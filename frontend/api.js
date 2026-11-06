/* ============================================
   SMARTPOS - API Client
   ============================================ */

const CLOUD_URL = 'https://smartpos-backend-gtwl.onrender.com';

function detectAPIBase() {
    if (window.location.protocol === 'file:') return CLOUD_URL + '/api';
    if (typeof window.Capacitor !== 'undefined') return CLOUD_URL + '/api';
    if (window.location.hostname.includes('onrender.com')) return window.location.origin + '/api';
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return window.location.origin + '/api';
    return CLOUD_URL + '/api';
}

const API_BASE = detectAPIBase();
console.log('[SmartPOS] api.js loaded — API Base:', API_BASE);

let authToken = localStorage.getItem('pos_token') || null;

async function apiCall(endpoint, options = {}, retries = 2) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    const freshToken = localStorage.getItem('pos_token');
    if (freshToken) headers['Authorization'] = `Bearer ${freshToken}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);

        try {
            const response = await fetch(API_BASE + endpoint, { ...options, headers, signal: controller.signal });
            clearTimeout(timeoutId);

            const isAuthRoute = endpoint.includes('/auth/login') || endpoint.includes('/auth/register') || endpoint.includes('/companies');

            if (response.status === 401 && !isAuthRoute) {
                console.warn(`[API] 401 Unauthorized on ${endpoint}.`);
                throw new Error('Server is waking up or session is temporarily unavailable.');
            }

            let data;
            const text = await response.text();
            try { data = JSON.parse(text); } 
            catch (e) { throw new Error('Invalid response from server.'); }

            if (!response.ok) throw new Error(data.error || 'Request failed');
            return data;

        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError' && attempt < retries) continue;
            if (err.name === 'AbortError') throw new Error('Server is waking up. Please wait 30 seconds and try again.');
            throw err;
        }
    }
}

const API = {
    // 🎯 AUTH & COMPANIES
    register: (data) => apiCall('/companies', { method: 'POST', body: JSON.stringify(data) }),
    login: (data) => apiCall('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    verify: () => apiCall('/auth/verify'),
    getCompanies: () => apiCall('/companies'),
    getServerInfo: () => apiCall('/server-info'),
    
    // 🎯 PRODUCTS
    getProducts: () => apiCall('/products'),
    createProduct: (data) => apiCall('/products', { method: 'POST', body: JSON.stringify(data) }),
    updateProduct: (id, data) => apiCall(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteProduct: (id) => apiCall(`/products/${id}`, { method: 'DELETE' }),
    
    // 🎯 SALES & MPESA
    createSale: (data) => apiCall('/sales', { method: 'POST', body: JSON.stringify(data) }),
    getSales: () => apiCall('/sales'),
    initiateMpesa: (phone, amount) => apiCall('/mpesa/stkpush', { method: 'POST', body: JSON.stringify({ phone, amount }) }),
    checkMpesaStatus: (id) => apiCall(`/mpesa/status/${id}`),
    
    // 🎯 RETURNS
    searchSaleForReturn: (params) => apiCall('/returns/search-sale?' + new URLSearchParams(params)),
    createReturn: (data) => apiCall('/returns', { method: 'POST', body: JSON.stringify(data) }),
    getReturns: (params = {}) => { const query = new URLSearchParams(params).toString(); return apiCall('/returns' + (query ? '?' + query : '')); },
    getReturn: (id) => apiCall('/returns/' + id),
    
    // 🎯 EMPLOYEES
    getEmployees: () => apiCall('/employees'),
    getEmployeeStats: () => apiCall('/employees/stats'),
    createEmployee: (data) => apiCall('/employees', { method: 'POST', body: JSON.stringify(data) }),
    updateEmployee: (id, data) => apiCall(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteEmployee: (id) => apiCall(`/employees/${id}`, { method: 'DELETE' }),
    resetEmployeePassword: (id, newPassword) => apiCall(`/employees/${id}/reset-password`, { method: 'PUT', body: JSON.stringify({ newPassword }) }),
    getPermissionsMatrix: () => apiCall('/permissions-matrix'),
    
    // 🎯 ANALYTICS & REPORTS
    getKPIs: (period) => apiCall(`/analytics/kpi?period=${period || 'today'}`),
    getSalesTrend: () => apiCall('/analytics/trend'),
    getTopProducts: () => apiCall('/analytics/top-products'),
    getReportSummary: (from, to) => apiCall(`/reports/summary?from=${from}&to=${to}`),

    // 🎯 BACKUPS (Mock functions for frontend UI)
    syncCloud: () => Promise.resolve({ success: true, message: 'Synced to cloud' }),
    createBackup: () => Promise.resolve({ success: true, message: 'Backup created' })
};

window.API = API;
window.API_BASE = API_BASE;
