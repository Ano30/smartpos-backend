/* ============================================
   SMARTPOS - Barcode Label Generator
   ============================================ */

let labelSelectedProducts = new Set();
let labelProductFilter = '';

// ============ INITIALIZE ============
function initLabelsPage() {
    renderLabelProducts();
    renderLabelsPreview();
}

// ============ RENDER PRODUCT LIST ============
function renderLabelProducts() {
    const grid = document.getElementById('labelProductGrid');
    if (!grid) return;
    
    let products = [...currentData.products];
    
    if (labelProductFilter) {
        const f = labelProductFilter.toLowerCase();
        products = products.filter(p => 
            p.name.toLowerCase().includes(f) ||
            (p.barcode && p.barcode.includes(f)) ||
            (p.category && p.category.toLowerCase().includes(f))
        );
    }
    
    if (products.length === 0) {
        grid.innerHTML = '<div class="no-data">No products found</div>';
        return;
    }
    
    grid.innerHTML = products.map(p => {
        const selected = labelSelectedProducts.has(p.id);
        return `
            <div class="label-product-item ${selected ? 'selected' : ''}" onclick="toggleLabelProduct(${p.id})">
                <div class="label-product-checkbox">
                    <i class="fas fa-${selected ? 'check-square' : 'square'}"></i>
                </div>
                <div class="label-product-info">
                    <div class="label-product-name">${p.name}</div>
                    <div class="label-product-meta">
                        <span>KES ${Number(p.sellingPrice).toFixed(2)}</span>
                        ${p.barcode 
                            ? `<span class="label-code-badge"><i class="fas fa-barcode"></i> ${p.barcode}</span>` 
                            : '<span class="label-no-code">No barcode</span>'}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============ TOGGLE PRODUCT SELECTION ============
function toggleLabelProduct(productId) {
    if (labelSelectedProducts.has(productId)) {
        labelSelectedProducts.delete(productId);
    } else {
        labelSelectedProducts.add(productId);
    }
    renderLabelProducts();
    renderLabelsPreview();
}

// ============ FILTER ============
function filterLabelProducts() {
    labelProductFilter = document.getElementById('labelSearch')?.value || '';
    renderLabelProducts();
}

// ============ SELECT ALL ============
function selectAllForLabels() {
    let products = [...currentData.products];
    
    if (labelProductFilter) {
        const f = labelProductFilter.toLowerCase();
        products = products.filter(p => 
            p.name.toLowerCase().includes(f) ||
            (p.barcode && p.barcode.includes(f)) ||
            (p.category && p.category.toLowerCase().includes(f))
        );
    }
    
    // If all selected → deselect all; otherwise select all
    const allSelected = products.every(p => labelSelectedProducts.has(p.id));
    
    if (allSelected) {
        products.forEach(p => labelSelectedProducts.delete(p.id));
        if (typeof showToast === 'function') showToast('Deselected all', 'info');
    } else {
        products.forEach(p => labelSelectedProducts.add(p.id));
        if (typeof showToast === 'function') showToast(`Selected ${products.length} products`, 'success');
    }
    
    renderLabelProducts();
    renderLabelsPreview();
}

// ============ RENDER PREVIEW ============
function renderLabelsPreview() {
    const sheet = document.getElementById('labelsPreviewSheet');
    const countEl = document.getElementById('labelCount');
    if (!sheet) return;
    
    const selectedIds = Array.from(labelSelectedProducts);
    
    if (countEl) {
        countEl.textContent = `${selectedIds.length} label${selectedIds.length !== 1 ? 's' : ''} selected`;
    }
    
    if (selectedIds.length === 0) {
        sheet.innerHTML = '<div class="no-data">Select products above to preview labels</div>';
        return;
    }
    
    const perPage = parseInt(document.getElementById('labelsPerPage')?.value) || 24;
    const cols = perPage === 40 ? 4 : perPage === 12 ? 2 : 3;
    
    // Build one page (or as many pages as needed)
    const products = selectedIds
        .map(id => currentData.products.find(p => p.id === id))
        .filter(Boolean);
    
    // Cap preview to first 2 pages for performance
    const maxPreview = perPage * 2;
    const previewProducts = products.slice(0, maxPreview);
    const remaining = products.length - previewProducts.length;
    
    sheet.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    
    sheet.innerHTML = previewProducts.map((p, i) => `
        <div class="label-preview-item">
            <div class="label-preview-content">
                ${document.getElementById('showName')?.checked !== false ? `<div class="label-name">${escapeHtml(p.name)}</div>` : ''}
                ${document.getElementById('showPrice')?.checked !== false ? `<div class="label-price">KES ${Number(p.sellingPrice).toFixed(2)}</div>` : ''}
                <div class="label-barcode">
                    <svg class="barcode-svg" data-code="${p.barcode || p.id}" data-index="${i}"></svg>
                </div>
                ${document.getElementById('showCode')?.checked !== false ? `<div class="label-code">${p.barcode || p.id}</div>` : ''}
            </div>
        </div>
    `).join('') + (remaining > 0 ? `
        <div class="label-more-notice" style="grid-column: 1 / -1;">
            <i class="fas fa-info-circle"></i> + ${remaining} more label${remaining !== 1 ? 's' : ''} (shown on print)
        </div>
    ` : '');
    
    // Render all barcodes using JsBarcode
    setTimeout(() => {
        document.querySelectorAll('.barcode-svg').forEach(svg => {
            const code = svg.dataset.code;
            try {
                JsBarcode(svg, code, {
                    format: 'CODE128',
                    width: 1.3,
                    height: 35,
                    displayValue: false,
                    margin: 0
                });
            } catch (e) {
                console.error('Barcode error for', code, e);
            }
        });
    }, 50);
}

// ============ UPDATE PREVIEW (On filter/checkbox change) ============
function updateLabelPreview() {
    renderLabelsPreview();
}

// ============ PRINT LABELS ============
function printLabels() {
    const selectedIds = Array.from(labelSelectedProducts);
    
    if (selectedIds.length === 0) {
        if (typeof showToast === 'function') showToast('Select at least one product', 'error');
        return;
    }
    
    const products = selectedIds
        .map(id => currentData.products.find(p => p.id === id))
        .filter(Boolean);
    
    const perPage = parseInt(document.getElementById('labelsPerPage')?.value) || 24;
    const cols = perPage === 40 ? 4 : perPage === 12 ? 2 : 3;
    const showName = document.getElementById('showName')?.checked !== false;
    const showPrice = document.getElementById('showPrice')?.checked !== false;
    const showCode = document.getElementById('showCode')?.checked !== false;
    
    // Build print HTML
    let printHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>SmartPOS - Labels</title>
            <style>
                @page { size: A4; margin: 10mm; }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', Arial, sans-serif; }
                .label-sheet {
                    display: grid;
                    grid-template-columns: repeat(${cols}, 1fr);
                    gap: 2mm;
                    page-break-after: always;
                }
                .label-item {
                    border: 0.5px dashed #ccc;
                    padding: 2mm;
                    text-align: center;
                    min-height: 28mm;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    break-inside: avoid;
                }
                .label-name {
                    font-size: 9pt;
                    font-weight: 600;
                    line-height: 1.1;
                    margin-bottom: 1mm;
                    max-width: 100%;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .label-price {
                    font-size: 12pt;
                    font-weight: 700;
                    color: #000;
                    margin-bottom: 1mm;
                }
                .label-barcode svg {
                    display: block;
                    max-width: 100%;
                    height: auto;
                }
                .label-code {
                    font-size: 7pt;
                    font-family: 'Courier New', monospace;
                    margin-top: 0.5mm;
                    color: #333;
                }
            </style>
        </head>
        <body>
    `;
    
    // Build labels in pages
    let currentPage = [];
    products.forEach((p, i) => {
        const labelHtml = `
            <div class="label-item">
                ${showName ? `<div class="label-name">${escapeHtml(p.name)}</div>` : ''}
                ${showPrice ? `<div class="label-price">KES ${Number(p.sellingPrice).toFixed(2)}</div>` : ''}
                <div class="label-barcode">
                    <svg class="barcode-print" data-code="${p.barcode || p.id}"></svg>
                </div>
                ${showCode ? `<div class="label-code">${p.barcode || p.id}</div>` : ''}
            </div>
        `;
        currentPage.push(labelHtml);
        
        if (currentPage.length === perPage || i === products.length - 1) {
            printHtml += `<div class="label-sheet">${currentPage.join('')}</div>`;
            currentPage = [];
        }
    });
    
    printHtml += `
            <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
            <script>
                window.onload = function() {
                    document.querySelectorAll('.barcode-print').forEach(svg => {
                        const code = svg.dataset.code;
                        try {
                            JsBarcode(svg, code, {
                                format: 'CODE128',
                                width: 1.5,
                                height: 35,
                                displayValue: false,
                                margin: 0
                            });
                        } catch (e) {}
                    });
                    
                    setTimeout(function() {
                        window.print();
                        window.onafterprint = function() { window.close(); };
                    }, 500);
                };
            <\/script>
        </body>
        </html>
    `;
    
    const printWindow = window.open('', '', 'width=900,height=700');
    printWindow.document.write(printHtml);
    printWindow.document.close();
    
    if (typeof showToast === 'function') {
        showToast(`Printing ${products.length} label${products.length !== 1 ? 's' : ''}...`, 'success');
    }
}

// ============ UTILITY ============
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}