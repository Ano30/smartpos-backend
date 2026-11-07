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
        
        // 🎯 ADDED: Update Cash and M-Pesa totals
        const kpiCashTotal = document.getElementById('kpiCashTotal');
        if (kpiCashTotal) kpiCashTotal.textContent = `KES ${formatNumber(data.cashTotal || 0)}`;

        const kpiMpesaTotal = document.getElementById('kpiMpesaTotal');
        if (kpiMpesaTotal) kpiMpesaTotal.textContent = `KES ${formatNumber(data.mpesaTotal || 0)}`;
        
        renderAlerts(data.inventory);
    } catch (err) {
        console.error('KPI error:', err);
    }
}
