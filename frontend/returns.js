/* ============================================
   SMARTPOS - Returns & Refunds
   ============================================ */

let currentReturnSale = null;
let returnItemSelections = {}; // { productId: quantity }

// ============ TAB SWITCHING ============
function switchReturnTab(tab) {
    document.querySelectorAll('.ret-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.ret-tab-content').forEach(c => c.classList.remove('active'));
    const el = document.getElementById('retTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (el) el.classList.add('active');
}

// ============ VIEW CONTROL ============
function showReturnsSearch() {
    document.getElementById('returnsSearchView').style.display = 'block';
    document.getElementById('returnsSaleView').style.display = 'none';
    document.getElementById('returnsListView').style.display = 'none';
    currentReturnSale = null;
    returnItemSelections = {};
}

function showReturnsSale() {
    document.getElementById('returnsSearchView').style.display = 'none';
    document.getElementById('returnsSaleView').style.display = 'block';
    document.getElementById('returnsListView').style.display = 'none';
}

function showReturnsList() {
    document.getElementById('returnsSearchView').style.display = 'none';
    document.getElementById('returnsSaleView').style.display = 'none';
    document.getElementById('returnsListView').style.display = 'block';
    loadReturnsList();
}

function backToSearch() {
    showReturnsSearch();
}

// ============ SEARCH ============
async function searchSaleByReceipt() {
    const receipt = document.getElementById('returnReceiptInput').value.trim();
    if (!receipt) {
        showToast('Please enter a receipt number', 'error');
        return;
    }
    await searchSale({ receipt });
}

async function searchSaleByPhone() {
    const phone = document.getElementById('returnPhoneInput').value.trim();
    if (!phone) {
        showToast('Please enter a phone number', 'error');
        return;
    }
    await searchSale({ phone });
}

async function searchSale(params) {
    try {
        showToast('Searching...', 'info');
        const result = await API.searchSaleForReturn(params);
        
        if (!result.success) throw new Error('Search failed');
        
        currentReturnSale = result.sale;
        returnItemSelections = {};
        
        renderSaleForReturn(result.sale);
        showReturnsSale();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ============ RENDER SALE ============
function renderSaleForReturn(sale) {
    // Eligibility badge
    const badge = document.getElementById('returnEligibilityBadge');
    if (sale.eligible) {
        badge.innerHTML = `
            <span class="eligibility-badge eligible">
                <i class="fas fa-check-circle"></i> Eligible for return (${sale.days_since} day${sale.days_since !== 1 ? 's' : ''} ago)
            </span>`;
    } else {
        badge.innerHTML = `
            <span class="eligibility-badge expired">
                <i class="fas fa-times-circle"></i> Return window expired (${sale.days_since} days ago, limit ${sale.return_window_days})
            </span>`;
    }
    
    // Sale info
    document.getElementById('returnsSaleInfo').innerHTML = `
        <div class="sale-info-card">
            <div class="sale-info-row">
                <div>
                    <div class="label">Receipt #</div>
                    <div class="value">${sale.receipt_no}</div>
                </div>
                <div>
                    <div class="label">Date</div>
                    <div class="value">${new Date(sale.sale_date).toLocaleString('en-KE')}</div>
                </div>
                <div>
                    <div class="label">Customer</div>
                    <div class="value">${sale.customer_name || 'Walk-in'} ${sale.customer_phone ? '(' + sale.customer_phone + ')' : ''}</div>
                </div>
                <div>
                    <div class="label">Total Paid</div>
                    <div class="value">KES ${Number(sale.total).toFixed(2)}</div>
                </div>
                <div>
                    <div class="label">Payment</div>
                    <div class="value" style="text-transform:capitalize;">${sale.payment_method}</div>
                </div>
            </div>
        </div>
    `;
    
    // Render items
    renderReturnItems(sale);
}

function renderReturnItems(sale) {
    const list = document.getElementById('returnsItemsList');
    
    if (!sale.items || sale.items.length === 0) {
        list.innerHTML = '<div class="no-data">No items in this sale</div>';
        return;
    }
    
    list.innerHTML = sale.items.map(item => {
        const canReturn = item.can_return && sale.eligible;
        const maxQty = item.returnable_qty;
        const selectedQty = returnItemSelections[item.product_id] || 0;
        
        return `
            <div class="return-item ${canReturn ? '' : 'disabled'}">
                <div class="return-item-info">
                    <div class="return-item-name">${item.product_name}</div>
                    <div class="return-item-meta">
                        Sold: ${item.quantity} @ KES ${Number(item.unit_price).toFixed(2)}
                        ${item.already_returned > 0 ? `<span class="already-returned">• Already returned: ${item.already_returned}</span>` : ''}
                    </div>
                </div>
                <div class="return-item-qty">
                    ${canReturn ? `
                        <div class="qty-control">
                            <button onclick="adjustReturnQty(${item.product_id}, -1, ${maxQty})">−</button>
                            <input type="number" 
                                   id="retQty_${item.product_id}"
                                   value="${selectedQty}"
                                   min="0"
                                   max="${maxQty}"
                                   step="0.01"
                                   oninput="setReturnQty(${item.product_id}, this.value, ${maxQty})">
                            <button onclick="adjustReturnQty(${item.product_id}, 1, ${maxQty})">+</button>
                        </div>
                        <div class="max-qty">Max: ${maxQty}</div>
                    ` : `
                        <span class="not-returnable">Not returnable</span>
                    `}
                </div>
            </div>
        `;
    }).join('');
    
    updateRefundSummary(sale);
}

function adjustReturnQty(productId, change, maxQty) {
    if (!currentReturnSale) return;
    const item = currentReturnSale.items.find(i => i.product_id === productId);
    if (!item) return;
    
    const isWeight = item.product_type === 'weight';
    const step = isWeight ? 0.5 : 1;
    let current = returnItemSelections[productId] || 0;
    current = Math.max(0, Math.min(maxQty, current + (change * step)));
    
    // Round to 2 decimals
    current = Math.round(current * 100) / 100;
    
    returnItemSelections[productId] = current;
    
    const input = document.getElementById('retQty_' + productId);
    if (input) input.value = current;
    
    updateRefundSummary(currentReturnSale);
}

function setReturnQty(productId, value, maxQty) {
    let qty = parseFloat(value) || 0;
    qty = Math.max(0, Math.min(maxQty, qty));
    returnItemSelections[productId] = qty;
    updateRefundSummary(currentReturnSale);
}

function updateRefundSummary(sale) {
    let total = 0;
    let count = 0;
    
    Object.entries(returnItemSelections).forEach(([productId, qty]) => {
        if (qty <= 0) return;
        const item = sale.items.find(i => i.product_id == productId);
        if (!item) return;
        total += item.unit_price * qty;
        count += 1;
    });
    
    document.getElementById('refundItemCount').textContent = count + ' item' + (count !== 1 ? 's' : '');
    document.getElementById('refundTotal').textContent = 'KES ' + total.toFixed(2);
}

// ============ PROCESS RETURN ============
async function processReturn() {
    if (!currentReturnSale) return;
    
    // Collect items
    const items = [];
    Object.entries(returnItemSelections).forEach(([productId, qty]) => {
        if (qty > 0) {
            items.push({ productId: parseInt(productId), quantity: qty });
        }
    });
    
    if (items.length === 0) {
        showToast('Select at least one item to return', 'error');
        return;
    }
    
    const refundMethod = document.getElementById('refundMethod').value;
    const reason = document.getElementById('returnReason').value;
    const notes = document.getElementById('returnNotes').value.trim();
    
    const totalText = document.getElementById('refundTotal').textContent;
    
    const confirmed = confirm(
        `Process refund?\n\n` +
        `Items: ${items.length}\n` +
        `Total: ${totalText}\n` +
        `Method: ${refundMethod.toUpperCase()}\n` +
        `Reason: ${reason}\n\n` +
        `Stock will be restored automatically.`
    );
    
    if (!confirmed) return;
    
    try {
        const result = await API.createReturn({
            saleId: currentReturnSale.id,
            items: items,
            refundMethod: refundMethod,
            reason: reason,
            notes: notes
        });
        
        if (!result.success) throw new Error('Return failed');
        
        showRefundReceipt(result.refund);
        
        // Reload products (stock changed)
        await loadProducts();
        if (typeof renderProducts === 'function') renderProducts();
        
        // Reset
        backToSearch();
        
    } catch (err) {
        showToast('Return failed: ' + err.message, 'error');
    }
}

// ============ REFUND RECEIPT ============
function showRefundReceipt(refund) {
    const body = document.getElementById('receiptBody');
    document.getElementById('receiptCompany').textContent = currentCompany.name;
    document.getElementById('receiptDate').textContent = new Date(refund.date).toLocaleString('en-KE');
    document.getElementById('receiptCashier').textContent = refund.cashier || currentUser.username;
    
    body.innerHTML = `
        <div class="receipt-row" style="font-weight:bold;color:#e74c3c;border-bottom:1px solid #ddd;padding-bottom:5px;">
            <span>REFUND RECEIPT</span>
            <span>${refund.refundNo}</span>
        </div>
        <div class="receipt-row" style="font-size:11px;">
            <span>Original Receipt</span>
            <span>${refund.originalReceipt}</span>
        </div>
        ${refund.customerName ? `
            <div class="receipt-row" style="font-size:11px;">
                <span>Customer</span>
                <span>${refund.customerName}</span>
            </div>
        ` : ''}
        <div style="height:10px;"></div>
        ${refund.items.map(item => `
            <div class="receipt-row">
                <span>${item.product_name} x${item.quantity}</span>
                <span>KES ${Number(item.total).toFixed(2)}</span>
            </div>
        `).join('')}
        <div class="receipt-divider"></div>
        <div class="receipt-row receipt-total" style="color:#e74c3c;">
            <span>REFUND TOTAL</span>
            <span>KES ${Number(refund.totalRefund).toFixed(2)}</span>
        </div>
        <div class="receipt-row">
            <span>Method</span>
            <span style="text-transform:capitalize;">${refund.refundMethod}</span>
        </div>
        <div class="receipt-row">
            <span>Reason</span>
            <span>${refund.reason}</span>
        </div>
    `;
    
    document.getElementById('receiptModal').classList.add('active');
}

// ============ LOAD RETURNS LIST ============
async function loadReturnsList() {
    const body = document.getElementById('returnsListBody');
    body.innerHTML = '<div class="no-data"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    
    try {
        const returns = await API.getReturns();
        
        if (!returns || returns.length === 0) {
            body.innerHTML = '<div class="no-data">No returns yet</div>';
            return;
        }
        
        body.innerHTML = `
            <table class="inventory-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>Refund #</th>
                        <th>Original Receipt</th>
                        <th>Refunded</th>
                        <th>Method</th>
                        <th>Reason</th>
                        <th>Cashier</th>
                    </tr>
                </thead>
                <tbody>
                    ${returns.map((r, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${new Date(r.return_date).toLocaleString('en-KE')}</td>
                            <td><code>REF-${String(r.id).padStart(6, '0')}</code></td>
                            <td>${r.original_receipt || '—'}</td>
                            <td><strong style="color:#e74c3c;">KES ${Number(r.refund_amount).toFixed(2)}</strong></td>
                            <td style="text-transform:capitalize;">${r.refund_method}</td>
                            <td>${r.reason || '—'}</td>
                            <td>${r.cashier_name || '—'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (err) {
        body.innerHTML = `<div class="no-data" style="color:#e74c3c;">Error: ${err.message}</div>`;
    }
}

// ============ SETUP EVENT LISTENERS ============
document.addEventListener('DOMContentLoaded', function() {
    // Enter key on receipt input
    const receiptInput = document.getElementById('returnReceiptInput');
    if (receiptInput) {
        receiptInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') searchSaleByReceipt();
        });
    }
    
    // Enter key on phone input
    const phoneInput = document.getElementById('returnPhoneInput');
    if (phoneInput) {
        phoneInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') searchSaleByPhone();
        });
    }
});