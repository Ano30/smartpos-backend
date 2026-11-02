/* ============================================
   SMARTPOS - Backup Management UI
   Handles the 3-layer backup interface
   ============================================ */

let allBackups = [];

// ============ LOAD BACKUPS ============
async function loadBackups() {
    try {
        // Load stats
        const stats = await API.backupStats();
        renderBackupStats(stats);
        
        // Load list
        allBackups = await API.listBackups();
        renderBackupList(allBackups);
    } catch (err) {
        console.error('Load backups error:', err);
        if (typeof showToast === 'function') {
            showToast('Failed to load backups: ' + err.message, 'error');
        }
        
        const tbody = document.getElementById('backupTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="no-data" style="color:#e74c3c;">
                        <i class="fas fa-exclamation-circle"></i> 
                        Failed to load backups. Check server connection.
                    </td>
                </tr>
            `;
        }
    }
}

// ============ RENDER BACKUP STATS ============
function renderBackupStats(stats) {
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    
    // Auto layer
    setText('statAutoCount', stats.auto?.count || 0);
    setText('statAutoSize', stats.auto?.sizeFormatted || '0 B');
    
    // Manual layer
    setText('statManualCount', stats.manual?.count || 0);
    setText('statManualSize', stats.manual?.sizeFormatted || '0 B');
    
    // Cloud layer
    setText('statCloudCount', stats.cloud?.count || 0);
    setText('statCloudSize', stats.cloud?.sizeFormatted || '0 B');
    
    // Totals
    const totalCount = (stats.auto?.count || 0) + 
                       (stats.manual?.count || 0) + 
                       (stats.cloud?.count || 0);
    const totalSize = (stats.auto?.size || 0) + 
                      (stats.manual?.size || 0) + 
                      (stats.cloud?.size || 0);
    
    setText('statTotalCount', totalCount);
    setText('statTotalSize', formatBytes(totalSize));
}

// ============ RENDER BACKUP LIST ============
function renderBackupList(backups) {
    const tbody = document.getElementById('backupTableBody');
    if (!tbody) return;
    
    if (backups.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="no-data">
                    <i class="fas fa-inbox"></i>
                    <p style="margin-top:8px;">No backups yet. Create your first backup above.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = backups.map((b, i) => {
        const sizeStr = formatBytes(b.size_bytes || 0);
        const dateStr = new Date(b.created_at).toLocaleString('en-KE');
        const recordCount = b.record_count || 0;
        
        return `
            <tr>
                <td>${i + 1}</td>
                <td>
                    <code style="font-size:11px;">${truncate(b.filename, 45)}</code>
                </td>
                <td>
                    <span class="backup-type-badge ${b.type}">${b.type}</span>
                </td>
                <td>${sizeStr}</td>
                <td>${recordCount} records</td>
                <td><span style="font-size:12px;">${dateStr}</span></td>
                <td>
                    <button class="action-btn edit" 
                            onclick="downloadBackup('${b.type}', '${b.filename}')" 
                            title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="action-btn restock" 
                            onclick="restoreBackupPrompt('${b.type}', '${b.filename}')" 
                            title="Restore">
                        <i class="fas fa-undo"></i>
                    </button>
                    <button class="action-btn delete" 
                            onclick="deleteBackupPrompt('${b.type}', '${b.filename}')" 
                            title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ============ FILTER BACKUPS ============
function filterBackups() {
    const search = document.getElementById('backupSearch')?.value.toLowerCase() || '';
    
    if (!search) {
        renderBackupList(allBackups);
        return;
    }
    
    const filtered = allBackups.filter(b => 
        b.filename.toLowerCase().includes(search) ||
        b.type.toLowerCase().includes(search)
    );
    
    renderBackupList(filtered);
}

// ============ CREATE MANUAL BACKUP ============
async function createManualBackup() {
    try {
        if (typeof showToast === 'function') {
            showToast('Creating backup...', 'info');
        }
        
        const result = await API.createBackup('manual');
        
        if (typeof showToast === 'function') {
            showToast(`✓ Backup created: ${result.backup.filename}`, 'success');
        }
        
        await loadBackups();
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast('Backup failed: ' + err.message, 'error');
        }
    }
}

// ============ CLOUD SYNC ============
async function createCloudSync() {
    try {
        if (typeof showToast === 'function') {
            showToast('Syncing to cloud...', 'info');
        }
        
        const result = await API.syncCloud();
        
        if (typeof showToast === 'function') {
            showToast('✓ Synced to cloud folder', 'success');
        }
        
        await loadBackups();
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast('Cloud sync failed: ' + err.message, 'error');
        }
    }
}

// ============ CLEAN OLD BACKUPS ============
async function cleanOldBackups() {
    if (!confirm('Delete backups older than 365 days?\n\nThis keeps the last 30 auto-backups as safety.')) {
        return;
    }
    
    try {
        const result = await API.cleanBackups();
        
        if (typeof showToast === 'function') {
            showToast(`✓ Removed ${result.removed} old backups`, 'success');
        }
        
        await loadBackups();
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast('Clean failed: ' + err.message, 'error');
        }
    }
}

// ============ DOWNLOAD BACKUP ============
function downloadBackup(type, filename) {
    try {
        API.downloadBackup(type, filename);
        
        if (typeof showToast === 'function') {
            showToast('Download started', 'success');
        }
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast('Download failed: ' + err.message, 'error');
        }
    }
}

// ============ RESTORE BACKUP ============
async function restoreBackupPrompt(type, filename) {
    const confirmed = confirm(
        `⚠️ RESTORE WARNING\n\n` +
        `You are about to restore:\n` +
        `${filename}\n\n` +
        `This will REPLACE all current data with the backup's data.\n\n` +
        `The current database will be saved as "pos.db.before_restore" as a safety measure.\n\n` +
        `You may need to RESTART the server after restore.\n\n` +
        `Continue?`
    );
    
    if (!confirmed) return;
    
    // Double confirmation for safety
    const doubleConfirm = confirm(
        `Are you ABSOLUTELY SURE?\n\n` +
        `Click OK to restore, Cancel to abort.`
    );
    
    if (!doubleConfirm) return;
    
    try {
        if (typeof showToast === 'function') {
            showToast('Restoring backup...', 'info');
        }
        
        const result = await API.restoreBackup(type, filename);
        
        if (typeof showToast === 'function') {
            showToast('✓ ' + result.message, 'success');
        }
        
        setTimeout(() => {
            alert(
                'Restore complete!\n\n' +
                'Please:\n' +
                '1. Stop the server (Ctrl+C in the terminal)\n' +
                '2. Start it again (npm start)\n' +
                '3. Refresh the page'
            );
        }, 500);
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast('Restore failed: ' + err.message, 'error');
        }
    }
}

// ============ DELETE BACKUP ============
async function deleteBackupPrompt(type, filename) {
    if (!confirm(`Delete this backup?\n\n${filename}\n\nThis cannot be undone.`)) {
        return;
    }
    
    try {
        await API.deleteBackup(type, filename);
        
        if (typeof showToast === 'function') {
            showToast('✓ Backup deleted', 'success');
        }
        
        await loadBackups();
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast('Delete failed: ' + err.message, 'error');
        }
    }
}

// ============ HELPERS ============
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function truncate(str, n) {
    if (!str) return '';
    return str.length > n ? str.substring(0, n) + '…' : str;
}