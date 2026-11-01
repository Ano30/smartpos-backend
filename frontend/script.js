/* ============================================================
   SMARTPOS - Main Application Logic (Stops Instant Logout)
   ============================================================ */

let currentUser = null;
let currentCompany = null;
let products = [];
let cart = [];
let discountAmount = 0;
let currentPaymentMethod = 'cash';

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    const token = getAuthToken();
    const userJson = localStorage.getItem('pos_user');
    const companyJson = localStorage.getItem('pos_company');

    if (token && userJson && companyJson) {
        // 1. Instantly trust local storage to prevent logout
        currentUser = JSON.parse(userJson);
        currentCompany = JSON.parse(companyJson);
        showMainApp();

        // 2. Verify in background, but DO NOT logout if it fails
        try {
            const verifyData = await API.verify();
            currentUser = verifyData.user;
            currentCompany = verifyData.company;
            localStorage.setItem('pos_user', JSON.stringify(currentUser));
            localStorage.setItem('pos_company', JSON.stringify(currentCompany));
        } catch (err) {
            console.log('[App] Background verify failed. Keeping local session.', err);
        }
    } else {
        showAuthScreen();
    }
}

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
    
    loadProducts();
    
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
}

// ============================================================
// AUTHENTICATION
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
    if (screen === 'register') document.getElementById('registerForm').classList.add('active');
    else document.getElementById('roleSelectionScreen').classList.add('active');
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
// PRODUCTS & CART
// ============================================================
async function loadProducts() {
    try {
        products = await API.getProducts();
        localStorage.setItem('pos_cached_products', JSON.stringify(products)); // Cache for offline
        renderProductGrid();
    } catch (err) {
        console.error('[App] Failed to fetch products. Loading offline cache...', err);
        const cached = localStorage.getItem('pos_cached_products');
        if (cached) {
            products = JSON.parse(cached);
            renderProductGrid();
            showToast('Running in Offline Mode (cached products)', 'warning');
        } else {
            showToast('No internet and no cached products found.', 'error');
        }
    }
}

function renderProductGrid() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;
    grid.innerHTML = products.map(p => `
        <div class="product-card" onclick="addToCart(${p.id})">
            <div class="product-name">${p.name}</div>
            <div class="product-price">KES ${parseFloat(p.selling_price).toFixed(2)}</div>
            <div class="product-stock">Stock: ${p.stock}</div>
        </div>
    `).join('');
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    if (product.stock <= 0) return showToast('Out of stock', 'error');

    const existing = cart.find(item => item.productId === productId);
    if (existing) {
        if (existing.quantity + 1 > product.stock) return showToast('Not enough stock', 'error');
        existing.quantity++;
    } else {
        cart.push({ productId: product.id, name: product.name, unit_price: parseFloat(product.selling_price), quantity: 1 });
    }
    renderCart();
}

function renderCart() {
    const cartItems = document.getElementById('cartItems');
    if (!cartItems) return;
    if (cart.length === 0) {
        cartItems.innerHTML = '<div class="empty-cart">Cart is empty</div>';
        document.getElementById('itemCount').textContent = '0 items';
        document.getElementById('subtotal').textContent = 'KES 0.00';
        document.getElementById('total').textContent = 'KES 0.00';
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
    document.getElementById('itemCount').textContent = `${totalItems} items`;
    document.getElementById('subtotal').textContent = `KES ${subtotal.toFixed(2)}`;
    document.getElementById('total').textContent = `KES ${(subtotal - discountAmount).toFixed(2)}`;
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
        paymentMpesa: currentPaymentMethod === 'mpesa' ? total : 0
    };

    // OFFLINE ELECTRON LOGIC
    if (window.require && window.require('electron')) {
        const { ipcRenderer } = window.require('electron');
        if (!navigator.onLine) {
            try {
                await ipcRenderer.invoke('save-offline-sale', { saleData: salePayload, token: token });
                showToast("Offline Mode: Sale saved locally.", "warning");
                
                // Deduct stock locally
                cart.forEach(cartItem => {
                    const p = products.find(prod => prod.id === cartItem.productId);
                    if (p) p.stock -= cartItem.quantity;
                });
                localStorage.setItem('pos_cached_products', JSON.stringify(products));
                
                clearCart();
                renderProductGrid(); 
            } catch (err) {
                showToast("Failed to save offline.", "error");
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
}

function updateCartQty(productId, change) {
    const item = cart.find(i => i.productId === productId);
    if (!item) return;
    if (change === -1 && item.quantity === 1) cart = cart.filter(i => i.productId !== productId);
    else item.quantity += change;
    renderCart();
}

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
                <span>TOTAL</span><span>KES ${receipt.total.toFixed(2)}</span>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function closeReceipt() { document.getElementById('receiptModal').style.display = 'none'; }
function printReceipt() { window.print(); }

// Expose to window
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
