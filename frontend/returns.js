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
        
        // 🎯 FIX: The backend sends the sale object directly. We check if it has an ID.
        if (!result || !result.id) {
            throw new Error('Sale not found');
        }
        
        currentReturnSale = result;
        returnItemSelections = {};
        
        renderSaleForReturn(result);
        showReturnsSale();
    } catch (err) {
        showToast('Search failed: ' + err.message, 'error');
    }
}

// ============ RENDER SALE ============
function renderSaleForReturn(sale) {
    // We calculate eligibility on the frontend since the backend doesn't send it
    const saleDate = new Date(sale.created_at);
    const now = new Date();
    const diffDays = Math.floor((now - saleDate) / (1000 * 60 * 60 * 24));
    const isEligible = diffDays <= 7;

    const badge = document.getElementById('returnEligibilityBadge');
    if (isEligible) {
        badge.innerHTML = `
            <span class="eligibility-badge eligible">
                <i class="fas fa-check-circle"></i> Eligible for return (${diffDays} day${diffDays !== 1 ? 's' : ''} ago)
            </span>`;
    } else {
        badge.innerHTML = `
            <span class="eligibility-badge expired">
                <i class="fas fa-times-circle"></i> Return window expired (${diffDays} days ago)
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
                    <div class="value">${new Date(sale.created_at).toLocaleString('en-KE')}</div>
                </div>
                <div>
                    <div class="label">Customer</div>
                    <div class="value">${sale.customer_phone || 'Walk-in'}</div>
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
    renderReturnItems(sale, isEligible);
}

function renderReturnItems(sale, isEligible) {
    const list = document.getElementById('returnsItemsList');
    
    if (!sale.items || sale.items.length === 0) {
        list.innerHTML = '<div class="no-data">No items in this sale</div>';
        return;
    }
    
    list.innerHTML = sale.items.map(item => {
        const canReturn = isEligible;
        const maxQty = item.quantity;
        const selectedQty = returnItemSelections[item.product_id] || 0;
        
        return `
            <div class="return-item ${canReturn ? '' : 'disabled'}">
                <div class="return-item-info">
                    <div class="return-item-name">${item.product_name}</div>
                    <div class="return-item-meta">
                        Sold: ${item.quantity} @ KES ${Number(item.unit_price).toFixed(2)}
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
                                   step="1"
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
    let current = returnItemSelections[productId] || 0;
    current = Math.max(0, Math.min(maxQty, current + change));
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
            const saleItem = currentReturnSale.items.find(i => i.product_id == productId);
            items.push({ 
                productId: parseInt(productId), 
                name: saleItem ? saleItem.product_name : 'Item',
                returnQty: qty,
                unit_price: saleItem ? saleItem.unit_price : 0,
                total: saleItem ? saleItem.unit_price * qty : 0
            });
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
    const totalRefund = parseFloat(totalText.replace('KES ', ''));
    
    if (!confirm(`Process refund of ${totalText}?`)) return;
    
    try {
        const result = await API.createReturn({
            saleId: currentReturnSale.id,
            items: items,
            refundMethod: refundMethod,
            reason: reason,
            notes: notes,
            totalRefund: totalRefund
        });
        
        if (!result.success) throw new Error('Return failed');
        
        showToast('Return processed successfully!', 'success');
        
        // Reload products (stock changed)
        if (typeof loadProducts === 'function') await loadProducts();
        
        // Reset
        backToSearch();
        
    } catch (err) {
        showToast('Return failed: ' + err.message, 'error');
    }
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
                        <th>Receipt</th>
                        <th>Refunded</th>
                        <th>Method</th>
                        <th>Reason</th>
                    </tr>
                </thead>
                <tbody>
                    ${returns.map((r, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td>${new Date(r.created_at).toLocaleString('en-KE')}</td>
                            <td>${r.receipt_no || '—'}</td>
                            <td><strong style="color:#e74c3c;">KES ${Number(r.total_refund).toFixed(2)}</strong></td>
                            <td style="text-transform:capitalize;">${r.refund_method}</td>
                            <td>${r.reason || '—'}</td>
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
    const receiptInput = document.getElementById('returnReceiptInput');
    if (receiptInput) {
        receiptInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') searchSaleByReceipt();
        });
    }
    
    const phoneInput = document.getElementById('returnPhoneInput');
    if (phoneInput) {
        phoneInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') searchSaleByPhone();
        });
    }
});

// Expose globally
window.switchReturnTab = switchReturnTab;
window.showReturnsSearch = showReturnsSearch;
window.showReturnsSale = showReturnsSale;
window.showReturnsList = showReturnsList;
window.backToSearch = backToSearch;
window.searchSaleByReceipt = searchSaleByReceipt;
window.searchSaleByPhone = searchSaleByPhone;
window.adjustReturnQty = adjustReturnQty;
window.setReturnQty = setReturnQty;
window.processReturn = processReturn;
window.loadReturnsList = loadReturnsList;
