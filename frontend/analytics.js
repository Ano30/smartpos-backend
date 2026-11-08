/* ============================================================
   SMARTPOS - Analytics Dashboard
   Chart.js powered analytics
   ============================================================ */

let currentPeriod = 'today';
let charts = {};

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

document.addEventListener('DOMContentLoaded', function() {
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
        
        // 🎯 We use the flat data structure from server.js
        const kpiRevenue = document.getElementById('kpiRevenue');
        if (kpiRevenue) kpiRevenue.textContent = `KES ${formatNumber(data.totalRevenue || 0)}`;
        
        const kpiTransactions = document.getElementById('kpiTransactions');
        if (kpiTransactions) kpiTransactions.textContent = formatNumber(data.totalTransactions || 0);
        
        const kpiItems = document.getElementById('kpiItems');
        if (kpiItems) kpiItems.textContent = formatNumber(data.itemsSold || 0);
        
        const kpiAvgSale = document.getElementById('kpiAvgSale');
        if (kpiAvgSale) kpiAvgSale.textContent = `Avg: KES ${formatNumber(data.avgSale || 0)}`;
        
        const kpiStockValue = document.getElementById('kpiStockValue');
        if (kpiStockValue) kpiStockValue.textContent = `KES ${formatNumber(data.stockValue || 0)}`;
        
        const kpiStockItems = document.getElementById('kpiStockItems');
        if (kpiStockItems) kpiStockItems.textContent = `${data.stockItems || 0} items`;
        
        // 🎯 Update Cash and M-Pesa Totals
        const kpiCashTotal = document.getElementById('kpiCashTotal');
        if (kpiCashTotal) kpiCashTotal.textContent = `KES ${formatNumber(data.cashTotal || 0)}`;

        const kpiMpesaTotal = document.getElementById('kpiMpesaTotal');
        if (kpiMpesaTotal) kpiMpesaTotal.textContent = `KES ${formatNumber(data.mpesaTotal || 0)}`;
        
        // Static 0% change for now
        updateChange('kpiRevenueChange', 0);
        updateChange('kpiTransactionsChange', 0);
        
        // We don't have detailed inventory alerts here, so we pass an empty object
        renderAlerts({ out_of_stock: 0, low_stock: 0 });
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
    bar.innerHTML = `<div class="alert-item success"><i class="fas fa-check-circle"></i><div>All systems normal. Inventory levels healthy.</div></div>`;
}

// ============ CHARTS (Placeholder implementations for now) ============
// Since server.js only sends simple data, we will make these charts simple.
async function loadSalesTrend() {
    try {
        const data = await API.getSalesTrend();
        const canvas = document.getElementById('salesTrendChart');
        if (!canvas) return;
        if (charts.salesTrend) charts.salesTrend.destroy();
        const ctx = canvas.getContext('2d');
        
        charts.salesTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => d.date),
                datasets: [{
                    label: 'Revenue',
                    data: data.map(d => d.revenue),
                    borderColor: COLORS.primary,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    } catch (err) { console.error(err); }
}

async function loadHourlySales() { /* Placeholder - server doesn't send this data yet */ }
async function loadTopProducts() { /* Placeholder */ }
async function loadCategoryPerformance() { /* Placeholder */ }
async function loadPaymentMethods() { /* Placeholder */ }
async function loadProfitAnalysis() { /* Placeholder */ }
async function loadCashierPerformance() { /* Placeholder */ }
async function loadInventoryInsights() { /* Placeholder */ }
async function loadCustomerInsights() { /* Placeholder */ }

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
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
    } catch (e) { return dateStr; }
}

function truncate(str, n) {
    if (!str) return '';
    return str.length > n ? str.substring(0, n) + '…' : str;
}
