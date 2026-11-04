// ============================================================
// ADD ITEM LOGIC (MISSING FUNCTIONS FIX)
// ============================================================

function onItemTypeChange() {
    const type = document.getElementById('itemType').value;
    const bulkFields = document.getElementById('bulkFields');
    const weightFields = document.getElementById('weightFields');
    const standardStockRow = document.getElementById('standardStockRow');
    const weightReorderRow = document.getElementById('weightReorderRow');

    if (type === 'bulk') {
        bulkFields.style.display = 'block';
        weightFields.style.display = 'none';
        standardStockRow.style.display = 'flex';
        weightReorderRow.style.display = 'none';
    } else if (type === 'weight') {
        bulkFields.style.display = 'none';
        weightFields.style.display = 'block';
        standardStockRow.style.display = 'none';
        weightReorderRow.style.display = 'flex';
    } else {
        bulkFields.style.display = 'none';
        weightFields.style.display = 'none';
        standardStockRow.style.display = 'flex';
        weightReorderRow.style.display = 'none';
    }
}

function resetItemForm() {
    document.getElementById('itemName').value = '';
    document.getElementById('itemCategory').value = '';
    document.getElementById('itemBarcode').value = '';
    document.getElementById('itemCostPrice').value = '';
    document.getElementById('itemSellingPrice').value = '';
    document.getElementById('itemStock').value = '';
    document.getElementById('itemReorder').value = '';
    document.getElementById('itemType').value = 'inventory';
    onItemTypeChange();
    showToast('Form reset', 'info');
}

async function saveItem() {
    const name = document.getElementById('itemName').value.trim();
    const category = document.getElementById('itemCategory').value.trim();
    const type = document.getElementById('itemType').value;
    const barcode = document.getElementById('itemBarcode').value.trim();
    const costPrice = parseFloat(document.getElementById('itemCostPrice').value) || 0;
    const sellingPrice = parseFloat(document.getElementById('itemSellingPrice').value) || 0;
    const stock = parseFloat(document.getElementById('itemStock').value) || 0;
    const reorderLevel = parseFloat(document.getElementById('itemReorder').value) || 5;

    if (!name || !category || !sellingPrice) {
        showToast('Please fill in Item Name, Category, and Selling Price', 'error');
        return;
    }

    const payload = {
        name,
        category,
        type,
        barcode: barcode || null,
        costPrice,
        sellingPrice,
        stock,
        reorderLevel
    };

    try {
        showToast('Saving item...', 'info');
        await API.createProduct(payload);
        showToast('Item saved successfully!', 'success');
        resetItemForm();
        if (typeof loadProducts === 'function') loadProducts();
    } catch (err) {
        showToast('Failed to save item: ' + err.message, 'error');
    }
}

// Expose the new functions globally so the buttons can find them
window.saveItem = saveItem;
window.onItemTypeChange = onItemTypeChange;
window.resetItemForm = resetItemForm;
