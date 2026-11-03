// Watermark, inserting images as pages, outside changes, copying comments, undo from the toast, resizable sidebar
const fs = require('fs'), path = require('path'); const { execFileSync } = require('child_process'); const { PDFDocument } = require('pdf-lib');
const { launch, kill, ok, samplePdf, focusDoc, pageCount, waitText, TMP } = require('./helpers');
module.exports = async () => {
  const F = await samplePdf('features.pdf'); const { app, win, logs } = await launch({ args: [F] });
  await win.waitForSelector('.tab'); await win.waitForTimeout(1500);
  // watermark with live preview
  await win.click('#bMenu'); await win.click('#menu button[data-act=watermark]'); await win.waitForSelector('#dlg[open] canvas.wmprev');
  await win.fill('#dlg textarea', 'سري — DRAFT'); await win.waitForTimeout(600);
  const px = await win.locator('canvas.wmprev').screenshot(); const pv = (await win.locator('canvas.wmprev').boundingBox()); ok(px.length > 2000 && pv.width > 100, 'watermark preview is drawn');
  await win.screenshot({ path: path.join(TMP, 'watermark-dialog.png') });
  await win.click('#dlgBtns .primary'); ok(/Watermark added to 6 pages/.test(await waitText(win, '#toast', /Watermark added/)), 'watermark added to all 6 pages');
  ok(await win.locator('#toast button').count() === 1, 'the message offers Undo');
  await win.click('#toast button'); await win.waitForTimeout(1500);
  ok(await win.locator('#toast button').count() === 0 || !(await win.locator('#toast.show').count()), 'Undo from the message removes it');
  await focusDoc(win); await win.keyboard.press('Control+y'); await win.waitForTimeout(1500);
  // insert two images after page 1
  execFileSync('pdftoppm', ['-r', '30', '-f', '2', '-l', '3', '-png', F, path.join(TMP, 'img')]);
  const imgs = fs.readdirSync(TMP).filter(f => /^img.*\.png$/.test(f)).map(f => path.join(TMP, f));
  await app.evaluate(({ dialog }, files) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files }); }, imgs);
  await win.click('#p-thumbs .thumb[data-n="1"]'); await win.click('#bMenu'); await win.click('#menu button[data-act=insertimg]'); await win.waitForSelector('#dlg[open]');
  await win.click('#dlgBtns .primary'); await waitText(win, '#toast', /pages added/);
  ok(await pageCount(win) === '/ 8', 'two images inserted as pages (8 pages)');
  // comments: draw, copy to all pages, nudge, undo
  await win.click('#p-thumbs .thumb[data-n="1"]'); await win.waitForTimeout(800); await win.screenshot({ path: path.join(TMP, 'after-insert.png') });
  await win.click('#bTools'); await win.click('button[data-tool=rect]');
  const b = await win.locator('.page[data-page-number="1"] canvas.annotOverlay').boundingBox();
  await win.mouse.move(b.x + 100, b.y + 150); await win.mouse.down(); await win.mouse.move(b.x + 200, b.y + 220, { steps: 4 }); await win.mouse.up(); await win.waitForTimeout(200);
  await win.click('button[data-tool=edit]'); await win.mouse.click(b.x + 100, b.y + 185, { button: 'right' }); await win.waitForSelector('#ctx:not([hidden])');
  const items = await win.locator('#ctx button span').allTextContents(); ok(items.includes('Copy to all pages') && items.includes('Duplicate'), 'right-clicking a comment shows its menu');
  await win.click('#ctx button:has-text("Copy to all pages")'); await win.waitForTimeout(400);
  ok(/8 comments/.test(await win.textContent('#stRight')), 'comment copied onto every page (8 comments)');
  await win.mouse.click(b.x + 100, b.y + 185); for (let i = 0; i < 5; i++) await win.keyboard.press('Shift+ArrowRight');
  ok(await win.locator('.tab.dirty').count() === 1, 'arrow keys nudge the selected comment');
  await win.keyboard.press('Control+z'); await win.keyboard.press('Control+z'); await win.waitForTimeout(300);
  ok(/\b1 comment\b/.test(await win.textContent('#stRight')), 'nudges are one undo step; then copying is undone');
  await win.keyboard.press('Escape');
  // save, then another program changes the file
  await focusDoc(win); await win.keyboard.press('Control+s'); await waitText(win, '#toast', /Saved/); await win.waitForTimeout(1500);
  ok(await win.locator('#banner:not([hidden])').count() === 0, 'our own save is not reported as an outside change');
  const d = await PDFDocument.load(fs.readFileSync(F)); d.removePage(0); fs.writeFileSync(F, await d.save());
  ok(/changed by another program/.test(await waitText(win, '#bannerMsg', /another program/, 8000)), 'an outside change is noticed');
  await win.click('#bannerBtns button >> nth=0'); await waitText(win, '#toast', /Reloaded/);
  ok(await pageCount(win) === '/ 7', 'Reload shows the new version (7 pages)');
  // sidebar resize grows thumbnails
  const w0 = (await win.locator('#p-thumbs .thumb .tc').first().boundingBox()).width, g = await win.locator('#sideGrip').boundingBox();
  await win.mouse.move(g.x + 2, g.y + 200); await win.mouse.down(); await win.mouse.move(g.x + 150, g.y + 200, { steps: 5 }); await win.mouse.up(); await win.waitForTimeout(800);
  ok((await win.locator('#p-thumbs .thumb .tc').first().boundingBox()).width > w0 + 100, 'dragging the sidebar edge enlarges the thumbnails');
  // search results listed in the sidebar
  await focusDoc(win); await win.keyboard.press('Control+f'); await win.fill('#q', 'secret number'); await win.click('#qList');
  ok(/^5 results/.test(await waitText(win, '#p-results .rhead', /results/)), 'search lists every result in the sidebar (5 text pages left)');
  ok(await win.locator('#p-results mark').count() === 5, 'each result highlights the match');
  await win.click('#p-results .item >> nth=4'); await win.waitForTimeout(600); ok((await win.inputValue('#pageInput')) === '7', 'clicking a result goes to its page');
  // closing everything shows recent files as cards with a preview, and pins
  await win.waitForTimeout(1500); await win.keyboard.press('Escape'); await focusDoc(win); await win.keyboard.press('Control+w'); await win.waitForSelector('#recentList li');
  ok(await win.locator('#searchbar.open').count() === 0, 'search bar closes with the last document');
  ok(await win.locator('#recentList li img').count() === 1, 'recent file card shows a first-page preview');
  await win.hover('#recentList li'); await win.click('#recentList li button.pin'); ok(await win.locator('#recentList li.pinned').count() === 1, 'files can be pinned');
  ok(!logs.length, 'no errors in the console' + (logs.length ? ': ' + logs.join(' | ') : ''));
  await kill(app);
};
