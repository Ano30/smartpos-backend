/* ============================================
   SMARTPOS - Import Products & Prices from Excel
   ============================================ */

let importState = {
    headers: [],
    preview: [],
    allRows: [],
    file: null,
    mode: 'products' // 'products' or 'prices'
};

// ============ INIT ============
document.addEventListener('DOMContentLoaded', function() {
    const fileInput = document.getElementById('importFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    const dropZone = document.getElementById('fileDropZone');
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                handleFile(e.dataTransfer.files[0]);
            }
        });
    }
});

// ============ IMPORT MODE ============
function setImportMode(mode) {
    importState.mode = mode;
    
    document.querySelectorAll('.import-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    const bannerProducts = document.getElementById('importBannerProducts');
    const bannerPrices = document.getElementById('importBannerPrices');
    
    if (mode === 'prices') {
        if (bannerProducts) bannerProducts.style.display = 'none';
        if (bannerPrices) bannerPrices.style.display = 'flex';
    } else {
        if (bannerProducts) bannerProducts.style.display = 'flex';
        if (bannerPrices) bannerPrices.style.display = 'none';
    }
    
    // Reset if a file was already uploaded
    resetImport();
}

// ============ FILE SELECT ============
function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
}

async function handleFile(file) {
    const allowedExts = ['.xls', '.xlsx', '.csv'];
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!allowedExts.includes(ext)) {
        showToast('Please upload a .xls, .xlsx, or .csv file', 'error');
        return;
    }
    
    if (file.size > 20 * 1024 * 1024) {
        showToast('File too large. Max 20 MB.', 'error');
        return;
    }
    
    importState.file = file;
    
    document.getElementById('importFileName').innerHTML = `
        <i class="fas fa-file-excel"></i> ${file.name} 
        <small>(${(file.size / 1024).toFixed(1)} KB)</small>
    `;
    
    showToast('Reading file...', 'info');
    
    try {
        const result = await API.previewImport(file);
        
        if (!result.success) {
            throw new Error('Preview failed');
        }
        
        importState.headers = result.headers;
        importState.preview = result.preview;
        importState.allRows = result.allRows;
        
        showImportStep(2);
        
        if (importState.mode === 'prices') {
            setupPriceMapping(result.headers);
        } else {
            setupColumnMapping(result.headers);
        }
        
        renderPreviewTable(result.headers, result.preview);
        
        const countEl = document.getElementById('importCount');
        if (countEl) {
            countEl.textContent = importState.mode === 'prices' 
                ? `${result.totalRows} rows to update` 
                : `${result.totalRows} products found`;
        }
        
        showToast(`✓ Found ${result.totalRows} rows`, 'success');
    } catch (err) {
        showToast('Error reading file: ' + err.message, 'error');
        document.getElementById('importFileName').innerHTML = '';
        importState.file = null;
    }
}

// ============ STEP CONTROL ============
function showImportStep(step) {
    document.getElementById('importStep1').style.display = step === 1 ? 'block' : 'none';
    document.getElementById('importStep2').style.display = step === 2 ? 'block' : 'none';
    document.getElementById('importStep3').style.display = step === 3 ? 'block' : 'none';
}

function resetImport() {
    const mode = importState.mode || 'products';
    importState = { headers: [], preview: [], allRows: [], file: null, mode: mode };
    
    const fileInput = document.getElementById('importFileInput');
    if (fileInput) fileInput.value = '';
    
    const fileNameEl = document.getElementById('importFileName');
    if (fileNameEl) fileNameEl.innerHTML = '';
    
    // Hide price mapping, show product mapping
    const productGrid = document.querySelector('.import-mapping');
    const priceGrid = document.getElementById('priceMappingGrid');
    if (productGrid) productGrid.style.display = 'block';
    if (priceGrid) priceGrid.style.display = 'none';
    
    showImportStep(1);
}

// ============ PRODUCT COLUMN MAPPING ============
function setupColumnMapping(headers) {
    // Show product mapping, hide price mapping
    const productMapping = document.querySelector('.import-mapping');
    const priceGrid = document.getElementById('priceMappingGrid');
    if (productMapping) productMapping.style.display = 'block';
    if (priceGrid) priceGrid.style.display = 'none';
    
    const selects = {
        mapName: document.getElementById('mapName'),
        mapCategory: document.getElementById('mapCategory'),
        mapBarcode: document.getElementById('mapBarcode'),
        mapBarcodeAlt: document.getElementById('mapBarcodeAlt'),
        mapCostPrice: document.getElementById('mapCostPrice'),
        mapSellingPrice: document.getElementById('mapSellingPrice'),
        mapStock: document.getElementById('mapStock'),
        mapReorderLevel: document.getElementById('mapReorderLevel'),
        mapUnitOfMeasure: document.getElementById('mapUnitOfMeasure')
    };
    
    // Populate each select with headers + "— None —"
    Object.values(selects).forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '<option value="">— None —</option>' + 
            headers.map(h => `<option value="${h}">${h}</option>`).join('');
    });
    
    // Auto-detect QuickBooks POS columns
    const auto = {
        mapName: ['Item', 'Name', 'Item Name', 'Description'],
        mapCategory: ['Department', 'Category', 'Dept'],
        mapBarcode: ['UPC', 'Barcode', 'Bar Code'],
        mapBarcodeAlt: ['Item Number', 'Item No.', 'Item No', 'ALU', 'ALUs', 'SKU'],
        mapCostPrice: ['Average Cost', 'Avg. Unit Cost', 'Cost', 'Unit Cost'],
        mapSellingPrice: ['Regular Price', 'Reg Price', 'Price', 'Selling Price'],
        mapStock: ['On Hand', 'On-Hand Qty', 'Quantity', 'Qty', 'Stock'],
        mapReorderLevel: ['Reorder Point', 'Reorder Level', 'Min Stock'],
        mapUnitOfMeasure: ['Unit of Measure', 'UOM', 'Unit']
    };
    
    Object.entries(auto).forEach(([key, candidates]) => {
        const sel = selects[key];
        if (!sel) return;
        
        for (const candidate of candidates) {
            const match = headers.find(h => 
                h.toLowerCase().trim() === candidate.toLowerCase().trim()
            );
            if (match) {
                sel.value = match;
                break;
            }
        }
    });
}

function getMapping() {
    return {
        name: document.getElementById('mapName').value,
        category: document.getElementById('mapCategory').value,
        barcode: document.getElementById('mapBarcode').value,
        barcodeAlt: document.getElementById('mapBarcodeAlt').value,
        costPrice: document.getElementById('mapCostPrice').value,
        sellingPrice: document.getElementById('mapSellingPrice').value,
        stock: document.getElementById('mapStock').value,
        reorderLevel: document.getElementById('mapReorderLevel').value,
        unitOfMeasure: document.getElementById('mapUnitOfMeasure').value
    };
}

// ============ PRICE COLUMN MAPPING ============
function setupPriceMapping(headers) {
    // Hide product mapping, show price mapping
    const productMapping = document.querySelector('.import-mapping');
    const priceGrid = document.getElementById('priceMappingGrid');
    
    if (productMapping) productMapping.style.display = 'none';
    if (priceGrid) priceGrid.style.display = 'block';
    
    const selects = {
        priceMapBarcode: document.getElementById('priceMapBarcode'),
        priceMapName: document.getElementById('priceMapName'),
        priceMapPrice: document.getElementById('priceMapPrice')
    };
    
    Object.values(selects).forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '<option value="">— None —</option>' + 
            headers.map(h => `<option value="${h}">${h}</option>`).join('');
    });
    
    // Auto-detect price columns
    const auto = {
        priceMapBarcode: ['Barcode', 'UPC', 'Item Number', 'Item No', 'Code'],
        priceMapName: ['Item Name', 'Name', 'Item', 'Description'],
        priceMapPrice: ['Price', 'New Price', 'Selling Price', 'Regular Price', 'Reg Price']
    };
    
    Object.entries(auto).forEach(([key, candidates]) => {
        const sel = selects[key];
        if (!sel) return;
        
        for (const c of candidates) {
            const match = headers.find(h => 
                h.toLowerCase().trim() === c.toLowerCase().trim()
            );
            if (match) {
                sel.value = match;
                break;
            }
        }
    });
}

// ============ PREVIEW TABLE ============
function renderPreviewTable(headers, rows) {
    const table = document.getElementById('importPreviewTable');
    if (!table) return;
    
    // Limit columns shown to first 10
    const cols = headers.slice(0, 10);
    
    let html = '<thead><tr>';
    cols.forEach(h => html += `<th>${h}</th>`);
    html += '</tr></thead><tbody>';
    
    rows.forEach(row => {
        html += '<tr>';
        cols.forEach(h => {
            const val = row[h] !== undefined ? String(row[h]) : '';
            const display = val.length > 30 ? val.substring(0, 30) + '…' : val;
            html += `<td title="${val}">${display}</td>`;
        });
        html += '</tr>';
    });
    
    html += '</tbody>';
    table.innerHTML = html;
}

// ============ START IMPORT ============
async function startImport() {
    if (importState.mode === 'prices') {
        return await startPriceImport();
    }
    return await startProductImport();
}

async function startProductImport() {
    const mapping = getMapping();
    
    if (!mapping.name) {
        showToast('Please map the "Product Name" column', 'error');
        return;
    }
    if (!mapping.sellingPrice && !mapping.costPrice) {
        showToast('Please map at least a selling price or cost column', 'error');
        return;
    }
    
    const confirmed = confirm(
        `Import ${importState.allRows.length} products?\n\n` +
        `Products with existing barcodes will be skipped.`
    );
    
    if (!confirmed) return;
    
    showToast('Importing products...', 'info');
    
    try {
        const result = await API.importProducts(importState.allRows, mapping);
        
        if (!result.success) {
            throw new Error('Import failed');
        }
        
        showImportResult(result);
        showImportStep(3);
        
        if (window.SoundEngine) SoundEngine.success();
        
        // Reload products
        if (typeof loadProducts === 'function') {
            await loadProducts();
            if (typeof renderProducts === 'function') renderProducts();
            if (typeof renderCategoryFilter === 'function') renderCategoryFilter();
        }
        
    } catch (err) {
        showToast('Import failed: ' + err.message, 'error');
    }
}

async function startPriceImport() {
    const barcode = document.getElementById('priceMapBarcode')?.value || '';
    const name = document.getElementById('priceMapName')?.value || '';
    const price = document.getElementById('priceMapPrice')?.value || '';
    
    if (!barcode && !name) {
        showToast('Map at least a Barcode or Name column', 'error');
        return;
    }
    if (!price) {
        showToast('Map the New Price column', 'error');
        return;
    }
    
    const confirmed = confirm(
        `Update prices for ${importState.allRows.length} products?\n\n` +
        `Products will be matched by barcode first, then by name.`
    );
    
    if (!confirmed) return;
    
    showToast('Updating prices...', 'info');
    
    try {
        const result = await API.updatePrices(importState.allRows, {
            barcode, name, price
        });
        
        if (!result.success) throw new Error('Update failed');
        
        showImportResult(result);
        showImportStep(3);
        
        if (window.SoundEngine) SoundEngine.success();
        
        // Reload products
        if (typeof loadProducts === 'function') {
            await loadProducts();
            if (typeof renderProducts === 'function') renderProducts();
            if (typeof updateInventory === 'function') updateInventory();
        }
        
    } catch (err) {
        showToast('Update failed: ' + err.message, 'error');
    }
}

// ============ SHOW RESULT ============
function showImportResult(result) {
    const s = result.summary;
    const el = document.getElementById('importResult');
    
    const updatedLabel = importState.mode === 'prices' ? 'Updated' : 'Imported';
    
    let html = `
        <div class="import-result-summary">
            <div class="import-result-card green">
                <div class="value">${s.imported || s.updated || 0}</div>
                <div class="label">${updatedLabel}</div>
            </div>
            <div class="import-result-card orange">
                <div class="value">${s.skipped}</div>
                <div class="label">Skipped</div>
            </div>
            <div class="import-result-card red">
                <div class="value">${s.errors}</div>
                <div class="label">Errors</div>
            </div>
            <div class="import-result-card">
                <div class="value">${s.total}</div>
                <div class="label">Total Rows</div>
            </div>
        </div>
    `;
    
    if (result.skippedProducts && result.skippedProducts.length > 0) {
        html += `
            <div class="import-detail-section">
                <h4><i class="fas fa-info-circle"></i> Skipped (first ${result.skippedProducts.length})</h4>
                <table class="import-detail-table">
                    <thead><tr><th>Row</th><th>Name</th><th>Reason</th></tr></thead>
                    <tbody>
                        ${result.skippedProducts.map(p => `
                            <tr>
                                <td>${p.row}</td>
                                <td>${p.name || '—'}</td>
                                <td>${p.reason}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    if (result.errors && result.errors.length > 0) {
        html += `
            <div class="import-detail-section">
                <h4 style="color:#e74c3c;"><i class="fas fa-exclamation-circle"></i> Errors (first ${result.errors.length})</h4>
                <table class="import-detail-table">
                    <thead><tr><th>Row</th><th>Error</th></tr></thead>
                    <tbody>
                        ${result.errors.map(e => `
                            <tr>
                                <td>${e.row}</td>
                                <td style="color:#e74c3c;">${e.error}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    el.innerHTML = html;
    
    const updatedCount = s.imported || s.updated || 0;
    showToast(`✓ ${updatedLabel} ${updatedCount} products`, 'success');
}