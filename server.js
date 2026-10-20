/* ============================================================
   SMARTPOS - Backend Server
   Node.js + Express + SQLite
   Supports: Local PC + Cloud (Railway) + Cloud Backup
   ============================================================ */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');

// ============================================================
// CONFIG
// ============================================================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'd6nvGYb4xRHQkLFKjTqI07wOlzmeoiCSZ1hp9VcPsAM23gUNWEDXryufa8tJB5';

// ============================================================
// ✅ WRITABLE PATHS — supports Local PC + Railway cloud
// ============================================================
// Priority order:
// 1. RAILWAY_VOLUME_MOUNT_PATH (Railway persistent volume)
// 2. DB_PATH (Electron env var for installed app)
// 3. Local ./data (dev mode)
const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
    || (process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(__dirname, 'data'));
const DB_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'pos.db')
    : (process.env.DB_PATH || path.join(DB_DIR, 'pos.db'));
const BACKUP_ROOT = process.env.BACKUP_PATH || path.join(DB_DIR, 'backups');
const CLOUD_DIR = path.join(BACKUP_ROOT, 'cloud');
const TMP_DIR = process.env.TMP_DIR || path.join(DB_DIR, 'tmp');
const CONFIG_FILE = process.env.CONFIG_PATH || path.join(DB_DIR, 'config.json');

[DB_DIR, BACKUP_ROOT, CLOUD_DIR, TMP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (e) {
            console.error('[Server] Cannot create folder:', dir, e.message);
        }
    }
});

console.log('[Server] DB_PATH:', DB_PATH);
console.log('[Server] BACKUP_ROOT:', BACKUP_ROOT);
console.log('[Server] TMP_DIR:', TMP_DIR);
console.log('[Server] Environment:', process.env.RAILWAY_VOLUME_MOUNT_PATH ? 'Railway Cloud' : (process.env.ELECTRON ? 'Electron App' : 'Dev'));

// ============================================================
// CONFIG MANAGEMENT
// ============================================================
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[Config] Failed to load:', e.message);
    }
    return { cloudFolderPath: '', autoSyncEnabled: true };
}

function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        return true;
    } catch (e) {
        console.error('[Config] Failed to save:', e.message);
        return false;
    }
}

let appConfig = loadConfig();
console.log('[Config] Cloud folder:', appConfig.cloudFolderPath || '(not set)');

// ============================================================
// DATABASE
// ============================================================
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('[Database] Connection error:', err.message);
        process.exit(1);
    }
    console.log('[Database] Connected');
    runSchema();
});

function runSchema() {
    const schema = `
        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            address TEXT,
            vat_rate REAL DEFAULT 0,
            currency TEXT DEFAULT 'KES',
            owner_user_id INTEGER,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS branches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            phone TEXT,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT,
            role TEXT DEFAULT 'employee',
            branch_id INTEGER DEFAULT 1,
            is_active INTEGER DEFAULT 1,
            last_login TEXT,
            permissions TEXT DEFAULT '[]',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(company_id, username)
        );
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            category TEXT,
            type TEXT DEFAULT 'inventory',
            barcode TEXT,
            cost_price REAL DEFAULT 0,
            selling_price REAL DEFAULT 0,
            stock REAL DEFAULT 0,
            reorder_level REAL DEFAULT 5,
            icon TEXT DEFAULT 'fa-box',
            units_per_pack INTEGER DEFAULT 1,
            selling_price_per_single REAL DEFAULT 0,
            unit_of_measure TEXT DEFAULT 'pcs',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            branch_id INTEGER DEFAULT 1,
            cashier_id INTEGER,
            cashier_name TEXT,
            receipt_no TEXT UNIQUE,
            subtotal REAL DEFAULT 0,
            discount REAL DEFAULT 0,
            total REAL DEFAULT 0,
            payment_cash REAL DEFAULT 0,
            payment_mpesa REAL DEFAULT 0,
            change_amount REAL DEFAULT 0,
            payment_method TEXT DEFAULT 'cash',
            mpesa_receipt TEXT,
            customer_phone TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sale_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sale_id INTEGER NOT NULL,
            product_id INTEGER,
            product_name TEXT,
            quantity REAL DEFAULT 1,
            unit_price REAL DEFAULT 0,
            total REAL DEFAULT 0,
            sell_mode TEXT DEFAULT 'unit'
        );
        CREATE TABLE IF NOT EXISTS returns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL,
            sale_id INTEGER,
            receipt_no TEXT,
            refund_method TEXT,
            reason TEXT,
            notes TEXT,
            total_refund REAL DEFAULT 0,
            cashier_id INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS return_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            return_id INTEGER NOT NULL,
            product_id INTEGER,
            product_name TEXT,
            quantity REAL,
            unit_price REAL,
            total REAL
        );
        CREATE TABLE IF NOT EXISTS mpesa_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            checkout_request_id TEXT,
            merchant_request_id TEXT,
            phone TEXT,
            amount REAL,
            mpesa_receipt TEXT,
            status TEXT DEFAULT 'pending',
            result_desc TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER,
            user_id INTEGER,
            action TEXT,
            details TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS backups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT,
            type TEXT,
            size INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `;

    db.exec(schema, (err) => {
        if (err) {
            console.error('[Database] Schema error:', err.message);
            process.exit(1);
        }
        console.log('[Database] Schema ready');
        seedDefaultData();
    });
}

function seedDefaultData() {
    db.get("SELECT COUNT(*) as count FROM companies", (err, row) => {
        if (err) { console.error('[Seed] Error:', err.message); return onReady(); }
        if (row.count > 0) { console.log('[Seed] Data exists, skipping'); return onReady(); }

        const hash = bcrypt.hashSync('admin123', 10);
        db.run("INSERT INTO companies (name, phone, is_active) VALUES ('smart', '0700000000', 1)",
            function (err) {
                if (err) { console.error('[Seed] Company error:', err.message); return onReady(); }
                const companyId = this.lastID;
                db.run(
                    "INSERT INTO users (company_id, username, password_hash, full_name, role, is_active, permissions) VALUES (?, ?, ?, ?, 'owner', 1, '[]')",
                    [companyId, 'admin', hash, 'System Admin'],
                    function (err2) {
                        if (err2) { console.error('[Seed] User error:', err2.message); return onReady(); }
                        const userId = this.lastID;
                        db.run("UPDATE companies SET owner_user_id = ? WHERE id = ?", [userId, companyId],
                            () => { console.log('[Seed] Default company + admin created (admin / admin123)'); onReady(); });
                    }
                );
            }
        );
    });
}

// ============================================================
// ON READY
// ============================================================
let serverStarted = false;

function onReady() {
    if (serverStarted) return;
    serverStarted = true;

    try {
        const result = createBackupFile('auto');
        console.log(`[Startup Backup] ✓ ${result.filename} (${(result.size / 1024).toFixed(2)} KB)`);
    } catch (err) { console.error('[Startup Backup] Failed:', err.message); }

    syncToCloudFolder();

    // ✅ Listen on 0.0.0.0 so phones on same WiFi can connect
    app.listen(PORT, '0.0.0.0', () => {
        console.log('╔════════════════════════════════════════════════════╗');
        console.log('║         SmartPOS Backend Server Started            ║');
        console.log('╠════════════════════════════════════════════════════╣');
        console.log(`║  Port:      ${PORT}                                   ║`);
        console.log(`║  API:       http://localhost:${PORT}/api              ║`);
        console.log(`║  Database:  ${DB_PATH.substring(0, 40)}...         ║`);
        console.log(`║  Cloud:     ${appConfig.cloudFolderPath ? '✓ Enabled' : '✗ Not set'}                            ║`);
        console.log('╚════════════════════════════════════════════════════╝');

        // Show local IP for mobile access
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    console.log(`[Mobile Access] http://${iface.address}:${PORT}`);
                    break;
                }
            }
        }
    });

    setInterval(() => {
        try {
            const result = createBackupFile('auto');
            console.log(`[Auto Backup] ✓ ${result.filename}`);
            syncToCloudFolder();
        } catch (err) { console.error('[Auto Backup] Failed:', err.message); }
    }, 30 * 60 * 1000);
}

// ============================================================
// CLOUD SYNC
// ============================================================
function syncToCloudFolder() {
    if (!appConfig.autoSyncEnabled) return;
    if (!appConfig.cloudFolderPath) return;

    try {
        const cloudPath = appConfig.cloudFolderPath;
        if (!fs.existsSync(cloudPath)) {
            console.warn('[Cloud Sync] Folder not found:', cloudPath);
            return;
        }

        const smartPosFolder = path.join(cloudPath, 'SmartPOS_Backups');
        if (!fs.existsSync(smartPosFolder)) {
            fs.mkdirSync(smartPosFolder, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `pos_${timestamp}.db`;
        const dest = path.join(smartPosFolder, filename);
        fs.copyFileSync(DB_PATH, dest);

        const latestDest = path.join(smartPosFolder, 'latest.db');
        fs.copyFileSync(DB_PATH, latestDest);

        try {
            const files = fs.readdirSync(smartPosFolder)
                .filter(f => f.startsWith('pos_') && f.endsWith('.db'))
                .map(f => ({ f, mtime: fs.statSync(path.join(smartPosFolder, f)).mtime }))
                .sort((a, b) => b.mtime - a.mtime);
            if (files.length > 30) {
                files.slice(30).forEach(({ f }) => {
                    try { fs.unlinkSync(path.join(smartPosFolder, f)); } catch (e) {}
                });
            }
        } catch (e) {}

        console.log(`[Cloud Sync] ✓ ${filename} copied to ${smartPosFolder}`);
    } catch (err) {
        console.error('[Cloud Sync] Failed:', err.message);
    }
}

// ============================================================
// EXPRESS APP
// ============================================================
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Too many attempts. Please try again later.' }
});

// Serve frontend — env var takes priority (packaged app), else ../frontend (dev)
const FRONTEND_PATH = process.env.SMART_POS_FRONTEND || path.join(__dirname, '..', 'frontend');
console.log('[Server] Serving frontend from:', FRONTEND_PATH);
app.use(express.static(FRONTEND_PATH));

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.substring(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
        if (req.user.role === 'owner') return next();
        const perms = req.user.permissions || [];
        if (perms.includes(permission)) return next();
        return res.status(403).json({ error: 'Access denied' });
    };
}

// ============================================================
// BACKUP HELPERS
// ============================================================
function createBackupFile(type = 'manual') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `pos_backup_${type}_${timestamp}.db`;
    const dest = path.join(BACKUP_ROOT, filename);

    fs.copyFileSync(DB_PATH, dest);
    const stats = fs.statSync(dest);

    db.run("INSERT INTO backups (filename, type, size) VALUES (?, ?, ?)",
        [filename, type, stats.size]);

    return { filename, size: stats.size, created: new Date().toISOString() };
}

// ============================================================
// PUBLIC ROUTES
// ============================================================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// ✅ Server info for Mobile Access
app.get('/api/server-info', (req, res) => {
    const interfaces = os.networkInterfaces();
    let localIP = 'localhost';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                localIP = iface.address;
                break;
            }
        }
    }
    res.json({
        localIP,
        port: PORT,
        hostname: os.hostname(),
        platform: os.platform(),
        isCloud: !!process.env.RAILWAY_VOLUME_MOUNT_PATH
    });
});

app.get('/api/companies', (req, res) => {
    db.all("SELECT id, name FROM companies WHERE is_active = 1 ORDER BY name ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.post('/api/companies', async (req, res) => {
    const { companyName, ownerFullName, ownerUsername, ownerPassword, phone } = req.body;
    if (!companyName || !ownerUsername || !ownerPassword) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        db.get("SELECT id FROM users WHERE username = ?", [ownerUsername], async (err, existing) => {
            if (err) return res.status(500).json({ error: err.message });
            if (existing) return res.status(400).json({ error: 'Username already taken' });

            const hash = await bcrypt.hash(ownerPassword, 10);
            db.run("INSERT INTO companies (name, phone, is_active) VALUES (?, ?, 1)",
                [companyName, phone || ''],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    const companyId = this.lastID;
                    db.run(
                        `INSERT INTO users (company_id, username, password_hash, full_name, role, is_active, permissions)
                         VALUES (?, ?, ?, ?, 'owner', 1, '[]')`,
                        [companyId, ownerUsername, hash, ownerFullName || 'Owner'],
                        function (err2) {
                            if (err2) return res.status(500).json({ error: err2.message });
                            db.run("UPDATE companies SET owner_user_id = ? WHERE id = ?", [this.lastID, companyId]);
                            res.json({ success: true, companyId, message: 'Company created successfully' });
                        }
                    );
                }
            );
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/login', authLimiter, (req, res) => {
    const { company_id, username, password, role } = req.body;
    if (!company_id || !username || !password) return res.status(400).json({ error: 'Missing credentials' });

    db.get(
        `SELECT u.*, c.name as company_name 
         FROM users u JOIN companies c ON c.id = u.company_id 
         WHERE u.company_id = ? AND u.username = ? AND u.is_active = 1`,
        [company_id, username],
        async (err, user) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!user) return res.status(401).json({ error: 'Invalid credentials' });

            const valid = await bcrypt.compare(password, user.password_hash);
            if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

            const userRole = user.role === 'employee' ? 'cashier' : user.role;
            const selectedRole = role === 'employee' ? 'cashier' : role;
            if (selectedRole && userRole !== selectedRole && user.role !== 'owner') {
                return res.status(401).json({ error: `This account is a ${user.role}, not a ${role}.` });
            }

            let permissions = [];
            try { permissions = user.permissions ? JSON.parse(user.permissions) : []; } catch (e) {}

            const tokenPayload = {
                userId: user.id, companyId: user.company_id,
                username: user.username, role: user.role, permissions
            };
            const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '30d' });

            db.run("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", [user.id]);

            res.json({
                token,
                user: {
                    id: user.id, username: user.username, fullName: user.full_name,
                    role: user.role, permissions, companyId: user.company_id
                },
                company: { id: user.company_id, name: user.company_name }
            });
        }
    );
});

app.get('/api/auth/verify', authenticate, (req, res) => {
    db.get(
        `SELECT u.id, u.username, u.full_name, u.role, u.permissions, u.company_id, c.name as company_name
         FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id = ?`,
        [req.user.userId],
        (err, user) => {
            if (err || !user) return res.status(401).json({ error: 'User not found' });
            let permissions = [];
            try { permissions = JSON.parse(user.permissions || '[]'); } catch (e) {}
            res.json({
                user: {
                    id: user.id, username: user.username, fullName: user.full_name,
                    role: user.role, permissions, companyId: user.company_id
                },
                company: { id: user.company_id, name: user.company_name }
            });
        }
    );
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
    const { companyName, username, password, phone, fullName } = req.body;
    if (!companyName || !username || !password) return res.status(400).json({ error: 'Missing fields' });
    try {
        const hash = await bcrypt.hash(password, 10);
        db.run("INSERT INTO companies (name, phone, is_active) VALUES (?, ?, 1)",
            [companyName, phone || ''],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                const companyId = this.lastID;
                db.run(
                    `INSERT INTO users (company_id, username, password_hash, full_name, role, is_active, permissions)
                     VALUES (?, ?, ?, ?, 'owner', 1, '[]')`,
                    [companyId, username, hash, fullName || 'Owner'],
                    function (err2) {
                        if (err2) return res.status(500).json({ error: err2.message });
                        db.run("UPDATE companies SET owner_user_id = ? WHERE id = ?", [this.lastID, companyId]);
                        res.json({ success: true, companyId });
                    }
                );
            }
        );
    } catch (err) { res.status(500).json({ error: 'Internal server error' }); }
});

// ============================================================
// PRODUCTS
// ============================================================
app.get('/api/products', authenticate, (req, res) => {
    db.all("SELECT * FROM products WHERE company_id = ? AND is_active = 1 ORDER BY name ASC",
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/products/barcode/:code', authenticate, (req, res) => {
    db.get("SELECT * FROM products WHERE company_id = ? AND barcode = ? AND is_active = 1",
        [req.user.companyId, req.params.code], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'Product not found' });
            res.json(row);
        });
});

app.get('/api/products/:id', authenticate, (req, res) => {
    db.get("SELECT * FROM products WHERE id = ? AND company_id = ?",
        [req.params.id, req.user.companyId], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: 'Not found' });
            res.json(row);
        });
});

app.post('/api/products', authenticate, requirePermission('add_product'), (req, res) => {
    const { name, category, type, barcode, costPrice, sellingPrice, stock, reorderLevel, icon, unitsPerPack, sellingPricePerSingle, unitOfMeasure } = req.body;
    if (!name || !sellingPrice) return res.status(400).json({ error: 'Name and selling price required' });
    db.run(
        `INSERT INTO products (company_id, name, category, type, barcode, cost_price, selling_price,
            stock, reorder_level, icon, units_per_pack, selling_price_per_single, unit_of_measure)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.companyId, name, category, type || 'inventory', barcode,
         costPrice || 0, sellingPrice, stock || 0, reorderLevel || 5, icon || 'fa-box',
         unitsPerPack || 1, sellingPricePerSingle || 0, unitOfMeasure || 'pcs'],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

app.put('/api/products/:id', authenticate, requirePermission('edit_product'), (req, res) => {
    const { name, category, type, barcode, costPrice, sellingPrice, stock, reorderLevel, icon, unitsPerPack, sellingPricePerSingle, unitOfMeasure } = req.body;
    db.run(
        `UPDATE products SET name=?, category=?, type=?, barcode=?, cost_price=?, selling_price=?,
         stock=?, reorder_level=?, icon=?, units_per_pack=?, selling_price_per_single=?, unit_of_measure=?
         WHERE id=? AND company_id=?`,
        [name, category, type, barcode, costPrice, sellingPrice, stock, reorderLevel, icon,
         unitsPerPack, sellingPricePerSingle, unitOfMeasure, req.params.id, req.user.companyId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, changes: this.changes });
        }
    );
});

app.post('/api/products/:id/restock', authenticate, requirePermission('restock'), (req, res) => {
    const { quantity } = req.body;
    if (!quantity || quantity <= 0) return res.status(400).json({ error: 'Invalid quantity' });
    db.run("UPDATE products SET stock = stock + ? WHERE id = ? AND company_id = ?",
        [quantity, req.params.id, req.user.companyId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

app.delete('/api/products/:id', authenticate, requirePermission('delete_product'), (req, res) => {
    db.run("UPDATE products SET is_active = 0 WHERE id = ? AND company_id = ?",
        [req.params.id, req.user.companyId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

// ============================================================
// SALES
// ============================================================
app.post('/api/sales', authenticate, requirePermission('make_sale'), (req, res) => {
    const { items, payment, paymentMethod, paymentCash, paymentMpesa, mpesaReceipt, customerPhone, discountAmount } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

    const receiptNo = 'R' + Date.now();
    const subtotal = items.reduce((s, i) => s + (i.unit_price || 0) * i.quantity, 0);
    const discount = discountAmount || 0;
    const total = Math.max(0, subtotal - discount);
    const cash = paymentCash || 0;
    const mpesa = paymentMpesa || 0;
    const change = cash > total ? cash - (total - mpesa) : 0;

    db.run(
        `INSERT INTO sales (company_id, branch_id, cashier_id, cashier_name, receipt_no,
            subtotal, discount, total, payment_cash, payment_mpesa, change_amount,
            payment_method, mpesa_receipt, customer_phone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.companyId, 1, req.user.userId, req.user.username, receiptNo,
         subtotal, discount, total, cash, mpesa, change, paymentMethod || 'cash',
         mpesaReceipt || null, customerPhone || null],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            const saleId = this.lastID;

            let completed = 0;
            items.forEach(item => {
                db.run(
                    `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total, sell_mode)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [saleId, item.productId, item.name || '', item.quantity, item.unit_price || 0,
                     (item.unit_price || 0) * item.quantity, item.sellMode || 'unit'],
                    () => {
                        db.run("UPDATE products SET stock = stock - ? WHERE id = ?",
                            [item.quantity, item.productId], () => {
                                completed++;
                                if (completed === items.length) {
                                    syncToCloudFolder();
                                    res.json({
                                        success: true, saleId,
                                        receipt: {
                                            receiptNo, date: new Date().toISOString(),
                                            cashier: req.user.username, items, subtotal, discount, total,
                                            payment: payment || total, paymentCash: cash, paymentMpesa: mpesa,
                                            change, mpesaReceipt
                                        }
                                    });
                                }
                            });
                    }
                );
            });
        }
    );
});

app.get('/api/sales', authenticate, (req, res) => {
    db.all("SELECT * FROM sales WHERE company_id = ? ORDER BY id DESC LIMIT 100",
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/sales/receipt/:receiptNo', authenticate, (req, res) => {
    db.get("SELECT * FROM sales WHERE receipt_no = ? AND company_id = ?",
        [req.params.receiptNo, req.user.companyId], (err, sale) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!sale) return res.status(404).json({ error: 'Sale not found' });
            db.all("SELECT * FROM sale_items WHERE sale_id = ?", [sale.id], (err2, items) => {
                res.json({ ...sale, items: items || [] });
            });
        });
});

app.get('/api/sales/:id', authenticate, (req, res) => {
    db.get("SELECT * FROM sales WHERE id = ? AND company_id = ?",
        [req.params.id, req.user.companyId], (err, sale) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!sale) return res.status(404).json({ error: 'Sale not found' });
            db.all("SELECT * FROM sale_items WHERE sale_id = ?", [sale.id], (err2, items) => {
                res.json({ ...sale, items: items || [] });
            });
        });
});

// ============================================================
// REPORTS
// ============================================================
app.get('/api/reports/report', authenticate, requirePermission('view_reports'), (req, res) => {
    const { type, date, month, year } = req.query;
    let whereClause = "company_id = ?";
    const params = [req.user.companyId];

    if (type === 'today') whereClause += " AND date(created_at) = date('now')";
    else if (type === 'day' && date) { whereClause += " AND date(created_at) = ?"; params.push(date); }
    else if (type === 'month' && month) { whereClause += " AND strftime('%Y-%m', created_at) = ?"; params.push(month); }
    else if (type === 'year' && year) { whereClause += " AND strftime('%Y', created_at) = ?"; params.push(year); }

    db.get(`SELECT COUNT(*) as transactions, COALESCE(SUM(total), 0) as revenue,
                COALESCE(AVG(total), 0) as avgSale FROM sales WHERE ${whereClause}`, params,
        (err, summary) => {
            if (err) return res.status(500).json({ error: err.message });
            db.all(
                `SELECT si.product_name, SUM(si.quantity) as total_qty,
                        AVG(si.unit_price) as unit_price, SUM(si.total) as total_revenue
                 FROM sale_items si JOIN sales s ON s.id = si.sale_id
                 WHERE s.${whereClause} GROUP BY si.product_name ORDER BY total_revenue DESC`,
                params,
                (err2, items) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    db.get(
                        `SELECT 
                            COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END), 0) as cash_rev,
                            COALESCE(SUM(CASE WHEN payment_method='mpesa' THEN total ELSE 0 END), 0) as mpesa_rev,
                            COALESCE(SUM(CASE WHEN payment_method='cash' THEN 1 ELSE 0 END), 0) as cash_tx,
                            COALESCE(SUM(CASE WHEN payment_method='mpesa' THEN 1 ELSE 0 END), 0) as mpesa_tx
                         FROM sales WHERE ${whereClause}`, params,
                        (err3, pay) => {
                            const totalRev = summary.revenue || 1;
                            res.json({
                                summary, items: items || [],
                                payment: {
                                    cash: { revenue: pay.cash_rev, transactions: pay.cash_tx, percentage: Math.round((pay.cash_rev / totalRev) * 100) },
                                    mpesa: { revenue: pay.mpesa_rev, transactions: pay.mpesa_tx, percentage: Math.round((pay.mpesa_rev / totalRev) * 100) }
                                }
                            });
                        }
                    );
                }
            );
        }
    );
});

app.get('/api/reports/yearly', authenticate, (req, res) => {
    db.all(`SELECT strftime('%Y', created_at) as year, COUNT(*) as transactions, SUM(total) as revenue
            FROM sales WHERE company_id = ? GROUP BY year ORDER BY year DESC`,
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/reports/monthly', authenticate, (req, res) => {
    db.all(`SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as transactions, SUM(total) as revenue
            FROM sales WHERE company_id = ? GROUP BY month ORDER BY month DESC LIMIT 12`,
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/reports/years', authenticate, (req, res) => {
    db.all(`SELECT DISTINCT strftime('%Y', created_at) as year FROM sales WHERE company_id = ? ORDER BY year DESC`,
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json((rows || []).map(r => r.year));
        });
});

// ============================================================
// EMPLOYEES
// ============================================================
app.get('/api/employees', authenticate, requirePermission('manage_employees'), (req, res) => {
    db.all(`SELECT id, username, full_name, role, is_active, last_login, permissions, created_at
            FROM users WHERE company_id = ? ORDER BY id ASC`,
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            const parsed = (rows || []).map(u => {
                let permissions = [];
                try { permissions = JSON.parse(u.permissions || '[]'); } catch (e) {}
                return { ...u, permissions };
            });
            res.json(parsed);
        });
});

app.get('/api/employees/stats', authenticate, requirePermission('manage_employees'), (req, res) => {
    db.all(`SELECT cashier_id, cashier_name, COUNT(*) as sales, COALESCE(SUM(total), 0) as revenue
            FROM sales WHERE company_id = ? GROUP BY cashier_id`,
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/employees/permissions-matrix', authenticate, (req, res) => {
    res.json({
        employee: ['make_sale', 'view_inventory', 'process_returns'],
        admin: ['make_sale', 'view_inventory', 'process_returns', 'restock', 'add_product',
                'edit_product', 'delete_product', 'print_labels', 'view_reports', 'view_analytics'],
        owner: ['*']
    });
});

app.post('/api/employees', authenticate, requirePermission('manage_employees'), async (req, res) => {
    const { fullName, username, password, role, permissions } = req.body;
    if (!fullName || !username || !password || !role) return res.status(400).json({ error: 'All fields required' });
    db.get("SELECT id FROM users WHERE company_id = ? AND username = ?",
        [req.user.companyId, username],
        async (err, existing) => {
            if (err) return res.status(500).json({ error: err.message });
            if (existing) return res.status(400).json({ error: 'Username already exists' });
            const hash = await bcrypt.hash(password, 10);
            db.run(
                `INSERT INTO users (company_id, username, password_hash, full_name, role, is_active, permissions)
                 VALUES (?, ?, ?, ?, ?, 1, ?)`,
                [req.user.companyId, username, hash, fullName, role, JSON.stringify(permissions || [])],
                function (err2) {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ success: true, id: this.lastID });
                }
            );
        }
    );
});

app.put('/api/employees/:id', authenticate, requirePermission('manage_employees'), async (req, res) => {
    const { fullName, role, permissions, isActive, password } = req.body;
    const updates = [];
    const params = [];

    if (fullName) { updates.push('full_name = ?'); params.push(fullName); }
    if (role) { updates.push('role = ?'); params.push(role); }
    if (permissions) { updates.push('permissions = ?'); params.push(JSON.stringify(permissions)); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }
    if (password) {
        const hash = await bcrypt.hash(password, 10);
        updates.push('password_hash = ?');
        params.push(hash);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id, req.user.companyId);
    db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ? AND company_id = ?`, params,
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

app.put('/api/employees/:id/permissions', authenticate, requirePermission('manage_employees'), (req, res) => {
    const { permissions } = req.body;
    db.run("UPDATE users SET permissions = ? WHERE id = ? AND company_id = ?",
        [JSON.stringify(permissions || []), req.params.id, req.user.companyId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

app.post('/api/employees/:id/reset-password', authenticate, requirePermission('manage_employees'), async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Password too short' });
    const hash = await bcrypt.hash(newPassword, 10);
    db.run("UPDATE users SET password_hash = ? WHERE id = ? AND company_id = ?",
        [hash, req.params.id, req.user.companyId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

app.delete('/api/employees/:id', authenticate, requirePermission('manage_employees'), (req, res) => {
    if (req.params.id == req.user.userId) return res.status(400).json({ error: 'Cannot delete yourself' });
    db.run("UPDATE users SET is_active = 0 WHERE id = ? AND company_id = ?",
        [req.params.id, req.user.companyId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
});

// ============================================================
// M-PESA (stub)
// ============================================================
app.post('/api/mpesa/stkpush', authenticate, (req, res) => {
    const { phone, amount } = req.body;
    const checkoutId = 'SIM_' + Date.now();
    db.run(`INSERT INTO mpesa_transactions (company_id, checkout_request_id, phone, amount, status)
            VALUES (?, ?, ?, ?, 'pending')`,
        [req.user.companyId, checkoutId, phone, amount]);
    res.json({ success: true, checkoutRequestId: checkoutId, message: 'STK push simulated.' });
});

app.get('/api/mpesa/status/:id', authenticate, (req, res) => {
    db.get("SELECT * FROM mpesa_transactions WHERE checkout_request_id = ?", [req.params.id],
        (err, tx) => {
            if (err || !tx) return res.status(404).json({ error: 'Not found' });
            res.json({ status: tx.status, mpesaReceipt: tx.mpesa_receipt, resultDesc: tx.result_desc });
        });
});

app.get('/api/mpesa/transactions', authenticate, (req, res) => {
    db.all("SELECT * FROM mpesa_transactions WHERE company_id = ? ORDER BY id DESC LIMIT 100",
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/mpesa/config', authenticate, (req, res) => {
    res.json({ configured: false, message: 'M-Pesa not yet configured' });
});

// ============================================================
// RETURNS
// ============================================================
app.get('/api/returns/search-sale', authenticate, (req, res) => {
    const { receipt, phone } = req.query;
    let query = "SELECT * FROM sales WHERE company_id = ?";
    const params = [req.user.companyId];

    if (receipt) { query += " AND receipt_no = ?"; params.push(receipt); }
    else if (phone) { query += " AND customer_phone = ?"; params.push(phone); }
    else return res.status(400).json({ error: 'Receipt or phone required' });

    db.get(query, params, (err, sale) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!sale) return res.status(404).json({ error: 'Sale not found' });
        db.all("SELECT * FROM sale_items WHERE sale_id = ?", [sale.id], (err2, items) => {
            res.json({ ...sale, items: items || [] });
        });
    });
});

app.post('/api/returns', authenticate, requirePermission('process_returns'), (req, res) => {
    const { saleId, items, refundMethod, reason, notes, totalRefund } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'No items selected' });
    db.get("SELECT receipt_no FROM sales WHERE id = ?", [saleId], (err, sale) => {
        if (err || !sale) return res.status(404).json({ error: 'Sale not found' });
        db.run(`INSERT INTO returns (company_id, sale_id, receipt_no, refund_method, reason, notes, total_refund, cashier_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.companyId, saleId, sale.receipt_no, refundMethod, reason, notes, totalRefund, req.user.userId],
            function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });
                const returnId = this.lastID;
                items.forEach(item => {
                    db.run(`INSERT INTO return_items (return_id, product_id, product_name, quantity, unit_price, total)
                            VALUES (?, ?, ?, ?, ?, ?)`,
                        [returnId, item.productId, item.name, item.quantity, item.unit_price, item.total]);
                    db.run("UPDATE products SET stock = stock + ? WHERE id = ?", [item.quantity, item.productId]);
                });
                res.json({ success: true, returnId });
            }
        );
    });
});

app.get('/api/returns', authenticate, (req, res) => {
    db.all("SELECT * FROM returns WHERE company_id = ? ORDER BY id DESC LIMIT 100",
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/returns/:id', authenticate, (req, res) => {
    db.get("SELECT * FROM returns WHERE id = ? AND company_id = ?",
        [req.params.id, req.user.companyId], (err, ret) => {
            if (err || !ret) return res.status(404).json({ error: 'Not found' });
            db.all("SELECT * FROM return_items WHERE return_id = ?", [ret.id], (err2, items) => {
                res.json({ ...ret, items: items || [] });
            });
        });
});

// ============================================================
// IMPORT — uses TMP_DIR (writable)
// ============================================================
const upload = multer({ dest: TMP_DIR });

app.post('/api/import/preview', authenticate, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const content = fs.readFileSync(req.file.path, 'utf8');
        const lines = content.split('\n').slice(0, 50);
        const headers = lines[0].split(',').map(h => h.trim());
        const rows = lines.slice(1).map(line => {
            const cells = line.split(',');
            const row = {};
            headers.forEach((h, i) => row[h] = (cells[i] || '').trim());
            return row;
        }).filter(r => Object.values(r).some(v => v));
        res.json({ headers, rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/import/products', authenticate, requirePermission('add_product'), (req, res) => {
    const { rows, mapping } = req.body;
    if (!rows || !mapping) return res.status(400).json({ error: 'Missing rows or mapping' });
    let imported = 0;
    rows.forEach(row => {
        const name = row[mapping.name];
        const price = parseFloat(row[mapping.sellingPrice]) || 0;
        if (!name || !price) return;
        db.run(`INSERT INTO products (company_id, name, category, type, barcode, cost_price, selling_price, stock, reorder_level)
                VALUES (?, ?, ?, 'inventory', ?, ?, ?, ?, 5)`,
            [req.user.companyId, name, row[mapping.category] || 'Uncategorized', row[mapping.barcode] || null,
             parseFloat(row[mapping.costPrice]) || 0, price, parseFloat(row[mapping.stock]) || 0],
            () => imported++);
    });
    setTimeout(() => res.json({ success: true, imported }), 500);
});

app.post('/api/import/prices', authenticate, requirePermission('edit_product'), (req, res) => {
    const { rows, mapping } = req.body;
    let updated = 0;
    rows.forEach(row => {
        const barcode = row[mapping.barcode];
        const newPrice = parseFloat(row[mapping.price]);
        if (!barcode || !newPrice) return;
        db.run("UPDATE products SET selling_price = ? WHERE barcode = ? AND company_id = ?",
            [newPrice, barcode, req.user.companyId], () => updated++);
    });
    setTimeout(() => res.json({ success: true, updated }), 500);
});

// ============================================================
// BACKUP ROUTES
// ============================================================
app.post('/api/backup/create', authenticate, requirePermission('manage_backups'), (req, res) => {
    try {
        const result = createBackupFile(req.body.type || 'manual');
        syncToCloudFolder();
        res.json({ success: true, ...result });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/backup/list', authenticate, requirePermission('manage_backups'), (req, res) => {
    try {
        const files = fs.readdirSync(BACKUP_ROOT)
            .filter(f => f.endsWith('.db'))
            .map(f => {
                const stats = fs.statSync(path.join(BACKUP_ROOT, f));
                return {
                    filename: f,
                    type: f.includes('_auto_') ? 'auto' : 'manual',
                    size: stats.size,
                    created: stats.mtime.toISOString()
                };
            })
            .sort((a, b) => new Date(b.created) - new Date(a.created));
        res.json(files);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/backup/stats', authenticate, requirePermission('manage_backups'), (req, res) => {
    try {
        const files = fs.readdirSync(BACKUP_ROOT).filter(f => f.endsWith('.db'));
        const stats = { auto: { count: 0, size: 0 }, manual: { count: 0, size: 0 }, cloud: { count: 0, size: 0 } };
        files.forEach(f => {
            const s = fs.statSync(path.join(BACKUP_ROOT, f));
            const type = f.includes('_auto_') ? 'auto' : 'manual';
            stats[type].count++;
            stats[type].size += s.size;
        });
        if (fs.existsSync(CLOUD_DIR)) {
            fs.readdirSync(CLOUD_DIR).forEach(f => {
                const s = fs.statSync(path.join(CLOUD_DIR, f));
                stats.cloud.count++;
                stats.cloud.size += s.size;
            });
        }
        res.json(stats);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/backup/download/:type/:filename', authenticate, (req, res) => {
    const filePath = path.join(BACKUP_ROOT, req.params.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    res.download(filePath);
});

app.post('/api/backup/restore/:type/:filename', authenticate, requirePermission('manage_backups'), (req, res) => {
    const src = path.join(BACKUP_ROOT, req.params.filename);
    if (!fs.existsSync(src)) return res.status(404).json({ error: 'Backup not found' });
    try {
        fs.copyFileSync(src, DB_PATH);
        res.json({ success: true, message: 'Restore will take effect after restart' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/backup/clean', authenticate, requirePermission('manage_backups'), (req, res) => {
    try {
        const files = fs.readdirSync(BACKUP_ROOT)
            .filter(f => f.endsWith('.db'))
            .map(f => ({ f, mtime: fs.statSync(path.join(BACKUP_ROOT, f)).mtime }))
            .sort((a, b) => b.mtime - a.mtime);
        const toDelete = files.slice(10);
        toDelete.forEach(({ f }) => fs.unlinkSync(path.join(BACKUP_ROOT, f)));
        res.json({ success: true, deleted: toDelete.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/backup/sync-cloud', authenticate, requirePermission('manage_backups'), (req, res) => {
    try {
        syncToCloudFolder();
        res.json({ success: true, message: 'Synced to cloud folder' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/backup/:type/:filename', authenticate, requirePermission('manage_backups'), (req, res) => {
    const filePath = path.join(BACKUP_ROOT, req.params.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ success: true });
});

// ============================================================
// CLOUD FOLDER CONFIG ROUTES
// ============================================================
app.get('/api/config/cloud-folder', authenticate, requirePermission('manage_backups'), (req, res) => {
    res.json({
        cloudFolderPath: appConfig.cloudFolderPath || '',
        autoSyncEnabled: appConfig.autoSyncEnabled !== false
    });
});

app.post('/api/config/cloud-folder', authenticate, requirePermission('manage_backups'), (req, res) => {
    const { cloudFolderPath, autoSyncEnabled } = req.body;

    if (cloudFolderPath !== undefined) {
        if (cloudFolderPath && !fs.existsSync(cloudFolderPath)) {
            return res.status(400).json({ error: 'Folder does not exist. Please check the path.' });
        }
        appConfig.cloudFolderPath = cloudFolderPath;
    }
    if (autoSyncEnabled !== undefined) {
        appConfig.autoSyncEnabled = autoSyncEnabled;
    }

    if (saveConfig(appConfig)) {
        if (appConfig.cloudFolderPath) syncToCloudFolder();
        res.json({ success: true, ...appConfig });
    } else {
        res.status(500).json({ error: 'Failed to save config' });
    }
});

app.post('/api/config/test-cloud-folder', authenticate, requirePermission('manage_backups'), (req, res) => {
    const { cloudFolderPath } = req.body;
    if (!cloudFolderPath) return res.status(400).json({ error: 'No path provided' });
    if (!fs.existsSync(cloudFolderPath)) {
        return res.status(400).json({ error: 'Folder does not exist' });
    }
    try {
        const smartPosFolder = path.join(cloudFolderPath, 'SmartPOS_Backups');
        if (!fs.existsSync(smartPosFolder)) {
            fs.mkdirSync(smartPosFolder, { recursive: true });
        }
        const testFile = path.join(smartPosFolder, 'test.txt');
        fs.writeFileSync(testFile, 'SmartPOS test file — ' + new Date().toISOString());
        fs.unlinkSync(testFile);
        res.json({ success: true, message: 'Folder is writable!' });
    } catch (err) {
        res.status(500).json({ error: 'Cannot write to folder: ' + err.message });
    }
});

// ============================================================
// ANALYTICS
// ============================================================
app.get('/api/analytics/kpi', authenticate, requirePermission('view_analytics'), (req, res) => {
    const { period } = req.query;
    let whereClause = "company_id = ?";
    const params = [req.user.companyId];

    if (period === 'today') whereClause += " AND date(created_at) = date('now')";
    else if (period === 'week') whereClause += " AND date(created_at) >= date('now', '-7 days')";
    else if (period === 'month') whereClause += " AND date(created_at) >= date('now', '-30 days')";
    else if (period === 'year') whereClause += " AND date(created_at) >= date('now', '-365 days')";

    db.get(`SELECT COUNT(*) as transactions, COALESCE(SUM(total), 0) as revenue FROM sales WHERE ${whereClause}`,
        params,
        (err, rev) => {
            if (err) return res.status(500).json({ error: err.message });
            db.get("SELECT COUNT(*) as items, COALESCE(SUM(stock * selling_price), 0) as stockValue FROM products WHERE company_id = ? AND is_active = 1",
                [req.user.companyId],
                (err2, inv) => {
                    db.get(`SELECT COALESCE(SUM(quantity), 0) as itemsSold FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.${whereClause}`,
                        params,
                        (err3, sold) => {
                            res.json({
                                revenue: rev.revenue, transactions: rev.transactions,
                                itemsSold: sold ? sold.itemsSold : 0,
                                avgSale: rev.transactions ? rev.revenue / rev.transactions : 0,
                                stockValue: inv ? inv.stockValue : 0,
                                stockItems: inv ? inv.items : 0
                            });
                        });
                });
        }
    );
});

app.get('/api/analytics/sales-trend', authenticate, requirePermission('view_analytics'), (req, res) => {
    const { period } = req.query;
    let days = period === '30days' ? 30 : period === '12months' ? 365 : 7;
    db.all(`SELECT date(created_at) as date, SUM(total) as revenue, COUNT(*) as transactions
            FROM sales WHERE company_id = ? AND date(created_at) >= date('now', '-${days} days')
            GROUP BY date ORDER BY date ASC`,
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/analytics/hourly-sales', authenticate, requirePermission('view_analytics'), (req, res) => {
    db.all(`SELECT strftime('%H', created_at) as hour, SUM(total) as revenue, COUNT(*) as transactions
            FROM sales WHERE company_id = ? GROUP BY hour ORDER BY hour`,
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/analytics/top-products', authenticate, requirePermission('view_analytics'), (req, res) => {
    const limit = parseInt(req.query.limit) || 8;
    db.all(`SELECT si.product_name as name, SUM(si.quantity) as quantity, SUM(si.total) as revenue
            FROM sale_items si JOIN sales s ON s.id = si.sale_id
            WHERE s.company_id = ? GROUP BY si.product_name ORDER BY revenue DESC LIMIT ?`,
        [req.user.companyId, limit], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/analytics/category-performance', authenticate, requirePermission('view_analytics'), (req, res) => {
    db.all(`SELECT p.category as category, SUM(si.total) as revenue
            FROM sale_items si JOIN sales s ON s.id = si.sale_id
            JOIN products p ON p.id = si.product_id
            WHERE s.company_id = ? GROUP BY p.category ORDER BY revenue DESC`,
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/analytics/payment-methods', authenticate, requirePermission('view_analytics'), (req, res) => {
    db.all(`SELECT payment_method, COUNT(*) as count, SUM(total) as revenue
            FROM sales WHERE company_id = ? GROUP BY payment_method`,
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/analytics/profit-analysis', authenticate, requirePermission('view_analytics'), (req, res) => {
    db.all(`SELECT p.name, SUM(si.quantity) as sold,
                   SUM((si.unit_price - p.cost_price) * si.quantity) as profit
            FROM sale_items si JOIN sales s ON s.id = si.sale_id
            JOIN products p ON p.id = si.product_id
            WHERE s.company_id = ? GROUP BY p.name ORDER BY profit DESC`,
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/analytics/cashier-performance', authenticate, requirePermission('view_analytics'), (req, res) => {
    db.all(`SELECT cashier_name, COUNT(*) as sales, SUM(total) as revenue
            FROM sales WHERE company_id = ? GROUP BY cashier_name ORDER BY revenue DESC`,
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/analytics/inventory-insights', authenticate, (req, res) => {
    db.all(`SELECT name, stock, reorder_level FROM products
            WHERE company_id = ? AND stock <= reorder_level AND is_active = 1`,
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/analytics/customer-insights', authenticate, (req, res) => {
    db.all(`SELECT customer_phone, COUNT(*) as visits, SUM(total) as spent
            FROM sales WHERE company_id = ? AND customer_phone IS NOT NULL
            GROUP BY customer_phone ORDER BY spent DESC LIMIT 20`,
        [req.user.companyId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows || []);
        });
});

app.get('/api/analytics/dashboard', authenticate, (req, res) => {
    res.json({ message: 'Use specific analytics endpoints' });
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    db.close((err) => {
        if (err) console.error(err.message);
        console.log('[Database] Closed');
        process.exit(0);
    });
});