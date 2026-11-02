/* ============================================================
   SMARTPOS - Main Application Logic (script.js)
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

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    const token = localStorage.getItem('pos_token');
    const userJson = localStorage.getItem('pos_user');
    const companyJson = localStorage.getItem('pos_company');

    if (token && userJson && companyJson && userJson !== 'undefined' && companyJson !== 'undefined') {
        try {
            currentUser = JSON.parse(userJson);
            currentCompany = JSON.parse(companyJson);
            
            // If we have the data, show the app immediately
            showMainApp();
            
            // Optionally verify in the background
            // API.verify().catch(() => handleLogout());
        } catch (err) {
            console.error('[App] Session parse error:', err);
            handleLogout();
        }
    } else {
        showAuthScreen();
    }
}

// ============================================================
// AUTHENTICATION & ROLE SELECTION
// ============================================================
function showAuthScreen() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    loadCompanies();
}

async function loadCompanies() {
    try {
        const companies = await API.getCompanies();
        const selects = ['ownerCompany', 'adminCompany', 'cashierCompany'];
        selects.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = '<option value="">-- Select Company --</option>' + 
                    companies.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            }
        });
    } catch (err) {
        console.error('[App] Failed to load companies:', err);
    }
}

function selectRole(role) {
    document.getElementById('roleSelectionScreen').classList.remove('active');
    document.getElementById(`${role}Screen`).classList.add('active');
}

function backToRoleSelection() {
    document.querySelectorAll('.auth-form').forEach(el => el.classList.remove('active'));
    document.getElementById('roleSelectionScreen').classList.add('active');
}

function switchAuth(screen) {
    document.querySelectorAll('.auth-form').forEach(el => el.classList.remove('active'));
    if (screen === 'register') {
        document.getElementById('registerForm').classList.add('active');
    } else {
        document.getElementById('roleSelectionScreen').classList.add('active');
    }
}

async function handleRoleLogin(role) {
    const companySelect = document.getElementById(`${role}Company`);
    const usernameInput = document.getElementById(`${role}Username`);
    const passwordInput = document.getElementById(`${role}Password`);

    if (!companySelect || !usernameInput || !passwordInput) return;

    const companyId = companySelect.value;
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!companyId || !username || !password) {
        showToast('Please fill all fields', 'error');
        return;
    }

    try {
        const data = await API.login({
            company_id: companyId,
            username: username,
            password: password,
            role: role
        });

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

async function handleRegister() {
    const companyName = document.getElementById('regCompany').value.trim();
    const fullName = document.getElementById('regFullName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;
    const phone = document.getElementById('regPhone').value.trim();

    if (!companyName || !fullName || !username || !password || !confirm) {
        showToast('Please fill all required fields', 'error');
        return;
    }
    if (password !== confirm) {
        showToast('Passwords do not match', 'error');
        return;
    }

    try {
        await API.register({ companyName, fullName, username, password, phone });
        showToast('Company created! Please login.', 'success');
        switchAuth('owner');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function handleLogout() {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_company');
    currentUser = null;
    currentCompany = null;
    window.location.reload();
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

// ============================================================
// NAVIGATION & MOBILE UI
// ============================================================
function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) targetPage.classList.add('active');
    
    const navItem = document.querySelector(`.nav-item[data-page="${pageId}"]`);
    if (navItem) navItem.classList.add('active');
}

function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobileSidebarOverlay');
    if (!sidebar) return;
    sidebar.classList.toggle('mobile-open');
    if (overlay) overlay.classList.toggle('active');
}

function togglePassword(fieldId, icon) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    if (field.type === 'password') {
        field.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        field.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
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
            <div class="product-stock">Stock: ${p.stock}</div>
        </div>
    `).join('');
}

// ============================================================
// CART & CHECKOUT
// ============================================================
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    if (product.stock <= 0) { showToast('Out of stock', 'error'); return; }

    const existing = cart.find(item => item.productId === productId);
    if (existing) {
        if (existing.quantity + 1 > product.stock) { showToast('Not enough stock', 'error'); return; }
        existing.quantity++;
    } else {
        cart.push({ productId: product.id, name: product.name, unit_price: parseFloat(product.selling_price), quantity: 1 });
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

function updateCartQty(productId, change) {
    const item = cart.find(i => i.productId === productId);
    if (!item) return;
    if (change === -1 && item.quantity === 1) {
        cart = cart.filter(i => i.productId !== productId);
    } else {
        item.quantity += change;
    }
    renderCart();
}

function clearCart() {
    cart = [];
    discountAmount = 0;
    renderCart();
    showToast('Cart cleared', 'info');
}

// ============================================================
// PAYMENT & DISCOUNT CONTROLS
// ============================================================
function selectPaymentMethod(method) {
    currentPaymentMethod = method;
    
    document.querySelectorAll('.pay-method-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.querySelector(`.pay-method-btn[data-method="${method}"]`);
    if (btn) btn.classList.add('active');
    
    document.querySelectorAll('.payment-view').forEach(view => view.classList.remove('active'));
    const view = document.getElementById(`payment${method.charAt(0).toUpperCase() + method.slice(1)}View`);
    if (view) view.classList.add('active');
}

function quickPayment(amount) {
    const input = document.getElementById('paymentInput');
    if (input) {
        input.value = amount;
        if (typeof calculateChange === 'function') calculateChange();
    }
}

function toggleDiscountInput() {
    const group = document.getElementById('discountInputGroup');
    if (group) {
        group.style.display = group.style.display === 'none' ? 'flex' : 'none';
    }
}

function applyDiscount() {
    const input = document.getElementById('discountInput');
    if (!input) return;
    const val = parseFloat(input.value);
    if (isNaN(val) || val < 0) {
        showToast('Enter a valid discount amount', 'error');
        return;
    }
    discountAmount = val;
    const row = document.getElementById('discountRow');
    const display = document.getElementById('discountDisplay');
    if (row) row.style.display = 'flex';
    if (display) display.textContent = `- KES ${val.toFixed(2)}`;
    
    renderCart();
    toggleDiscountInput();
}

function clearDiscount() {
    discountAmount = 0;
    const row = document.getElementById('discountRow');
    if (row) row.style.display = 'none';
    const input = document.getElementById('discountInput');
    if (input) input.value = '';
    
    renderCart();
    toggleDiscountInput();
}

// ============================================================
// CHECKOUT (WITH OFFLINE ELECTRON LOGIC)
// ============================================================
async function checkout() {
    if (cart.length === 0) { showToast('Cart is empty', 'error'); return; }

    const token = localStorage.getItem('pos_token');
    const subtotal = cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    const total = Math.max(0, subtotal - discountAmount);
    
    const salePayload = {
        items: cart,
        subtotal: subtotal,
        discountAmount: discountAmount,
        total: total,
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
                showToast("Offline Mode: Sale saved locally and will sync later.", "warning");
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
        showToast('Sale completed!', 'success');
        clearCart();
        loadProducts();
    } catch (err) {
        showToast("Sale failed: " + err.message, "error");
    }
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

// ============================================================
// EXPOSE FUNCTIONS TO GLOBAL WINDOW
// ============================================================
window.selectRole = selectRole;
window.backToRoleSelection = backToRoleSelection;
window.switchAuth = switchAuth;
window.handleRoleLogin = handleRoleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
window.addToCart = addToCart;
window.checkout = checkout;
window.clearCart = clearCart;
window.updateCartQty = updateCartQty;
window.switchPage = switchPage;
window.selectPaymentMethod = selectPaymentMethod;
window.quickPayment = quickPayment;
window.toggleDiscountInput = toggleDiscountInput;
window.applyDiscount = applyDiscount;
window.clearDiscount = clearDiscount;
window.toggleMobileSidebar = toggleMobileSidebar;
window.togglePassword = togglePassword;
