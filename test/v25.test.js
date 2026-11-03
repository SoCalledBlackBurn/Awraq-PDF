// 2.5 features: edit text, duplicate pages, my notes, compare, combine, comment summary, focus mode, layout
const fs = require('fs'), path = require('path'); const { PDFDocument, StandardFonts, PDFName, PDFDict } = require('pdf-lib');
const { launch, kill, ok, samplePdf, focusDoc, pageCount, waitText, TMP } = require('./helpers');

/** Same as the sample, but page 2 says "red fox leaps" instead of "brown fox jumps" */
async function changedPdf(name) {
  const doc = await PDFDocument.create(), f = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 6; i++) {
    const p = doc.addPage(i === 4 ? [842, 595] : [595, 842]);
    const line = i === 2 ? `This is page ${i}. The quick red fox leaps over the lazy dog.` : `This is page ${i}. The quick brown fox jumps over the lazy dog.`;
    p.drawText(line, { x: 50, y: p.getHeight() - 80, size: 16, font: f }); p.drawText(`Secret number 12345 on page ${i}`, { x: 50, y: p.getHeight() - 120, size: 14, font: f });
  }
  const file = path.join(TMP, name); fs.writeFileSync(file, await doc.save()); return file;
}
const mockOpen = (app, files) => app.evaluate(({ dialog }, f) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: f }); }, files);
const mockSave = (app, file) => app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: f }); }, file);

module.exports = async () => {
  const F = await samplePdf('v25.pdf'), OLD = await changedPdf('v25-old.pdf');
  const { app, win, logs } = await launch({ args: [F] });
  await win.waitForSelector('.tab'); await win.waitForTimeout(1500);

  // ---- layout: one toolbar row, floating page controls
  const tb = await win.locator('#toolbar').boundingBox(); ok(tb.height < 60, 'main toolbar fits on one row at 1280px');
  ok(await win.locator('#hud').isVisible() && /6/.test(await pageCount(win)), 'floating page and zoom controls are shown');

  // ---- edit text: click a line, retype it
  await win.click('#bTools'); await win.click('button[data-tool=retype]');
  await win.locator('.page[data-page-number="1"] .textLayer span', { hasText: 'quick brown' }).first().click();
  await win.waitForSelector('.textEditor.retype');
  ok(/quick brown fox jumps over the lazy dog/.test(await win.inputValue('.textEditor.retype')), 'edit text opens with the words of the line');
  await win.fill('.textEditor.retype', 'This line was edited in Awraq.'); await win.keyboard.press('Enter'); await win.waitForTimeout(300);
  ok(/\b1 comment\b/.test(await win.textContent('#stRight')), 'edited line kept as an editable item');
  ok(/Text replaced/.test(await waitText(win, '#toast', /Text replaced/)), 'the message confirms the change');

  // ---- duplicate a page (from the thumbnail menu), then undo
  await win.click('#p-thumbs .thumb[data-n="1"]', { button: 'right' }); await win.click('#ctx button:has-text("Duplicate page")');
  await waitText(win, '#pageCount', /7/); ok(/7/.test(await pageCount(win)), 'page duplicated (7 pages)');
  ok(/\b2 comments\b/.test(await win.textContent('#stRight')), 'the page\'s edited text was duplicated with it');
  await focusDoc(win); await win.keyboard.press('Control+z'); await waitText(win, '#pageCount', /\/ 6/);
  ok(/\/ 6/.test(await pageCount(win)), 'Ctrl+Z removes the duplicate');

  // ---- save: the edited text is a real annotation covering the old line in the page colour
  await win.keyboard.press('Control+s'); await win.waitForTimeout(1500);
  const saved = await PDFDocument.load(fs.readFileSync(F)); const annots = saved.getPage(0).node.Annots(); let data = null;
  for (let i = 0; annots && i < annots.size(); i++) { const d = annots.lookup(i); const v = d instanceof PDFDict && d.get(PDFName.of('PRData')); if (v) data = JSON.parse(v.decodeText()); }
  ok(data && data.kind === 'retype' && data.text === 'This line was edited in Awraq.' && data.bg === '#ffffff' && /^#[0-3]/.test(data.color), 'saved with the new words, white cover and dark text colour');

  // ---- my notes, with page links
  await win.click('.sidetabs button[data-panel=notes]'); await win.fill('#p-notes textarea', 'Check the numbers on p. 4 before signing.'); await win.waitForTimeout(800);
  await win.click('#p-notes .prefs button'); await win.waitForTimeout(400);
  ok(/^4$/.test((await win.inputValue('#pageInput')).trim()), 'a page mentioned in a note becomes a link');
  await win.click('.sidetabs button[data-panel=thumbs]'); await win.click('.sidetabs button[data-panel=notes]');
  ok(/numbers on p\. 4/.test(await win.inputValue('#p-notes textarea')), 'notes are kept for the file');

  // ---- compare with an older version
  await mockOpen(app, [OLD]); await win.click('#bMenu'); await win.click('#menu button[data-act=compare]');
  await win.waitForSelector('#p-compare .dh', { timeout: 20000 });
  const ins = await win.locator('#p-compare ins').allTextContents(), del = await win.locator('#p-compare del').allTextContents();
  ok((await win.locator('#p-compare .dsum .pill').allTextContents()).join('|') === '1 change|2 words added|2 words removed', 'comparison finds exactly one change');
  ok(ins.join(' ').includes('brown') && ins.join(' ').includes('jumps') && del.join(' ').includes('red') && del.join(' ').includes('leaps'), 'added and removed words are told apart');
  await win.click('#p-compare .item'); await win.waitForTimeout(500); ok(/^2$/.test((await win.inputValue('#pageInput')).trim()), 'clicking the change goes to its page');

  // ---- comment summary
  const sum = path.join(TMP, 'v25-summary.txt'); await mockSave(app, sum); await win.click('#bMenu'); await win.click('#menu button[data-act=annotsummary]'); await win.waitForTimeout(800);
  const txt = fs.existsSync(sum) ? fs.readFileSync(sum, 'utf8') : '';
  ok(/Edited text/.test(txt) && /This line was edited in Awraq/.test(txt) && /Page 1/.test(txt), 'comment summary lists the edit with its page');

  // ---- focus mode
  await focusDoc(win); await win.keyboard.press('F9'); await win.waitForTimeout(200);
  ok(!(await win.locator('#toolbar').isVisible()) && await win.locator('#hud').isVisible(), 'F9 hides everything except the pages');
  await win.keyboard.press('Escape'); await win.waitForTimeout(200); ok(await win.locator('#toolbar').isVisible(), 'Esc leaves focus mode');

  // ---- combine two files into a new document
  await mockOpen(app, [F, OLD]); await win.click('#bMenu'); await win.click('#menu button[data-act=combine]');
  await win.waitForSelector('#dlg[open] .flist'); ok((await win.locator('#dlg .flist li').count()) === 2, 'combine lists the chosen files');
  await win.click('#dlgBtns .primary'); await waitText(win, '#pageCount', /12/);
  ok(/12/.test(await pageCount(win)) && (await win.locator('.tab').count()) === 2, 'files combined into a new 12-page document');

  ok(!logs.length, 'no errors in the console' + (logs.length ? ': ' + logs.join(' | ') : ''));
  await kill(app);
};
