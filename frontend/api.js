/* ============================================
   SMARTPOS - API Client (Electron PC + Mobile + Web)
   ============================================ */

const CLOUD_URL = 'https://smartpos-backend-gtwl.onrender.com';

function detectAPIBase() {
    if (window.location.protocol === 'file:') {
        return CLOUD_URL + '/api';
    }
    if (typeof window.Capacitor !== 'undefined') {
        return CLOUD_URL + '/api';
    }
    if (window.location.hostname.includes('onrender.com')) {
        return window.location.origin + '/api';
    }
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return window.location.origin + '/api';
    }
    return CLOUD_URL + '/api';
}

const API_BASE = detectAPIBase();
console.log(`[SmartPOS] api.js v4 loaded — API Base: ${API_BASE}`);

let authToken = localStorage.getItem('pos_token') || null;
window.getAuthToken = () => authToken;

async function apiCall(endpoint, options = {}, retries = 2) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        // Increase timeout to 60 seconds (Render free tier can be slow to wake up)
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
            const response = await fetch(API_BASE + endpoint, {
                ...options,
                headers,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const isAuthRoute = endpoint.includes('/auth/login')
                             || endpoint.includes('/auth/register')
                             || endpoint.includes('/companies');

            // 🎯 THE FIX: Only log out if we get a 401 from an explicit /auth/verify endpoint,
            // or if it's a fatal auth error. Do NOT instantly log out on background API calls.
            if (response.status === 401 && !isAuthRoute) {
                console.warn(`[API] 401 Unauthorized on ${endpoint}. Not auto-logging out.`);
                // We throw an error so the specific page fails, but the user stays logged in.
                throw new Error('Session expired or unauthorized. Please log in again.');
            }

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            return data;
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                if (attempt < retries) continue; // Retry if timed out
                throw new Error('Request timed out. The server is taking too long.');
            }
            if (attempt < retries && !err.message.includes('unauthorized')) {
                await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
                continue;
            }
            throw err;
        }
    }
}

// ============================================
// API METHODS
// ============================================
const API = {
    // AUTH
    login: (data) => apiCall('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    register: (data) => apiCall('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    verify: () => apiCall('/auth/verify'),
    
    // COMPANIES
    getCompanies: () => apiCall('/companies'),
    
    // PRODUCTS
    getProducts: () => apiCall('/products'),
    getProduct: (id) => apiCall(`/products/${id}`),
    getProductByBarcode: (code) => apiCall(`/products/barcode/${code}`),
    createProduct: (data) => apiCall('/products', { method: 'POST', body: JSON.stringify(data) }),
    updateProduct: (id, data) => apiCall(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteProduct: (id) => apiCall(`/products/${id}`, { method: 'DELETE' }),
    restockProduct: (id, data) => apiCall(`/products/${id}/restock`, { method: 'POST', body: JSON.stringify(data) }),
    
    // SALES
    createSale: (data) => apiCall('/sales', { method: 'POST', body: JSON.stringify(data) }),
    getSales: () => apiCall('/sales'),
    getSale: (id) => apiCall(`/sales/${id}`),
    getSaleByReceipt: (receipt) => apiCall(`/sales/receipt/${receipt}`),
    
    // REPORTS
    getReport: (query) => apiCall(`/reports/report?${query}`),
    getYearlyReport: () => apiCall('/reports/yearly'),
    getMonthlyReport: () => apiCall('/reports/monthly'),
    getReportYears: () => apiCall('/reports/years'),
    
    // ANALYTICS
    getKPI: (period) => apiCall(`/analytics/kpi?period=${period}`),
    getSalesTrend: (period) => apiCall(`/analytics/sales-trend?period=${period}`),
    getHourlySales: () => apiCall('/analytics/hourly-sales'),
    getTopProducts: (limit = 8) => apiCall(`/analytics/top-products?limit=${limit}`),
    getCategoryPerformance: () => apiCall('/analytics/category-performance'),
    getPaymentMethods: () => apiCall('/analytics/payment-methods'),
    getProfitAnalysis: () => apiCall('/analytics/profit-analysis'),
    getCashierPerformance: () => apiCall('/analytics/cashier-performance'),
    getInventoryInsights: () => apiCall('/analytics/inventory-insights'),
    getCustomerInsights: () => apiCall('/analytics/customer-insights'),
    
    // EMPLOYEES
    getEmployees: () => apiCall('/employees'),
    getEmployeeStats: () => apiCall('/employees/stats'),
    getPermissionsMatrix: () => apiCall('/employees/permissions-matrix'),
    createEmployee: (data) => apiCall('/employees', { method: 'POST', body: JSON.stringify(data) }),
    updateEmployee: (id, data) => apiCall(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteEmployee: (id) => apiCall(`/employees/${id}`, { method: 'DELETE' }),
    updateEmployeePermissions: (id, permissions) => apiCall(`/employees/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions }) }),
    resetEmployeePassword: (id, newPassword) => apiCall(`/employees/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
    
    // RETURNS
    searchSaleForReturn: (query) => apiCall(`/returns/search-sale?${query}`),
    createReturn: (data) => apiCall('/returns', { method: 'POST', body: JSON.stringify(data) }),
    getReturns: () => apiCall('/returns'),
    getReturn: (id) => apiCall(`/returns/${id}`),
    
    // M-PESA
    initiateMpesa: (data) => apiCall('/mpesa/stkpush', { method: 'POST', body: JSON.stringify(data) }),
    checkMpesaStatus: (id) => apiCall(`/mpesa/status/${id}`),
    getMpesaTransactions: () => apiCall('/mpesa/transactions'),
    getMpesaConfig: () => apiCall('/mpesa/config'),
    
    // BACKUP
    createBackup: (type) => apiCall('/backup/create', { method: 'POST', body: JSON.stringify({ type }) }),
    getBackups: () => apiCall('/backup/list'),
    getBackupStats: () => apiCall('/backup/stats'),
    cleanBackups: () => apiCall('/backup/clean', { method: 'POST' }),
    deleteBackup: (type, filename) => apiCall(`/backup/${type}/${filename}`, { method: 'DELETE' }),
    
    // SETTINGS
    getServerInfo: () => apiCall('/server-info')
};

window.API = API;
