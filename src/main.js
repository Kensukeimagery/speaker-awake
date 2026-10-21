const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// Let the hidden window keep playing without a user gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const startHidden = process.argv.includes('--hidden');
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

let win = null;
let tray = null;
let quitting = false;
let engineState = { running: false, mode: 'ultrasonic' };
let lang = 'en';

const TRAY_TEXT = {
  en: { open: 'Open Speaker Awake', start: 'Start keeping awake', stop: 'Pause', quit: 'Quit',
        on: 'Speaker Awake – running', off: 'Speaker Awake – paused' },
  th: { open: 'เปิด Speaker Awake', start: 'เริ่มกันลำโพงหลับ', stop: 'หยุดชั่วคราว', quit: 'ออกจากโปรแกรม',
        on: 'Speaker Awake – กำลังทำงาน', off: 'Speaker Awake – หยุดอยู่' },
};

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
  } catch {
    return null;
  }
}

function saveSettings(data) {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('save settings failed', e);
  }
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function applyAutoStart(enabled) {
  // Only meaningful for the installed build; in dev it would register electron.exe.
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!enabled, args: ['--hidden'] });
}

function refreshTray() {
  if (!tray) return;
  const t = TRAY_TEXT[lang] || TRAY_TEXT.en;
  tray.setToolTip(engineState.running ? t.on : t.off);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t.open, click: showWindow },
    { label: engineState.running ? t.stop : t.start,
      click: () => win && win.webContents.send('toggle-running') },
    { type: 'separator' },
    { label: t.quit, click: () => { quitting = true; app.quit(); } },
  ]));
}

function createWindow() {
  win = new BrowserWindow({
    width: 520,
    height: 780,
    minWidth: 440,
    minHeight: 600,
    show: false,
    backgroundColor: '#0e1016',
    title: 'Speaker Awake',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0e1016', symbolColor: '#e8eaf2', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // keep the pulse timer exact while hidden in the tray
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!startHidden) win.show(); });
  win.on('close', (e) => {
    if (!quitting) { e.preventDefault(); win.hide(); }
  });
  // Never navigate the app window away or open new windows; links go to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

app.on('second-instance', showWindow);

app.whenReady().then(() => {
  createWindow();

  const trayImg = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'tray.png'));
  tray = new Tray(trayImg);
  tray.on('click', showWindow);
  refreshTray();

  ipcMain.handle('settings:load', () => loadSettings());
  ipcMain.on('settings:save', (_e, data) => {
    saveSettings(data);
    applyAutoStart(data && data.autoStart);
  });
  ipcMain.on('engine:state', (_e, s) => {
    engineState = s;
    refreshTray();
  });
  ipcMain.on('app:lang', (_e, l) => { lang = l === 'th' ? 'th' : 'en'; refreshTray(); });
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), packaged: app.isPackaged }));
  ipcMain.on('app:quit', () => { quitting = true; app.quit(); });
  ipcMain.on('app:open-external', (_e, url) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url);
  });
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* stay alive in the tray */ });
