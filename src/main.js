const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, session, desktopCapturer, powerMonitor } = require('electron');
const fs = require('fs');
const path = require('path');

// The UI is a small settings page, so software rendering in the main process is plenty. This drops the
// separate GPU process (about 60 % less CPU and ~25 MB less memory while sitting in the tray).
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');

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
let engineState = { running: false };
let trayKey = '';
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
    // write-then-rename so a crash or power cut can never leave a half-written settings file
    const tmp = settingsFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, settingsFile());
  } catch (e) {
    console.error('save settings failed', e);
  }
}

// The page only needs to draw (animations, meters, device list) while someone can see it.
function sendVisibility() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('ui-visible', win.isVisible() && !win.isMinimized());
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function applyAutoStart(enabled, mode) {
  // Only meaningful for the installed build; in dev it would register electron.exe.
  if (!app.isPackaged) return;
  // 'tray' = start hidden in the background, 'window' = open the window at login.
  app.setLoginItemSettings({ openAtLogin: !!enabled, args: mode === 'window' ? [] : ['--hidden'] });
}

function refreshTray() {
  if (!tray) return;
  const key = `${engineState.running}|${lang}`;
  if (key === trayKey) return; // rebuilding the menu is not free; only do it when something changed
  trayKey = key;
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
      spellcheck: false,
      enableWebSQL: false,
      backgroundThrottling: false, // keep the pulse timer exact while hidden in the tray
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!startHidden) win.show(); });
  for (const ev of ['show', 'hide', 'minimize', 'restore']) win.on(ev, sendVisibility);
  win.webContents.on('did-finish-load', sendVisibility);
  // The audio engine lives in the page. If the page dies, bring it straight back.
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('renderer gone:', details && details.reason);
    if (!quitting && win && !win.isDestroyed() && details.reason !== 'clean-exit') win.reload();
  });
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

// "Pause while other audio plays" listens to the Windows output mix through Chromium's
// loopback capture. Only our own local page may ask; the audio never leaves the renderer.
function setupLoopbackCapture() {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    const frame = request.frame;
    if (!frame || !frame.url.startsWith('file://')) return callback({});
    desktopCapturer
      .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      .then((sources) => callback({ video: sources[0], audio: 'loopback' }))
      .catch(() => callback({}));
  });
}

app.whenReady().then(() => {
  setupLoopbackCapture();
  createWindow();
  // After sleep/hibernate Windows may have reset the audio device; have the page re-check it.
  powerMonitor.on('resume', () => {
    setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.send('power-resume'); }, 3000);
  });

  const trayImg = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'tray.png'));
  tray = new Tray(trayImg);
  tray.on('click', showWindow);
  refreshTray();

  ipcMain.handle('settings:load', () => loadSettings());
  ipcMain.on('settings:save', (_e, data) => {
    saveSettings(data);
    applyAutoStart(data && data.autoStart, data && data.startMode);
  });
  ipcMain.on('engine:state', (_e, s) => {
    engineState = { running: !!(s && s.running) };
    refreshTray();
  });
  ipcMain.on('app:lang', (_e, l) => { lang = l === 'th' ? 'th' : 'en'; refreshTray(); });
  ipcMain.handle('ui:visible', () => !!win && win.isVisible() && !win.isMinimized());
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), packaged: app.isPackaged }));
  ipcMain.on('app:quit', () => { quitting = true; app.quit(); });
  ipcMain.on('app:open-external', (_e, url) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) shell.openExternal(url);
  });
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* stay alive in the tray */ });
