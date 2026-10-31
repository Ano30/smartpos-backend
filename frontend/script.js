/* ============================================================
   SMARTPOS - Main Application Logic (Full Restored + Offline)
   ============================================================ */

// ============================================================
// GLOBAL STATE
// ============================================================
let currentUser = null;
let currentCompany = null;
let products = [];
let cart = [];
let discountAmount = 0;
let currentPaymentMethod = 'cash';
let searchTimeout = null;
let mpesaCheckInterval = null;
let mpesaCheckoutId = null;
let mpesaAmount = 0;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    const token = getAuthToken();
    const userJson = localStorage.getItem('pos_user');
    const companyJson = localStorage.getItem('pos_company');

    if (token && userJson && companyJson) {
        try {
            currentUser = JSON.parse(userJson);
            currentCompany = JSON.parse(companyJson);
            
            // Verify token in the background
            const verifyData = await API.verify();
            currentUser = verifyData.user;
            currentCompany = verifyData.company;
            
            showMainApp();
        } catch (err) {
            console.log('[App] Session invalid, showing login');
            handleLogout();
        }
    } else {
        showAuthScreen();
    }
}

// ============================================================
// NAVIGATION & UI STATE
// ============================================================
function showAuthScreen() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    loadCompanies();
}

function showMainApp() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    
    document.getElementById('sidebarUser').textContent = currentUser.fullName || currentUser.username;
    document.getElementById('sidebarRole').textContent = currentUser.role.toUpperCase();
    document.getElementById('sidebarCompany').textContent = currentCompany.name;
    
    applyPermissions();
    loadProducts();
    loadCategories();
    
    setInterval(() => {
        const now = new Date();
        const dateTimeEl = document.getElementById('dateTime');
        if (dateTimeEl) dateTimeEl.textContent = now.toLocaleString();
    }, 1000);
}

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.classList.add('active');
    
    const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (navItem) navItem.classList.add('active');

    // Trigger page-specific loads
    if (pageId === 'inventory') loadInventoryTable();
    if (pageId === 'employees') loadEmployees();
    if (pageId === 'reports') generateReport();
    if (pageId === 'analytics') refreshAnalytics();
    if (pageId === 'backup') loadBackups();
}

// ============================================================
// AUTHENTICATION & LOGIN
// ============================================================
function selectRole(role) {
    document.querySelectorAll('.auth-form').forEach(el => el.classList.remove('active'));
    const screen = document.getElementById(`${role}Screen`);
    if (screen) screen.classList.add('active');
}

function backToRoleSelection() {
    document.querySelectorAll('.auth-form').forEach(el => el.classList.remove('active'));
    const screen = document.getElementById('roleSelectionScreen');
    if (screen) screen.classList.add('active');
}

function switchAuth(screen) {
    document.querySelectorAll('.auth-form').forEach(el => el.classList.remove('active'));
    if (screen === 'register') {
        const regForm = document.getElementById('registerForm');
        if (regForm) regForm.classList.add('active');
    } else {
        const roleSelection = document.getElementById('roleSelectionScreen');
        if (roleSelection) roleSelection.classList.add('active');
    }
}

async function loadCompanies() {
    try {
        const companies = await API.getCompanies();
        ['ownerCompany', 'adminCompany', 'cashierCompany'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<option value="">-- Select Company --</option>' + companies.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        });
    } catch (err) {
        console.error('Failed to load companies:', err);
    }
}

async function handleRoleLogin(role) {
    const companyId = document.getElementById(`${role}Company`).value;
    const username = document.getElementById(`${role}Username`).value.trim();
    const password = document.getElementById(`${role}Password`).value;

    if (!companyId || !username || !password) return showToast('Please fill all fields', 'error');

    try {
        const data = await API.login({ company_id: companyId, username, password, role });
        localStorage.setItem('pos_token', data.token);
        localStorage.setItem('pos_user', JSON.stringify(data.user));
        localStorage.setItem('pos_company', JSON.stringify(data.company));
        currentUser = data.user;
        currentCompany = data.company;
        showToast('Login successful!', 'success');
        showMainApp();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function handleLogout() {
    localStorage.clear();
    window.location.reload();
}

// ============================================================
// PRODUCTS & INVENTORY
// ============================================================
async function loadProducts() {
    try {
        products = await API.getProducts();
        renderProductGrid();
    } catch (err) {
        console.error('[App] Failed to load products:', err);
        if (navigator.onLine) showToast('Failed to load products', 'error');
    }
}

function renderProductGrid() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    grid.innerHTML = products.map(p => `
        <div class="product-card" onclick="addToCart(${p.id})">
            <div class="product-name">${p.name}</div>
            <div class="product-price">KES ${parseFloat(p.selling_price).toFixed(2)}</div>
            <div class="product-stock">Stock: ${p.stock} ${p.unit_of_measure || 'pcs'}</div>
        </div>
    `).join('');
}

// ============================================================
// CART & CHECKOUT (WITH OFFLINE ELECTRON LOGIC)
// ============================================================
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    if (product.stock <= 0) return showToast('Out of stock', 'error');

    const existing = cart.find(item => item.productId === productId);
    if (existing) {
        if (existing.quantity + 1 > product.stock) return showToast('Not enough stock', 'error');
        existing.quantity++;
    } else {
        cart.push({ productId: product.id, name: product.name, unit_price: parseFloat(product.selling_price), quantity: 1, sellMode: 'unit' });
    }
    renderCart();
}

function renderCart() {
    const cartItems = document.getElementById('cartItems');
    const itemCount = document.getElementById('itemCount');
    const subtotalEl = document.getElementById('subtotal');
    const totalEl = document.getElementById('total');

    if (!cartItems) return;

    if (cart.length === 0) {
        cartItems.innerHTML = '<div class="empty-cart">Cart is empty</div>';
        if(itemCount) itemCount.textContent = '0 items';
        if(subtotalEl) subtotalEl.textContent = 'KES 0.00';
        if(totalEl) totalEl.textContent = 'KES 0.00';
        return;
    }

    cartItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">KES ${item.unit_price.toFixed(2)} x ${item.quantity}</div>
            </div>
            <div class="cart-item-actions">
                <button onclick="updateCartQty(${item.productId}, -1)">-</button>
                <span>${item.quantity}</span>
                <button onclick="updateCartQty(${item.productId}, 1)">+</button>
            </div>
        </div>
    `).join('');

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    const finalTotal = Math.max(0, subtotal - discountAmount);

    if(itemCount) itemCount.textContent = `${totalItems} items`;
    if(subtotalEl) subtotalEl.textContent = `KES ${subtotal.toFixed(2)}`;
    if(totalEl) totalEl.textContent = `KES ${finalTotal.toFixed(2)}`;
}

async function checkout() {
    if (cart.length === 0) return showToast('Cart is empty', 'error');

    const token = localStorage.getItem('pos_token');
    const subtotal = cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    const total = Math.max(0, subtotal - discountAmount);
    
    const salePayload = {
        items: cart, subtotal, discountAmount, total,
        paymentMethod: currentPaymentMethod,
        paymentCash: currentPaymentMethod === 'cash' ? total : 0,
        paymentMpesa: currentPaymentMethod === 'mpesa' ? total : 0,
        mpesaReceipt: null, customerPhone: null
    };

    // OFFLINE ELECTRON LOGIC
    if (window.require && window.require('electron')) {
        const { ipcRenderer } = window.require('electron');
        if (!navigator.onLine) {
            try {
                await ipcRenderer.invoke('save-offline-sale', { saleData: salePayload, token: token });
                showToast("Offline Mode: Sale saved locally and will sync when internet returns.", "warning");
                clearCart();
                loadProducts(); 
            } catch (err) {
                showToast("Failed to save offline: " + err.message, "error");
            }
            return;
        }
    }

    // ONLINE LOGIC
    try {
        const response = await API.createSale(salePayload);
        showReceipt(response.receipt);
        clearCart();
        loadProducts();
    } catch (err) {
        showToast("Sale failed: " + err.message, "error");
    }
}

function clearCart() {
    cart = [];
    discountAmount = 0;
    renderCart();
    const discountRow = document.getElementById('discountRow');
    if (discountRow) discountRow.style.display = 'none';
}

function updateCartQty(productId, change) {
    const item = cart.find(i => i.productId === productId);
    if (!item) return;
    if (change === -1 && item.quantity === 1) cart = cart.filter(i => i.productId !== productId);
    else item.quantity += change;
    renderCart();
}

// ============================================================
// UI HELPERS
// ============================================================
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function showReceipt(receipt) {
    const modal = document.getElementById('receiptModal');
    if (!modal) return;

    document.getElementById('receiptCompany').textContent = currentCompany.name;
    document.getElementById('receiptDate').textContent = new Date(receipt.date).toLocaleString();
    document.getElementById('receiptCashier').textContent = receipt.cashier;

    const body = document.getElementById('receiptBody');
    body.innerHTML = receipt.items.map(item => `
        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
            <span>${item.name} x${item.quantity}</span>
            <span>KES ${(item.unit_price * item.quantity).toFixed(2)}</span>
        </div>
    `).join('');

    body.innerHTML += `
        <div style="border-top: 1px dashed #ccc; margin-top:10px; padding-top:10px;">
            <div style="display:flex; justify-content:space-between; font-weight:bold;">
                <span>TOTAL</span>
                <span>KES ${receipt.total.toFixed(2)}</span>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function closeReceipt() {
    document.getElementById('receiptModal').style.display = 'none';
}

function printReceipt() {
    window.print();
}

// ============================================================
// PLACEHOLDERS FOR OTHER PAGES (Will load from your other .js files)
// ============================================================
function applyPermissions() {}
function loadCategories() {}

function loadInventoryTable() {
    if (typeof renderInventoryTable === 'function') renderInventoryTable();
}

function loadEmployees() {
    if (typeof renderEmployees === 'function') renderEmployees();
}

function generateReport() {
    if (typeof renderReports === 'function') renderReports();
}

function refreshAnalytics() {
    if (typeof loadAnalytics === 'function') loadAnalytics();
}

function loadBackups() {
    if (typeof renderBackups === 'function') renderBackups();
}

// ============================================================
// EXPOSE FUNCTIONS TO WINDOW
// ============================================================
window.selectRole = selectRole;
window.backToRoleSelection = backToRoleSelection;
window.switchAuth = switchAuth;
window.loadCompanies = loadCompanies;
window.handleRoleLogin = handleRoleLogin;
window.handleLogout = handleLogout;
window.addToCart = addToCart;
window.checkout = checkout;
window.clearCart = clearCart;
window.updateCartQty = updateCartQty;
window.closeReceipt = closeReceipt;
window.printReceipt = printReceipt;
window.switchPage = switchPage;
