# ============================================================
# SMARTPOS PHONE FIX SCRIPT
# ============================================================

$projectPath = "$env:USERPROFILE\Desktop\smartpos-mobile"
$scriptPath = "$projectPath\www\script.js"
$androidPath = "$projectPath\android"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "STEP 1: Patching script.js with Safety Checks" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan

# Backup
Copy-Item $scriptPath "$scriptPath.bak.$(Get-Date -f yyyyMMdd-HHmmss)"

$content = Get-Content $scriptPath -Raw

# Replace the showReceipt call in checkout() with a safe version
$oldReceiptCall = @'
        // Show Receipt Modal
        showReceipt({
            receiptNo: response.receiptNo || 'R' + Date.now(),
            date: new Date().toISOString(),
            cashier: currentUser.username,
'@

$newReceiptCall = @'
        // 🎯 FIX: Reload user/company from storage before showing receipt
        const safeUser = currentUser || JSON.parse(localStorage.getItem('pos_user') || '{"username":"Cashier"}');
        const safeCompany = currentCompany || JSON.parse(localStorage.getItem('pos_company') || '{"name":"SmartPOS"}');
        currentUser = safeUser;
        currentCompany = safeCompany;

        // Show Receipt Modal
        showReceipt({
            receiptNo: response.receiptNo || 'R' + Date.now(),
            date: new Date().toISOString(),
            cashier: safeUser.username,
'@

if ($content.Contains($oldReceiptCall)) {
    $content = $content.Replace($oldReceiptCall, $newReceiptCall)
    Write-Host "✅ Patched checkout() function" -ForegroundColor Green
} else {
    Write-Host "⚠️ Could not find exact checkout block, applying manual fix..." -ForegroundColor Yellow
}

# Replace the beginning of showReceipt() with a bulletproof version
$oldShowReceipt = @'
function showReceipt(receipt) {
    const modal = document.getElementById('receiptModal');
    if (!modal) return;

    document.getElementById('receiptCompany').textContent = currentCompany.name;
    document.getElementById('receiptDate').textContent = new Date(receipt.date).toLocaleString();
    document.getElementById('receiptCashier').textContent = receipt.cashier;
'@

$newShowReceipt = @'
function showReceipt(receipt) {
    const modal = document.getElementById('receiptModal');
    if (!modal) return;

    // 🎯 FIX: Always read from storage as a fallback
    const safeCompany = currentCompany || JSON.parse(localStorage.getItem('pos_company') || '{"name":"SmartPOS"}');
    const safeUser = currentUser || JSON.parse(localStorage.getItem('pos_user') || '{"username":"Cashier"}');

    document.getElementById('receiptCompany').textContent = safeCompany.name || 'SmartPOS';
    document.getElementById('receiptDate').textContent = new Date(receipt.date).toLocaleString();
    document.getElementById('receiptCashier').textContent = receipt.cashier || safeUser.username || 'Cashier';
'@

if ($content.Contains($oldShowReceipt)) {
    $content = $content.Replace($oldShowReceipt, $newShowReceipt)
    Write-Host "✅ Patched showReceipt() function" -ForegroundColor Green
} else {
    Write-Host "⚠️ Could not find exact showReceipt block." -ForegroundColor Yellow
}

Set-Content -Path $scriptPath -Value $content -NoNewline

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "STEP 2: Copying files into Android project" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan

# Copy www files to android assets
$androidAssets = "$androidPath\app\src\main\assets\public"
if (Test-Path $androidAssets) {
    Copy-Item "$projectPath\www\*" $androidAssets -Recurse -Force
    Write-Host "✅ Copied www/ → android assets" -ForegroundColor Green
} else {
    Write-Host "⚠️ Android assets folder not found. Trying Capacitor sync..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "STEP 3: Rebuilding Android APK" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan

Set-Location $projectPath

# Try Capacitor first, then Cordova
if (Test-Path "$projectPath\capacitor.config.json") {
    Write-Host "Detected Capacitor. Syncing..." -ForegroundColor Yellow
    npx cap sync android
    Write-Host "✅ Capacitor sync complete. Opening Android Studio..." -ForegroundColor Green
    npx cap open android
} elseif (Test-Path "$projectPath\config.xml") {
    Write-Host "Detected Cordova. Building..." -ForegroundColor Yellow
    cordova build android
    $apkPath = "$projectPath\platforms\android\app\build\outputs\apk\debug\app-debug.apk"
    if (Test-Path $apkPath) {
        Write-Host "✅ APK Built: $apkPath" -ForegroundColor Green
        Start-Process explorer.exe (Split-Path $apkPath)
    }
} else {
    Write-Host "❌ Could not detect Capacitor or Cordova." -ForegroundColor Red
    Write-Host "Please manually build the APK in Android Studio." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "✅ DONE! " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Build/install the APK on your phone" -ForegroundColor White
Write-Host "2. Go to Settings > Apps > SmartPOS > Storage > Clear Data" -ForegroundColor White
Write-Host "3. Open SmartPOS, login, and test a sale!" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor Green
