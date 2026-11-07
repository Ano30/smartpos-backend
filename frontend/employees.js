/* ============================================================
   SMARTPOS - Employees Management (v7 - Fixed Username Error)
   ============================================================ */

(function() {
    'use strict';

    // ============ STATE ============
    let empMgr_list = [];
    let empMgr_stats = [];
    let empMgr_period = 'today';
    let empMgr_permMatrix = {
        employee: ['make_sale', 'view_inventory', 'process_returns'],
        admin: ['make_sale', 'view_inventory', 'process_returns', 'restock', 'add_product',
                'edit_product', 'delete_product', 'print_labels', 'view_reports', 'view_analytics'],
        owner: ['*']
    };
    let empMgr_editingRightsEmpId = null;

    const EMPMGR_PERMISSIONS = [
        { key: 'make_sale', label: 'Make Sales', icon: 'fa-shopping-cart', group: 'Sales' },
        { key: 'view_inventory', label: 'View Inventory', icon: 'fa-boxes', group: 'Inventory' },
        { key: 'add_product', label: 'Add Products', icon: 'fa-plus-square', group: 'Inventory' },
        { key: 'edit_product', label: 'Edit Products', icon: 'fa-edit', group: 'Inventory' },
        { key: 'delete_product', label: 'Delete Products', icon: 'fa-trash', group: 'Inventory' },
        { key: 'restock', label: 'Restock Items', icon: 'fa-boxes-stacked', group: 'Inventory' },
        { key: 'process_returns', label: 'Process Returns', icon: 'fa-undo', group: 'Returns' },
        { key: 'print_labels', label: 'Print Labels', icon: 'fa-tags', group: 'Labels' },
        { key: 'view_reports', label: 'View Reports', icon: 'fa-chart-line', group: 'Reports' },
        { key: 'view_analytics', label: 'View Analytics', icon: 'fa-chart-pie', group: 'Reports' },
        { key: 'import_data', label: 'Import Data', icon: 'fa-file-import', group: 'Data' },
        { key: 'manage_employees', label: 'Manage Employees', icon: 'fa-users', group: 'Admin' },
        { key: 'manage_backups', label: 'Manage Backups', icon: 'fa-database', group: 'Admin' },
        { key: 'manage_mpesa', label: 'Manage M-Pesa', icon: 'fa-mobile-alt', group: 'Admin' },
        { key: 'view_audit_log', label: 'View Audit Log', icon: 'fa-history', group: 'Admin' }
    ];

    // ============================================================
    // ✅ ROBUST USER GETTER
    // ============================================================
    function empMgr_getUser() {
        if (window.currentUser && window.currentUser.role) return window.currentUser;
        try {
            const cached = localStorage.getItem('pos_user');
            if (cached) {
                const u = JSON.parse(cached);
                if (u && u.role) {
                    window.currentUser = u;
                    return u;
                }
            }
        } catch (e) {}
        return null;
    }

    function empMgr_hasPerm(permission) {
        const user = empMgr_getUser();
        if (!user) return false;
        if (user.role === 'owner') return true;
        const perms = user.permissions || [];
        return perms.includes(permission);
    }

    // ============================================================
    // PAGE LOADER
    // ============================================================
    async function loadEmployeesPage() {
        try {
            console.log('[Employees] Loading page... user role:', empMgr_getUser()?.role);
            await empMgr_loadMatrix();
            await empMgr_loadEmployees();
            await empMgr_loadStats();
            empMgr_renderStats();
            empMgr_renderTable();
        } catch (err) {
            console.error('[Employees] Load error:', err);
            if (typeof showToast === 'function') showToast('Failed to load employees: ' + err.message, 'error');
        }
    }

    async function empMgr_loadEmployees() {
        empMgr_list = await API.getEmployees();
        return empMgr_list;
    }

    async function empMgr_loadStats() {
        try {
            const stats = await API.getEmployeeStats(empMgr_period);
            if (Array.isArray(stats)) {
                empMgr_stats = stats;
            } else {
                empMgr_stats = []; 
            }
        } catch (err) {
            empMgr_stats = [];
        }
    }

    async function empMgr_loadMatrix() {
        try {
            const matrix = await API.getPermissionsMatrix();
            if (matrix) empMgr_permMatrix = matrix;
        } catch (err) {}
    }

    // ============================================================
    // RENDER STATS
    // ============================================================
    function empMgr_renderStats() {
        const grid = document.getElementById('employeeStatsGrid');
        if (!grid) return;

        const totalEmployees = empMgr_list.filter(e => e.role !== 'owner').length;
        const activeEmployees = empMgr_list.filter(e => e.is_active && e.role !== 'owner').length;
        
        const totalSales = Array.isArray(empMgr_stats) ? empMgr_stats.reduce((sum, s) => sum + (s.sales || 0), 0) : 0;
        const totalRevenue = Array.isArray(empMgr_stats) ? empMgr_stats.reduce((sum, s) => sum + (s.revenue || 0), 0) : 0;

        grid.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon"><i class="fas fa-users"></i></div>
                <div><div class="stat-value">${totalEmployees}</div><div class="stat-label">Total Employees</div></div>
            </div>
            <div class="stat-card green">
                <div class="stat-icon"><i class="fas fa-user-check"></i></div>
                <div><div class="stat-value">${activeEmployees}</div><div class="stat-label">Active</div></div>
            </div>
            <div class="stat-card orange">
                <div class="stat-icon"><i class="fas fa-receipt"></i></div>
                <div><div class="stat-value">${totalSales}</div><div class="stat-label">Total Sales</div></div>
            </div>
            <div class="stat-card blue">
                <div class="stat-icon"><i class="fas fa-money-bill-wave"></i></div>
                <div><div class="stat-value">KES ${empMgr_formatMoney(totalRevenue)}</div><div class="stat-label">Total Revenue</div></div>
            </div>
        `;
    }

    // ============================================================
    // RENDER TABLE
    // ============================================================
    function empMgr_renderTable() {
        const tbody = document.getElementById('employeeTableBody');
        if (!tbody) return;

        if (empMgr_list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="no-data">No employees found. Click "Add Employee" to get started.</td></tr>';
            return;
        }

        const sorted = [...empMgr_list].sort((a, b) => {
            const roleOrder = { owner: 0, admin: 1, employee: 2 };
            const aOrder = roleOrder[a.role] ?? 3;
            const bOrder = roleOrder[b.role] ?? 3;
            if (aOrder !== bOrder) return aOrder - bOrder;
            if (a.is_active !== b.is_active) return b.is_active - a.is_active;
            return a.id - b.id;
        });

        const currentUser = empMgr_getUser();

        tbody.innerHTML = sorted.map((emp, i) => {
            const stats = Array.isArray(empMgr_stats) ? (empMgr_stats.find(s => s.cashier_id === emp.id) || { sales: 0, revenue: 0 }) : { sales: 0, revenue: 0 };
            const initials = empMgr_getInitials(emp.full_name || emp.username);
            const avatarColor = empMgr_avatarColor(emp.role);
            const roleBadgeClass = emp.role === 'owner' ? 'owner' : emp.role === 'admin' ? 'admin' : 'employee';
            const roleLabel = emp.role === 'owner' ? 'OWNER' : emp.role === 'admin' ? 'ADMIN' : 'EMPLOYEE';
            const rightsCount = (emp.permissions || []).length;
            const rightsLabel = emp.role === 'owner' ? 'All rights' : `${rightsCount} right${rightsCount !== 1 ? 's' : ''}`;
            const statusBadge = emp.is_active
                ? '<span class="status-badge active">ACTIVE</span>'
                : '<span class="status-badge inactive">INACTIVE</span>';
            const isSelf = currentUser && currentUser.id === emp.id;
            const isOwnerRow = emp.role === 'owner';
            
            const canManage = currentUser && (currentUser.role === 'owner' || currentUser.role === 'admin');

            return `
                <tr>
                    <td>${i + 1}</td>
                    <td>
                        <div class="employee-cell">
                            <div class="employee-avatar" style="background:${avatarColor};">${initials}</div>
                            <div><div class="employee-name">${empMgr_escapeHtml(emp.full_name || emp.username)}</div></div>
                        </div>
                    </td>
                    <td><code>${empMgr_escapeHtml(emp.username)}</code></td>
                    <td><span class="role-badge ${roleBadgeClass}">${roleLabel}</span></td>
                    <td><span class="rights-badge">${rightsLabel}</span></td>
                    <td>${statusBadge}</td>
                    <td>${stats.sales || 0}</td>
                    <td>KES ${empMgr_formatMoney(stats.revenue || 0)}</td>
                    <td class="actions-cell">
                        <button class="action-btn view" onclick="viewEmployeePermissions(${emp.id})" title="View Rights">
                            <i class="fas fa-shield-alt"></i>
                        </button>
                        
                        ${canManage && !isOwnerRow ? `
                            <button class="action-btn rights" onclick="openUpdateRightsModal(${emp.id})" title="Update Rights">
                                <i class="fas fa-user-cog"></i>
                            </button>
                            <button class="action-btn reset-pw" onclick="resetEmployeePassword(${emp.id}, '${empMgr_escapeAttr(emp.username)}')" title="Reset Password">
                                <i class="fas fa-key"></i>
                            </button>
                            <button class="action-btn edit" onclick="editEmployee(${emp.id})" title="Edit Employee">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}

                        ${canManage && !isSelf && !isOwnerRow ? `
                            <button class="action-btn delete" onclick="deleteEmployee(${emp.id})" title="Delete Employee" style="background:#e74c3c; color:white;">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ============================================================
    // ⭐ RESET PASSWORD (OWNER FEATURE)
    // ============================================================
    async function resetEmployeePassword(employeeId, username) {
        if (!empMgr_hasPerm('manage_employees')) {
            if (typeof showToast === 'function') showToast('Access denied.', 'error');
            return;
        }

        const employee = empMgr_list.find(e => e.id === employeeId);
        if (!employee) { alert('Employee not found'); return; }

        const currentUser = empMgr_getUser();
        if (currentUser && currentUser.id === employeeId) {
            alert('⚠️ You cannot reset your own password this way.');
            return;
        }

        const newPassword = prompt(
            `🔑 RESET PASSWORD\n\n` +
            `Employee: ${employee.full_name || username}\n` +
            `Username: ${username}\n\n` +
            `Enter a new password (minimum 4 characters):`
        );

        if (newPassword === null) return;
        if (!newPassword.trim() || newPassword.length < 4) { 
            alert('Password must be at least 4 characters'); return; 
        }

        if (!confirm(`Reset password for "${username}"?`)) return;

        try {
            await API.resetEmployeePassword(employeeId, newPassword);
            if (typeof showToast === 'function') showToast(`✓ Password reset for ${username}`, 'success');

            setTimeout(() => {
                alert(
                    `✅ PASSWORD RESET SUCCESSFUL!\n\n` +
                    `Share with the employee:\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Role:     ${employee.role}\n` +
                    `Username: ${username}\n` +
                    `Password: ${newPassword}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━`
                );
            }, 400);
        } catch (err) {
            if (typeof showToast === 'function') showToast(err.message, 'error');
        }
    }

    // ============================================================
    // ADD / EDIT MODAL
    // ============================================================
    function openAddEmployeeModal() {
        if (!empMgr_hasPerm('manage_employees')) {
            if (typeof showToast === 'function') showToast('Access denied.', 'error');
            return;
        }

        const modal = document.getElementById('employeeModal');
        if (!modal) return;

        document.getElementById('employeeModalTitle').textContent = 'Add Employee';
        document.getElementById('employeeId').value = '';
        document.getElementById('employeeFullName').value = '';
        document.getElementById('employeeUsername').value = '';
        // Username is always enabled for adding
        document.getElementById('employeeUsername').disabled = false;
        document.getElementById('employeePassword').value = '';
        document.getElementById('employeePassword').placeholder = 'Enter password';
        document.getElementById('employeeRole').value = 'employee';
        document.getElementById('empPassHint').textContent = '(minimum 4 characters)';

        empMgr_renderAddEditPermGrid([]);
        onEmployeeRoleChange();

        modal.classList.add('active');
        setTimeout(() => document.getElementById('employeeFullName')?.focus(), 200);
    }

    function editEmployee(employeeId) {
        if (!empMgr_hasPerm('manage_employees')) return;

        const emp = empMgr_list.find(e => e.id === employeeId);
        if (!emp) return;

        const modal = document.getElementById('employeeModal');
        if (!modal) return;

        document.getElementById('employeeModalTitle').textContent = 'Edit Employee';
        document.getElementById('employeeId').value = emp.id;
        document.getElementById('employeeFullName').value = emp.full_name || '';
        document.getElementById('employeeUsername').value = emp.username;
        
        // 🎯 FIX: Username must stay enabled so it sends to the server
        document.getElementById('employeeUsername').disabled = false; 
        
        document.getElementById('employeePassword').value = '';
        document.getElementById('employeePassword').placeholder = 'Leave empty to keep current password';
        document.getElementById('empPassHint').textContent = '(leave empty to keep current)';
        document.getElementById('employeeRole').value = emp.role;

        empMgr_renderAddEditPermGrid(emp.permissions || []);
        updatePermissionCount();

        modal.classList.add('active');
    }

    function closeEmployeeModal() {
        const modal = document.getElementById('employeeModal');
        if (modal) modal.classList.remove('active');
    }

    function empMgr_renderAddEditPermGrid(selectedPermissions) {
        const grid = document.getElementById('employeePermissionsGrid');
        if (!grid) return;

        const currentRole = document.getElementById('employeeRole').value;
        const isOwnerRole = currentRole === 'owner';

        const groups = {};
        EMPMGR_PERMISSIONS.forEach(p => {
            if (!groups[p.group]) groups[p.group] = [];
            groups[p.group].push(p);
        });

        let html = '';
        Object.entries(groups).forEach(([groupName, perms]) => {
            html += `
                <div class="permission-group">
                    <div class="permission-group-title">${groupName}</div>
                    <div class="permission-items">
                        ${perms.map(p => {
                            const checked = isOwnerRole || selectedPermissions.includes(p.key) ? 'checked' : '';
                            const disabled = isOwnerRole ? 'disabled' : '';
                            return `
                                <label class="permission-item ${isOwnerRole ? 'locked' : ''}">
                                    <input type="checkbox" value="${p.key}" ${checked} ${disabled} onchange="updatePermissionCount()">
                                    <i class="fas ${p.icon}"></i>
                                    <span>${p.label}</span>
                                </label>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
        updatePermissionCount();
    }

    function updatePermissionCount() {
        const checkboxes = document.querySelectorAll('#employeePermissionsGrid input[type="checkbox"]');
        const checked = document.querySelectorAll('#employeePermissionsGrid input[type="checkbox"]:checked');
        const countEl = document.getElementById('permissionCount');
        if (!countEl) return;

        const total = checkboxes.length;
        const selected = checked.length;
        countEl.textContent = `${selected} of ${total} rights selected`;

        countEl.className = 'permission-count';
        if (selected === 0) countEl.classList.add('danger');
        else if (selected < 3) countEl.classList.add('warn');
        else countEl.classList.add('ok');
    }

    function onEmployeeRoleChange() {
        const role = document.getElementById('employeeRole').value;
        let defaultPerms = [];

        if (role === 'owner') {
            defaultPerms = EMPMGR_PERMISSIONS.map(p => p.key);
        } else if (role === 'admin') {
            defaultPerms = empMgr_permMatrix.admin || [];
        } else {
            defaultPerms = empMgr_permMatrix.employee || ['make_sale', 'view_inventory', 'process_returns'];
        }

        empMgr_renderAddEditPermGrid(defaultPerms);
    }

    function empMgr_getSelectedPerms() {
        const checkboxes = document.querySelectorAll('#employeePermissionsGrid input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    async function saveEmployee() {
        if (!empMgr_hasPerm('manage_employees')) return;

        const id = document.getElementById('employeeId').value;
        const fullName = document.getElementById('employeeFullName').value.trim();
        const username = document.getElementById('employeeUsername').value.trim();
        const password = document.getElementById('employeePassword').value;
        const role = document.getElementById('employeeRole').value;
        const permissions = role === 'owner' ? [] : empMgr_getSelectedPerms();

        if (!fullName) { showToast('Full name required', 'error'); return; }
        if (!username) { showToast('Username required', 'error'); return; }

        if (!id) {
            if (!password || password.length < 4) { showToast('Password must be at least 4 chars', 'error'); return; }

            try {
                await API.createEmployee({ fullName, username, password, role, permissions });
                showToast(`✓ ${fullName} added`, 'success');
                closeEmployeeModal();
                await loadEmployeesPage();
            } catch (err) {
                showToast(err.message, 'error');
            }
        } else {
            // 🎯 FIX: Always include username in update
            const updateData = { fullName, username, role, permissions };
            if (password) {
                if (password.length < 4) { showToast('Password too short', 'error'); return; }
                updateData.password = password;
            }

            try {
                await API.updateEmployee(id, updateData);
                showToast(`✓ ${fullName} updated`, 'success');
                closeEmployeeModal();
                await loadEmployeesPage();
            } catch (err) {
                showToast(err.message, 'error');
            }
        }
    }

    async function deleteEmployee(employeeId) {
        if (!empMgr_hasPerm('manage_employees')) return;

        const emp = empMgr_list.find(e => e.id === employeeId);
        if (!emp) return;

        const currentUser = empMgr_getUser();
        if (currentUser && currentUser.id === employeeId) {
            showToast('You cannot delete yourself', 'error'); return;
        }

        if (!confirm(`Delete "${emp.full_name || emp.username}"? This action cannot be undone.`)) return;

        try {
            await API.deleteEmployee(employeeId);
            showToast(`✓ ${emp.full_name || emp.username} deleted`, 'success');
            await loadEmployeesPage();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function empMgr_getInitials(name) {
        if (!name) return '??';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function empMgr_avatarColor(role) {
        const colors = {
            owner: 'linear-gradient(135deg, #f39c12, #e67e22)',
            admin: 'linear-gradient(135deg, #3498db, #2980b9)',
            employee: 'linear-gradient(135deg, #27ae60, #229954)'
        };
        return colors[role] || colors.employee;
    }

    function empMgr_escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function empMgr_escapeAttr(str) {
        return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    function empMgr_formatMoney(num) {
        if (!num) return '0.00';
        num = Number(num);
        if (Math.abs(num) >= 1000000) return (num / 1000000).toFixed(2) + 'M';
        if (Math.abs(num) >= 1000) return num.toLocaleString('en-KE', { maximumFractionDigits: 2 });
        return num.toFixed(2);
    }

    // Expose globally
    window.loadEmployeesPage = loadEmployeesPage;
    window.openAddEmployeeModal = openAddEmployeeModal;
    window.editEmployee = editEmployee;
    window.closeEmployeeModal = closeEmployeeModal;
    window.saveEmployee = saveEmployee;
    window.deleteEmployee = deleteEmployee;
    window.resetEmployeePassword = resetEmployeePassword;
    window.onEmployeeRoleChange = onEmployeeRoleChange;
    window.updatePermissionCount = updatePermissionCount;

    console.log('[SmartPOS] employees.js loaded (v7 - Fixed Username Error)');
})();
