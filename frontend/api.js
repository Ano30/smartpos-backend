/* ============================================
   SMARTPOS - API Client (Bulletproof Login Fix)
   ============================================ */

const CLOUD_URL = 'https://smartpos-backend-gtwl.onrender.com';

function detectAPIBase() {
    // Force it to always use the live cloud URL
    return CLOUD_URL + '/api';
}

const API_BASE = detectAPIBase();
let authToken = localStorage.getItem('pos_token') || null;
window.getAuthToken = () => authToken;

async function apiCall(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    try {
        const response = await fetch(API_BASE + endpoint, {
            ...options,
            headers
        });

        let data;
        const text = await response.text();
        
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error('Invalid response from server.');
        }

        // If the server returns an error, throw it, but DO NOT wipe localStorage here.
        // Wiping localStorage is what causes the instant logout!
        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;

    } catch (err) {
        // Just pass the error up to the caller. The UI will handle it gracefully.
        throw err;
    }
}

const API = {
    register: (data) => apiCall('/companies', { method: 'POST', body: JSON.stringify({ companyName: data.companyName, ownerFullName: data.fullName || data.ownerFullName, ownerUsername: data.username || data.ownerUsername, ownerPassword: data.password || data.ownerPassword, phone: data.phone }) }),
    login: (data) => apiCall('/auth/login', { method: 'POST', body: JSON.stringify({ company_id: data.company_id, username: data.username, password: data.password, role: data.role }) }),
    verify: () => apiCall('/auth/verify'),
    getCompanies: () => apiCall('/companies'),
    getServerInfo: () => apiCall('/server-info'),
    getProducts: () => apiCall('/products'),
    getProduct: (id) => apiCall(`/products/${id}`),
    getByBarcode: (code) => apiCall(`/products/barcode/${encodeURIComponent(code)}`),
    createProduct: (data) => apiCall('/products', { method: 'POST', body: JSON.stringify(data) }),
    updateProduct: (id, data) => apiCall(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    restock: (id, quantity) => apiCall(`/products/${id}/restock`, { method: 'POST', body: JSON.stringify({ quantity }) }),
    deleteProduct: (id) => apiCall(`/products/${id}`, { method: 'DELETE' }),
    createSale: (data) => apiCall('/sales', { method: 'POST', body: JSON.stringify(data) }),
    getSale: (id) => apiCall(`/sales/${id}`),
    getSaleByReceipt: (receiptNo) => apiCall(`/sales/receipt/${encodeURIComponent(receiptNo)}`),
    getSales: (params = {}) => { const query = new URLSearchParams(params).toString(); return apiCall('/sales' + (query ? '?' + query : '')); },
    getReport: (params) => apiCall('/reports/report?' + new URLSearchParams(params)),
    getYearly: () => apiCall('/reports/yearly'),
    getMonthly: () => apiCall('/reports/monthly'),
    getYears: () => apiCall('/reports/years'),
    createBackup: (type = 'manual') => apiCall('/backup/create', { method: 'POST', body: JSON.stringify({ type }) }),
    listBackups: () => apiCall('/backup/list'),
    backupStats: () => apiCall('/backup/stats'),
    downloadBackup: (type, filename) => { const url = `${API_BASE}/backup/download/${type}/${encodeURIComponent(filename)}?token=${authToken}`; const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); },
    restoreBackup: (type, filename) => apiCall(`/backup/restore/${type}/${encodeURIComponent(filename)}`, { method: 'POST' }),
    cleanBackups: () => apiCall('/backup/clean', { method: 'POST' }),
    syncCloud: () => apiCall('/backup/sync-cloud', { method: 'POST' }),
    deleteBackup: (type, filename) => apiCall(`/backup/${type}/${encodeURIComponent(filename)}`, { method: 'DELETE' }),
    getKPIs: (period, start, end) => { const params = new URLSearchParams({ period }); if (start) params.append('start', start); if (end) params.append('end', end); return apiCall('/analytics/kpi?' + params); },
    getSalesTrend: (period) => apiCall('/analytics/sales-trend?period=' + period),
    getHourlySales: () => apiCall('/analytics/hourly-sales'),
    getTopProducts: (period, limit = 8) => apiCall(`/analytics/top-products?period=${period}&limit=${limit}`),
    getCategoryPerformance: (period) => apiCall('/analytics/category-performance?period=' + period),
    getPaymentMethods: (period) => apiCall('/analytics/payment-methods?period=' + period),
    getProfitAnalysis: (period) => apiCall('/analytics/profit-analysis?period=' + period),
    getCashierPerformance: (period) => apiCall('/analytics/cashier-performance?period=' + period),
    getInventoryInsights: () => apiCall('/analytics/inventory-insights'),
    getCustomerInsights: () => apiCall('/analytics/customer-insights'),
    getDashboardSummary: (period) => apiCall('/analytics/dashboard?period=' + period),
    getEmployees: () => apiCall('/employees'),
    getEmployeeStats: (period = 'today') => apiCall('/employees/stats?period=' + period),
    getPermissionsMatrix: () => apiCall('/employees/permissions-matrix'),
    createEmployee: (data) => apiCall('/employees', { method: 'POST', body: JSON.stringify(data) }),
    updateEmployee: (id, data) => apiCall(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateEmployeePermissions: (id, permissions) => apiCall(`/employees/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) }),
    resetEmployeePassword: (id, newPassword) => apiCall(`/employees/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
    deleteEmployee: (id) => apiCall(`/employees/${id}`, { method: 'DELETE' }),
    initiateMpesa: (phone, amount, saleId) => apiCall('/mpesa/stkpush', { method: 'POST', body: JSON.stringify({ phone, amount, saleId }) }),
    checkMpesaStatus: (checkoutId) => apiCall(`/mpesa/status/${encodeURIComponent(checkoutId)}`),
    getMpesaTransactions: () => apiCall('/mpesa/transactions'),
    getMpesaConfig: () => apiCall('/mpesa/config'),
    previewImport: (file) => { const formData = new FormData(); formData.append('file', file); return fetch(API_BASE + '/import/preview', { method: 'POST', headers: { 'Authorization': `Bearer ${authToken}` }, body: formData }).then(async (r) => { const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Preview failed'); return data; }); },
    importProducts: (rows, mapping) => apiCall('/import/products', { method: 'POST', body: JSON.stringify({ rows, mapping }) }),
    updatePrices: (rows, mapping) => apiCall('/import/prices', { method: 'POST', body: JSON.stringify({ rows, mapping }) }),
    searchSaleForReturn: (params) => apiCall('/returns/search-sale?' + new URLSearchParams(params)),
    createReturn: (data) => apiCall('/returns', { method: 'POST', body: JSON.stringify(data) }),
    getReturns: (params = {}) => { const query = new URLSearchParams(params).toString(); return apiCall('/returns' + (query ? '?' + query : '')); },
    getReturn: (id) => apiCall('/returns/' + id)
};

window.API = API;
window.API_BASE = API_BASE;