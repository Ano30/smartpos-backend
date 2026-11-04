# ============================================================
# SMARTPOS PORTABLE BUILDER
# ============================================================

$buildPath = "$env:USERPROFILE\Desktop\SmartPOS-Build"
$electronPath = "$buildPath\electron-app"

Write-Host "Creating Build Environment at: $buildPath" -ForegroundColor Cyan

# 1. Create Folders
New-Item -ItemType Directory -Force -Path $buildPath | Out-Null
New-Item -ItemType Directory -Force -Path $electronPath | Out-Null

# 2. Create package.json (Icon is now optional to prevent build crashes)
$pkgJson = @'
{
  "name": "smartpos-desktop",
  "version": "1.0.0",
  "description": "SmartPOS Point of Sale System",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder --win"
  },
  "author": "Ano",
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.9.1"
  },
  "build": {
    "appId": "com.smartpos.desktop",
    "productName": "SmartPOS",
    "win": {
      "target": [
        "nsis",
        "portable"
      ]
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true
    }
  }
}
'@
Set-Content -Path "$electronPath\package.json" -Value $pkgJson

# 3. Create main.js (The App Logic with Anti-Logout Shield)
$mainJs = @'
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 720,
        title: 'SmartPOS - Point of Sale System',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
            partition: 'persist:smartpos' 
        }
    });

    // LOAD THE LIVE CLOUD APP
    mainWindow.loadURL('https://smartpos-backend-gtwl.onrender.com');

    // ANTI-LOGOUT SHIELD
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.executeJavaScript(`
            const originalRemoveItem = localStorage.removeItem;
            localStorage.removeItem = function(key) {
                if (key === 'pos_token' || key === 'pos_user' || key === 'pos_company') {
                    console.log('🛡️ Electron blocked a script from deleting your login session!');
                    return; 
                }
                return originalRemoveItem.apply(this, arguments);
            };
        `).catch(err => console.log(err));
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

function createMenu() {
    const template = [
        { label: 'File', submenu: [{ label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() }, { type: 'separator' }, { role: 'quit' }] },
        { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
    createMenu();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
'@
Set-Content -Path "$electronPath\main.js" -Value $mainJs

# 4. Install and Build
Write-Host "Installing dependencies... This may take a minute." -ForegroundColor Yellow
Set-Location $electronPath
npm install

Write-Host "Building App... This will take 2-3 minutes." -ForegroundColor Yellow
npm run dist

Write-Host "==================================================" -ForegroundColor Green
Write-Host "✅ BUILD COMPLETE!" -ForegroundColor Green
Write-Host "Your apps are located in: $electronPath\dist" -ForegroundColor Cyan
Write-Host "1. SmartPOS Setup 1.0.0.exe (Installer)" -ForegroundColor White
Write-Host "2. SmartPOS 1.0.0.exe (Portable)" -ForegroundColor White
Write-Host "==================================================" -ForegroundColor Green

# 6. Open the folder for you
Start-Process explorer.exe "$electronPath\dist"
