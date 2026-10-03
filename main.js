/*
 * Awraq PDF — Open Source PDF Reader & Editor
 * Copyright (C) 2026 Amr Mustafa M. M.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, protocol, net, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const pkg = require('./package.json');
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');
let S = { // strings for native dialogs; renderer replaces them with the current UI language
  unsavedTitle: 'Unsaved changes', unsavedMsg: 'Some files have unsaved changes.', unsavedDetail: 'If you quit now, your changes will be lost.',
  quit: 'Quit without saving', cancel: 'Cancel', open: 'Open PDF', save: 'Save', images: 'Images'
};

/* ---------- helpers ---------- */
function pdfArgs(argv) { return argv.slice(1).filter(a => /\.pdf$/i.test(a) && fs.existsSync(a)).map(a => path.resolve(a)); }
function readRecent() { try { return JSON.parse(fs.readFileSync(recentFile(), 'utf8')).filter(p => fs.existsSync(p)); } catch { return []; } }
function writeRecent(l) { try { fs.writeFileSync(recentFile(), JSON.stringify(l)); } catch {} }
function addRecent(p) { const l = [p, ...readRecent().filter(x => x !== p)].slice(0, 15); writeRecent(l); try { app.addRecentDocument(p); } catch {} }
function readFile(p, recent = true) { const b = fs.readFileSync(p); if (recent && /\.pdf$/i.test(p)) addRecent(p); return { path: p, name: path.basename(p), data: new Uint8Array(b.buffer, b.byteOffset, b.length) }; }

function qpdfPath() {
  if (process.platform === 'win32') {
    const p = app.isPackaged ? path.join(process.resourcesPath, 'qpdf', 'qpdf.exe') : path.join(__dirname, 'qpdf-win', 'qpdf.exe');
    return fs.existsSync(p) ? p : null;
  }
  return process.env.QPDF_BIN || 'qpdf';
}
/** Run qpdf with input bytes. args may contain the tokens {in} and {out}. */
function runQpdf(args, input) {
  return new Promise(resolve => {
    const bin = qpdfPath(); if (!bin) return resolve({ code: -1, stderr: 'qpdf not found' });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfr-'));
    const inP = path.join(dir, 'in.pdf'), outP = path.join(dir, 'out.pdf');
    if (input) fs.writeFileSync(inP, Buffer.from(input));
    const a = args.map(x => x === '{in}' ? inP : x === '{out}' ? outP : x);
    execFile(bin, a, { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof err.code === 'number' ? err.code : -1) : 0;
      let data = null; try { if (fs.existsSync(outP)) data = new Uint8Array(fs.readFileSync(outP)); } catch {}
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      resolve({ code, stdout: String(stdout || ''), stderr: String(stderr || ''), data });
    });
  });
}

/* ---------- windows, sessions, preferences ---------- */
const wins = new Set(); let lastFocused = null;
const initialFor = new Map(), adoptQueue = new Map(), sessions = new Map();
const prefsFile = () => path.join(app.getPath('userData'), 'prefs.json'), sessionFile = () => path.join(app.getPath('userData'), 'session.json');
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
let prefs = { restore: true };
let sessT; function writeSession() { clearTimeout(sessT); sessT = setTimeout(() => { try { fs.writeFileSync(sessionFile(), JSON.stringify([...sessions.values()].filter(s => s.tabs.length))); } catch {} }, 300); }
const winOf = e => BrowserWindow.fromWebContents(e.sender) || lastFocused;
const targetWin = () => (lastFocused && !lastFocused.isDestroyed() ? lastFocused : [...wins].pop()) || null;

function createWindow({ bounds = null, maximize = !bounds, files = [], session = null, adopt = null } = {}) {
  const w = new BrowserWindow({
    width: bounds?.width || 1280, height: bounds?.height || 840, ...(bounds && bounds.x != null ? { x: Math.round(bounds.x), y: Math.round(bounds.y) } : {}),
    minWidth: 720, minHeight: 480, title: 'Awraq PDF', backgroundColor: '#E4E8ED', show: false, icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: false }
  });
  const id = w.webContents.id; wins.add(w); lastFocused = w;
  initialFor.set(id, { files, session }); if (adopt) adoptQueue.set(id, adopt);
  w.loadURL('app://local/index.html');
  w.once('ready-to-show', () => { if (maximize) w.maximize(); w.show(); w.focus(); });
  w.webContents.setWindowOpenHandler(({ url }) => { if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^(https?|mailto):/i.test(url)) shell.openExternal(url); } });
  w.webContents.on('will-prevent-unload', e => {
    const c = dialog.showMessageBoxSync(w, { type: 'warning', buttons: [S.quit, S.cancel], defaultId: 1, cancelId: 1, title: S.unsavedTitle, message: S.unsavedMsg, detail: S.unsavedDetail });
    if (c === 0) e.preventDefault();
  });
  w.on('focus', () => { lastFocused = w; });
  const keepBounds = () => { const s = sessions.get(id); if (s && !w.isDestroyed()) { s.bounds = w.getNormalBounds(); s.maximized = w.isMaximized(); writeSession(); } };
  w.on('resize', keepBounds); w.on('move', keepBounds);
  w.on('close', () => { if (wins.size > 1) { sessions.delete(id); writeSession(); } });
  w.on('closed', () => { wins.delete(w); initialFor.delete(id); adoptQueue.delete(id); if (lastFocused === w) lastFocused = [...wins].pop() || null; });
  return w;
}

/* ---------- auto update (installer build + configured GitHub repo only) ---------- */
let updater = null;
function setupUpdater() {
  const repo = pkg.updates || {};
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR || !repo.owner || /YOUR_/.test(repo.owner)) return;
  try {
    const { autoUpdater } = require('electron-updater');
    updater = autoUpdater; autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true;
    const send = (state, info) => wins.forEach(w => w.webContents.send('update', { state, version: info && info.version }));
    autoUpdater.on('update-available', i => send('available', i));
    autoUpdater.on('update-not-available', i => send('none', i));
    autoUpdater.on('update-downloaded', i => send('downloaded', i));
    autoUpdater.on('error', e => send('error', { version: String(e && e.message || e) }));
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 8000);
  } catch (e) { updater = null; }
}

/* ---------- app lifecycle ---------- */
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', (_e, argv) => {
    const files = pdfArgs(argv); let w = targetWin();
    if (!w) { createWindow({ files }); return; }
    if (w.isMinimized()) w.restore(); w.focus();
    for (const p of files) w.webContents.send('open-path', p);
  });
  app.whenReady().then(() => {
    const root = path.join(__dirname, 'renderer');
    protocol.handle('app', req => {
      const u = new URL(req.url); const p = path.normalize(path.join(root, decodeURIComponent(u.pathname)));
      if (!p.startsWith(root)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(p).toString());
    });
    Menu.setApplicationMenu(null);
    prefs = Object.assign(prefs, readJSON(prefsFile(), {}));
    const files = pdfArgs(process.argv);
    const saved = prefs.restore ? readJSON(sessionFile(), []).filter(s => s && Array.isArray(s.tabs) && s.tabs.length) : [];
    if (files.length || !saved.length) createWindow({ files });
    else saved.forEach((s, i) => createWindow({ bounds: s.bounds, maximize: !!s.maximized || !s.bounds, session: s.tabs, files: [] }));
    setupUpdater();
  });
  app.on('window-all-closed', () => app.quit());
}

/* ---------- IPC ---------- */
ipcMain.handle('initial', e => { const v = initialFor.get(e.sender.id) || { files: [], session: null }; initialFor.set(e.sender.id, { files: [], session: null }); return v; });
ipcMain.handle('pending-adopt', e => { const v = adoptQueue.get(e.sender.id) || null; adoptQueue.delete(e.sender.id); return v; });
ipcMain.handle('set-prefs', (_e, p) => { prefs = Object.assign(prefs, p); try { fs.writeFileSync(prefsFile(), JSON.stringify(prefs)); } catch {} });
ipcMain.handle('session-update', (e, tabsList) => { const w = winOf(e); if (!w) return; sessions.set(e.sender.id, { tabs: tabsList, bounds: w.getNormalBounds(), maximized: w.isMaximized() }); writeSession(); });
ipcMain.handle('new-window', () => { createWindow({}); });
ipcMain.handle('close-window', e => { const w = winOf(e); if (w) setTimeout(() => w.close(), 50); });
/** A tab was dropped at a screen point: hand it to the window under the point, or open a new window there */
ipcMain.handle('tab-drop', (e, { screenX, screenY, payload, allowNew, forceNew }) => {
  const src = winOf(e);
  if (!forceNew && !screenX && !screenY) { const c = screen.getCursorScreenPoint(); screenX = c.x; screenY = c.y; }
  if (!forceNew) {
    const target = [...wins].find(w => w !== src && !w.isDestroyed() && !w.isMinimized() && (() => { const b = w.getBounds(); return screenX >= b.x && screenX <= b.x + b.width && screenY >= b.y && screenY <= b.y + b.height; })());
    if (target) { const cb = target.getContentBounds(); payload.dropClientX = screenX - cb.x; target.webContents.send('adopt-tab', payload); target.focus(); return { moved: true, merged: true }; }
    if (!allowNew) return { moved: false };
  }
  const sb = src ? src.getNormalBounds() : { width: 1100, height: 780, x: 100, y: 100 };
  const width = Math.min(sb.width, 1200), height = Math.min(sb.height, 860);
  const x = forceNew ? sb.x + 40 : screenX - 140, y = forceNew ? sb.y + 40 : screenY - 18;
  const wa = screen.getDisplayNearestPoint({ x: Math.round(x + 140), y: Math.round(y + 18) }).workArea; // keep the new window on screen
  const cx = Math.max(wa.x, Math.min(x, wa.x + wa.width - width)), cy = Math.max(wa.y, Math.min(y, wa.y + wa.height - height));
  createWindow({ bounds: { x: cx, y: cy, width: Math.min(width, wa.width), height: Math.min(height, wa.height) }, maximize: false, adopt: payload });
  return { moved: true, merged: false };
});
ipcMain.handle('strings', (_e, s) => { S = { ...S, ...s }; });
ipcMain.handle('recent', () => readRecent());
ipcMain.handle('recent-remove', (_e, p) => { const l = readRecent().filter(x => x !== p); writeRecent(l); return l; });
ipcMain.handle('read-path', (_e, p) => readFile(p));
ipcMain.handle('exists', (_e, p) => { try { return fs.existsSync(p); } catch { return false; } });
ipcMain.handle('open-dialog', async (_e, o = {}) => {
  const r = await dialog.showOpenDialog(winOf(_e), { title: o.title || S.open, properties: ['openFile', ...(o.multi === false ? [] : ['multiSelections'])], filters: o.filters || [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled) return [];
  return r.filePaths.map(p => readFile(p, !o.raw));
});
ipcMain.handle('save-dialog', async (_e, { defaultPath, data, filters }) => {
  const r = await dialog.showSaveDialog(winOf(_e), { title: S.save, defaultPath, filters: filters || [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(data)); if (/\.pdf$/i.test(r.filePath)) addRecent(r.filePath);
  return { path: r.filePath, name: path.basename(r.filePath) };
});
ipcMain.handle('write-path', (_e, { path: p, data }) => { fs.writeFileSync(p, Buffer.from(data)); return true; });
ipcMain.handle('show-in-folder', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('set-title', (e, t) => { const w = winOf(e); if (w) w.setTitle(t); });
ipcMain.handle('confirm', (_e, { message, detail, buttons }) => dialog.showMessageBoxSync(winOf(_e), { type: 'question', buttons, defaultId: 0, cancelId: buttons.length - 1, message, detail }));
ipcMain.handle('qpdf', (_e, { args, input }) => runQpdf(args, input));
ipcMain.handle('qpdf-available', async () => (await runQpdf(['--version'])).code === 0);
ipcMain.handle('app-info', () => ({ version: app.getVersion(), updates: !!updater, portable: !!process.env.PORTABLE_EXECUTABLE_DIR }));
ipcMain.handle('check-update', async () => { if (!updater) return false; try { await updater.checkForUpdates(); return true; } catch { return false; } });
ipcMain.handle('install-update', () => { if (updater) updater.quitAndInstall(); });

/* ---------- printing: the renderer sends finished page images, we print them in a hidden window ---------- */
const printJobs = new Map();
ipcMain.handle('printers', async (_e) => { try { return (await _e.sender.getPrintersAsync()).map(p => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault })); } catch { return []; } });
ipcMain.handle('print-begin', () => { const id = Math.random().toString(36).slice(2); printJobs.set(id, { dir: fs.mkdtempSync(path.join(os.tmpdir(), 'pdfr-print-')), files: [] }); return id; });
ipcMain.handle('print-add', (_e, { id, index, data }) => { const j = printJobs.get(id); if (!j) return false; const f = path.join(j.dir, `p${String(index).padStart(5, '0')}.jpg`); fs.writeFileSync(f, Buffer.from(data)); j.files[index] = f; return true; });
ipcMain.handle('print-cancel', (_e, id) => { const j = printJobs.get(id); if (j) { try { fs.rmSync(j.dir, { recursive: true, force: true }); } catch {} printJobs.delete(id); } });
ipcMain.handle('print-run', async (_e, { id, opts }) => {
  const j = printJobs.get(id); if (!j) return { ok: false, reason: 'no job' };
  const orient = opts.landscape ? 'landscape' : 'portrait';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: ${opts.pageSize} ${orient}; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .p { width: 100%; height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; break-after: page; page-break-after: always; }
    .p:last-child { break-after: auto; page-break-after: auto; }
    img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  </style></head><body>${j.files.filter(Boolean).map(f => `<div class="p"><img src="${pathToFileURL(f).href}"></div>`).join('')}</body></html>`;
  const htmlPath = path.join(j.dir, 'print.html'); fs.writeFileSync(htmlPath, html);
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  try {
    await pw.loadFile(htmlPath);
    await pw.webContents.executeJavaScript('Promise.all([...document.images].map(i => i.decode().catch(() => {}))).then(() => true)');
    if (opts.toPdf) { // used for testing / "save what would be printed"
      const data = await pw.webContents.printToPDF({ pageSize: opts.pageSize, landscape: !!opts.landscape, printBackground: true, margins: opts.marginType === 'none' ? { marginType: 'none' } : { marginType: 'default' } });
      fs.writeFileSync(opts.toPdf, data); return { ok: true };
    }
    const po = { silent: !opts.system, printBackground: true, copies: opts.copies || 1, landscape: !!opts.landscape, color: opts.color !== false, pageSize: opts.pageSize,
      margins: { marginType: opts.marginType === 'none' ? 'none' : 'printableArea' }, duplexMode: opts.duplexMode || 'simplex', collate: true };
    if (opts.deviceName && !opts.system) po.deviceName = opts.deviceName;
    return await new Promise(res => pw.webContents.print(po, (ok, reason) => res({ ok, reason: reason || '' })));
  } catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
  finally { setTimeout(() => { try { pw.destroy(); } catch {} try { fs.rmSync(j.dir, { recursive: true, force: true }); } catch {} printJobs.delete(id); }, 1500); }
});
