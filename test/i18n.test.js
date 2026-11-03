// Every interface string must exist in every language
const fs = require('fs'), vm = require('vm'), path = require('path'); const { ok } = require('./helpers');
module.exports = async () => {
  const R = path.join(__dirname, '..', 'renderer'), ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(R, 'i18n.js'), 'utf8'), ctx); const I = ctx.window.I18N;
  const js = fs.readFileSync(path.join(R, 'app.js'), 'utf8'), html = fs.readFileSync(path.join(R, 'index.html'), 'utf8'), keys = new Set(), unq = s => s.replace(/\\(['"\\])/g, '$1');
  for (const m of js.matchAll(/\btn?\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(unq(m[1]));
  const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
  for (const m of html.matchAll(/<[^>]*data-t[^>]*>([^<]+)</g)) keys.add(dec(m[1]));
  for (const m of html.matchAll(/(?:title|placeholder|aria-label)="([^"]+)"/g)) keys.add(dec(m[1]));
  for (const l of I.languages) { if (l.code === 'en') continue; const miss = [...keys].filter(k => !(k in I.dict[l.code]) && /[A-Za-z]/.test(k) && !/^(Awraq PDF)$/.test(k)); ok(!miss.length, `${l.name}: all ${keys.size} strings translated` + (miss.length ? ' — missing: ' + miss.join(' | ') : '')); }
};
