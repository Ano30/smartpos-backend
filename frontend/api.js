const CLOUD_URL = 'https://smartpos-backend-gtwl.onrender.com';

function detectAPIBase() {
    return CLOUD_URL + '/api'; // Force cloud
}

const API_BASE = detectAPIBase();
let authToken = localStorage.getItem('pos_token') || null;
window.getAuthToken = () => authToken;

async function apiCall(endpoint, options = {}, retries = 2) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        try {
            const response = await fetch(API_BASE + endpoint, { ...options, headers, signal: controller.signal });
            clearTimeout(timeoutId);

            const isAuthRoute = endpoint.includes('/auth/login') || endpoint.includes('/companies');
            
            // If 401 on a non-login route, ONLY clear token if we are actually online
            if (response.status === 401 && !isAuthRoute) {
                localStorage.clear();
                throw new Error('Session expired.');
            }

            let data;
            const text = await response.text();
            try { data = JSON.parse(text); } catch (e) { throw new Error('Invalid response.'); }
            if (!response.ok) throw new Error(data.error || 'Request failed');
            return data;

        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError' && attempt < retries) continue;
            throw err;
        }
    }
}
