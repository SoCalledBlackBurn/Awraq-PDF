/*
 * Awraq PDF — end-to-end test helpers. Tests drive the real app through Playwright's Electron support.
 * Linux: run under a virtual display, e.g.  xvfb-run -a npm test   (needs qpdf and poppler-utils installed)
 */
const { _electron: electron } = require('playwright-core');
const path = require('path'), fs = require('fs'), os = require('os');
const { PDFDocument, StandardFonts, degrees } = require('pdf-lib');
const APP = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'awraq-test-'));

let failures = 0;
function ok(cond, msg) { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) { failures++; process.exitCode = 1; } }
const failed = () => failures;

/** Launch the app with its own empty profile (HOME), optionally reusing one to test what survives a restart */
async function launch({ args = [], home } = {}) {
  home = home || fs.mkdtempSync(path.join(TMP, 'home-'));
  const app = await electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', APP, ...args],
    env: { ...process.env, HOME: home, APPDATA: home, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' }, timeout: 60000 });
  const win = await app.firstWindow(); const logs = [];
  win.on('console', m => { if (m.type() === 'error') logs.push(m.text()); }); win.on('pageerror', e => logs.push(e.message));
  return { app, win, logs, home };
}
const kill = app => { try { app.process().kill('SIGKILL'); } catch {} return new Promise(r => setTimeout(r, 800)); };
const recoveryDir = home => [path.join(home, '.config', 'Awraq PDF', 'recovery'), path.join(home, 'Awraq PDF', 'recovery')].find(d => fs.existsSync(d)) || '';
const focusDoc = win => win.locator('.vc:not([hidden])').focus();
const pageCount = async win => (await win.textContent('#pageCount')).trim();
async function waitText(win, sel, re, ms = 20000) { for (let t = 0; t < ms; t += 250) { const s = await win.textContent(sel).catch(() => ''); if (re.test(s)) return s; await win.waitForTimeout(250); } return ''; }

/** A 6-page document: page 4 is landscape, page 5 has /Rotate 90 */
async function samplePdf(name = 'sample.pdf') {
  const doc = await PDFDocument.create(), f = await doc.embedFont(StandardFonts.Helvetica);
  doc.setTitle('Sample Title'); doc.setAuthor('Original Author');
  for (let i = 1; i <= 6; i++) {
    const p = doc.addPage(i === 4 ? [842, 595] : [595, 842]); if (i === 5) p.setRotation(degrees(90));
    p.drawText(`This is page ${i}. The quick brown fox jumps over the lazy dog.`, { x: 50, y: p.getHeight() - 80, size: 16, font: f });
    p.drawText(`Secret number 12345 on page ${i}`, { x: 50, y: p.getHeight() - 120, size: 14, font: f });
  }
  const file = path.join(TMP, name); fs.writeFileSync(file, await doc.save()); return file;
}
module.exports = { launch, kill, ok, failed, samplePdf, recoveryDir, focusDoc, pageCount, waitText, TMP, APP };
