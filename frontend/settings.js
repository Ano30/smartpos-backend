/* ============================================================
   SMARTPOS - Settings & Help (Cloud/PC Optimized)
   ============================================================ */

// Global variables for settings
let soundEnabled = true;
let soundVolume = 70;

document.addEventListener('DOMContentLoaded', () => {
    // Load initial settings data
    loadSettings();
    loadMobileUrl();
});

function loadSettings() {
    // --- Load Contact Info ---
    const contactBody = document.getElementById('contactInfoBody');
    if (contactBody) {
        contactBody.innerHTML = `
            <div style="font-size: 14px; line-height: 1.8;">
                <div><i class="fas fa-user"></i> <strong>Developer:</strong> Ano30</div>
                <div><i class="fas fa-envelope"></i> <strong>Email:</strong> support@smartpos.com</div>
                <div><i class="fas fa-phone"></i> <strong>Phone:</strong> +254 700 000 000</div>
            </div>
        `;
    }

    // --- Load Terms Last Updated ---
    const termsDate = document.getElementById('termsLastUpdated');
    if (termsDate) {
        termsDate.textContent = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // --- Load About Info ---
    const aboutVersion = document.getElementById('aboutVersionLine');
    const aboutBody = document.getElementById('aboutBody');
    if (aboutVersion && aboutBody) {
        aboutVersion.textContent = 'Version 1.0.0 (Cloud Edition)';
        aboutBody.innerHTML = `
            <p style="font-size: 13px; color: #7f8c8d; line-height: 1.6;">
                SmartPOS is a complete Point of Sale solution designed for retail stores, supermarkets, and small businesses.
                It features real-time syncing, M-Pesa integration, and advanced analytics.
            </p>
            <div style="margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #27ae60;">
                <h4 style="margin: 0 0 5px 0; color: #2c3e50;">Running in Cloud Mode</h4>
                <p style="margin: 0; font-size: 12px; color: #7f8c8d;">
                    This application is securely connected to the Render cloud server and Turso database.
                </p>
            </div>
        `;
    }

    // --- Load Sound Settings ---
    const toggle = document.getElementById('soundEnabledToggle');
    const volume = document.getElementById('soundVolume');
    const volumeLabel = document.getElementById('soundVolumeLabel');

    if (toggle && volume && volumeLabel) {
        // Set defaults
        toggle.checked = soundEnabled;
        volume.value = soundVolume;
        volumeLabel.textContent = `${soundVolume}%`;

        // Add listeners
        toggle.addEventListener('change', (e) => {
            soundEnabled = e.target.checked;
            showSettingsToast(soundEnabled ? 'Sound enabled' : 'Sound muted');
        });

        volume.addEventListener('input', (e) => {
            soundVolume = e.target.value;
            volumeLabel.textContent = `${soundVolume}%`;
        });
    }
}

// ============================================================
// MOBILE ACCESS (CLOUD FIX)
// ============================================================
function loadMobileUrl() {
    const urlContainer = document.getElementById('mobileServerUrl');
    if (urlContainer) {
        // Since we are on the cloud, just give the direct Render URL
        urlContainer.innerHTML = `https://smartpos-backend-gtwl.onrender.com`;
    }
}

function copyMobileUrl() {
    const url = document.getElementById('mobileServerUrl').innerText;
    navigator.clipboard.writeText(url).then(() => {
        showSettingsToast('URL copied to clipboard!');
    }).catch(err => {
        showSettingsToast('Failed to copy URL', 'error');
    });
}

function refreshMobileUrl() {
    // No need to refresh, it's a static cloud URL
    loadMobileUrl();
    showSettingsToast('URL updated');
}

// ============================================================
// UI ACTIONS (MODALS & TOAST)
// ============================================================
function copyContactInfo() {
    const text = "Developer: Ano30\nEmail: support@smartpos.com\nPhone: +254 700 000 000";
    navigator.clipboard.writeText(text).then(() => {
        showSettingsToast('Contact info copied!');
    });
}

function openShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) modal.style.display = 'flex';
}

function closeShortcutsModal() {
    const modal = document.getElementById('shortcutsModal');
    if (modal) modal.style.display = 'none';
}

function openTermsModal() {
    const modal = document.getElementById('termsModal');
    const body = document.getElementById('termsModalBody');
    
    if (modal && body) {
        body.innerHTML = `
            <h3 style="margin-top: 0;">1. Software License</h3>
            <p>SmartPOS is licensed, not sold, to you for use only under the terms of this license. We reserve all rights not expressly granted to you.</p>
            
            <h3>2. Data Privacy</h3>
            <p>Your data is securely stored in the Turso Cloud Database. We do not sell or share your sales data with third parties. You are responsible for keeping your login credentials secure.</p>
            
            <h3>3. Payments & Refunds</h3>
            <p>All M-Pesa transactions shown in this app are simulated for testing and accountability purposes. SmartPOS is not liable for any financial discrepancies outside of its calculated reports.</p>
            
            <h3>4. Acceptable Use</h3>
            <p>You agree not to use the software for any illegal purposes or to attempt to reverse-engineer the application.</p>
        `;
        modal.style.display = 'flex';
    }
}

function closeTermsModal() {
    const modal = document.getElementById('termsModal');
    if (modal) modal.style.display = 'none';
}

function printTerms() {
    window.print();
}

function testSound(type) {
    if (!soundEnabled) return;
    
    // A simple beep using the Web Audio API for testing
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.value = type === 'error' ? 300 : (type === 'success' ? 800 : 600);
        
        gainNode.gain.setValueAtTime(soundVolume / 100, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
        console.log('Audio not supported');
    }
}

function showSettingsToast(message) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = 'toast show success';
        setTimeout(() => { toast.className = 'toast'; }, 3000);
    } else {
        alert(message);
    }
}

// Bind functions to window so HTML onclick can find them
window.copyMobileUrl = copyMobileUrl;
window.refreshMobileUrl = refreshMobileUrl;
window.copyContactInfo = copyContactInfo;
window.openShortcutsModal = openShortcutsModal;
window.closeShortcutsModal = closeShortcutsModal;
window.openTermsModal = openTermsModal;
window.closeTermsModal = closeTermsModal;
window.printTerms = printTerms;
window.testSound = testSound;