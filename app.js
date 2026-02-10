
// -- CONFIGURATION --
const SUPABASE_URL = 'https://iunxgdjfwgvdlhttxuty.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1bnhnZGpmd2d2ZGxodHR4dXR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NDgxNTAsImV4cCI6MjA4NjIyNDE1MH0.qodKPLdqY-4_3PFLdXBdTRhPPxsUjb15ZW8TEYHrXek';

// -- STATE --
let session = null;
let profile = null;
let transactions = [];
let currency = 'USD'; // Default, will load from profile or localStorage

// -- SUPABASE CLIENT --
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// -- ELEMENTS --
const authContainer = document.getElementById('auth-container');
const dashboardContainer = document.getElementById('dashboard-container');
const landingPage = document.getElementById('landing-page'); // New
const authForm = document.getElementById('auth-form');
const authMessage = document.getElementById('auth-message');
const transactionList = document.getElementById('transaction-ul');
const totalIncomeEl = document.getElementById('total-income');
const totalExpenseEl = document.getElementById('total-expense');
const totalBalanceEl = document.getElementById('total-balance');
const currencySelector = document.getElementById('currency-selector');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const addBtn = document.getElementById('add-btn');
const closeModal = document.getElementById('close-modal');
const transactionForm = document.getElementById('transaction-form');
const offlineIndicator = document.getElementById('offline-indicator');
const monthFilter = document.getElementById('month-filter');

// -- INITIALIZATION --
window.addEventListener('DOMContentLoaded', async () => {
    // Set initial month filter to current month
    monthFilter.value = new Date().toISOString().slice(0, 7);

    // Check Auth
    const { data } = await supabaseClient.auth.getSession();
    session = data.session;
    
    if (session) {
        initDashboard();
    } else {
        showLanding(); // Changed from showAuth()
    }

    // Landing Page Listeners
    document.getElementById('nav-login-btn').addEventListener('click', showAuth);
    document.getElementById('nav-signup-btn').addEventListener('click', showAuth);
    document.getElementById('get-started-btn').addEventListener('click', showAuth);

    // Offline Listeners
    window.addEventListener('online', syncData);
    window.addEventListener('offline', updateOfflineStatus);
    updateOfflineStatus();
});

function showLanding() {
    landingPage.classList.remove('hidden');
    authContainer.classList.add('hidden');
    dashboardContainer.classList.add('hidden');
}

function showAuth() {
    landingPage.classList.add('hidden'); // Hide landing
    authContainer.classList.remove('hidden');
    dashboardContainer.classList.add('hidden');
}

function initDashboard() {
    landingPage.classList.add('hidden'); // Ensure landing is hidden
    authContainer.classList.add('hidden');
    dashboardContainer.classList.remove('hidden');
    
    loadProfile();
    loadTransactions();

    // Setup Realtime Subscription? Optional for MVP.
    // syncing is handled manually for offline support priority.
}

// -- AUTHENTICATION --
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    authMessage.textContent = 'Processing...';

    // Try Sign In
    let { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        // Try Sign Up if Sign In fails (Simple 2-in-1 flow for MVP convenience)
        let signUp = await supabaseClient.auth.signUp({ email, password });
        if (signUp.error) {
            authMessage.textContent = 'Error: ' + signUp.error.message;
        } else {
            authMessage.textContent = 'Account created! Please check your email to verify (if configured) or just log in.';
            // If email confirmation is off, this executes immediately
             if (signUp.data.session) {
                session = signUp.data.session;
                initDashboard();
             }
        }
    } else {
        session = data.session;
        initDashboard();
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    location.reload();
});

// -- DATA & SYNC --

async function loadProfile() {
    // Try to load local pref first
    const savedCurrency = localStorage.getItem('currency');
    if (savedCurrency) {
        currency = savedCurrency;
        currencySelector.value = currency;
    }

    // If online, fetch from profile
    if (navigator.onLine && session) {
        const { data } = await supabaseClient
            .from('profiles')
            .select('currency')
            .eq('id', session.user.id)
            .single();
        
        if (data && data.currency) {
            currency = data.currency;
            currencySelector.value = currency;
            localStorage.setItem('currency', currency);
        }
    }
}

async function loadTransactions() {
    // 1. Load from LocalStorage (Cache)
    const cached = localStorage.getItem('transactions');
    if (cached) {
        transactions = JSON.parse(cached);
        renderUI();
    }

    // 2. If Online, Fetch from Supabase
    if (navigator.onLine && session) {
        const { data, error } = await supabaseClient
            .from('transactions')
            .select('*')
            .order('date', { ascending: false });
        
        if (!error && data) {
            transactions = data;
            localStorage.setItem('transactions', JSON.stringify(transactions));
            renderUI();
            
            // Sync any pending offline actions
            syncData();
        }
    }
}

async function syncData() {
    updateOfflineStatus();
    if (!navigator.onLine) return;

    const queue = JSON.parse(localStorage.getItem('sync_queue') || '[]');
    if (queue.length === 0) return;

    console.log('Syncing ' + queue.length + ' items...');
    
    const newQueue = [];
    for (const item of queue) {
        try {
            if (item.action === 'add') {
                const { error } = await supabaseClient.from('transactions').insert(item.data);
                if (error) throw error;
            } else if (item.action === 'delete') {
                const { error } = await supabaseClient.from('transactions').delete().eq('id', item.id);
                if (error) throw error;
            }
        } catch (err) {
            console.error('Sync failed for item', item, err);
            newQueue.push(item); // Keep in queue if failed
        }
    }

    localStorage.setItem('sync_queue', JSON.stringify(newQueue));
    if (newQueue.length === 0) {
        loadTransactions(); // Refresh fresh data
    }
}


// -- UI RENDERING --
function renderUI() {
    const selectedMonth = monthFilter.value; // YYYY-MM
    
    // Filter by Month
    const filtered = transactions.filter(t => t.date.startsWith(selectedMonth));
    
    // Calculate Totals
    let income = 0;
    let expense = 0;
    
    transactionList.innerHTML = '';
    
    filtered.forEach(t => {
        if (t.type === 'income') income += Number(t.amount);
        else expense += Number(t.amount);

        // Add to List
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="t-info">
                <span class="t-cat">${t.note || t.type} <span style="font-size:0.8em; color:#888">(${t.category_id || 'General'})</span></span>
                <span class="t-date">${t.date}</span>
            </div>
            <div style="display:flex; align-items:center">
                <span class="t-amount ${t.type === 'income' ? 'income-amt' : 'expense-amt'}">
                    ${t.type === 'income' ? '+' : '-'} ${formatMoney(t.amount)}
                </span>
                <button class="delete-btn" onclick="deleteTransaction('${t.id}')">&times;</button>
            </div>
        `;
        transactionList.appendChild(li);
    });

    totalIncomeEl.textContent = formatMoney(income);
    totalExpenseEl.textContent = formatMoney(expense);
    totalBalanceEl.textContent = formatMoney(income - expense);

    // Trigger Chart Update (globally available from charts.js)
    if (window.updateChart) {
        window.updateChart(filtered);
    }
}

function formatMoney(amount) {
    const symbol = currency === 'NGN' ? '₦' : '$';
    return symbol + Number(amount).toFixed(2);
}

// -- OPERATIONS --

// Open Modal
addBtn.onclick = () => {
    transactionForm.reset();
    document.getElementById('date').valueAsDate = new Date();
    modal.classList.remove('hidden');
};

closeModal.onclick = () => modal.classList.add('hidden');
window.onclick = (e) => { if (e.target == modal) modal.classList.add('hidden'); };

// Add Transaction
transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = {
        user_id: session.user.id,
        type: document.querySelector('input[name="type"]:checked').value,
        amount: document.getElementById('amount').value,
        category_id: null, // For MVP we aren't using the category ID relation strictly yet, just text.
        // But to fit schema, we should handle this. 
        // For simplicity: We will store the category name in 'note' or create a quick category.
        // Actually, let's just make the category_id nullable in schema reference, 
        // OR better: Just store text in 'note' for MVP vs Schema Strictness?
        // Wait, schema has category_id. We'll leave it null for now and put the text in 'note' 
        // to avoid complex category management UI in step 3.
        date: document.getElementById('date').value,
        note: document.getElementById('category').value + (document.getElementById('note').value ? ' - ' + document.getElementById('note').value : '')
    };

    // Optimistic Update
    const tempId = 'temp-' + Date.now();
    const newTx = { ...formData, id: tempId };
    
    transactions.unshift(newTx);
    localStorage.setItem('transactions', JSON.stringify(transactions));
    renderUI();
    modal.classList.add('hidden');

    // Sync
    if (navigator.onLine) {
        const { error } = await supabaseClient.from('transactions').insert(formData);
        if (!error) loadTransactions(); // Refresh real ID
    } else {
        addToQueue('add', formData);
    }
});

// Delete Transaction
window.deleteTransaction = async (id) => {
    if (!confirm('Delete this transaction?')) return;

    // Optimistic Delete
    transactions = transactions.filter(t => t.id !== id);
    localStorage.setItem('transactions', JSON.stringify(transactions));
    renderUI();

    if (navigator.onLine) {
        await supabaseClient.from('transactions').delete().eq('id', id);
    } else {
        addToQueue('delete', { id });
    }
};

function addToQueue(action, data) {
    const queue = JSON.parse(localStorage.getItem('sync_queue') || '[]');
    queue.push({ action, data, id: data.id });
    localStorage.setItem('sync_queue', JSON.stringify(queue));
}

// Currency Change
currencySelector.addEventListener('change', (e) => {
    currency = e.target.value;
    localStorage.setItem('currency', currency);
    renderUI();
    
    // Save to profile if online
    if (navigator.onLine && session) {
        supabaseClient.from('profiles').update({ currency }).eq('id', session.user.id);
    }
});

monthFilter.addEventListener('change', renderUI);

function updateOfflineStatus() {
    if (navigator.onLine) {
        offlineIndicator.classList.add('hidden');
    } else {
        offlineIndicator.classList.remove('hidden');
    }
}
