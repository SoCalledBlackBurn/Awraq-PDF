// Crash recovery, closing a window with unsaved changes, password-protected files
const fs = require('fs'); const { execFileSync } = require('child_process');
const { launch, kill, ok, samplePdf, recoveryDir, focusDoc, pageCount, waitText, waitFor } = require('./helpers');
module.exports = async () => {
  const F = await samplePdf('recovery.pdf'); let { app, win, home } = await launch({ args: [F] });
  await win.waitForSelector('.tab'); await win.waitForTimeout(1200);
  await win.click('#p-thumbs .thumb[data-n="1"]'); await win.click('#p-thumbs .thumb[data-n="3"]', { modifiers: ['Shift'] });
  ok(await win.locator('#p-thumbs .thumb.sel').count() === 3, 'Shift+click selects a run of pages');
  await win.click('#p-thumbs .thumb[data-n="2"]', { button: 'right' }); await win.click('#ctx button.danger'); await win.waitForTimeout(1500);
  await focusDoc(win); await win.keyboard.press('Control+r');
  await win.click('#bTools'); await win.click('button[data-tool=ellipse]');
  const b = await win.locator('.page[data-page-number="1"] canvas.annotOverlay').boundingBox();
  await win.mouse.move(b.x + 60, b.y + 60); await win.mouse.down(); await win.mouse.move(b.x + 200, b.y + 160, { steps: 5 }); await win.mouse.up();
  const mirrored = await waitFor(() => recoveryDir(home) && fs.readdirSync(recoveryDir(home)).some(f => f.endsWith('.json')));
  await win.waitForTimeout(1500); // let the page bytes finish writing too
  ok(mirrored, 'unsaved work is mirrored to the recovery folder');
  await kill(app); // simulated crash
  ({ app, win } = await launch({ args: [F], home }));
  ok(/recovered/i.test(await waitText(win, '#bannerMsg', /recovered/i)), 'reopening the file offers to restore');
  await win.click('#bannerBtns button >> nth=0'); await win.waitForTimeout(2000);
  ok(await pageCount(win) === '/ 3', 'restored version has the pages deleted');
  ok(/Rotated 90/.test(await win.textContent('#stRight')) && /\b1 comment\b/.test(await win.textContent('#stRight')), 'restored rotation and comment');
  ok(await win.locator('.tab.dirty').count() === 1, 'restored file is marked unsaved');
  // closing the window asks about each unsaved file; answer "Don't save"
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  const closed = new Promise(r => app.on('close', r));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await Promise.race([closed, new Promise(r => setTimeout(r, 8000))]);
  ok(!!(await waitFor(() => !recoveryDir(home) || !fs.readdirSync(recoveryDir(home)).some(f => f.endsWith('.json')), 8000)), '"Don\'t save" discards the recovery data');
  ok(fs.readFileSync(F).length > 0 && execFileSync('qpdf', ['--show-npages', F]).toString().trim() === '6', 'the original file was left untouched');
  // password protection goes through qpdf with an argument file (password never on the command line)
  ({ app, win } = await launch({ args: [F], home }));
  await win.waitForSelector('.tab'); await win.waitForTimeout(1200);
  await win.click('#bMenu'); await win.click('#menu button[data-act=protect]'); await win.waitForSelector('#dlg[open]');
  await win.fill('#dlg input[type=password] >> nth=0', 'كلمة سر 1'); await win.fill('#dlg input[type=password] >> nth=1', 'كلمة سر 1');
  await win.click('#dlgBtns .primary'); await win.waitForTimeout(300); await focusDoc(win); await win.keyboard.press('Control+s'); await win.waitForTimeout(3000);
  const enc = execFileSync('qpdf', ['--password=كلمة سر 1', '--show-encryption', F]).toString();
  ok(/R = 6/.test(enc) && /User password = كلمة سر 1/.test(enc), 'AES-256 encryption with an Arabic password containing spaces');
  await kill(app);
  ({ app, win } = await launch({ args: [F], home }));
  await win.waitForSelector('#dlg[open]', { timeout: 20000 }); await win.fill('#dlg input[type=password]', 'كلمة سر 1'); await win.click('#dlgBtns .primary');
  await win.waitForSelector('.tab', { timeout: 20000 }); await win.waitForTimeout(1500);
  ok(/Password protected/.test(await win.textContent('#stRight')), 'protected file reopens with its password');
  await win.click('#p-thumbs .thumb[data-n="1"]', { button: 'right' }); await win.click('#ctx button.danger'); await win.waitForTimeout(4000);
  ok(!fs.readdirSync(recoveryDir(home)).some(f => f.endsWith('.json')), 'decrypted content of protected files is never written to the recovery folder');
  await kill(app);
};
