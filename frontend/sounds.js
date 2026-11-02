/* ============================================
   SMARTPOS - Sound Effects Engine
   Uses Web Audio API - no external files needed
   ============================================ */

const SoundEngine = (function() {
    let audioCtx = null;
    let enabled = localStorage.getItem('pos_sounds_enabled') !== 'false';
    
    // ============ INIT ============
    function getCtx() {
        if (!audioCtx) {
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.warn('Web Audio not supported');
                return null;
            }
        }
        // Resume if suspended (Chrome autoplay policy)
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }
    
    // ============ CORE TONE PLAYER ============
    function playTone(frequency, duration, type = 'sine', volume = 0.15, delay = 0) {
        if (!enabled) return;
        const ctx = getCtx();
        if (!ctx) return;
        
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = type;
            osc.frequency.value = frequency;
            
            const startTime = ctx.currentTime + delay;
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
            
            osc.start(startTime);
            osc.stop(startTime + duration + 0.05);
        } catch (e) {
            // Silently fail
        }
    }
    
    // ============ PUBLIC SOUNDS ============
    
    /**
     * Success beep — item scanned or added
     * Two-tone rising chirp
     */
    function success() {
        playTone(880, 0.08, 'sine', 0.15, 0);
        playTone(1320, 0.12, 'sine', 0.13, 0.06);
    }
    
    /**
     * Error sound — scan failed, item not found
     * Low buzz
     */
    function error() {
        playTone(220, 0.15, 'square', 0.12, 0);
        playTone(180, 0.20, 'square', 0.10, 0.10);
    }
    
    /**
     * Cha-ching — sale completed successfully
     * Cash register style three-note chime
     */
    function chaChing() {
        // First "cha"
        playTone(1046, 0.10, 'sine', 0.18, 0);
        playTone(1568, 0.15, 'sine', 0.14, 0.05);
        // Second "ching" — slightly lower
        playTone(1318, 0.10, 'triangle', 0.16, 0.20);
        playTone(1760, 0.25, 'triangle', 0.13, 0.26);
    }
    
    /**
     * Click — soft button press
     */
    function click() {
        playTone(600, 0.03, 'sine', 0.06, 0);
    }
    
    /**
     * Warning — for low stock alerts, etc.
     */
    function warning() {
        playTone(600, 0.15, 'triangle', 0.12, 0);
        playTone(600, 0.15, 'triangle', 0.12, 0.18);
    }
    
    /**
     * Refund sound — soft descending tone
     */
    function refund() {
        playTone(880, 0.12, 'sine', 0.15, 0);
        playTone(660, 0.12, 'sine', 0.13, 0.10);
        playTone(440, 0.25, 'sine', 0.11, 0.20);
    }
    
    /**
     * Notification — new page, action complete
     */
    function notify() {
        playTone(1318, 0.10, 'sine', 0.12, 0);
        playTone(1046, 0.12, 'sine', 0.10, 0.08);
    }
    
    // ============ ENABLE / DISABLE ============
    function setEnabled(value) {
        enabled = !!value;
        localStorage.setItem('pos_sounds_enabled', enabled ? 'true' : 'false');
    }
    
    function isEnabled() {
        return enabled;
    }
    
    function toggle() {
        setEnabled(!enabled);
        return enabled;
    }
    
    // ============ PUBLIC API ============
    return {
        success,
        error,
        chaChing,
        click,
        warning,
        refund,
        notify,
        setEnabled,
        isEnabled,
        toggle
    };
})();

// Make available globally
window.SoundEngine = SoundEngine;