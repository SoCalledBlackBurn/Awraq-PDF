// Safe saving: the original is never half-written, and a locked file gets a clear message
const fs = require('fs'), path = require('path');
const { launch, kill, ok, samplePdf, focusDoc, TMP, APP } = require('./helpers');
module.exports = async () => {
  // the main-process write function, on its own
  const src = fs.readFileSync(path.join(APP, 'main.js'), 'utf8'), a = src.indexOf('const selfWrites'), b = src.indexOf('\n}\n', src.indexOf('function writeFileSafe0')) + 3;
  const fingerprint = () => '', writeFileSafe = new Function('fs', 'path', 'crypto', 'fingerprint', src.slice(a, b) + '; return writeFileSafe;')(fs, path, require('crypto'), fingerprint);
  const d = path.join(TMP, 'w'); fs.mkdirSync(d); const f = path.join(d, 'a.pdf'); fs.writeFileSync(f, 'OLD');
  writeFileSafe(f, Buffer.from('NEW')); ok(fs.readFileSync(f, 'utf8') === 'NEW' && fs.readdirSync(d).length === 1, 'atomic write replaces the file and leaves nothing behind');
  // a file locked by another program (simulated: Windows reports EBUSY)
  const F = await samplePdf('locked.pdf'), before = fs.readFileSync(F); const { app, win } = await launch({ args: [F] });
  await win.waitForSelector('.tab'); await win.waitForTimeout(1200);
  await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('write-path'); ipcMain.handle('write-path', () => { const e = new Error("EBUSY: resource busy or locked, open 'x.pdf'"); e.code = 'EBUSY'; throw e; }); });
  await win.click('#p-thumbs .thumb[data-n="2"]', { button: 'right' }); await win.click('#ctx button.danger'); await win.waitForTimeout(1200);
  await focusDoc(win); await win.keyboard.press('Control+s'); await win.waitForSelector('#dlg[open]', { timeout: 8000 });
  ok(/open in another program/.test(await win.textContent('#dlgBody')), 'locked file: the message says what to do');
  ok(/Save as/.test(await win.textContent('#dlgBtns')), 'locked file: offers "Save as…"');
  ok(await win.locator('.tab.dirty').count() === 1 && fs.readFileSync(F).equals(before), 'locked file: changes kept, original untouched');
  await kill(app);
};
