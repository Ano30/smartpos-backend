/* ============================================
   SMARTPOS - Main Frontend Logic (v7 - Performance Optimized)
   ============================================ */

// ============ GLOBAL STATE ============
let currentUser = null;
let currentCompany = null;
let currentData = { products: [], sales: [] };
let cart = [];
let currentCategory = 'all';
let selectedPaymentMethod = 'cash';
let appliedDiscount = 0;
let appliedDiscountType = null;
let suggestionIndex = -1;
let currentRestockProduct = null;

let dateTimeInterval = null;
let globalClickListeners = [];

let mpesaState = {
    checkoutId: null, phone: null, amount: 0, receiptNo: null,
    pollInterval: null, elapsed: 0, isSplit: false, splitCash: 0, splitMpesa: 0
};

let pendingProductOptions = null;
let pendingWeightProduct = null;

// ============ PERMISSION HELPERS ============
function hasPermission(permission) {
    if (!currentUser) return false;
    if (currentUser.role === 'owner') return true;
    const perms = currentUser.permissions || [];
    return perms.includes(permission);
}

function requirePermission(permission, actionName = 'do this') {
    if (!hasPermission(permission)) {
        showToast(`Access denied. You cannot ${actionName}.`, 'error');
        return false;
    }
    return true;
}

function syncUserToWindow() {
    window.currentUser = currentUser;
    window.currentCompany = currentCompany;
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async function() {
    console.log('[SmartPOS] script.js loaded');

    // ✅ NON-BLOCKING backend check — fires in background, doesn't delay typing
    (async () => {
        try {
            const res = await fetch('http://localhost:3000/api/health');
            if (res.ok) console.log('[SmartPOS] Backend ready ✓');
            else console.warn('[SmartPOS] Backend returned', res.status);
        } catch (e) {
            console.warn('[SmartPOS] Backend not responding yet');
        }
    })();

    // ✅ Load companies in background — don't await, let UI be responsive
    loadCompaniesIntoAllDropdowns();

    const savedUser = localStorage.getItem('pos_user');
    const savedCompany = localStorage.getItem('pos_company');
    const savedToken = localStorage.getItem('pos_token');

    if (savedToken && savedUser && savedCompany) {
        try {
            currentUser = JSON.parse(savedUser);
            currentCompany = JSON.parse(savedCompany);
            syncUserToWindow();

            try {
                const verify = await API.verify();
                currentUser = verify.user;
                currentCompany = verify.company;
                localStorage.setItem('pos_user', JSON.stringify(verify.user));
                localStorage.setItem('pos_company', JSON.stringify(verify.company));
                syncUserToWindow();
            } catch (verifyErr) {
                console.log('Session verify failed, using cached');
            }

            await loadProducts();
            showMainApp();
            return;
        } catch (e) {
            console.error('Session invalid:', e);
            logout();
            return;
        }
    }

    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    backToRoleSelection();

    // ✅ Force focus to role selection area after a tiny delay
    setTimeout(() => {
        const firstCard = document.querySelector('.role-card');
        if (firstCard) firstCard.focus?.();
    }, 100);
});

// ============================================================
// AUTH: ROLE-BASED FLOW
// ============================================================

function selectRole(role) {
    console.log('[SmartPOS] selectRole:', role);

    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));

    let formId;
    if (role === 'owner') formId = 'ownerScreen';
    else if (role === 'admin') formId = 'adminScreen';
    else if (role === 'cashier') formId = 'cashierScreen';
    else return;

    const el = document.getElementById(formId);
    if (!el) return;
    el.classList.add('active');

    // ✅ Focus the username field IMMEDIATELY (not after 200ms)
    // This makes the field ready for typing right away
    const userInput = document.getElementById(role + 'Username');
    if (userInput) {
        userInput.focus();
        // Use requestAnimationFrame to ensure DOM is painted first
        requestAnimationFrame(() => userInput.focus());
    }

    // ✅ Reload companies in background
    loadCompaniesIntoAllDropdowns();
}

function backToRoleSelection() {
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    const el = document.getElementById('roleSelectionScreen');
    if (el) el.classList.add('active');
}

function switchAuth(form) {
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    let formId;
    if (form === 'register') formId = 'registerForm';
    else if (form === 'owner') formId = 'ownerScreen';
    else if (form === 'admin') formId = 'adminScreen';
    else if (form === 'cashier') formId = 'cashierScreen';
    else formId = 'roleSelectionScreen';

    const el = document.getElementById(formId);
    if (el) el.classList.add('active');
}

async function loadCompaniesIntoAllDropdowns() {
    try {
        const companies = await API.getCompanies();
        const optionsHtml = '<option value="">-- Select Company --</option>' +
            companies.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        ['ownerCompany', 'adminCompany', 'cashierCompany'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = optionsHtml;
        });
    } catch (err) {
        console.error('Failed to load companies:', err);
        ['ownerCompany', 'adminCompany', 'cashierCompany'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<option value="">-- Backend offline --</option>';
        });
    }
}

async function handleRoleLogin(role) {
    const companyEl = document.getElementById(role + 'Company');
    const userEl = document.getElementById(role + 'Username');
    const passEl = document.getElementById(role + 'Password');

    if (!companyEl || !userEl || !passEl) return;

    const companyId = companyEl.value;
    const username = userEl.value.trim();
    const password = passEl.value;

    if (!companyId) return showToast('Please select a company', 'error');
    if (!username || !password) return showToast('Please enter username and password', 'error');

    try {
        const result = await API.login({
            company_id: parseInt(companyId),
            username,
            password,
            role
        });

        localStorage.setItem('pos_token', result.token);
        localStorage.setItem('pos_user', JSON.stringify(result.user));
        localStorage.setItem('pos_company', JSON.stringify(result.company));

        authToken = result.token;
        currentUser = result.user;
        currentCompany = result.company;
        syncUserToWindow();

        passEl.value = '';

        await loadProducts();
        showMainApp();
        showToast(`Welcome back, ${result.user.fullName || result.user.username}!`, 'success');
    } catch (err) {
        showToast(err.message || 'Invalid credentials', 'error');
    }
}

async function handleRegister() {
    const companyName = document.getElementById('regCompany').value.trim();
    const fullName = document.getElementById('regFullName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;
    const phone = document.getElementById('regPhone').value.trim();

    if (!companyName || !username || !password || !fullName) {
        return showToast('Please fill all required fields', 'error');
    }
    if (password !== confirm) return showToast('Passwords do not match', 'error');
    if (password.length < 4) return showToast('Password must be at least 4 characters', 'error');

    try {
        await API.register({ companyName, fullName, username, password, phone });
        showToast('✓ Company created! Please login as owner.', 'success');

        ['regCompany','regFullName','regUsername','regPassword','regConfirm','regPhone']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

        await loadCompaniesIntoAllDropdowns();

        setTimeout(() => {
            switchAuth('owner');
            const select = document.getElementById('ownerCompany');
            if (select) {
                for (let opt of select.options) {
                    if (opt.text === companyName) { select.value = opt.value; break; }
                }
            }
            document.getElementById('ownerUsername').value = username;
            document.getElementById('ownerPassword').value = password;
        }, 800);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function handleLogout() {
    if (!confirm('Are you sure you want to logout?')) return;
    logout();
}

function logout() {
    cleanupTimers();
    cleanupGlobalListeners();

    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_company');
    authToken = null;
    currentUser = null;
    currentCompany = null;
    syncUserToWindow();
    currentData = { products: [], sales: [] };
    cart = [];
    appliedDiscount = 0;

    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('authScreen').style.display = 'flex';
    backToRoleSelection();

    ['ownerUsername','ownerPassword','adminUsername','adminPassword','cashierUsername','cashierPassword']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    loadCompaniesIntoAllDropdowns();
}

function cleanupTimers() {
    if (dateTimeInterval) {
        clearInterval(dateTimeInterval);
        dateTimeInterval = null;
    }
    if (mpesaState.pollInterval) {
        clearInterval(mpesaState.pollInterval);
        mpesaState.pollInterval = null;
    }
}

function cleanupGlobalListeners() {
    globalClickListeners.forEach(({ target, event, handler }) => {
        try { target.removeEventListener(event, handler); } catch (e) {}
    });
    globalClickListeners = [];
    document.querySelectorAll('[data-listener-attached]').forEach(el => {
        delete el.dataset.listenerAttached;
    });
}

function trackListener(target, event, handler) {
    target.addEventListener(event, handler);
    globalClickListeners.push({ target, event, handler });
}

async function showMainApp() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'flex';

    syncUserToWindow();

    document.getElementById('sidebarCompany').textContent = currentCompany.name;
    document.getElementById('sidebarUser').textContent = currentUser.fullName || currentUser.username;
    document.getElementById('sidebarRole').textContent =
        (currentUser.role || 'employee').charAt(0).toUpperCase() + (currentUser.role || 'employee').slice(1);

    applyRolePermissions();
    updateDateTime();

    // ✅ Update time every 30 seconds instead of every 1 second (massive CPU savings)
    if (dateTimeInterval) clearInterval(dateTimeInterval);
    dateTimeInterval = setInterval(updateDateTime, 30000);

    renderProducts();
    renderCategoryFilter();
    populateCategoryList();
    setupNavigation();
    setupEventListeners();
    setupBarcodeScanner();
}

// ============ ROLE PERMISSIONS ============
function applyRolePermissions() {
    const perms = currentUser.permissions || [];
    const isOwner = currentUser.role === 'owner';
    const has = (p) => isOwner || perms.includes(p);

    const permissionMap = {
        'add_product': ['.perm-add-product', '[data-page="addItem"]'],
        'restock': ['.perm-restock', '[data-page="restock"]'],
        'process_returns': ['.perm-returns', '[data-page="returns"]'],
        'manage_employees': ['.perm-employees', '[data-page="employees"]'],
        'view_reports': ['.perm-reports', '[data-page="reports"]'],
        'view_analytics': ['.perm-analytics', '[data-page="analytics"]'],
        'manage_backups': ['.perm-backups', '[data-page="backup"]'],
        'import_data': ['.perm-import', '[data-page="import"]']
    };

    Object.entries(permissionMap).forEach(([permission, selectors]) => {
        const allowed = has(permission);
        selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                el.style.display = allowed ? '' : 'none';
            });
        });
    });

    const labelsNav = document.querySelector('[data-page="labels"]');
    if (labelsNav) labelsNav.style.display = has('view_inventory') ? '' : 'none';
    const salesNav = document.querySelector('[data-page="sales"]');
    if (salesNav) salesNav.style.display = has('make_sale') ? '' : 'none';
    const invNav = document.querySelector('[data-page="inventory"]');
    if (invNav) invNav.style.display = has('view_inventory') ? '' : 'none';
}

// ============ NAVIGATION ============
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.dataset.listenerAttached === 'true') return;
        item.dataset.listenerAttached = 'true';
        item.addEventListener('click', function(e) {
            e.preventDefault();
            switchPage(this.dataset.page);
        });
    });
}

function switchPage(page) {
    const pagePermission = {
        'sales': 'make_sale', 'restock': 'restock', 'inventory': 'view_inventory',
        'addItem': 'add_product', 'import': 'import_data', 'returns': 'process_returns',
        'labels': 'view_inventory', 'employees': 'manage_employees', 'reports': 'view_reports',
        'analytics': 'view_analytics', 'backup': 'manage_backups'
    };

    const requiredPerm = pagePermission[page];
    if (requiredPerm && !hasPermission(requiredPerm)) {
        showToast('Access denied.', 'error');
        return;
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');
    const navItem = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navItem) navItem.classList.add('active');

    if (page === 'inventory') updateInventory();
    else if (page === 'reports') { populateYearFilter(); generateReport(); }
    else if (page === 'sales') {
        renderProducts();
        setTimeout(() => document.getElementById('barcodeScannerInput')?.focus(), 200);
    }
    else if (page === 'analytics') { if (typeof refreshAnalytics === 'function') refreshAnalytics(); }
    else if (page === 'backup') { if (typeof loadBackups === 'function') loadBackups(); }
    else if (page === 'employees') { if (typeof loadEmployeesPage === 'function') loadEmployeesPage(); }
    else if (page === 'labels') { if (typeof initLabelsPage === 'function') initLabelsPage(); }
    else if (page === 'restock') {
        setupRestockScanner();
        setTimeout(() => document.getElementById('restockBarcodeInput')?.focus(), 200);
    }
    else if (page === 'returns') {
        if (typeof showReturnsSearch === 'function') showReturnsSearch();
    }
    else if (page === 'import') {
        if (typeof resetImport === 'function') resetImport();
    }
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
    if (window._mainEventListenersAttached) return;
    window._mainEventListenersAttached = true;

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keyup', e => {
            if (e.key === 'Enter' && !document.getElementById('searchSuggestions')?.classList.contains('active')) {
                searchProduct();
            }
        });
    }

    const invSearch = document.getElementById('inventorySearch');
    if (invSearch) invSearch.addEventListener('keyup', updateInventory);
    const invTypeFilter = document.getElementById('inventoryTypeFilter');
    if (invTypeFilter) invTypeFilter.addEventListener('change', updateInventory);

    ['itemName', 'itemCostPrice', 'itemSellingPrice', 'itemStock', 'itemCategory', 'itemBarcode',
     'itemUnitsPerPack', 'itemSellingPricePerSingle', 'itemStockWeight']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', updateItemPreview);
                el.addEventListener('change', updateItemPreview);
            }
        });

    const paymentInput = document.getElementById('paymentInput');
    if (paymentInput) paymentInput.addEventListener('input', calculateChange);
    const weightInput = document.getElementById('weightInput');
    if (weightInput) weightInput.addEventListener('input', updateWeightTotal);

    const closeSuggestionsHandler = function(e) {
        const container = document.getElementById('searchSuggestions');
        const input = document.getElementById('searchInput');
        if (!container || !input) return;
        if (!container.contains(e.target) && e.target !== input) {
            container.classList.remove('active');
        }
    };
    trackListener(document, 'click', closeSuggestionsHandler);
}

// ============ BARCODE SCANNER ============
function setupBarcodeScanner() {
    const scannerInput = document.getElementById('barcodeScannerInput');
    if (!scannerInput) return;
    if (scannerInput.dataset.listenerAttached === 'true') return;
    scannerInput.dataset.listenerAttached = 'true';

    scannerInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); submitBarcode(); }
    });

    const refocusHandler = function(e) {
        const tag = e.target.tagName;
        if (['INPUT','TEXTAREA','SELECT','BUTTON','A','LABEL'].includes(tag)) return;
        if (e.target.closest('input, textarea, select, button, a, label, .modal')) return;
        const salesPage = document.getElementById('page-sales');
        if (salesPage && salesPage.classList.contains('active')) {
            const si = document.getElementById('barcodeScannerInput');
            if (si && document.activeElement !== si) setTimeout(() => si.focus(), 50);
        }
    };
    trackListener(document, 'click', refocusHandler);

    setTimeout(() => scannerInput.focus(), 500);
}

async function submitBarcode() {
    const input = document.getElementById('barcodeScannerInput');
    if (!input) return;
    const barcode = input.value.trim();
    if (!barcode) { input.focus(); return; }
    input.value = '';
    input.focus();

    try {
        let product = currentData.products.find(p => p.barcode === barcode);
        if (!product) {
            try {
                const apiProduct = await API.getByBarcode(barcode);
                product = normalizeProduct(apiProduct);
                currentData.products.push(product);
            } catch (e) {
                playBeepError();
                showToast(`❌ No product found: ${barcode}`, 'error');
                return;
            }
        }
        handleProductClick(product);
    } catch (err) {
        playBeepError();
        showToast('Error: ' + err.message, 'error');
    }
}

function normalizeProduct(p) {
    return {
        id: p.id, name: p.name, category: p.category, type: p.type,
        barcode: p.barcode, costPrice: p.cost_price,
        sellingPrice: p.selling_price, stock: p.stock,
        reorderLevel: p.reorder_level, icon: p.icon || 'fa-box',
        unitsPerPack: p.units_per_pack || 1,
        sellingPricePerSingle: p.selling_price_per_single || 0,
        unitOfMeasure: p.unit_of_measure || 'pcs',
        costPricePerUnit: p.cost_price_per_unit || 0
    };
}

// ============ SOUND ============
function playBeepSuccess() { if (window.SoundEngine) SoundEngine.success(); }
function playBeepError() { if (window.SoundEngine) SoundEngine.error(); }
function playChaChing() { if (window.SoundEngine) SoundEngine.chaChing(); }
function playClick() { if (window.SoundEngine) SoundEngine.click(); }

// ============ DATE & TIME ============
function updateDateTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit' };
    const el = document.getElementById('dateTime');
    if (el) el.textContent = now.toLocaleDateString('en-KE', options);
}

// ============ PRODUCTS ============
async function loadProducts() {
    try {
        const products = await API.getProducts();
        currentData.products = products.map(normalizeProduct);
    } catch (err) {
        console.error('Load products error:', err);
    }
}

function renderCategoryFilter() {
    const categories = ['all', ...new Set(currentData.products.map(p => p.category).filter(Boolean))];
    const filter = document.getElementById('categoryFilter');
    if (!filter) return;

    filter.innerHTML = categories.map(cat =>
        `<button class="category-btn ${cat === 'all' ? 'active' : ''}" data-category="${cat}">
            ${cat === 'all' ? 'All' : cat}
        </button>`
    ).join('');

    filter.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            filter.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentCategory = this.dataset.category;
            renderProducts();
        });
    });
}

function renderProducts() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    let products = [...currentData.products];
    if (currentCategory !== 'all') products = products.filter(p => p.category === currentCategory);

    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    if (searchTerm) {
        products = products.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            (p.barcode && p.barcode.includes(searchTerm))
        );
    }

    if (products.length === 0) {
        grid.innerHTML = '<div class="no-data"><i class="fas fa-box-open"></i><p>No products found.</p></div>';
        return;
    }

    grid.innerHTML = products.map(product => {
        const outOfStock = (product.type === 'inventory' || product.type === 'bulk' || product.type === 'weight') && product.stock <= 0;
        let typeLabel = 'INV', badgeClass = '';
        if (product.type === 'non-inventory') { typeLabel = 'NON-INV'; badgeClass = 'non-inv'; }
        else if (product.type === 'bulk') { typeLabel = 'BULK'; badgeClass = 'bulk'; }
        else if (product.type === 'weight') { typeLabel = 'WEIGHT'; badgeClass = 'weight'; }

        let priceDisplay = `KES ${Number(product.sellingPrice).toFixed(2)}`;
        let stockDisplay = '';
        if (product.type === 'bulk') {
            priceDisplay = `KES ${Number(product.sellingPrice).toFixed(2)}<small style="font-size:10px;color:#7f8c8d;">/pack</small>`;
            stockDisplay = `${product.stock} pcs`;
        } else if (product.type === 'weight') {
            priceDisplay = `KES ${Number(product.sellingPrice).toFixed(2)}<small style="font-size:10px;color:#7f8c8d;">/${product.unitOfMeasure}</small>`;
            stockDisplay = `${product.stock} ${product.unitOfMeasure}`;
        } else if (product.type === 'non-inventory') {
            stockDisplay = `Qty: ${product.stock}`;
        } else {
            stockDisplay = `Stock: ${product.stock}`;
        }

        return `<div class="product-card ${outOfStock ? 'out-of-stock' : ''}" onclick="handleProductClickById(${product.id})">
            <div class="badge-type ${badgeClass}">${typeLabel}</div>
            <div class="product-icon"><i class="fas ${product.icon}"></i></div>
            <div class="product-name">${product.name}</div>
            <div class="product-price">${priceDisplay}</div>
            <div class="product-stock">${stockDisplay}</div>
        </div>`;
    }).join('');
}

function searchProduct() { renderProducts(); }

function handleProductClickById(productId) {
    const product = currentData.products.find(p => p.id === productId);
    if (!product) return;
    handleProductClick(product);
}

function handleProductClick(product) {
    if (product.type === 'bulk') openProductOptions(product);
    else if (product.type === 'weight') openWeightInput(product);
    else addToCart(product, 'unit');
}

// ============ SEARCH AUTOCOMPLETE ============
function showSearchSuggestions() {
    const input = document.getElementById('searchInput');
    const container = document.getElementById('searchSuggestions');
    if (!input || !container) return;

    const query = input.value.trim().toLowerCase();
    suggestionIndex = -1;

    if (!query) {
        container.classList.remove('active');
        renderProducts();
        return;
    }

    const scored = [];
    currentData.products.forEach(p => {
        const nameLower = (p.name || '').toLowerCase();
        const barcodeLower = (p.barcode || '').toLowerCase();
        const categoryLower = (p.category || '').toLowerCase();
        let score = 0;
        if (nameLower.startsWith(query)) score = 100;
        else {
            const words = nameLower.split(/\s+/);
            if (words.some(w => w.startsWith(query))) score = 90;
            else if (nameLower.includes(query)) score = 80;
            else if (barcodeLower.includes(query)) score = 60;
            else if (categoryLower.includes(query)) score = 50;
        }
        if (score > 0) scored.push({ product: p, score });
    });

    scored.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
    const matches = scored.slice(0, 10).map(s => s.product);

    if (matches.length === 0) {
        container.innerHTML = `<div class="suggestion-empty"><i class="fas fa-search"></i><span>No products match "<strong>${escapeHtml(query)}</strong>"</span></div>`;
        container.classList.add('active');
        renderProducts();
        return;
    }

    container.innerHTML = matches.map((p, i) => {
        let priceDisplay = `KES ${Number(p.sellingPrice).toFixed(2)}`;
        if (p.type === 'bulk') priceDisplay += ' <small>/pack</small>';
        else if (p.type === 'weight') priceDisplay += ` <small>/${p.unitOfMeasure}</small>`;

        let stockText = '';
        if (p.type === 'inventory' || p.type === 'bulk') stockText = p.stock === 0 ? 'Out of stock' : `Stock: ${p.stock}`;
        else if (p.type === 'weight') stockText = `${p.stock} ${p.unitOfMeasure}`;
        else stockText = `Qty: ${p.stock}`;

        return `<div class="suggestion-item" onclick="selectSuggestion(${p.id})" data-index="${i}">
            <div style="flex:1;min-width:0;">
                <div class="name">${highlightMatch(p.name, query)}</div>
                <div class="meta">
                    <span>${p.category || 'Uncategorized'}</span>
                    <span>· ${stockText}</span>
                    ${p.barcode ? `· <code>${p.barcode}</code>` : ''}
                </div>
            </div>
            <div class="price">${priceDisplay}</div>
        </div>`;
    }).join('');

    container.classList.add('active');
    renderProducts();
}

function highlightMatch(text, query) {
    if (!text) return '';
    if (!query) return escapeHtml(text);
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query);
    if (idx === -1) return escapeHtml(text);
    return escapeHtml(text.substring(0, idx)) +
        '<mark style="background:#fef5e7;padding:0 3px;border-radius:3px;font-weight:700;color:#d35400;">' +
        escapeHtml(text.substring(idx, idx + query.length)) + '</mark>' +
        escapeHtml(text.substring(idx + query.length));
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function handleSearchKeydown(e) {
    const container = document.getElementById('searchSuggestions');
    if (!container.classList.contains('active')) { if (e.key === 'Enter') searchProduct(); return; }
    const items = container.querySelectorAll('.suggestion-item');

    if (e.key === 'ArrowDown') { e.preventDefault(); suggestionIndex = Math.min(suggestionIndex + 1, items.length - 1); updateSuggestionSelection(items); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); suggestionIndex = Math.max(suggestionIndex - 1, 0); updateSuggestionSelection(items); }
    else if (e.key === 'Enter') {
        e.preventDefault();
        if (suggestionIndex >= 0 && items[suggestionIndex]) items[suggestionIndex].click();
        else if (items.length > 0) items[0].click();
    } else if (e.key === 'Escape') container.classList.remove('active');
}

function updateSuggestionSelection(items) {
    items.forEach((item, i) => item.classList.toggle('selected', i === suggestionIndex));
    if (items[suggestionIndex]) items[suggestionIndex].scrollIntoView({ block: 'nearest' });
}

function selectSuggestion(productId) {
    const product = currentData.products.find(p => p.id === productId);
    if (!product) return;
    const input = document.getElementById('searchInput');
    const container = document.getElementById('searchSuggestions');
    input.value = '';
    container.classList.remove('active');
    handleProductClick(product);
    input.focus();
}

// ============ BULK OPTIONS MODAL ============
function openProductOptions(product) {
    pendingProductOptions = product;
    document.getElementById('productOptionsProduct').innerHTML = `
        <h3>${product.name}</h3>
        <div class="category">${product.category} · Bulk Pack of ${product.unitsPerPack}</div>
        <div style="margin-top:8px;font-size:13px;color:#7f8c8d;">In stock: <strong>${product.stock} units</strong></div>`;
    const packPrice = Number(product.sellingPrice).toFixed(2);
    const singlePrice = Number(product.sellingPricePerSingle).toFixed(2);
    document.getElementById('productOptionsButtons').innerHTML = `
        <button class="product-option-btn" onclick="confirmProductOption('pack')">
            <div><div class="option-label">📦 Full Pack (${product.unitsPerPack} pcs)</div><div class="option-sub">Buy the whole pack</div></div>
            <div class="option-price">KES ${packPrice}</div>
        </button>
        <button class="product-option-btn" onclick="confirmProductOption('single')">
            <div><div class="option-label">🎯 Single Unit</div><div class="option-sub">Buy just 1 ${product.unitOfMeasure || 'pcs'}</div></div>
            <div class="option-price">KES ${singlePrice}</div>
        </button>`;
    document.getElementById('productOptionsModal').classList.add('active');
}

function closeProductOptions() {
    document.getElementById('productOptionsModal').classList.remove('active');
    pendingProductOptions = null;
}

function confirmProductOption(mode) {
    if (!pendingProductOptions) return;
    addToCart(pendingProductOptions, mode);
    closeProductOptions();
}

// ============ WEIGHT INPUT MODAL ============
function openWeightInput(product) {
    pendingWeightProduct = product;
    document.getElementById('weightProductInfo').innerHTML = `
        <h3>${product.name}</h3>
        <div class="price-per-unit">KES ${Number(product.sellingPrice).toFixed(2)} per ${product.unitOfMeasure}</div>
        <div style="font-size:12px;color:#7f8c8d;margin-top:4px;">In stock: ${product.stock} ${product.unitOfMeasure}</div>`;
    document.getElementById('weightInput').value = '';
    document.getElementById('weightInput').placeholder = '0.00';
    document.getElementById('weightUnitHelp').textContent = `in ${product.unitOfMeasure}`;
    document.getElementById('weightTotalDisplay').textContent = 'KES 0.00';
    document.getElementById('weightInputModal').classList.add('active');
    setTimeout(() => document.getElementById('weightInput')?.focus(), 300);
}

function closeWeightInput() {
    document.getElementById('weightInputModal').classList.remove('active');
    pendingWeightProduct = null;
}

function updateWeightTotal() {
    if (!pendingWeightProduct) return;
    const weight = parseFloat(document.getElementById('weightInput').value) || 0;
    const total = weight * Number(pendingWeightProduct.sellingPrice);
    document.getElementById('weightTotalDisplay').textContent = `KES ${total.toFixed(2)}`;
}

function quickWeight(value) {
    document.getElementById('weightInput').value = value;
    updateWeightTotal();
}

function confirmWeightAdd() {
    if (!pendingWeightProduct) return;
    const weight = parseFloat(document.getElementById('weightInput').value);
    if (!weight || weight <= 0) { showToast('Please enter a valid weight', 'error'); return; }
    if (weight > pendingWeightProduct.stock) { showToast(`Only ${pendingWeightProduct.stock} ${pendingWeightProduct.unitOfMeasure} available`, 'error'); return; }
    addToCartByWeight(pendingWeightProduct, weight);
    closeWeightInput();
}

function addToCartByWeight(product, weight) {
    const existing = cart.find(item => item.id === product.id && item.sellMode === 'weight');
    if (existing) {
        const newWeight = existing.quantity + weight;
        if (newWeight > product.stock) { showToast('Not enough stock', 'error'); return; }
        existing.quantity = newWeight;
        existing.total = newWeight * Number(product.sellingPrice);
    } else {
        cart.push({ id: product.id, name: product.name, price: Number(product.sellingPrice),
            quantity: weight, type: product.type, sellMode: 'weight', unitOfMeasure: product.unitOfMeasure,
            total: weight * Number(product.sellingPrice) });
    }
    updateCart();
    showToast(`✓ ${weight} ${product.unitOfMeasure} of ${product.name} added`, 'success');
    playBeepSuccess();
}

// ============ CART ============
function addToCart(product, sellMode = 'unit') {
    if (sellMode === 'unit' && product.type !== 'non-inventory' && product.stock <= 0) { showToast('Product is out of stock!', 'error'); return; }
    let price, unitsDeducted;
    if (product.type === 'bulk') {
        if (sellMode === 'single') { price = Number(product.sellingPricePerSingle); unitsDeducted = 1; }
        else { price = Number(product.sellingPrice); unitsDeducted = product.unitsPerPack; }
    } else { price = Number(product.sellingPrice); unitsDeducted = 1; }

    if (product.type !== 'non-inventory' && product.stock < unitsDeducted) { showToast(`Not enough stock (need ${unitsDeducted}, have ${product.stock})`, 'error'); return; }

    const cartItem = cart.find(item => item.id === product.id && item.sellMode === sellMode);
    if (cartItem) { cartItem.quantity++; cartItem.total = cartItem.quantity * price; }
    else {
        cart.push({ id: product.id, name: product.name, price: price, quantity: 1, type: product.type,
            sellMode: sellMode, unitsDeducted: unitsDeducted, unitOfMeasure: product.type === 'weight' ? product.unitOfMeasure : null });
    }
    updateCart();
    showToast(`${product.name} added to cart`, 'success');
    playBeepSuccess();
}

function updateCart() {
    const cartItems = document.getElementById('cartItems');
    if (!cartItems) return;
    if (cart.length === 0) {
        cartItems.innerHTML = `<div class="empty-cart"><i class="fas fa-shopping-basket"></i><p>Cart is empty</p><small>Scan or click a product to add</small></div>`;
    } else {
        cartItems.innerHTML = cart.map((item, index) => {
            let qtyDisplay = item.quantity;
            let priceLine = `KES ${item.price.toFixed(2)}`;
            if (item.sellMode === 'single') priceLine += ' /single';
            else if (item.sellMode === 'pack') priceLine += ' /pack';
            else if (item.sellMode === 'weight') { qtyDisplay = `${item.quantity} ${item.unitOfMeasure}`; priceLine += ` /${item.unitOfMeasure}`; }
            const lineTotal = item.price * item.quantity;
            return `<div class="cart-item">
                <div class="cart-item-info"><div class="cart-item-name">${item.name}</div><div class="cart-item-price">${priceLine}</div></div>
                <div class="cart-item-quantity"><button onclick="updateQuantity(${index}, -1)">−</button><span>${qtyDisplay}</span><button onclick="updateQuantity(${index}, 1)">+</button></div>
                <div class="cart-item-total">KES ${lineTotal.toFixed(2)}</div>
                <i class="fas fa-times cart-item-remove" onclick="removeFromCart(${index})"></i>
            </div>`;
        }).join('');
    }
    updateTotals();
}

function updateQuantity(index, change) {
    const item = cart[index];
    const product = currentData.products.find(p => p.id === item.id);
    if (!product) return;

    if (item.sellMode === 'weight') {
        const step = 0.5;
        const newQty = item.quantity + (change * step);
        if (newQty <= 0) { removeFromCart(index); return; }
        if (newQty > product.stock) { showToast('Not enough stock', 'error'); return; }
        item.quantity = Math.round(newQty * 100) / 100;
        return updateCart();
    }

    if (change > 0) {
        const unitsNeeded = item.sellMode === 'pack' ? product.unitsPerPack : 1;
        const currentTotalUnits = cart.filter(c => c.id === item.id).reduce((sum, c) => sum + (c.unitsDeducted * c.quantity), 0);
        if (currentTotalUnits + unitsNeeded > product.stock) { showToast('Not enough stock', 'error'); return; }
        item.quantity++;
    } else if (change < 0 && item.quantity > 1) item.quantity--;
    else if (change < 0 && item.quantity === 1) { removeFromCart(index); return; }
    updateCart();
}

function removeFromCart(index) { cart.splice(index, 1); updateCart(); }

function clearCart() {
    if (cart.length === 0) return;
    if (confirm('Clear all items from cart?')) {
        cart = [];
        appliedDiscount = 0;
        updateCart();
        const pi = document.getElementById('paymentInput'); if (pi) pi.value = '';
        const cd = document.getElementById('changeDisplay'); if (cd) cd.innerHTML = '';
        const dr = document.getElementById('discountRow'); if (dr) dr.style.display = 'none';
        const dig = document.getElementById('discountInputGroup'); if (dig) dig.style.display = 'none';
    }
}

// ============ TOTALS + DISCOUNT ============
function updateTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = Math.max(0, subtotal - appliedDiscount);

    const subtotalEl = document.getElementById('subtotal');
    const totalEl = document.getElementById('total');
    const itemCountEl = document.getElementById('itemCount');
    if (subtotalEl) subtotalEl.textContent = `KES ${subtotal.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `KES ${total.toFixed(2)}`;
    if (itemCountEl) itemCountEl.textContent = `${cart.reduce((sum, item) => sum + (item.sellMode === 'weight' ? 1 : item.quantity), 0)} items`;

    const discountRow = document.getElementById('discountRow');
    if (discountRow) {
        if (appliedDiscount > 0) { discountRow.style.display = 'flex'; document.getElementById('discountDisplay').textContent = `- KES ${appliedDiscount.toFixed(2)}`; }
        else discountRow.style.display = 'none';
    }
}

function toggleDiscountInput() {
    const el = document.getElementById('discountInputGroup');
    el.style.display = el.style.display === 'none' ? 'flex' : 'none';
    if (el.style.display === 'flex') setTimeout(() => document.getElementById('discountInput')?.focus(), 100);
}

function applyDiscount() {
    const val = parseFloat(document.getElementById('discountInput').value);
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (!val || val <= 0) { showToast('Enter a valid discount', 'error'); return; }
    if (val > subtotal) { showToast('Discount cannot exceed subtotal', 'error'); return; }
    appliedDiscount = val;
    appliedDiscountType = 'manual';
    updateTotals();
    document.getElementById('discountInputGroup').style.display = 'none';
    showToast(`Discount of KES ${val.toFixed(2)} applied`, 'success');
}

function clearDiscount() {
    appliedDiscount = 0;
    appliedDiscountType = null;
    document.getElementById('discountInput').value = '';
    document.getElementById('discountInputGroup').style.display = 'none';
    updateTotals();
}

// ============ PAYMENT ============
function quickPayment(amount) {
    const input = document.getElementById('paymentInput');
    if (input) { input.value = amount; calculateChange(); }
}

function calculateChange() {
    const amount = parseFloat(document.getElementById('paymentInput').value);
    const total = getCartTotal();
    const display = document.getElementById('changeDisplay');
    if (!display) return;
    if (!amount || amount <= 0) { display.innerHTML = ''; return; }
    if (amount < total) display.innerHTML = `<span style="color: #e74c3c;">Insufficient. Need KES ${(total - amount).toFixed(2)} more</span>`;
    else display.innerHTML = `<span style="color: #27ae60;">Change: KES ${(amount - total).toFixed(2)}</span>`;
}

function getCartTotal() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    return Math.max(0, subtotal - appliedDiscount);
}

function selectPaymentMethod(method) {
    selectedPaymentMethod = method;
    document.querySelectorAll('.pay-method-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.method === method));
    document.querySelectorAll('.payment-view').forEach(v => v.classList.remove('active'));
    if (method === 'cash') document.getElementById('paymentCashView')?.classList.add('active');
    else if (method === 'mpesa') document.getElementById('paymentMpesaView')?.classList.add('active');
    else if (method === 'split') { document.getElementById('paymentSplitView')?.classList.add('active'); calculateSplit(); }
}

function calculateSplit() {
    const cash = parseFloat(document.getElementById('splitCashInput')?.value) || 0;
    const mpesa = parseFloat(document.getElementById('splitMpesaInput')?.value) || 0;
    const total = getCartTotal();
    const paid = cash + mpesa;
    const display = document.getElementById('splitDisplay');
    if (!display) return;
    if (paid === 0) { display.innerHTML = ''; return; }
    if (paid < total) display.innerHTML = `<div style="padding:10px;background:#fef5e7;border-radius:8px;margin-top:10px;font-size:13px;color:#d35400;text-align:center;"><strong>Remaining: KES ${(total - paid).toFixed(2)}</strong></div>`;
    else if (paid > total) display.innerHTML = `<div style="padding:10px;background:#eafaf1;border-radius:8px;margin-top:10px;font-size:13px;color:#27ae60;text-align:center;"><strong>✓ Complete</strong> · Change: KES ${(paid - total).toFixed(2)}</div>`;
    else display.innerHTML = `<div style="padding:10px;background:#eafaf1;border-radius:8px;margin-top:10px;font-size:13px;color:#27ae60;text-align:center;"><strong>✓ Exact amount</strong></div>`;
}

function autoFillSplit() {
    const cash = parseFloat(document.getElementById('splitCashInput')?.value) || 0;
    const total = getCartTotal();
    const mpesaInput = document.getElementById('splitMpesaInput');
    if (mpesaInput) { mpesaInput.value = Math.max(0, total - cash).toFixed(2); calculateSplit(); }
}

// ============ CHECKOUT ============
async function checkout() {
    if (!requirePermission('make_sale', 'make sales')) return;
    if (cart.length === 0) { showToast('Cart is empty!', 'error'); return; }
    if (selectedPaymentMethod === 'mpesa') openMpesaModal();
    else if (selectedPaymentMethod === 'split') await checkoutSplit();
    else await checkoutCash();
}

async function checkoutSplit() {
    const cash = parseFloat(document.getElementById('splitCashInput')?.value) || 0;
    const mpesa = parseFloat(document.getElementById('splitMpesaInput')?.value) || 0;
    const total = getCartTotal();
    if (cash + mpesa < total) { showToast(`Insufficient. Need KES ${(total - cash - mpesa).toFixed(2)} more`, 'error'); return; }
    if (mpesa > 0) openMpesaModalForSplit(cash, mpesa);
    else { document.getElementById('paymentInput').value = cash; await checkoutCash(); }
}

function openMpesaModalForSplit(cashAmount, mpesaAmount) {
    mpesaState.splitCash = cashAmount;
    mpesaState.splitMpesa = mpesaAmount;
    mpesaState.isSplit = true;
    mpesaState.amount = mpesaAmount;
    document.getElementById('mpesaAmount').textContent = `KES ${mpesaAmount.toFixed(2)}`;
    document.getElementById('mpesaPhone').value = '';
    document.getElementById('mpesaSuccessAmount').textContent = `KES ${mpesaAmount.toFixed(2)}`;
    showMpesaStep(1);
    document.getElementById('mpesaModal').classList.add('active');
    setTimeout(() => document.getElementById('mpesaPhone')?.focus(), 300);
}

async function checkoutCash() {
    const total = getCartTotal();
    const paymentInput = parseFloat(document.getElementById('paymentInput').value);
    if (!paymentInput || paymentInput < total) { showToast('Please enter sufficient payment amount', 'error'); return; }
    try {
        const result = await API.createSale({
            items: cart.map(i => ({ productId: i.id, name: i.name, quantity: i.quantity, unit_price: i.price, sellMode: i.sellMode })),
            payment: paymentInput, paymentMethod: 'cash', paymentCash: paymentInput, paymentMpesa: 0,
            discountAmount: appliedDiscount, discountType: appliedDiscountType
        });
        playChaChing();
        showReceipt(result.receipt);
        cart = [];
        appliedDiscount = 0;
        appliedDiscountType = null;
        updateCart();
        document.getElementById('paymentInput').value = '';
        document.getElementById('changeDisplay').innerHTML = '';
        document.getElementById('discountInputGroup').style.display = 'none';
        await loadProducts();
        renderProducts();
        renderCategoryFilter();
        setTimeout(() => document.getElementById('barcodeScannerInput')?.focus(), 500);
    } catch (err) { showToast(err.message, 'error'); }
}

// ============ M-PESA ============
function openMpesaModal() {
    if (cart.length === 0) { showToast('Cart is empty!', 'error'); return; }
    const total = getCartTotal();
    mpesaState.amount = total;
    mpesaState.isSplit = false;
    mpesaState.splitCash = 0;
    mpesaState.splitMpesa = 0;
    document.getElementById('mpesaAmount').textContent = `KES ${total.toFixed(2)}`;
    document.getElementById('mpesaPhone').value = '';
    document.getElementById('mpesaSuccessAmount').textContent = `KES ${total.toFixed(2)}`;
    showMpesaStep(1);
    document.getElementById('mpesaModal').classList.add('active');
    setTimeout(() => document.getElementById('mpesaPhone')?.focus(), 300);
}

function closeMpesaModal() {
    if (mpesaState.pollInterval) clearInterval(mpesaState.pollInterval);
    mpesaState = { checkoutId: null, phone: null, amount: 0, receiptNo: null, pollInterval: null, elapsed: 0, isSplit: false, splitCash: 0, splitMpesa: 0 };
    document.getElementById('mpesaModal').classList.remove('active');
}

function showMpesaStep(step) {
    document.querySelectorAll('.mpesa-step').forEach(el => el.classList.remove('active'));
    document.getElementById('mpesaStep' + step)?.classList.add('active');
}

async function initiateMpesaPayment() {
    const phone = document.getElementById('mpesaPhone').value.trim();
    if (!phone) { showToast('Please enter customer phone number', 'error'); return; }
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 9) { showToast('Please enter a valid phone number', 'error'); return; }
    mpesaState.phone = phone;
    try {
        const result = await API.initiateMpesa(phone, mpesaState.amount);
        if (!result.success) throw new Error(result.message || 'Failed to send STK push');
        mpesaState.checkoutId = result.checkoutRequestId;
        document.getElementById('mpesaPhoneDisplay').textContent = phone;
        showMpesaStep(2);
        startMpesaPolling();
    } catch (err) { showMpesaError(err.message); }
}

function startMpesaPolling() {
    mpesaState.elapsed = 0;
    const totalWait = 60;
    const progressBar = document.getElementById('mpesaProgressBar');
    const timerEl = document.getElementById('mpesaTimer');
    if (progressBar) progressBar.style.width = '0%';
    mpesaState.pollInterval = setInterval(async () => {
        mpesaState.elapsed++;
        const pct = Math.min((mpesaState.elapsed / totalWait) * 100, 100);
        if (progressBar) progressBar.style.width = pct + '%';
        if (timerEl) timerEl.textContent = `Checking status... ${mpesaState.elapsed}s / ${totalWait}s`;
        try {
            const status = await API.checkMpesaStatus(mpesaState.checkoutId);
            if (status.status === 'success') {
                clearInterval(mpesaState.pollInterval);
                mpesaState.pollInterval = null;
                mpesaState.receiptNo = status.mpesaReceipt || 'N/A';
                document.getElementById('mpesaReceiptNo').textContent = mpesaState.receiptNo;
                showMpesaStep(3);
                return;
            } else if (status.status === 'failed') {
                clearInterval(mpesaState.pollInterval);
                mpesaState.pollInterval = null;
                showMpesaError(status.resultDesc || 'Payment was not completed');
                return;
            }
        } catch (err) {}
        if (mpesaState.elapsed >= totalWait) {
            clearInterval(mpesaState.pollInterval);
            mpesaState.pollInterval = null;
            showMpesaError('Payment timed out.');
        }
    }, 1000);
}

function showMpesaError(msg) { document.getElementById('mpesaErrorMsg').textContent = msg; showMpesaStep(4); }
function retryMpesa() { if (mpesaState.pollInterval) clearInterval(mpesaState.pollInterval); showMpesaStep(1); setTimeout(() => document.getElementById('mpesaPhone')?.focus(), 300); }

async function completeMpesaSale() {
    try {
        const isSplit = mpesaState.isSplit;
        const cashAmount = isSplit ? (mpesaState.splitCash || 0) : 0;
        const mpesaAmount = mpesaState.amount;
        const totalPayment = cashAmount + mpesaAmount;
        const result = await API.createSale({
            items: cart.map(i => ({ productId: i.id, name: i.name, quantity: i.quantity, unit_price: i.price, sellMode: i.sellMode })),
            payment: totalPayment,
            paymentMethod: isSplit ? 'split' : 'mpesa',
            paymentCash: cashAmount, paymentMpesa: mpesaAmount,
            mpesaReceipt: mpesaState.receiptNo, customerPhone: mpesaState.phone,
            discountAmount: appliedDiscount, discountType: appliedDiscountType
        });
        playChaChing();
        closeMpesaModal();
        showReceipt(result.receipt);
        cart = [];
        appliedDiscount = 0;
        updateCart();
        await loadProducts();
        renderProducts();
        renderCategoryFilter();
        showToast('✓ Sale completed', 'success');
    } catch (err) { showToast('Failed to save sale: ' + err.message, 'error'); }
}

// ============ RECEIPT ============
function showReceipt(receipt) {
    document.getElementById('receiptCompany').textContent = receipt.companyName || currentCompany.name;
    document.getElementById('receiptDate').textContent = new Date(receipt.date || Date.now()).toLocaleString('en-KE');
    document.getElementById('receiptCashier').textContent = receipt.cashier || currentUser.username;

    const body = document.getElementById('receiptBody');
    const items = receipt.items || [];
    body.innerHTML = `
        <div class="receipt-row" style="font-weight:bold;border-bottom:1px solid #ddd;padding-bottom:5px;"><span>Receipt #</span><span>${receipt.receiptNo}</span></div>
        ${receipt.mpesaReceipt ? `<div class="receipt-row" style="color:#27ae60;"><span>M-Pesa Ref</span><span>${receipt.mpesaReceipt}</span></div>` : ''}
        <div style="height:10px;"></div>
        ${items.map(item => `<div class="receipt-row"><span>${item.product_name || item.name} x${item.quantity}</span><span>KES ${Number(item.total || item.unit_price * item.quantity).toFixed(2)}</span></div>`).join('')}
        <div class="receipt-divider"></div>
        <div class="receipt-row"><span>Subtotal</span><span>KES ${Number(receipt.subtotal || 0).toFixed(2)}</span></div>
        ${receipt.discount > 0 ? `<div class="receipt-row" style="color:#e74c3c;"><span>Discount</span><span>- KES ${Number(receipt.discount).toFixed(2)}</span></div>` : ''}
        <div class="receipt-divider"></div>
        <div class="receipt-row receipt-total"><span>TOTAL</span><span>KES ${Number(receipt.total || 0).toFixed(2)}</span></div>
        ${receipt.paymentCash > 0 ? `<div class="receipt-row"><span>Cash</span><span>KES ${Number(receipt.paymentCash).toFixed(2)}</span></div>` : ''}
        ${receipt.paymentMpesa > 0 ? `<div class="receipt-row"><span>M-Pesa</span><span>KES ${Number(receipt.paymentMpesa).toFixed(2)}</span></div>` : ''}
        ${receipt.change > 0 ? `<div class="receipt-row"><span>Change</span><span>KES ${Number(receipt.change).toFixed(2)}</span></div>` : ''}`;
    document.getElementById('receiptModal').classList.add('active');
}

function closeReceipt() {
    document.getElementById('receiptModal').classList.remove('active');
    setTimeout(() => document.getElementById('barcodeScannerInput')?.focus(), 200);
}

function printReceipt() {
    const receipt = document.querySelector('.receipt');
    const printWindow = window.open('', '', 'width=400,height=600');
    printWindow.document.write('<html><head><title>Receipt</title>');
    printWindow.document.write('<style>body{font-family:Courier New,monospace;padding:20px;font-size:12px;}.receipt-header{text-align:center;border-bottom:2px dashed #000;padding-bottom:10px;margin-bottom:10px;}.receipt-row{display:flex;justify-content:space-between;padding:2px 0;}.receipt-divider{border-top:1px dashed #999;margin:8px 0;}.receipt-total{font-weight:bold;font-size:14px;}.receipt-footer{text-align:center;border-top:2px dashed #000;padding-top:10px;margin-top:10px;}</style></head><body>');
    printWindow.document.write(receipt.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
}

// ============ INVENTORY ============
function updateInventory() {
    if (!currentData) return;
    const search = document.getElementById('inventorySearch')?.value.toLowerCase() || '';
    const typeFilter = document.getElementById('inventoryTypeFilter')?.value || 'all';
    let products = [...currentData.products];
    if (typeFilter !== 'all') products = products.filter(p => p.type === typeFilter);
    if (search) products = products.filter(p => p.name.toLowerCase().includes(search) || (p.category || '').toLowerCase().includes(search) || (p.barcode && p.barcode.includes(search)));

    const totalItems = currentData.products.length;
    const invItems = currentData.products.filter(p => p.type === 'inventory').length;
    const bulkItems = currentData.products.filter(p => p.type === 'bulk').length;
    const lowStock = currentData.products.filter(p => ['inventory','bulk','weight'].includes(p.type) && p.stock <= (p.reorderLevel || 5)).length;

    const statsEl = document.getElementById('inventoryStats');
    if (statsEl) {
        statsEl.innerHTML = `
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-boxes"></i></div><div><div class="stat-value">${totalItems}</div><div class="stat-label">Total Items</div></div></div>
            <div class="stat-card green"><div class="stat-icon"><i class="fas fa-cubes"></i></div><div><div class="stat-value">${invItems}</div><div class="stat-label">Simple Items</div></div></div>
            <div class="stat-card orange"><div class="stat-icon"><i class="fas fa-layer-group"></i></div><div><div class="stat-value">${bulkItems}</div><div class="stat-label">Bulk Items</div></div></div>
            <div class="stat-card red"><div class="stat-icon"><i class="fas fa-exclamation-triangle"></i></div><div><div class="stat-value">${lowStock}</div><div class="stat-label">Low Stock</div></div></div>`;
    }

    const tbody = document.getElementById('inventoryTableBody');
    if (!tbody) return;
    if (products.length === 0) { tbody.innerHTML = '<tr><td colspan="9" class="no-data">No items found.</td></tr>'; return; }

    const canRestock = hasPermission('restock');
    const canDelete = hasPermission('delete_product');

    tbody.innerHTML = products.map((p, i) => {
        let stockClass = 'ok';
        if (['inventory','bulk','weight'].includes(p.type)) {
            if (p.stock === 0) stockClass = 'out';
            else if (p.stock <= (p.reorderLevel || 5)) stockClass = 'low';
        }
        let priceDisplay = `KES ${Number(p.sellingPrice).toFixed(2)}`;
        if (p.type === 'bulk') priceDisplay = `KES ${Number(p.sellingPrice).toFixed(2)}/pack<br><small>KES ${Number(p.sellingPricePerSingle).toFixed(2)}/single</small>`;
        else if (p.type === 'weight') priceDisplay = `KES ${Number(p.sellingPrice).toFixed(2)}/${p.unitOfMeasure}`;

        let stockDisplay = p.stock;
        if (p.type === 'bulk') stockDisplay = `${p.stock} units`;
        else if (p.type === 'weight') stockDisplay = `${p.stock} ${p.unitOfMeasure}`;
        else if (p.type === 'non-inventory') stockDisplay = `${p.stock} units`;
        else stockDisplay = `${p.stock} pcs`;

        return `<tr>
            <td>${i + 1}</td>
            <td><strong>${p.name}</strong></td>
            <td>${p.category}</td>
            <td><span class="type-badge ${p.type}">${p.type}</span></td>
            <td>KES ${Number(p.costPrice).toFixed(2)}</td>
            <td>${priceDisplay}</td>
            <td><span class="stock-badge ${stockClass}">${stockDisplay}</span></td>
            <td>${p.barcode ? `<code>${p.barcode}</code>` : '<em style="color:#bdc3c7;">None</em>'}</td>
            <td>
                ${canRestock ? `<button class="action-btn restock" onclick="restockItem(${p.id})" title="Add Stock"><i class="fas fa-plus"></i></button>` : ''}
                ${canDelete ? `<button class="action-btn delete" onclick="deleteItem(${p.id})" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

async function restockItem(id) {
    if (!requirePermission('restock', 'restock items')) return;
    const product = currentData.products.find(p => p.id === id);
    if (!product) return;
    const qty = prompt(`Add stock for "${product.name}"\nCurrent: ${product.stock}\n\nEnter quantity:`);
    if (qty === null) return;
    const quantity = parseFloat(qty);
    if (isNaN(quantity) || quantity <= 0) { showToast('Invalid quantity', 'error'); return; }
    try {
        await API.restock(id, quantity);
        showToast(`Added ${quantity} to ${product.name}`, 'success');
        await loadProducts();
        updateInventory();
        renderProducts();
    } catch (err) { showToast(err.message, 'error'); }
}

async function deleteItem(id) {
    if (!requirePermission('delete_product', 'delete products')) return;
    const product = currentData.products.find(p => p.id === id);
    if (!product) return;
    if (!confirm(`Delete "${product.name}"?`)) return;
    try {
        await API.deleteProduct(id);
        showToast('Item deleted', 'success');
        await loadProducts();
        updateInventory();
        renderProducts();
        renderCategoryFilter();
    } catch (err) { showToast(err.message, 'error'); }
}

// ============ ADD ITEM ============
function onItemTypeChange() {
    const type = document.getElementById('itemType').value;
    document.getElementById('bulkFields').style.display = type === 'bulk' ? 'block' : 'none';
    document.getElementById('weightFields').style.display = type === 'weight' ? 'block' : 'none';
    document.getElementById('standardStockRow').style.display = type === 'weight' ? 'none' : 'flex';
    document.getElementById('weightReorderRow').style.display = type === 'weight' ? 'flex' : 'none';

    const costLabel = document.getElementById('costPriceLabel');
    const sellLabel = document.getElementById('sellingPriceLabel');
    if (type === 'bulk') { costLabel.textContent = 'Cost Price per PACK (KES) *'; sellLabel.textContent = 'Selling Price per PACK (KES) *'; }
    else if (type === 'weight') { costLabel.textContent = 'Cost Price per UNIT (KES) *'; sellLabel.textContent = 'Selling Price per UNIT (KES) *'; }
    else { costLabel.textContent = 'Cost Price (KES) *'; sellLabel.textContent = 'Selling Price (KES) *'; }
    updateItemPreview();
}

async function saveItem() {
    if (!requirePermission('add_product', 'add products')) return;
    const name = document.getElementById('itemName').value.trim();
    const category = document.getElementById('itemCategory').value.trim();
    const type = document.getElementById('itemType').value;
    const barcode = document.getElementById('itemBarcode').value.trim() || null;
    const costPrice = parseFloat(document.getElementById('itemCostPrice').value) || 0;
    const sellingPrice = parseFloat(document.getElementById('itemSellingPrice').value);
    const icon = getCategoryIcon(category);

    if (!name) { showToast('Item name is required', 'error'); return; }
    if (!category) { showToast('Category is required', 'error'); return; }
    if (isNaN(sellingPrice) || sellingPrice <= 0) { showToast('Valid selling price required', 'error'); return; }

    const data = { name, category, type, barcode, costPrice, sellingPrice, icon };

    if (type === 'bulk') {
        const unitsPerPack = parseInt(document.getElementById('itemUnitsPerPack').value);
        const pricePerSingle = parseFloat(document.getElementById('itemSellingPricePerSingle').value);
        const stock = parseFloat(document.getElementById('itemStock').value) || 0;
        const reorderLevel = parseInt(document.getElementById('itemReorder').value) || 5;
        if (!unitsPerPack || unitsPerPack < 2) { showToast('Units per pack must be at least 2', 'error'); return; }
        if (!pricePerSingle || pricePerSingle <= 0) { showToast('Single-unit price is required', 'error'); return; }
        data.unitsPerPack = unitsPerPack; data.sellingPricePerSingle = pricePerSingle; data.stock = stock; data.reorderLevel = reorderLevel;
    } else if (type === 'weight') {
        const unitOfMeasure = document.getElementById('itemUnitOfMeasure').value;
        const stock = parseFloat(document.getElementById('itemStockWeight').value) || 0;
        const reorderLevel = parseFloat(document.getElementById('itemReorderWeight').value) || 10;
        data.unitOfMeasure = unitOfMeasure; data.stock = stock; data.reorderLevel = reorderLevel;
    } else {
        const stock = parseFloat(document.getElementById('itemStock').value) || 0;
        const reorderLevel = parseInt(document.getElementById('itemReorder').value) || 5;
        data.stock = stock; data.reorderLevel = reorderLevel;
    }

    try {
        await API.createProduct(data);
        showToast(`✓ ${name} added!`, 'success');
        resetItemForm();
        await loadProducts();
        renderProducts();
        renderCategoryFilter();
        updateInventory();
        populateCategoryList();
    } catch (err) { showToast(err.message, 'error'); }
}

function getCategoryIcon(category) {
    const cat = (category || '').toLowerCase();
    const icons = { 'electronics': 'fa-laptop', 'clothing': 'fa-tshirt', 'food': 'fa-utensils', 'books': 'fa-book', 'groceries': 'fa-shopping-basket', 'cosmetics': 'fa-spray-can', 'perfume': 'fa-spray-can', 'beverages': 'fa-wine-bottle', 'furniture': 'fa-couch', 'toys': 'fa-gamepad', 'medicine': 'fa-pills', 'stationery': 'fa-pen', 'cleaning': 'fa-spray-can' };
    return icons[cat] || 'fa-box';
}

function resetItemForm() {
    ['itemName','itemCategory','itemBarcode','itemCostPrice','itemSellingPrice','itemStock','itemReorder','itemUnitsPerPack','itemSellingPricePerSingle','itemStockWeight','itemReorderWeight','packCount','totalPieces'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('itemType').value = 'inventory';
    document.getElementById('itemUnitOfMeasure').value = 'kg';
    onItemTypeChange();
    document.getElementById('itemPreview').innerHTML = '<div class="preview-placeholder">Fill the form to see preview</div>';
}

function updateItemPreview() {
    const name = document.getElementById('itemName').value;
    const category = document.getElementById('itemCategory').value;
    const type = document.getElementById('itemType').value;
    const price = parseFloat(document.getElementById('itemSellingPrice').value) || 0;
    const preview = document.getElementById('itemPreview');
    if (!preview) return;
    if (!name && !category && !price) { preview.innerHTML = '<div class="preview-placeholder">Fill the form to see preview</div>'; return; }
    let details = '';
    if (type === 'bulk') {
        const units = document.getElementById('itemUnitsPerPack').value || '?';
        const singlePrice = document.getElementById('itemSellingPricePerSingle').value || '?';
        details = `<div class="details"><i class="fas fa-layer-group"></i> Bulk · ${units} per pack</div><div class="details"><i class="fas fa-tag"></i> Pack: KES ${price.toFixed(2)}</div><div class="details"><i class="fas fa-tag"></i> Single: KES ${singlePrice}</div>`;
    } else if (type === 'weight') {
        const unit = document.getElementById('itemUnitOfMeasure').value;
        details = `<div class="details"><i class="fas fa-weight-hanging"></i> Sold by ${unit}</div><div class="details"><i class="fas fa-tag"></i> KES ${price.toFixed(2)}/${unit}</div>`;
    } else {
        const stock = document.getElementById('itemStock').value || 0;
        details = `<div class="details"><i class="fas fa-box"></i> ${stock} in stock</div>`;
    }
    preview.innerHTML = `<div class="preview-item"><div class="product-icon"><i class="fas ${getCategoryIcon(category)}"></i></div><h4>${name || 'Item Name'}</h4><div class="price">KES ${price.toFixed(2)}</div><div class="details"><i class="fas fa-tag"></i> ${category || 'Category'}</div>${details}</div>`;
}

function populateCategoryList() {
    const categories = [...new Set(currentData.products.map(p => p.category).filter(Boolean))];
    const dl = document.getElementById('categoryList');
    if (dl) dl.innerHTML = categories.map(c => `<option value="${c}">`).join('');
}

function focusBarcodeForAdd() { const el = document.getElementById('itemBarcode'); if (el) { el.focus(); showToast('Ready — scan or type the barcode', 'info'); } }

function setPackPreset(units, label) {
    const el = document.getElementById('itemUnitsPerPack');
    if (el) { el.value = units; showToast(`Preset: ${label} (${units} per pack)`, 'success'); updateItemPreview(); calculatePackStock(); }
}

function calculatePackStock() {
    const unitsPerPack = parseInt(document.getElementById('itemUnitsPerPack')?.value) || 0;
    const packCount = parseFloat(document.getElementById('packCount')?.value) || 0;
    const totalEl = document.getElementById('totalPieces');
    if (totalEl) totalEl.value = unitsPerPack * packCount;
}

function applyPackCountToStock() {
    const unitsPerPack = parseInt(document.getElementById('itemUnitsPerPack')?.value) || 0;
    const packCount = parseFloat(document.getElementById('packCount')?.value) || 0;
    const totalPieces = unitsPerPack * packCount;
    if (totalPieces <= 0) { showToast('Enter a valid number of packs', 'error'); return; }
    const stockInput = document.getElementById('itemStock');
    if (stockInput) stockInput.value = totalPieces;
    updateItemPreview();
    showToast(`✓ Stock set: ${packCount} packs × ${unitsPerPack} = ${totalPieces} pieces`, 'success');
}

// ============ RESTOCK ============
function setupRestockScanner() {
    const input = document.getElementById('restockBarcodeInput');
    if (!input) return;
    if (input.dataset.listenerAttached === 'true') return;
    input.dataset.listenerAttached = 'true';
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); lookupRestockProduct(); } });
}

async function lookupRestockProduct() {
    if (!requirePermission('restock', 'restock items')) return;
    const input = document.getElementById('restockBarcodeInput');
    const barcode = input.value.trim();
    if (!barcode) { input.focus(); return; }
    input.value = '';
    try {
        let product = currentData.products.find(p => p.barcode === barcode);
        if (!product) {
            try {
                const apiProduct = await API.getByBarcode(barcode);
                product = normalizeProduct(apiProduct);
                currentData.products.push(product);
            } catch (e) { playBeepError(); showToast(`❌ No product found: ${barcode}`, 'error'); input.focus(); return; }
        }
        currentRestockProduct = product;
        playBeepSuccess();
        showRestockForm(product);
    } catch (err) { showToast(err.message, 'error'); }
}

function showRestockForm(product) {
    const card = document.getElementById('restockFormCard');
    if (!card) return;
    card.style.display = 'block';
    document.getElementById('restockProductName').textContent = product.name;
    document.getElementById('restockProductMeta').innerHTML = `<span><strong>Current stock:</strong> ${product.stock} ${product.unitOfMeasure || 'units'}</span><span><strong>Cost:</strong> KES ${Number(product.costPrice).toFixed(2)}</span><span><strong>Selling:</strong> KES ${Number(product.sellingPrice).toFixed(2)}</span>`;
    document.getElementById('restockQuantity').value = '';
    document.getElementById('restockCostPrice').value = '';
    document.getElementById('restockSellingPrice').value = '';
    document.getElementById('restockUnitHelp').textContent = product.unitOfMeasure || 'units';
    setTimeout(() => document.getElementById('restockQuantity')?.focus(), 200);
}

function clearRestockForm() {
    const card = document.getElementById('restockFormCard');
    if (card) card.style.display = 'none';
    const input = document.getElementById('restockBarcodeInput');
    if (input) { input.value = ''; input.focus(); }
    currentRestockProduct = null;
}

async function saveRestock() {
    if (!requirePermission('restock', 'restock items')) return;
    if (!currentRestockProduct) return;
    const quantity = parseFloat(document.getElementById('restockQuantity').value);
    const newCostPrice = parseFloat(document.getElementById('restockCostPrice').value) || null;
    const newSellingPrice = parseFloat(document.getElementById('restockSellingPrice').value) || null;
    if (!quantity || quantity <= 0) { showToast('Enter a valid quantity', 'error'); return; }
    try {
        await API.restock(currentRestockProduct.id, quantity);
        if (newCostPrice || newSellingPrice) {
            await API.updateProduct(currentRestockProduct.id, {
                name: currentRestockProduct.name, category: currentRestockProduct.category,
                type: currentRestockProduct.type, barcode: currentRestockProduct.barcode,
                costPrice: newCostPrice || currentRestockProduct.costPrice,
                sellingPrice: newSellingPrice || currentRestockProduct.sellingPrice,
                reorderLevel: currentRestockProduct.reorderLevel, unitsPerPack: currentRestockProduct.unitsPerPack,
                sellingPricePerSingle: currentRestockProduct.sellingPricePerSingle, unitOfMeasure: currentRestockProduct.unitOfMeasure
            });
        }
        showToast(`✓ Restocked ${quantity} of ${currentRestockProduct.name}`, 'success');
        await loadProducts();
        clearRestockForm();
    } catch (err) { showToast('Restock failed: ' + err.message, 'error'); }
}

// ============ REPORTS ============
function toggleReportFilters() {
    const type = document.getElementById('reportFilterType').value;
    document.getElementById('dayFilter').style.display = type === 'day' ? 'flex' : 'none';
    document.getElementById('monthFilter').style.display = type === 'month' ? 'flex' : 'none';
    document.getElementById('yearFilter').style.display = type === 'year' ? 'flex' : 'none';
}

async function populateYearFilter() {
    try {
        const years = await API.getYears();
        const currentYear = new Date().getFullYear().toString();
        if (!years.includes(currentYear)) years.unshift(currentYear);
        const yearSelect = document.getElementById('reportYear');
        if (yearSelect) yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    } catch (err) {}
}

async function generateReport() {
    if (!requirePermission('view_reports', 'view reports')) return;
    const filterType = document.getElementById('reportFilterType').value;
    const params = { type: filterType };
    if (filterType === 'day') { params.date = document.getElementById('reportDate').value; if (!params.date) { showToast('Please select a date', 'error'); return; } }
    else if (filterType === 'month') { params.month = document.getElementById('reportMonth').value; if (!params.month) { showToast('Please select a month', 'error'); return; } }
    else if (filterType === 'year') { params.year = document.getElementById('reportYear').value; }
    try {
        const data = await API.getReport(params);
        const summaryEl = document.getElementById('reportSummary');
        if (summaryEl) {
            summaryEl.innerHTML = `
                <div class="summary-card"><div class="value">${data.summary.transactions}</div><div class="label">Total Transactions</div></div>
                <div class="summary-card green"><div class="value">KES ${formatMoney(data.summary.revenue)}</div><div class="label">Total Revenue</div></div>
                <div class="summary-card"><div class="value">KES ${formatMoney(data.summary.avgSale)}</div><div class="label">Average Sale</div></div>`;
        }
        renderPaymentBreakdown(data.payment, data.summary.revenue);
        const itemsBody = document.getElementById('reportItemsBody');
        if (itemsBody) {
            if (data.items.length === 0) itemsBody.innerHTML = '<tr><td colspan="4" class="no-data">No sales in this period</td></tr>';
            else itemsBody.innerHTML = data.items.map(item => `<tr><td><strong>${item.product_name}</strong></td><td>${item.total_qty}</td><td>KES ${Number(item.unit_price).toFixed(2)}</td><td><strong>KES ${Number(item.total_revenue).toFixed(2)}</strong></td></tr>`).join('');
        }
        renderSalesHistory();
    } catch (err) { showToast(err.message, 'error'); }
}

function renderPaymentBreakdown(payment) {
    const el = document.getElementById('paymentBreakdown');
    if (!el || !payment) return;
    const cash = payment.cash || { transactions: 0, revenue: 0, percentage: 0 };
    const mpesa = payment.mpesa || { transactions: 0, revenue: 0, percentage: 0 };
    el.innerHTML = `
        <div class="payment-card cash"><div class="payment-card-icon"><i class="fas fa-money-bill-wave"></i></div><div class="payment-card-body"><div class="payment-card-label">Cash Payments</div><div class="payment-card-amount">KES ${formatMoney(cash.revenue)}</div><div class="payment-card-meta"><span>${cash.transactions} sales</span><span>${cash.percentage}%</span></div></div></div>
        <div class="payment-card mpesa"><div class="payment-card-icon"><i class="fas fa-mobile-alt"></i></div><div class="payment-card-body"><div class="payment-card-label">M-Pesa Payments</div><div class="payment-card-amount">KES ${formatMoney(mpesa.revenue)}</div><div class="payment-card-meta"><span>${mpesa.transactions} sales</span><span>${mpesa.percentage}%</span></div></div></div>`;
}

async function renderSalesHistory() {
    const history = document.getElementById('salesHistoryList');
    if (!history) return;
    try {
        const monthly = await API.getMonthly();
        if (monthly.length === 0) { history.innerHTML = '<div class="no-data">No sales history yet</div>'; return; }
        history.innerHTML = monthly.map(m => {
            const [year, month] = m.month.split('-');
            const monthName = new Date(year, parseInt(month) - 1).toLocaleString('en-KE', { month: 'long' });
            return `<div class="history-item"><div><strong>${monthName} ${year}</strong><div class="history-date">${m.transactions} transactions</div></div><div class="history-amount">KES ${formatMoney(m.revenue)}</div></div>`;
        }).join('');
    } catch (err) {}
}

// ============ TOAST ============
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 2500);
}

function formatMoney(num) {
    if (num === null || num === undefined) return '0.00';
    num = Number(num);
    if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (Math.abs(num) >= 1000) return num.toLocaleString('en-KE', { maximumFractionDigits: 2 });
    return num.toFixed(2);
}

// ============ CLEANUP ============
window.addEventListener('beforeunload', function() {
    cleanupTimers();
    cleanupGlobalListeners();
});

// ============ EXPOSE FUNCTIONS GLOBALLY ============
window.selectRole = selectRole;
window.backToRoleSelection = backToRoleSelection;
window.switchAuth = switchAuth;
window.handleRoleLogin = handleRoleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;

// ============ LOGOUT BUTTON SAFETY NET ============
if (!window._logoutListenerAttached) {
    window._logoutListenerAttached = true;
    document.addEventListener('click', function(e) {
        const logoutBtn = e.target.closest('.btn-logout');
        if (logoutBtn) { e.preventDefault(); handleLogout(); }
    });
}

console.log('[SmartPOS] script.js fully loaded (v7 - performance)');