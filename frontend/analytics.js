/* ============================================
   SMARTPOS - Analytics Dashboard
   Chart.js powered analytics
   ============================================ */

let currentPeriod = 'today';
let charts = {};

// Chart.js global config
Chart.defaults.font.family = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
Chart.defaults.color = '#7f8c8d';
Chart.defaults.font.size = 11;

const COLORS = {
    primary: '#3498db',
    success: '#27ae60',
    warning: '#e67e22',
    danger: '#e74c3c',
    purple: '#9b59b6',
    teal: '#1abc9c',
    pink: '#e91e63',
    indigo: '#3f51b5',
    palette: [
        '#3498db', '#27ae60', '#e67e22', '#9b59b6', '#e74c3c',
        '#1abc9c', '#e91e63', '#3f51b5', '#f39c12', '#00bcd4',
        '#8e44ad', '#16a085', '#c0392b', '#2c3e50', '#7f8c8d'
    ]
};

// ============ SETUP PERIOD BUTTONS ============
document.addEventListener('DOMContentLoaded', function() {
    // Wait for elements to exist
    const setupPeriodButtons = () => {
        const buttons = document.querySelectorAll('.period-btn');
        if (buttons.length === 0) {
            setTimeout(setupPeriodButtons, 200);
            return;
        }
        buttons.forEach(btn => {
            btn.addEventListener('click', function() {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentPeriod = this.dataset.period;
                refreshAnalytics();
            });
        });
    };
    setupPeriodButtons();
});

// ============ MAIN REFRESH ============
async function refreshAnalytics() {
    try {
        await Promise.all([
            loadKPI(),
            loadSalesTrend(),
            loadHourlySales(),
            loadTopProducts(),
            loadCategoryPerformance(),
            loadPaymentMethods(),
            loadProfitAnalysis(),
            loadCashierPerformance(),
            loadInventoryInsights(),
            loadCustomerInsights()
        ]);
    } catch (err) {
        console.error('Analytics error:', err);
        if (typeof showToast === 'function') {
            showToast('Failed to load analytics: ' + err.message, 'error');
        }
    }
}

// ============ KPI CARDS ============
async function loadKPI() {
    try {
        const data = await API.getKPIs(currentPeriod);
        
        const kpiRevenue = document.getElementById('kpiRevenue');
        if (kpiRevenue) kpiRevenue.textContent = `KES ${formatNumber(data.current.revenue)}`;
        updateChange('kpiRevenueChange', data.growth.revenue);
        
        const kpiTransactions = document.getElementById('kpiTransactions');
        if (kpiTransactions) kpiTransactions.textContent = formatNumber(data.current.transactions);
        updateChange('kpiTransactionsChange', data.growth.transactions);
        
        const kpiItems = document.getElementById('kpiItems');
        if (kpiItems) kpiItems.textContent = formatNumber(data.current.itemsSold);
        
        const kpiAvgSale = document.getElementById('kpiAvgSale');
        if (kpiAvgSale) kpiAvgSale.textContent = `Avg: KES ${formatNumber(data.current.avgSale)}`;
        
        const kpiStockValue = document.getElementById('kpiStockValue');
        if (kpiStockValue) kpiStockValue.textContent = `KES ${formatNumber(data.inventory.stock_value)}`;
        
        const kpiStockItems = document.getElementById('kpiStockItems');
        if (kpiStockItems) kpiStockItems.textContent = 
            `${data.inventory.total_items} items (${data.inventory.inventory_count} inv)`;
        
        renderAlerts(data.inventory);
    } catch (err) {
        console.error('KPI error:', err);
    }
}

function updateChange(elementId, value) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const abs = Math.abs(value).toFixed(1);
    if (value > 0.5) {
        el.className = 'kpi-change up';
        el.innerHTML = `<i class="fas fa-arrow-up"></i> ${abs}% vs previous`;
    } else if (value < -0.5) {
        el.className = 'kpi-change down';
        el.innerHTML = `<i class="fas fa-arrow-down"></i> ${abs}% vs previous`;
    } else {
        el.className = 'kpi-change neutral';
        el.innerHTML = `<i class="fas fa-minus"></i> No change`;
    }
}

function renderAlerts(inv) {
    const bar = document.getElementById('alertsBar');
    if (!bar) return;
    
    const alerts = [];
    
    if (inv.out_of_stock > 0) {
        alerts.push(`
            <div class="alert-item danger">
                <i class="fas fa-exclamation-circle"></i>
                <div><strong>${inv.out_of_stock}</strong> items out of stock</div>
            </div>
        `);
    }
    if (inv.low_stock > 0) {
        alerts.push(`
            <div class="alert-item warning">
                <i class="fas fa-exclamation-triangle"></i>
                <div><strong>${inv.low_stock}</strong> items low on stock</div>
            </div>
        `);
    }
    if (alerts.length === 0) {
        alerts.push(`
            <div class="alert-item success">
                <i class="fas fa-check-circle"></i>
                <div>All systems normal. Inventory levels healthy.</div>
            </div>
        `);
    }
    
    bar.innerHTML = alerts.join('');
}

// ============ SALES TREND ============
async function loadSalesTrend() {
    const trendPeriod = document.getElementById('trendPeriod');
    const period = trendPeriod ? trendPeriod.value : '7days';
    
    try {
        const data = await API.getSalesTrend(period);
        
        const labels = data.map(d => formatDateLabel(d.period, period));
        const revenue = data.map(d => d.revenue);
        const transactions = data.map(d => d.transactions);
        
        const canvas = document.getElementById('salesTrendChart');
        if (!canvas) return;
        
        if (charts.salesTrend) charts.salesTrend.destroy();
        
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 260);
        gradient.addColorStop(0, 'rgba(52, 152, 219, 0.4)');
        gradient.addColorStop(1, 'rgba(52, 152, 219, 0.02)');
        
        charts.salesTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Revenue (KES)',
                        data: revenue,
                        borderColor: COLORS.primary,
                        backgroundColor: gradient,
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: COLORS.primary,
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 7,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Transactions',
                        data: transactions,
                        borderColor: COLORS.success,
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        tension: 0.4,
                        pointRadius: 3,
                        pointHoverRadius: 6,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { usePointStyle: true, padding: 15, font: { size: 11 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(44, 62, 80, 0.95)',
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                const label = context.dataset.label || '';
                                const value = context.parsed.y;
                                if (label.includes('Revenue')) {
                                    return `${label}: KES ${formatNumber(value)}`;
                                }
                                return `${label}: ${value}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        grid: { color: '#f5f6fa' },
                        ticks: { callback: v => 'KES ' + formatNumber(v) }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        grid: { drawOnChartArea: false }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
    } catch (err) {
        console.error('Trend error:', err);
    }
}

// ============ HOURLY SALES ============
async function loadHourlySales() {
    try {
        const data = await API.getHourlySales();
        
        const canvas = document.getElementById('hourlyChart');
        if (!canvas) return;
        
        if (charts.hourly) charts.hourly.destroy();
        
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 260);
        gradient.addColorStop(0, 'rgba(155, 89, 182, 0.8)');
        gradient.addColorStop(1, 'rgba(155, 89, 182, 0.2)');
        
        charts.hourly = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    label: 'Revenue (KES)',
                    data: data.map(d => d.revenue),
                    backgroundColor: gradient,
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(44, 62, 80, 0.95)',
                        padding: 12,
                        callbacks: { label: ctx => 'KES ' + formatNumber(ctx.parsed.y) }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f5f6fa' },
                        ticks: { callback: v => formatNumber(v) }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
    } catch (err) {
        console.error('Hourly error:', err);
    }
}

// ============ TOP PRODUCTS ============
async function loadTopProducts() {
    try {
        const data = await API.getTopProducts(currentPeriod, 8);
        
        const canvas = document.getElementById('topProductsChart');
        if (!canvas) return;
        
        if (charts.topProducts) charts.topProducts.destroy();
        
        const ctx = canvas.getContext('2d');
        
        charts.topProducts = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(d => truncate(d.product_name, 15)),
                datasets: [{
                    label: 'Revenue (KES)',
                    data: data.map(d => d.revenue),
                    backgroundColor: data.map((_, i) => COLORS.palette[i % COLORS.palette.length]),
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(44, 62, 80, 0.95)',
                        padding: 12,
                        callbacks: {
                            title: ctx => data[ctx[0].dataIndex].product_name,
                            label: ctx => [
                                'Revenue: KES ' + formatNumber(ctx.parsed.x),
                                'Qty: ' + data[ctx.dataIndex].qty_sold,
                                'Transactions: ' + data[ctx.dataIndex].transactions
                            ]
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: '#f5f6fa' },
                        ticks: { callback: v => formatNumber(v) }
                    },
                    y: { grid: { display: false } }
                }
            }
        });
    } catch (err) {
        console.error('Top products error:', err);
    }
}

// ============ CATEGORY PERFORMANCE ============
async function loadCategoryPerformance() {
    try {
        const data = await API.getCategoryPerformance(currentPeriod);
        
        const canvas = document.getElementById('categoryChart');
        if (!canvas) return;
        
        if (charts.category) charts.category.destroy();
        
        const ctx = canvas.getContext('2d');
        
        charts.category = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.map(d => d.category),
                datasets: [{
                    data: data.map(d => d.revenue),
                    backgroundColor: data.map((_, i) => COLORS.palette[i % COLORS.palette.length]),
                    borderWidth: 3,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            usePointStyle: true,
                            padding: 12,
                            font: { size: 11 },
                            generateLabels: function(chart) {
                                const data = chart.data;
                                return data.labels.map((label, i) => ({
                                    text: `${truncate(label, 15)}`,
                                    fillStyle: data.datasets[0].backgroundColor[i],
                                    hidden: false,
                                    index: i
                                }));
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(44, 62, 80, 0.95)',
                        padding: 12,
                        callbacks: {
                            label: ctx => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
                                return `KES ${formatNumber(ctx.parsed)} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    } catch (err) {
        console.error('Category error:', err);
    }
}

// ============ PAYMENT METHODS ============
async function loadPaymentMethods() {
    try {
        const data = await API.getPaymentMethods(currentPeriod);
        
        const canvas = document.getElementById('paymentChart');
        if (!canvas) return;
        
        if (charts.payment) charts.payment.destroy();
        
        const ctx = canvas.getContext('2d');
        
        const methodColors = {
            'cash': COLORS.success,
            'mpesa': COLORS.warning,
            'card': COLORS.primary,
            'credit': COLORS.purple
        };
        
        charts.payment = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: data.map(d => (d.payment_method || 'cash').toUpperCase()),
                datasets: [{
                    data: data.map(d => d.revenue),
                    backgroundColor: data.map(d => 
                        methodColors[d.payment_method] || COLORS.palette[0]
                    ),
                    borderWidth: 3,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { usePointStyle: true, padding: 12, font: { size: 11 } }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(44, 62, 80, 0.95)',
                        padding: 12
                    }
                }
            }
        });
    } catch (err) {
        console.error('Payment error:', err);
    }
}

// ============ PROFIT ANALYSIS ============
async function loadProfitAnalysis() {
    try {
        const data = await API.getProfitAnalysis(currentPeriod);
        
        const summary = document.getElementById('profitSummary');
        if (summary) {
            summary.innerHTML = `
                <div class="profit-stat">
                    <div class="label">Revenue</div>
                    <div class="value">KES ${formatNumber(data.summary.revenue)}</div>
                </div>
                <div class="profit-stat cost">
                    <div class="label">Cost</div>
                    <div class="value">KES ${formatNumber(data.summary.cost)}</div>
                </div>
                <div class="profit-stat profit">
                    <div class="label">Profit</div>
                    <div class="value">KES ${formatNumber(data.summary.profit)}</div>
                </div>
                <div class="profit-stat margin">
                    <div class="label">Margin</div>
                    <div class="value">${data.summary.margin.toFixed(1)}%</div>
                </div>
            `;
        }
        
        const canvas = document.getElementById('profitChart');
        if (!canvas) return;
        
        if (charts.profit) charts.profit.destroy();
        
        const ctx = canvas.getContext('2d');
        
        const labels = data.trend.map(d => formatDateLabel(d.date, '7days'));
        const revenue = data.trend.map(d => d.revenue);
        const cost = data.trend.map(d => d.cost);
        const profit = data.trend.map(d => d.profit);
        
        charts.profit = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Revenue',
                        data: revenue,
                        backgroundColor: 'rgba(52, 152, 219, 0.7)',
                        borderRadius: 4
                    },
                    {
                        label: 'Cost',
                        data: cost,
                        backgroundColor: 'rgba(231, 76, 60, 0.7)',
                        borderRadius: 4
                    },
                    {
                        label: 'Profit',
                        data: profit,
                        type: 'line',
                        borderColor: COLORS.success,
                        backgroundColor: 'rgba(39, 174, 96, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        pointBackgroundColor: COLORS.success,
                        pointRadius: 5,
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        fill: false
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { usePointStyle: true, padding: 15 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(44, 62, 80, 0.95)',
                        padding: 12,
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: KES ${formatNumber(ctx.parsed.y)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f5f6fa' },
                        ticks: { callback: v => 'KES ' + formatNumber(v) }
                    },
                    x: { grid: { display: false } }
                }
            }
        });
    } catch (err) {
        console.error('Profit error:', err);
    }
}

// ============ CASHIER PERFORMANCE ============
async function loadCashierPerformance() {
    try {
        const data = await API.getCashierPerformance(currentPeriod);
        
        const el = document.getElementById('cashierTable');
        if (!el) return;
        
        const html = data.length === 0 
            ? '<div class="no-data">No data available</div>'
            : `<table class="mini-table">
                <thead>
                    <tr><th>#</th><th>Cashier</th><th>Sales</th><th>Revenue</th><th>Avg</th></tr>
                </thead>
                <tbody>
                    ${data.map((c, i) => `
                        <tr>
                            <td><span class="rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${i + 1}</span></td>
                            <td><strong>${c.full_name || c.username}</strong></td>
                            <td>${c.transactions}</td>
                            <td><strong>KES ${formatNumber(c.revenue)}</strong></td>
                            <td>KES ${formatNumber(c.avg_sale)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>`;
        
        el.innerHTML = html;
    } catch (err) {
        console.error('Cashier error:', err);
    }
}

// ============ INVENTORY INSIGHTS ============
async function loadInventoryInsights() {
    try {
        const data = await API.getInventoryInsights();
        
        // Low stock table
        const lowEl = document.getElementById('lowStockTable');
        if (lowEl) {
            const lowHtml = data.lowStock.length === 0
                ? '<div class="no-data">All stock levels healthy ✓</div>'
                : `<table class="mini-table">
                    <thead><tr><th>Item</th><th>Stock</th><th>Reorder</th></tr></thead>
                    <tbody>
                        ${data.lowStock.slice(0, 8).map(p => `
                            <tr>
                                <td><strong>${truncate(p.name, 20)}</strong></td>
                                <td><span class="badge-pill low">${p.stock}</span></td>
                                <td>${p.reorder_level}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`;
            lowEl.innerHTML = lowHtml;
        }
        
        // Slow movers
        const slowEl = document.getElementById('slowMoversTable');
        if (slowEl) {
            const slowHtml = data.slowMovers.length === 0
                ? '<div class="no-data">No slow movers detected</div>'
                : `<table class="mini-table">
                    <thead><tr><th>Item</th><th>Stock</th><th>Value</th></tr></thead>
                    <tbody>
                        ${data.slowMovers.slice(0, 8).map(p => `
                            <tr>
                                <td><strong>${truncate(p.name, 20)}</strong></td>
                                <td>${p.stock}</td>
                                <td>KES ${formatNumber(p.stock * p.selling_price)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`;
            slowEl.innerHTML = slowHtml;
        }
        
        // Best performers
        const bestEl = document.getElementById('bestPerformersTable');
        if (bestEl) {
            const bestHtml = data.best.length === 0
                ? '<div class="no-data">No sales data yet</div>'
                : `<table class="mini-table">
                    <thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Revenue</th></tr></thead>
                    <tbody>
                        ${data.best.slice(0, 8).map((p, i) => `
                            <tr>
                                <td><span class="rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${i + 1}</span></td>
                                <td><strong>${truncate(p.product_name, 18)}</strong></td>
                                <td>${p.qty}</td>
                                <td><strong>KES ${formatNumber(p.revenue)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`;
            bestEl.innerHTML = bestHtml;
        }
    } catch (err) {
        console.error('Inventory insights error:', err);
    }
}

// ============ CUSTOMER INSIGHTS ============
async function loadCustomerInsights() {
    try {
        const data = await API.getCustomerInsights();
        
        const newC = data.newVsReturning?.new_customers || 0;
        const returning = data.newVsReturning?.returning || 0;
        const unique = data.retention?.unique_customers || 0;
        const visits = data.retention?.total_visits || 0;
        const retention = unique > 0 ? ((visits / unique).toFixed(1)) : 0;
        
        const statsEl = document.getElementById('customerStats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="customer-stat">
                    <div class="value">${unique}</div>
                    <div class="label">Unique Customers</div>
                </div>
                <div class="customer-stat">
                    <div class="value">${newC}</div>
                    <div class="label">New (30 days)</div>
                </div>
                <div class="customer-stat">
                    <div class="value">${returning}</div>
                    <div class="label">Returning</div>
                </div>
                <div class="customer-stat">
                    <div class="value">${retention}x</div>
                    <div class="label">Avg Visits</div>
                </div>
            `;
        }
        
        const tableEl = document.getElementById('topCustomersTable');
        if (tableEl) {
            const tableHtml = data.topCustomers.length === 0
                ? '<div class="no-data">No customer data available. Add customer names/phones during sales.</div>'
                : `<table class="mini-table">
                    <thead>
                        <tr><th>#</th><th>Customer</th><th>Phone</th><th>Visits</th><th>Total Spent</th><th>Last Visit</th></tr>
                    </thead>
                    <tbody>
                        ${data.topCustomers.map((c, i) => `
                            <tr>
                                <td><span class="rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}">${i + 1}</span></td>
                                <td><strong>${c.customer_name || 'N/A'}</strong></td>
                                <td>${c.customer_phone || '-'}</td>
                                <td>${c.visits}</td>
                                <td><strong>KES ${formatNumber(c.total_spent)}</strong></td>
                                <td>${formatDate(c.last_visit)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`;
            tableEl.innerHTML = tableHtml;
        }
    } catch (err) {
        console.error('Customer error:', err);
    }
}

// ============ UTILITIES ============
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    num = Number(num);
    if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (Math.abs(num) >= 1000) return num.toLocaleString('en-KE', { maximumFractionDigits: 2 });
    return num.toFixed(2);
}

function formatDateLabel(dateStr, period) {
    if (!dateStr) return '';
    try {
        if (period === '12months') {
            const [y, m] = dateStr.split('-');
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            return `${months[parseInt(m) - 1]} ${y.slice(2)}`;
        }
        if (period === '5years') return dateStr;
        if (period === '24hours') {
            const parts = dateStr.split(' ');
            return parts[1] || dateStr;
        }
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
    } catch (e) {
        return dateStr;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const d = new Date(dateStr);
        const now = new Date();
        const diff = (now - d) / 1000;
        
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        
        return d.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
    } catch (e) {
        return dateStr;
    }
}

function truncate(str, n) {
    if (!str) return '';
    return str.length > n ? str.substring(0, n) + '…' : str;
}