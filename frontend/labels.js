/* ============================================================
   SMARTPOS - Labels Generator Logic (labels.js)
   ============================================================ */

let selectedLabels = [];

// 🎯 INIT: Load products when the page is opened
function initLabelsPage() {
    if (typeof products === 'undefined' || !Array.isArray(products)) {
        console.warn('Products not loaded yet, trying again...');
        setTimeout(initLabelsPage, 500);
        return;
    }
    renderLabelProducts();
}

// 🎯 RENDER: Draw the list of products on the page
function renderLabelProducts(filterText = '') {
    const grid = document.getElementById('labelProductGrid');
    if (!grid) return;

    // Use the global 'products' array from script.js
    let list = products;

    if (filterText) {
        list = list.filter(p => p.name.toLowerCase().includes(filterText.toLowerCase()));
    }

    if (list.length === 0) {
        grid.innerHTML = '<div style="padding:20px;text-align:center;color:#7f8c8d;">No products found.</div>';
        return;
    }

    grid.innerHTML = list.map(p => {
        const isSelected = selectedLabels.includes(p.id);
        const barcodeDisplay = p.barcode ? `<span style="font-size:10px;color:#95a5a6;"><i class="fas fa-barcode"></i> ${p.barcode}</span>` : `<span style="font-size:10px;color:#e67e22;">No barcode</span>`;
        
        return `
            <div class="label-product-item" style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #e1e8ed;border-radius:8px;margin-bottom:8px;background:#fff;cursor:pointer;" onclick="toggleLabelSelection(${p.id})">
                <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleLabelSelection(${p.id})">
                <div style="flex:1;">
                    <div style="font-weight:600;color:#2c3e50;">${p.name}</div>
                    <div style="font-size:12px;color:#7f8c8d;">KES ${parseFloat(p.selling_price).toFixed(2)}</div>
                    ${barcodeDisplay}
                </div>
            </div>
        `;
    }).join('');
}

// 🎯 TOGGLE: Select/Deselect a product
function toggleLabelSelection(productId) {
    const index = selectedLabels.indexOf(productId);
    if (index === -1) {
        selectedLabels.push(productId);
    } else {
        selectedLabels.splice(index, 1);
    }
    renderLabelProducts(document.getElementById('labelSearch')?.value || '');
    updateLabelPreview();
}

// 🎯 UPDATE PREVIEW: Show what the labels will look like
function updateLabelPreview() {
    const sheet = document.getElementById('labelsPreviewSheet');
    const countEl = document.getElementById('labelCount');
    
    if (!sheet) return;

    if (selectedLabels.length === 0) {
        sheet.innerHTML = '<div class="no-data">Select products above to preview labels</div>';
        if (countEl) countEl.textContent = '0 labels selected';
        return;
    }

    if (countEl) countEl.textContent = `${selectedLabels.length} labels selected`;

    const labelsHtml = selectedLabels.map(id => {
        const p = products.find(prod => prod.id === id);
        if (!p) return '';
        
        return `
            <div class="label-preview-item" style="border:1px dashed #ccc; padding:10px; margin:5px; text-align:center; width:150px; display:inline-block;">
                <div style="font-size:10px; font-weight:bold;">${p.name}</div>
                <div style="font-size:10px;">KES ${parseFloat(p.selling_price).toFixed(2)}</div>
                <svg class="barcode-svg" data-barcode="${p.barcode || '123456'}"></svg>
            </div>
        `;
    }).join('');

    sheet.innerHTML = labelsHtml;

    // Draw the actual barcodes using JsBarcode
    setTimeout(() => {
        document.querySelectorAll('.barcode-svg').forEach(svg => {
            const code = svg.getAttribute('data-barcode');
            if (code) {
                try {
                    JsBarcode(svg, code, { format: "CODE128", width: 1, height: 30, displayValue: true, fontSize: 8 });
                } catch (e) { console.error('Barcode error:', e); }
            }
        });
    }, 100);
}

// 🎯 SEARCH: Filter products
function filterLabelProducts() {
    const query = document.getElementById('labelSearch')?.value || '';
    renderLabelProducts(query);
}

// 🎯 SELECT ALL
function selectAllForLabels() {
    selectedLabels = products.map(p => p.id);
    renderLabelProducts(document.getElementById('labelSearch')?.value || '');
    updateLabelPreview();
}

// 🎯 PRINT
function printLabels() {
    if (selectedLabels.length === 0) {
        alert('Please select at least one product to print.');
        return;
    }
    window.print();
}

// Expose functions globally
window.initLabelsPage = initLabelsPage;
window.renderLabelProducts = renderLabelProducts;
window.toggleLabelSelection = toggleLabelSelection;
window.updateLabelPreview = updateLabelPreview;
window.filterLabelProducts = filterLabelProducts;
window.selectAllForLabels = selectAllForLabels;
window.printLabels = printLabels;

console.log('[SmartPOS] labels.js loaded successfully');
