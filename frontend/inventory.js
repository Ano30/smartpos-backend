// ============================================================
// ADD ITEM LOGIC
// ============================================================
function onItemTypeChange() {
    const type = document.getElementById('itemType').value;
    document.getElementById('bulkFields').style.display = (type === 'bulk') ? 'block' : 'none';
    document.getElementById('weightFields').style.display = (type === 'weight') ? 'block' : 'none';
    
    // Toggle stock row visibility based on type
    if (type === 'weight') {
        document.getElementById('standardStockRow').style.display = 'none';
        document.getElementById('weightReorderRow').style.display = 'flex';
    } else {
        document.getElementById('standardStockRow').style.display = 'flex';
        document.getElementById('weightReorderRow').style.display = 'none';
    }
}

function calculatePackStock() {
    const packCount = parseFloat(document.getElementById('packCount').value) || 0;
    const unitsPerPack = parseFloat(document.getElementById('itemUnitsPerPack').value) || 12;
    const totalPieces = packCount * unitsPerPack;
    document.getElementById('totalPieces').value = totalPieces;
}

function applyPackCountToStock() {
    const totalPieces = document.getElementById('totalPieces').value;
    if (totalPieces) {
        document.getElementById('itemStock').value = totalPieces;
        showToast(`Stock updated to ${totalPieces} total pieces`, 'success');
    }
}

async function saveItem() {
    const type = document.getElementById('itemType').value;
    let stock = 0;
    let unitsPerPack = 1;

    if (type === 'bulk') {
        unitsPerPack = parseInt(document.getElementById('itemUnitsPerPack').value) || 12;
        const packCount = parseInt(document.getElementById('packCount').value) || 0;
        
        if (packCount > 0) {
            stock = packCount * unitsPerPack; // e.g., 30 * 12 = 360
        } else {
            stock = parseFloat(document.getElementById('itemStock').value) || 0;
        }
    } else if (type === 'weight') {
        stock = parseFloat(document.getElementById('itemStockWeight').value) || 0;
    } else {
        stock = parseFloat(document.getElementById('itemStock').value) || 0;
    }

    const payload = {
        name: document.getElementById('itemName').value.trim(),
        category: document.getElementById('itemCategory').value.trim(),
        type: type,
        barcode: document.getElementById('itemBarcode').value.trim(),
        costPrice: parseFloat(document.getElementById('itemCostPrice').value) || 0,
        sellingPrice: parseFloat(document.getElementById('itemSellingPrice').value) || 0,
        sellingPricePerSingle: parseFloat(document.getElementById('itemSellingPricePerSingle').value) || 0,
        unitsPerPack: unitsPerPack,
        stock: stock,
        reorderLevel: parseFloat(document.getElementById('itemReorder').value) || 5,
        unitOfMeasure: document.getElementById('itemUnitOfMeasure') ? document.getElementById('itemUnitOfMeasure').value : 'pcs'
    };

    if (!payload.name) { showToast('Item Name is required', 'error'); return; }

    try {
        await API.createProduct(payload);
        showToast('Item added successfully!', 'success');
        document.getElementById('itemName').value = '';
        document.getElementById('itemBarcode').value = '';
        document.getElementById('itemCostPrice').value = '';
        document.getElementById('itemSellingPrice').value = '';
        document.getElementById('itemStock').value = '';
        document.getElementById('packCount').value = '';
        document.getElementById('totalPieces').value = '';
        
        if (window.products) {
            loadProducts(); // Reload products in script.js
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ============================================================
// RESTOCK LOGIC (UPDATED FOR PACKS VS PIECES)
// ============================================================
async function saveRestock() {
    if (!window.currentRestockProduct) {
        showToast('No product selected', 'error'); return;
    }

    const inputQty = parseFloat(document.getElementById('restockQuantity').value);
    if (isNaN(inputQty) || inputQty <= 0) {
        showToast('Please enter a valid quantity', 'error'); return;
    }

    // Get the unit selection from the new dropdown
    const unitType = document.getElementById('restockUnitType').value;
    
    let piecesToAdd = inputQty;
    
    // If they selected "Packs" and the item has units_per_pack, do the math
    if (unitType === 'packs' && window.currentRestockProduct.units_per_pack > 1) {
        piecesToAdd = inputQty * window.currentRestockProduct.units_per_pack;
        showToast(`Adding ${piecesToAdd} total pieces (${inputQty} packs)`, 'info');
    }

    const newCost = parseFloat(document.getElementById('restockCostPrice').value);
    const newSelling = parseFloat(document.getElementById('restockSellingPrice').value);

    try {
        const product = window.currentRestockProduct;
        
        const payload = {
            name: product.name,
            category: product.category,
            type: product.type,
            barcode: product.barcode,
            costPrice: !isNaN(newCost) ? newCost : product.cost_price,
            sellingPrice: !isNaN(newSelling) ? newSelling : product.selling_price,
            stock: product.stock + piecesToAdd, // Add the total pieces
            reorderLevel: product.reorder_level,
            unitsPerPack: product.units_per_pack,
            sellingPricePerSingle: product.selling_price_per_single,
            unitOfMeasure: product.unit_of_measure
        };

        // Assuming you have an updateProduct API in api.js
        await API.updateProduct(product.id, payload);
        
        showToast('Restock saved successfully!', 'success');
        clearRestockForm(); // Hide the form
        if (window.products) loadProducts(); // Refresh grid

    } catch (err) {
        showToast(err.message, 'error');
    }
}
