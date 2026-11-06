/* ============================================================
   SMARTPOS - Reports Logic (reports.js)
   ============================================================ */

function toggleReportFilters() {
    const type = document.getElementById('reportFilterType').value;
    document.getElementById('dayFilter').style.display = 'none';
    document.getElementById('monthFilter').style.display = 'none';
    document.getElementById('yearFilter').style.display = 'none';

    if (type === 'day') document.getElementById('dayFilter').style.display = 'block';
    if (type === 'month') document.getElementById('monthFilter').style.display = 'block';
    if (type === 'year') document.getElementById('yearFilter').style.display = 'block';
}

async function generateReport() {
    const type = document.getElementById('reportFilterType').value;
    
    try {
        showToast('Generating report...', 'info');
        const sales = await API.getSales();
        
        let filteredSales = sales || [];
        let totalRevenue = 0;
        let totalTransactions = filteredSales.length;

        const today = new Date().toISOString().split('T')[0];
        
        if (type === 'today') {
            filteredSales = filteredSales.filter(s => s.created_at && s.created_at.startsWith(today));
        } else if (type === 'day') {
            const date = document.getElementById('reportDate').value;
            if (date) filteredSales = filteredSales.filter(s => s.created_at && s.created_at.startsWith(date));
        }

        filteredSales.forEach(s => totalRevenue += parseFloat(s.total || 0));

        const summaryDiv = document.getElementById('reportSummary');
        if (summaryDiv) {
            summaryDiv.innerHTML = `
                <div class="stat-card blue" style="margin-bottom:20px;">
                    <div class="stat-icon"><i class="fas fa-money-bill-wave"></i></div>
                    <div><div class="stat-value">KES ${totalRevenue.toFixed(2)}</div><div class="stat-label">Total Revenue</div></div>
                </div>
                <div class="stat-card green">
                    <div class="stat-icon"><i class="fas fa-receipt"></i></div>
                    <div><div class="stat-value">${totalTransactions}</div><div class="stat-label">Transactions</div></div>
                </div>
            `;
        }

        const historyDiv = document.getElementById('salesHistoryList');
        if (historyDiv) {
            if (filteredSales.length === 0) {
                historyDiv.innerHTML = '<p style="padding:20px;text-align:center;color:#7f8c8d;">No sales found for this period.</p>';
            } else {
                historyDiv.innerHTML = `
                    <table class="inventory-table">
                        <thead><tr><th>Receipt #</th><th>Cashier</th><th>Date</th><th>Total</th></tr></thead>
                        <tbody>
                            ${filteredSales.map(sale => `
                                <tr>
                                    <td>${sale.receipt_no}</td>
                                    <td>${sale.cashier_name}</td>
                                    <td>${new Date(sale.created_at).toLocaleString()}</td>
                                    <td>KES ${parseFloat(sale.total).toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            }
        }

        showToast('Report generated!', 'success');
    } catch (err) {
        showToast('Failed to generate report: ' + err.message, 'error');
    }
}

window.toggleReportFilters = toggleReportFilters;
window.generateReport = generateReport;
