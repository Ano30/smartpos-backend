/* ============================================================
   SMARTPOS - Backend Server (Turso Cloud + M-Pesa Simulation)
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
const multer = require('multer');
const { createClient } = require('@libsql/client');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'd6nvGYb4xRHQkLFKjTqI07wOlzmeoiCSZ1hp9VcPsAM23gUNWEDXryufa8tJB5';

const TMP_DIR = process.env.TMP_DIR || path.join(os.tmpdir(), 'smartpos_tmp');
if (!fs.existsSync(TMP_DIR)) { try { fs.mkdirSync(TMP_DIR, { recursive: true }); } catch (e) {} }

const turso = createClient({
    url: process.env.TURSO_DATABASE_URL || 'file:local.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
});

function sanitizeArgs(args) {
    if (!args) return [];
    if (Array.isArray(args)) return args.map(a => a === undefined ? null : a);
    return args;
}

const db = {
    run: function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        turso.execute({ sql, args: sanitizeArgs(params) }).then(res => {
            const context = { lastID: Number(res.lastInsertRowid || 0), changes: res.rowsAffected };
            if (callback) callback.call(context, null);
        }).catch(err => { if (callback) callback(err); });
    },
    get: function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        turso.execute({ sql, args: sanitizeArgs(params) }).then(res => {
            if (callback) callback(null, res.rows[0]);
        }).catch(err => { if (callback) callback(err); });
    },
    all: function(sql, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        turso.execute({ sql, args: sanitizeArgs(params) }).then(res => {
            if (callback) callback(null, res.rows);
        }).catch(err => { if (callback) callback(err); });
    }
};

function runSchema() {
    const statements = [
        `CREATE TABLE IF NOT EXISTS companies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, is_active INTEGER DEFAULT 1, owner_user_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, username TEXT NOT NULL, password_hash TEXT NOT NULL, full_name TEXT, role TEXT DEFAULT 'employee', is_active INTEGER DEFAULT 1, permissions TEXT DEFAULT '[]', created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, name TEXT NOT NULL, category TEXT, type TEXT DEFAULT 'inventory', barcode TEXT, cost_price REAL DEFAULT 0, selling_price REAL DEFAULT 0, stock REAL DEFAULT 0, reorder_level REAL DEFAULT 5, icon TEXT DEFAULT 'fa-box', units_per_pack INTEGER DEFAULT 1, selling_price_per_single REAL DEFAULT 0, unit_of_measure TEXT DEFAULT 'pcs', is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, cashier_id INTEGER, cashier_name TEXT, receipt_no TEXT UNIQUE, subtotal REAL DEFAULT 0, discount REAL DEFAULT 0, total REAL DEFAULT 0, payment_cash REAL DEFAULT 0, payment_mpesa REAL DEFAULT 0, change_amount REAL DEFAULT 0, payment_method TEXT DEFAULT 'cash', mpesa_receipt TEXT, customer_phone TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS sale_items (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL, product_id INTEGER, product_name TEXT, quantity REAL DEFAULT 1, unit_price REAL DEFAULT 0, total REAL DEFAULT 0)`,
        `CREATE TABLE IF NOT EXISTS returns (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, sale_id INTEGER, receipt_no TEXT, refund_method TEXT, reason TEXT, notes TEXT, total_refund REAL DEFAULT 0, cashier_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
        `CREATE TABLE IF NOT EXISTS return_items (id INTEGER PRIMARY KEY AUTOINCREMENT, return_id INTEGER NOT NULL, product_id INTEGER, product_name TEXT, quantity REAL, unit_price REAL, total REAL)`,
        `CREATE TABLE IF NOT EXISTS mpesa_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER, checkout_request_id TEXT, phone TEXT, amount REAL, mpesa_receipt TEXT, status TEXT DEFAULT 'pending')`
    ];
    turso.batch(statements)
        .then(() => { seedDefaultData(); })
        .catch(err => { setTimeout(runSchema, 5000); });
}

function seedDefaultData() {
    db.get("SELECT COUNT(*) as count FROM companies", (err, row) => {
        if (err || (row && row.count > 0)) return onReady();
        const hash = bcrypt.hashSync('admin123', 10);
        db.run("INSERT INTO companies (name, phone) VALUES ('smart', '0700000000')", function (err) {
            if (err) return onReady();
            db.run("INSERT INTO users (company_id, username, password_hash, full_name, role) VALUES (?, 'admin', ?, 'System Admin', 'owner')", [this.lastID, hash], () => {
                db.run("UPDATE companies SET owner_user_id = ? WHERE id = ?", [this.lastID, this.lastID]);
                onReady();
            });
        });
    });
}

let serverStarted = false;
function onReady() {
    if (serverStarted) return;
    serverStarted = true;
    app.listen(PORT, '0.0.0.0', () => { console.log(`SmartPOS Backend running on port ${PORT}`); });
}

runSchema();

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    try { req.user = jwt.verify(authHeader.substring(7), JWT_SECRET); next(); } 
    catch (err) { return res.status(401).json({ error: 'Invalid token' }); }
}

const FRONTEND_PATH = path.join(__dirname, 'frontend'); 
app.use(express.static(FRONTEND_PATH));

// ============================================================
// API ROUTES
// ============================================================
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.get('/api/companies', (req, res) => db.all("SELECT id, name FROM companies ORDER BY name ASC", [], (err, rows) => res.json(rows || [])));

app.get('/api/server-info', (req, res) => {
    res.json({ status: 'online', platform: 'render', version: '1.0.0' });
});

app.get('/api/permissions-matrix', authenticate, (req, res) => {
    res.json({
        employee: ['make_sale', 'view_inventory', 'process_returns'],
        admin: ['make_sale', 'view_inventory', 'process_returns', 'restock', 'add_product', 'edit_product', 'delete_product', 'print_labels', 'view_reports', 'view_analytics'],
        owner: ['*']
    });
});

app.post('/api/auth/login', (req, res) => {
    const { company_id, username, password, role } = req.body;
    db.get(`SELECT u.*, c.name as company_name FROM users u JOIN companies c ON c.id = u.company_id WHERE u.company_id = ? AND u.username = ?`, [company_id, username], async (err, user) => {
        if (err || !user || !await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
        const token = jwt.sign({ userId: user.id, companyId: user.company_id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role, companyId: user.company_id }, company: { id: user.company_id, name: user.company_name } });
    });
});

// 🎯 PRODUCTS
app.get('/api/products', authenticate, (req, res) => db.all("SELECT * FROM products WHERE company_id = ? AND is_active = 1 ORDER BY name ASC", [req.user.companyId], (err, rows) => res.json(rows || [])));

app.post('/api/products', authenticate, (req, res) => {
    const { name, category, type, barcode, costPrice, sellingPrice, stock, reorderLevel, icon, unitsPerPack, sellingPricePerSingle, unitOfMeasure } = req.body;
    
    db.run(`INSERT INTO products (company_id, name, category, type, barcode, cost_price, selling_price, stock, reorder_level, icon, units_per_pack, selling_price_per_single, unit_of_measure) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.companyId, name, category, type || 'inventory', barcode || null, costPrice || 0, sellingPrice || 0, stock || 0, reorderLevel || 5, icon || 'fa-box', unitsPerPack || 1, sellingPricePerSingle || 0, unitOfMeasure || 'pcs'],
        function (err) { 
            if (err) return res.status(500).json({ error: err.message }); 
            res.json({ success: true, id: this.lastID }); 
        });
});

app.put('/api/products/:id', authenticate, (req, res) => {
    const { name, category, type, barcode, costPrice, sellingPrice, stock, reorderLevel, icon, unitsPerPack, sellingPricePerSingle, unitOfMeasure } = req.body;
    
    db.run(`UPDATE products SET name=?, category=?, type=?, barcode=?, cost_price=?, selling_price=?, stock=?, reorder_level=?, icon=?, units_per_pack=?, selling_price_per_single=?, unit_of_measure=? WHERE id=? AND company_id=?`,
        [name, category, type, barcode || null, costPrice || 0, sellingPrice || 0, stock || 0, reorderLevel || 5, icon || 'fa-box', unitsPerPack || 1, sellingPricePerSingle || 0, unitOfMeasure || 'pcs', req.params.id, req.user.companyId],
        function (err) { 
            if (err) return res.status(500).json({ error: err.message }); 
            res.json({ success: true }); 
        });
});

app.delete('/api/products/:id', authenticate, (req, res) => {
    db.run("UPDATE products SET is_active = 0 WHERE id = ? AND company_id = ?", [req.params.id, req.user.companyId], function (err) { 
        if (err) return res.status(500).json({ error: err.message }); 
        res.json({ success: true }); 
    });
});

// 🎯 SALES 
app.post('/api/sales', authenticate, (req, res) => {
    const { items, subtotal, discountAmount, total, paymentMethod, paymentCash, paymentMpesa, customerPhone, mpesaReceipt } = req.body;
    const receiptNo = 'R' + Date.now();
    
    db.run(`INSERT INTO sales (company_id, cashier_id, cashier_name, receipt_no, subtotal, discount, total, payment_cash, payment_mpesa, payment_method, customer_phone, mpesa_receipt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.companyId, req.user.userId, req.user.username, receiptNo, subtotal, discountAmount || 0, total, paymentCash || 0, paymentMpesa || 0, paymentMethod, customerPhone || null, mpesaReceipt || null],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            const saleId = this.lastID; 
            let completed = 0;
            
            if (items.length === 0) return res.json({ success: true, saleId, receiptNo });
            
            items.forEach(item => {
                const qtyToDeduct = item.totalPiecesDeducted || item.quantity;

                db.run(`INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?)`, 
                [saleId, item.productId, item.name, qtyToDeduct, item.unit_price, (item.unit_price * item.quantity)], () => {
                    db.run("UPDATE products SET stock = stock - ? WHERE id = ?", [qtyToDeduct, item.productId], () => {
                        completed++;
                        if (completed === items.length) res.json({ success: true, saleId, receiptNo });
                    });
                });
            });
        });
});

app.get('/api/sales', authenticate, (req, res) => {
    db.all("SELECT * FROM sales WHERE company_id = ? ORDER BY id DESC LIMIT 100", [req.user.companyId], (err, rows) => {
        res.json(rows || []);
    });
});

// 🎯 EMPLOYEES
app.get('/api/employees', authenticate, (req, res) => {
    db.all("SELECT id, full_name, username, role, permissions, is_active FROM users WHERE company_id = ? ORDER BY full_name ASC", [req.user.companyId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const formatted = (rows || []).map(r => ({
            id: r.id, fullName: r.full_name, username: r.username, role: r.role, permissions: r.permissions || '[]', isActive: r.is_active
        }));
        res.json(formatted);
    });
});

app.get('/api/employees/stats', authenticate, (req, res) => {
    db.get("SELECT COUNT(*) as total FROM users WHERE company_id = ?", [req.user.companyId], (err, row) => {
        res.json({ totalEmployees: row ? row.total : 0, activeEmployees: row ? row.total : 0 });
    });
});

app.post('/api/employees', authenticate, async (req, res) => {
    const { fullName, username, password, role, permissions } = req.body;
    if (!fullName || !username || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        db.get("SELECT id FROM users WHERE company_id = ? AND username = ?", [req.user.companyId, username], async (err, existingUser) => {
            if (err) return res.status(500).json({ error: err.message });
            
            if (existingUser) {
                return res.status(400).json({ error: 'Username already exists. Please choose another.' });
            }

            const hash = await bcrypt.hash(password, 10);
            db.run(`INSERT INTO users (company_id, username, password_hash, full_name, role, permissions) VALUES (?, ?, ?, ?, ?, ?)`,
                [req.user.companyId, username, hash, fullName, role || 'employee', JSON.stringify(permissions || [])],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, id: this.lastID });
                });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/employees/:id', authenticate, async (req, res) => {
    const { fullName, username, password, role, permissions } = req.body;
    const employeeId = req.params.id;

    if (password) {
        try {
            const hash = await bcrypt.hash(password, 10);
            db.run(`UPDATE users SET full_name=?, username=?, password_hash=?, role=?, permissions=? WHERE id=? AND company_id=?`,
                [fullName, username, hash, role, JSON.stringify(permissions || []), employeeId, req.user.companyId],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true });
                });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    } else {
        db.run(`UPDATE users SET full_name=?, username=?, role=?, permissions=? WHERE id=? AND company_id=?`,
            [fullName, username, role, JSON.stringify(permissions || []), employeeId, req.user.companyId],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
    }
});

app.delete('/api/employees/:id', authenticate, (req, res) => {
    db.run("UPDATE users SET is_active = 0 WHERE id = ? AND company_id = ?", [req.params.id, req.user.companyId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.put('/api/employees/:id/reset-password', authenticate, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    try {
        const hash = await bcrypt.hash(newPassword, 10);
        db.run(`UPDATE users SET password_hash = ? WHERE id = ? AND company_id = ?`, 
            [hash, req.params.id, req.user.companyId], 
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                if (this.changes === 0) return res.status(404).json({ error: 'Employee not found' });
                res.json({ success: true, message: 'Password reset successfully' });
            });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 🎯 ANALYTICS
app.get('/api/analytics/kpi', authenticate, (req, res) => {
    const { period } = req.query;
    
    // Calculate Revenue, Transactions, Cash, and M-Pesa
    db.get(`SELECT 
            COUNT(id) as transactions, 
            SUM(total) as revenue,
            SUM(payment_cash) as cash_total,
            SUM(payment_mpesa) as mpesa_total
            FROM sales WHERE company_id = ?`, [req.user.companyId], (err, salesRow) => {
        
        // Calculate Stock Value
        db.get(`SELECT SUM(stock * cost_price) as stockValue FROM products WHERE company_id = ? AND is_active = 1`, [req.user.companyId], (err2, stockRow) => {
            res.json({
                totalRevenue: salesRow?.revenue || 0,
                totalTransactions: salesRow?.transactions || 0,
                cashTotal: salesRow?.cash_total || 0,
                mpesaTotal: salesRow?.mpesa_total || 0,
                stockValue: stockRow?.stockValue || 0,
                itemsSold: 0,
                avgSale: salesRow?.transactions > 0 ? (salesRow.revenue / salesRow.transactions) : 0
            });
        });
    });
});

app.get('/api/analytics/trend', authenticate, (req, res) => {
    db.all(`SELECT date(created_at) as date, SUM(total) as revenue FROM sales WHERE company_id = ? GROUP BY date(created_at) ORDER BY date(created_at) ASC LIMIT 7`, [req.user.companyId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.get('/api/analytics/top-products', authenticate, (req, res) => {
    db.all(`SELECT product_name as name, SUM(quantity) as total_qty FROM sale_items JOIN sales ON sale_items.sale_id = sales.id WHERE sales.company_id = ? GROUP BY product_name ORDER BY total_qty DESC LIMIT 5`, [req.user.companyId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// 🎯 REPORTS
app.get('/api/reports/summary', authenticate, (req, res) => {
    const { from, to } = req.query;
    let query = "SELECT * FROM sales WHERE company_id = ?";
    const params = [req.user.companyId];
    
    if (from && to) {
        query += " AND created_at >= ? AND created_at <= ?";
        params.push(from, to + ' 23:59:59');
    }
    
    db.all(query + " ORDER BY created_at DESC", params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// 🎯 MPESA & RETURNS
app.post('/api/mpesa/stkpush', authenticate, (req, res) => {
    const { phone, amount } = req.body;
    const checkoutId = 'SIM_' + Date.now();
    db.run(`INSERT INTO mpesa_transactions (company_id, checkout_request_id, phone, amount, status) VALUES (?, ?, ?, ?, 'pending')`, [req.user.companyId, checkoutId, phone, amount]);
    setTimeout(() => {
        const fakeReceipt = 'Q' + Math.random().toString(36).substring(2, 10).toUpperCase();
        db.run("UPDATE mpesa_transactions SET status = 'success', mpesa_receipt = ? WHERE checkout_request_id = ?", [fakeReceipt, checkoutId]);
    }, 3000);
    res.json({ success: true, checkoutRequestId: checkoutId });
});

app.get('/api/mpesa/status/:id', authenticate, (req, res) => {
    db.get("SELECT * FROM mpesa_transactions WHERE checkout_request_id = ?", [req.params.id], (err, tx) => {
        if (!tx) return res.status(404).json({ error: 'Not found' });
        res.json({ status: tx.status, mpesaReceipt: tx.mpesa_receipt });
    });
});

app.get('/api/returns/search-sale', authenticate, (req, res) => {
    const { receipt, phone } = req.query; 
    let query = "SELECT * FROM sales WHERE company_id = ?"; const params = [req.user.companyId];
    if (receipt) { query += " AND receipt_no = ?"; params.push(receipt); } 
    else if (phone) { query += " AND customer_phone = ?"; params.push(phone); } 
    else return res.status(400).json({ error: 'Receipt or phone required' });
    
    db.get(query, params, (err, sale) => { 
        if (!sale) return res.status(404).json({ error: 'Sale not found' }); 
        db.all("SELECT * FROM sale_items WHERE sale_id = ?", [sale.id], (err2, items) => res.json({ ...sale, items: items || [] })); 
    });
});

app.post('/api/returns', authenticate, (req, res) => {
    const { saleId, items, refundMethod, reason, notes, totalRefund } = req.body;
    db.get("SELECT receipt_no FROM sales WHERE id = ?", [saleId], (err, sale) => {
        if (!sale) return res.status(404).json({ error: 'Not found' });
        db.run(`INSERT INTO returns (company_id, sale_id, receipt_no, refund_method, reason, notes, total_refund, cashier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [req.user.companyId, saleId, sale.receipt_no, refundMethod, reason, notes, totalRefund, req.user.userId], function (err2) {
            const returnId = this.lastID;
            items.forEach(item => { 
                db.run(`INSERT INTO return_items (return_id, product_id, product_name, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?)`, [returnId, item.productId, item.name, item.returnQty, item.unit_price, item.total]); 
                db.run("UPDATE products SET stock = stock + ? WHERE id = ?", [item.returnQty, item.productId]); 
            });
            res.json({ success: true, returnId });
        });
    });
});

app.get('*', (req, res) => {
    if (req.url.startsWith('/api')) return res.status(404).json({ error: 'API endpoint not found' });
    res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});
