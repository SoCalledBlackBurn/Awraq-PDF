// OCR on a scanned page, then undo it
const fs = require('fs'), path = require('path'); const { execFileSync } = require('child_process'); const { PDFDocument } = require('pdf-lib');
const { launch, kill, ok, samplePdf, focusDoc, waitText, TMP } = require('./helpers');
module.exports = async () => {
  const src = await samplePdf('toscan.pdf'); execFileSync('pdftoppm', ['-r', '150', '-f', '1', '-l', '1', '-png', '-singlefile', src, path.join(TMP, 'scan')]);
  const d = await PDFDocument.create(), img = await d.embedPng(fs.readFileSync(path.join(TMP, 'scan.png'))); d.addPage([595, 842]).drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
  const F = path.join(TMP, 'scan.pdf'); fs.writeFileSync(F, await d.save());
  const { app, win } = await launch({ args: [F] }); await win.waitForSelector('.tab'); await win.waitForTimeout(1200);
  await win.click('#bMenu'); await win.click('#menu button[data-act=ocr]'); await win.waitForSelector('#dlg[open]'); await win.click('#dlgBtns .primary');
  ok(!!(await waitText(win, '#toast', /Text recognized/, 120000)), 'OCR finishes');
  await win.keyboard.press('Control+f'); await win.fill('#q', 'quick brown');
  ok(!!(await waitText(win, '#qinfo', /1 of 1/, 15000)), 'recognized text is searchable');
  await win.keyboard.press('Escape'); await focusDoc(win); await win.keyboard.press('Control+z'); await win.waitForTimeout(1500);
  await win.keyboard.press('Control+f'); await win.fill('#q', 'quick brown');
  ok(!!(await waitText(win, '#qinfo', /No results/, 15000)), 'Ctrl+Z removes the text layer again');
  await kill(app);
};
