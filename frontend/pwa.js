/* SmartPOS PWA Client */
(function() {
    'use strict';
    let deferredPrompt = null;

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(reg => console.log('[PWA] SW registered:', reg.scope))
                .catch(err => console.warn('[PWA] SW error:', err));
        });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallButton();
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        hideInstallButton();
        if (typeof showToast === 'function') showToast('SmartPOS installed!', 'success');
    });

    function showInstallButton() {
        if (document.getElementById('pwaInstallBanner')) return;
        const banner = document.createElement('div');
        banner.id = 'pwaInstallBanner';
        banner.innerHTML = `<div style="display:flex;align-items:center;gap:12px;">
            <i class="fas fa-mobile-alt" style="font-size:24px;color:#f5a623;"></i>
            <div style="flex:1;">
                <div style="font-weight:700;color:#2c3e50;font-size:14px;">Install SmartPOS App</div>
                <div style="font-size:12px;color:#7f8c8d;">Add to home screen</div>
            </div>
            <button id="pwaInstallBtn" style="background:#27ae60;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;">Install</button>
            <button id="pwaInstallClose" style="background:none;border:none;color:#95a5a6;font-size:20px;cursor:pointer;padding:4px 8px;">x</button>
        </div>`;
        banner.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#fff;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.15);padding:16px 20px;max-width:90%;width:420px;z-index:99999;border:1px solid #e1e8ed;';
        document.body.appendChild(banner);
        document.getElementById('pwaInstallBtn').addEventListener('click', installApp);
        document.getElementById('pwaInstallClose').addEventListener('click', hideInstallButton);
    }

    function hideInstallButton() {
        const banner = document.getElementById('pwaInstallBanner');
        if (banner) banner.remove();
    }

    async function installApp() {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        hideInstallButton();
    }

    function updateOnlineStatus() {
        const isOnline = navigator.onLine;
        let indicator = document.getElementById('pwaOfflineIndicator');
        if (!isOnline) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'pwaOfflineIndicator';
                indicator.innerHTML = '<i class="fas fa-wifi" style="margin-right:8px;"></i><strong>Offline Mode</strong> - Sales sync when reconnected';
                indicator.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#e67e22;color:#fff;text-align:center;padding:8px;font-size:13px;z-index:99998;';
                document.body.appendChild(indicator);
            }
        } else {
            if (indicator) indicator.remove();
        }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    document.addEventListener('DOMContentLoaded', () => {
        updateOnlineStatus();
        console.log('[PWA] Client loaded');
    });
})();
