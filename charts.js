
let expenseChart = null;

window.updateChart = function (transactions) {
    const ctx = document.getElementById('expenseChart').getContext('2d');

    // Group by Category
    const incomeData = {};
    const expenseData = {};
    const allCategories = new Set();

    transactions.forEach(t => {
        const cat = t.note ? t.note.split(' - ')[0] : 'Uncategorized';
        allCategories.add(cat);

        if (t.type === 'income') {
            incomeData[cat] = (incomeData[cat] || 0) + Number(t.amount);
        } else {
            expenseData[cat] = (expenseData[cat] || 0) + Number(t.amount);
        }
    });

    const labels = Array.from(allCategories);
    const incomeValues = labels.map(l => incomeData[l] || 0);
    const expenseValues = labels.map(l => expenseData[l] || 0);

    // Destroy old chart
    if (expenseChart) {
        expenseChart.destroy();
    }

    // Use a Bar chart to clearly show Income vs Expense side-by-side per category
    // This handles the scale difference better than a doughnut
    expenseChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Income',
                    data: incomeValues,
                    backgroundColor: '#10b981', // Green
                    borderRadius: 4,
                },
                {
                    label: 'Expense',
                    data: expenseValues,
                    backgroundColor: '#ef4444', // Red
                    borderRadius: 4,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    ticks: { color: '#9ca3af' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#e5e7eb' }
                }
            }
        }
    });
};
