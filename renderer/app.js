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
'use strict';
(() => {
const $ = id => document.getElementById(id);
const N = window.native || null;
const L = pdfjsLib, V = pdfjsViewer, PL = PDFLib;
L.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
const DPR = () => Math.min(window.devicePixelRatio || 1, 3);
const ARABIC = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const uid = () => Math.random().toString(36).slice(2, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

/* ================= i18n ================= */
const LANGS = I18N.languages;
let lang = store.get('lang') || (() => { const n = (navigator.language || 'en').slice(0, 2); return LANGS.some(l => l.code === n) ? n : 'en'; })();
const langInfo = () => LANGS.find(l => l.code === lang) || LANGS[0];
const LOC = () => langInfo().locale;
function t(key, vars) {
  let s = (I18N.dict[lang] && I18N.dict[lang][key]) || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(v);
  return s;
}
const num = n => Number(n).toLocaleString(LOC());
function applyI18n() {
  const li = langInfo(); document.documentElement.lang = li.code; document.documentElement.dir = li.dir;
  document.querySelectorAll('[data-t]').forEach(e => { if (!e.dataset.k) e.dataset.k = e.textContent.trim(); e.textContent = t(e.dataset.k); });
  document.querySelectorAll('[title]').forEach(e => { if (!e.dataset.kt) e.dataset.kt = e.title; e.title = t(e.dataset.kt); });
  document.querySelectorAll('[placeholder]').forEach(e => { if (!e.dataset.kp) e.dataset.kp = e.placeholder; e.placeholder = t(e.dataset.kp); });
  document.querySelectorAll('[aria-label]').forEach(e => { if (!e.dataset.ka) e.dataset.ka = e.getAttribute('aria-label'); e.setAttribute('aria-label', t(e.dataset.ka)); });
  N && N.strings({ unsavedTitle: t('Unsaved changes'), unsavedMsg: t('Some files have unsaved changes.'), unsavedDetail: t('If you quit now, your changes will be lost.'), quit: t('Quit without saving'), cancel: t('Cancel'), open: t('Open PDF'), save: t('Save'), images: t('Images') });
  $('toolHint').textContent = t(TOOL_HINTS[tool.name] || '');
  if (T()) { renderTabs(); syncUI(); rebuildSide(); } else { renderRecent(); N && N.setTitle(t('Awraq PDF')); }
}

/* ================= UI helpers ================= */
function toast(msg, ms = 2400) { const e = $('toast'); e.textContent = msg; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('show'), ms); }
function busy(msg, frac) { $('busyMsg').textContent = msg || ''; $('busy').hidden = !msg; const b = $('busyBar'); b.classList.toggle('on', frac != null); if (frac != null) b.firstElementChild.style.width = Math.round(frac * 100) + '%'; }
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c != null) e.append(c);
  return e;
}
function icon(name) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'i'); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#i-' + name); s.append(u); return s; }
function modal(title, body, buttons = [{ label: t('OK'), value: true, primary: true }], onOpen) {
  return new Promise(res => {
    const d = $('dlg'); $('dlgTitle').textContent = title;
    const b = $('dlgBody'); b.innerHTML = ''; if (typeof body === 'string') b.append(el('p', { text: body, style: 'line-height:1.7;white-space:pre-line' })); else if (body) b.append(body);
    const bb = $('dlgBtns'); bb.innerHTML = ''; let result = null;
    buttons.forEach(btn => bb.append(el('button', { type: 'button', class: btn.primary ? 'primary' : (btn.danger ? 'danger' : ''), text: btn.label,
      onclick: async () => { if (btn.check && !(await btn.check())) return; result = btn.value; d.close(); } })));
    const done = () => { d.removeEventListener('close', done); res(result); };
    d.addEventListener('close', done);
    $('dlgForm').onsubmit = e => { e.preventDefault(); const p = bb.querySelector('.primary'); p && p.click(); };
    d.showModal(); onOpen && onOpen(d);
  });
}
async function prompt(title, label, value = '', { multiline = false, hint = '', type = 'text' } = {}) {
  const inp = multiline ? el('textarea', { dir: 'auto' }) : el('input', { type, dir: 'auto' }); inp.value = value;
  const f = el('div', { class: 'field' }, label ? el('label', { text: label }) : null, inp, hint ? el('div', { class: 'hint', text: hint }) : null);
  const r = await modal(title, f, [{ label: t('OK'), value: 'ok', primary: true }, { label: t('Cancel'), value: null }], () => { inp.focus(); inp.select && inp.select(); });
  return r ? inp.value : null;
}
async function confirmBox(message, detail, buttons) {
  if (N) return N.confirm({ message, detail, buttons });
  const r = await modal(message, detail, buttons.map((l, i) => ({ label: l, value: i, primary: i === 0 }))); return r ?? buttons.length - 1;
}
function parseRange(s, max) {
  const out = new Set();
  for (const part of s.split(/[,،\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part.trim()); if (!m) return null;
    let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a]; if (a < 1 || b > max) return null;
    for (let i = a; i <= b; i++) out.add(i);
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}
function hasSeq(bytes, str) {
  const s = [...str].map(c => c.charCodeAt(0)), n = bytes.length - s.length;
  outer: for (let i = 0; i <= n; i++) { if (bytes[i] !== s[0]) continue; for (let j = 1; j < s.length; j++) if (bytes[i + j] !== s[j]) continue outer; return true; }
  return false;
}

/* ================= settings / theme ================= */
const settings = Object.assign({ theme: 'system', restore: true, author: '', rate: 1 }, store.get('settings', {}));
function applyTheme() { const d = settings.theme === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : settings.theme === 'dark'; document.documentElement.dataset.theme = d ? 'dark' : 'light'; }
applyTheme(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
if (store.get('night')) document.body.classList.add('night');
function toggleNight() { const on = document.body.classList.toggle('night'); store.set('night', on); $('bNight').setAttribute('aria-pressed', on); }
$('bNight').setAttribute('aria-pressed', document.body.classList.contains('night'));
let qpdfOK = null;
const hasQpdf = async () => qpdfOK ?? (qpdfOK = N ? await N.qpdfAvailable() : false);

/* ================= tabs / documents ================= */
const tabs = []; let active = null;
const T = () => active;

async function openFiles() {
  if (N) { const files = await N.openDialog({}); for (const f of files) await openData(f.data, f.name, f.path); }
  else { const i = el('input', { type: 'file', accept: '.pdf', multiple: true }); i.onchange = async () => { for (const f of i.files) await openData(new Uint8Array(await f.arrayBuffer()), f.name, ''); }; i.click(); }
}
async function openPath(p, page) {
  const ex = tabs.find(x => x.path === p); if (ex) { activate(ex); return; }
  try { const f = await N.readPath(p); await openData(f.data, f.name, f.path, page ? { page } : null); }
  catch (e) { toast(t('Could not open the file: {p}', { p })); await N.recentRemove(p); renderRecent(); }
}
function loadPdf(bytes, password) {
  return new Promise((resolve, reject) => {
    const task = L.getDocument({ data: bytes.slice(), password, cMapUrl: 'lib/cmaps/', cMapPacked: true, standardFontDataUrl: 'lib/standard_fonts/', isEvalSupported: false, enableXfa: true });
    task.onPassword = async (update, reason) => {
      const pw = await prompt(t('This file is password protected'), reason === 2 ? t('Wrong password. Try again:') : t('Enter the password:'), '', { type: 'password' });
      if (pw === null) { task.destroy(); reject(new Error('cancelled')); } else { task.usedPassword = pw; update(pw); }
    };
    task.promise.then(pdf => { pdf._password = task.usedPassword || password; resolve(pdf); }, reject);
  });
}
/** Handles encrypted files: returns {bytes, password, protection, restricted, noPrint} or null if cancelled */
async function unlock(bytes) {
  const info = { bytes, password: undefined, protection: null, restricted: false, noPrint: false };
  if (!hasSeq(bytes, '/Encrypt') || !(await hasQpdf())) return info;
  if ((await N.qpdf(['--is-encrypted', '{in}'], bytes)).code !== 0) return info;
  const req = (await N.qpdf(['--requires-password', '{in}'], bytes)).code === 0;
  let pw = '';
  if (req) {
    let msg = t('Enter the password:');
    for (;;) {
      busy(); pw = await prompt(t('This file is password protected'), msg, '', { type: 'password' }); if (pw === null) return null;
      busy(t('Opening…'));
      const chk = await N.qpdf(['--password=' + pw, '--check', '{in}'], bytes);
      if (!/invalid password/i.test(chk.stderr + chk.stdout)) break; msg = t('Wrong password. Try again:');
    }
  }
  const sh = await N.qpdf(['--password=' + pw, '--show-encryption', '{in}'], bytes); const out = sh.stdout;
  const owner = /supplied password is owner password/i.test(out);
  info.password = pw;
  if (!owner && /modify[^:\n]*:\s*not allowed/i.test(out)) { info.restricted = true; info.noPrint = /print[^:\n]*:\s*not allowed/i.test(out) && !/print low resolution:\s*allowed/i.test(out); return info; }
  const dec = await N.qpdf(['--password=' + pw, '--decrypt', '{in}', '{out}'], bytes);
  if (dec.data && (dec.code === 0 || dec.code === 3)) { info.bytes = dec.data; info.password = undefined; if (pw) info.protection = { user: pw, owner: '', print: true, copy: true, modify: true }; }
  return info;
}
/** Pull back the comments this app wrote (marked with /PRData) so they stay editable */
async function importOwnAnnots(bytes) {
  if (!hasSeq(bytes, 'PRData')) return { bytes, annots: [] };
  try {
    const doc = await PL.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); const annots = []; const key = PL.PDFName.of('PRData');
    doc.getPages().forEach((page, i) => {
      const arr = page.node.Annots(); if (!arr) return;
      for (let j = arr.size() - 1; j >= 0; j--) {
        const d = arr.lookup(j); if (!(d instanceof PL.PDFDict)) continue; const v = d.get(key); if (!v) continue;
        try { const a = JSON.parse(v.decodeText()); a.page = i + 1; annots.unshift(a); arr.remove(j); } catch {}
      }
    });
    if (!annots.length) return { bytes, annots };
    return { bytes: await doc.save({ useObjectStreams: false }), annots };
  } catch (e) { console.warn(e); return { bytes, annots: [] }; }
}

async function openData(bytes, name, path, restore) {
  busy(t('Opening {name}…', { name }));
  let pdf, info;
  try {
    info = await unlock(bytes); if (!info) { busy(); return; }
    let annots = [];
    if (!info.restricted) { const r = await importOwnAnnots(info.bytes); info.bytes = r.bytes; annots = r.annots; }
    pdf = await loadPdf(info.bytes, info.password);
    const tab = { id: uid(), name, path, bytes: info.bytes, pdf, annots, undo: [], redo: [], dirty: false, sel: null,
      password: pdf._password, protection: info.protection, restricted: info.restricted, noPrint: info.noPrint, restore };
    buildViewer(tab); tabs.push(tab); renderTabs(); activate(tab); saveSession();
    if (tab.restricted) banner(t('The owner of this file restricted changes. You can read and search it, but not edit or save changes.'));
  } catch (e) { if (e.message !== 'cancelled') { toast(e.name === 'InvalidPDFException' ? t('The file is damaged or not a valid PDF') : t('Could not open the file')); console.error(e); } }
  finally { busy(); }
}
/** Serialize a tab so another window can take it over exactly as it is */
async function tabPayload(x) {
  const v = x.viewer;
  return { bytes: await baseBytes(x), name: x.name, path: x.path, annots: structuredClone(x.annots), dirty: x.dirty, protection: x.protection, password: x.password,
    restricted: x.restricted, noPrint: x.noPrint, view: { page: v.currentPageNumber, zoom: v.currentScaleValue, scroll: v.scrollMode, spread: v.spreadMode, rot: v.pagesRotation } };
}
async function adoptTab(p) {
  busy(t('Opening {name}…', { name: p.name }));
  try {
    const pdf = await loadPdf(p.bytes, p.password || undefined);
    const tab = { id: uid(), name: p.name, path: p.path, bytes: p.bytes, pdf, annots: p.annots || [], undo: [], redo: [], dirty: !!p.dirty, sel: null,
      password: p.password, protection: p.protection, restricted: p.restricted, noPrint: p.noPrint, restore: p.view };
    buildViewer(tab);
    let idx = tabs.length;
    if (p.dropClientX != null) { // insert where it was dropped on the tab strip
      const els = [...document.querySelectorAll('#tabs .tab')], rtl = langInfo().dir === 'rtl';
      idx = 0; for (const n of els) { const r = n.getBoundingClientRect(), mid = r.left + r.width / 2; if (rtl ? p.dropClientX < mid : p.dropClientX > mid) idx++; }
    }
    tabs.splice(idx, 0, tab); renderTabs(); activate(tab); saveSession();
  } catch (e) { console.error(e); toast(t('Could not open the file')); } finally { busy(); }
}
/** Remove a tab that was handed to another window (no save prompt, not added to "recently closed") */
function releaseTab(tab) {
  stopSpeak(); const i = tabs.indexOf(tab); if (i < 0) return; const wasActive = tab === active; tabs.splice(i, 1);
  tab.container.remove(); try { tab.pdf.destroy(); } catch {}
  if (wasActive || !tabs.length) { active = null; activate(tabs[Math.min(i, tabs.length - 1)] || null); } else renderTabs();
  saveSession(true);
}
async function moveTabToWindow(tab, screenX, screenY, forceNew) {
  if (!N) return false;
  const payload = await tabPayload(tab);
  const r = await N.tabDrop({ screenX, screenY, payload, allowNew: tabs.length > 1, forceNew });
  if (!r.moved) return false;
  releaseTab(tab);
  if (!tabs.length && r.merged) N.closeWindow();
  return true;
}

function buildViewer(tab) {
  const container = el('div', { class: 'vc', tabindex: '0' }); const vdiv = el('div', { class: 'pdfViewer' }); container.append(vdiv); $('stage').append(container);
  const eventBus = new V.EventBus();
  const linkService = new V.PDFLinkService({ eventBus, externalLinkTarget: 2 });
  const findController = new V.PDFFindController({ eventBus, linkService });
  const viewer = new V.PDFViewer({ container, viewer: vdiv, eventBus, linkService, findController, textLayerMode: 1, annotationMode: L.AnnotationMode.ENABLE_FORMS,
    annotationEditorMode: L.AnnotationEditorType.DISABLE, removePageBorders: true, imageResourcesPath: 'lib/images/', maxCanvasPixels: 33554432 });
  linkService.setViewer(viewer);
  Object.assign(tab, { container, vdiv, eventBus, linkService, findController, viewer });
  attachDoc(tab);
  eventBus.on('pagesinit', () => {
    const pos = Object.assign({}, store.get('pos:' + (tab.path || tab.name)) || {}, tab.restore || {}); tab.restore = null;
    viewer.scrollMode = pos.scroll ?? 0; viewer.spreadMode = pos.spread ?? 0; viewer.currentScaleValue = pos.zoom || 'auto';
    if (pos.rot) viewer.pagesRotation = pos.rot;
    if (pos.page > 1 && pos.page <= tab.pdf.numPages) viewer.currentPageNumber = pos.page;
    if (tab === active) syncUI();
  });
  eventBus.on('pagechanging', () => { if (tab === active) syncPage(); savePos(tab); });
  eventBus.on('scalechanging', () => { if (tab === active) syncZoom(); savePos(tab); });
  eventBus.on('rotationchanging', () => { if (tab === active) { buildThumbs(); syncStatus(); } });
  eventBus.on('pagerendered', e => attachOverlay(tab, e.source));
  eventBus.on('updatefindmatchescount', e => { if (tab === active) showFindCount(e.matchesCount); });
  eventBus.on('updatefindcontrolstate', e => { if (tab === active) showFindState(e.state, e.matchesCount); });
  container.addEventListener('wheel', e => {
    if (presState) { e.preventDefault(); if (!container.wl) { container.wl = 1; e.deltaY > 0 ? viewer.nextPage() : viewer.previousPage(); setTimeout(() => container.wl = 0, 250); } return; }
    if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); zoomStep(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  setupPointer(tab);
}
function attachDoc(tab) {
  tab.viewer.setDocument(tab.pdf); tab.linkService.setDocument(tab.pdf, null);
  tab.pdf.annotationStorage.onSetModified = () => markDirty(tab);
  tab.meta = null; tab.pdf.getMetadata().then(m => { tab.meta = m; if (tab === active) syncStatus(); }).catch(() => {});
}
function renderTabs() {
  const box = $('tabs'); box.innerHTML = '';
  for (const x of tabs) {
    const close = el('button', { class: 'x', title: t('Close (Ctrl+W)'), onclick: e => { e.stopPropagation(); closeTab(x); } }, icon('x'));
    const d = el('div', { class: 'tab' + (x === active ? ' active' : '') + (x.dirty ? ' dirty' : ''), role: 'tab', title: x.path || x.name,
      onauxclick: e => { if (e.button === 1) { e.preventDefault(); closeTab(x); } },
      oncontextmenu: e => { e.preventDefault(); e.stopPropagation(); tabMenu(x, e.clientX, e.clientY); } },
      x.protection || x.password ? el('span', { class: 'lock' }, icon('lock')) : null, el('span', { class: 'nm', text: x.name, dir: 'auto' }), close);
    d._tab = x; d.addEventListener('pointerdown', e => tabPointerDown(e, d, x));
    box.append(d);
  }
  const a = box.querySelector('.tab.active'); if (a) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/* ---------- tab dragging (pointer based, works in both LTR and RTL) ---------- */
function tabPointerDown(e, elx, tab) {
  if (e.button !== 0 || e.target.closest('.x')) return;
  const box = $('tabs'), sx = e.clientX, sy = e.clientY; let dragging = false, target = null, out = false, lastScreen = [e.screenX, e.screenY];
  const others = () => [...box.querySelectorAll('.tab')].filter(n => n !== elx);
  const move = ev => {
    const dx = ev.clientX - sx;
    if (!dragging) { if (Math.abs(dx) < 6) return; dragging = true; elx.classList.add('dragging'); elx.setPointerCapture(e.pointerId); box.classList.add('reordering'); }
    const bar = $('tabbar').getBoundingClientRect();
    out = ev.clientY < bar.top - 25 || ev.clientY > bar.bottom + 45 || ev.clientX < 0 || ev.clientX > innerWidth || ev.clientY < 0;
    elx.classList.toggle('detaching', out); document.body.classList.toggle('tab-detaching', out);
    elx.style.transform = out ? `translate(${dx}px, ${ev.clientY - sy}px)` : `translateX(${dx}px)`;
    lastScreen = [ev.screenX, ev.screenY];
    if (out) { others().forEach(n => n.classList.remove('drop-before', 'drop-after')); target = null; return; }
    // which tab is the pointer over, and on which half
    const r0 = elx.getBoundingClientRect(), cx = r0.left + r0.width / 2; let best = null;
    for (const n of others()) { const r = n.getBoundingClientRect(); n.classList.remove('drop-before', 'drop-after'); if (cx >= r.left && cx <= r.right) best = { n, before: (cx < r.left + r.width / 2) }; }
    target = best; if (best) best.n.classList.add(best.before ? 'drop-before' : 'drop-after');
    // auto-scroll the strip near its edges
    const br = box.getBoundingClientRect(); if (ev.clientX < br.left + 30) box.scrollLeft -= 12; else if (ev.clientX > br.right - 30) box.scrollLeft += 12;
  };
  const up = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    box.classList.remove('reordering'); others().forEach(n => n.classList.remove('drop-before', 'drop-after'));
    if (!dragging) { activate(tab); return; }
    elx.classList.remove('dragging', 'detaching'); elx.style.transform = ''; document.body.classList.remove('tab-detaching');
    if (out) { moveTabToWindow(tab, lastScreen[0], lastScreen[1]).then(ok => { if (!ok) renderTabs(); }); return; }
    if (target) {
      const visualBefore = target.before, rtl = getComputedStyle(box).direction === 'rtl';
      const insertBeforeInOrder = rtl ? !visualBefore : visualBefore; // DOM order is reversed visually in RTL
      const from = tabs.indexOf(tab); tabs.splice(from, 1);
      let to = tabs.indexOf(target.n._tab); if (!insertBeforeInOrder) to++;
      tabs.splice(to, 0, tab); saveSession();
    }
    renderTabs();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}
function moveTab(tab, delta) { const i = tabs.indexOf(tab), j = Math.max(0, Math.min(tabs.length - 1, i + delta)); if (i === j) return; tabs.splice(i, 1); tabs.splice(j, 0, tab); renderTabs(); saveSession(); }

/* ---------- tab context menu & bulk closing ---------- */
const closedTabs = [];
async function closeTabs(list) { for (const x of list) { if (!tabs.includes(x)) continue; if (!(await closeTab(x))) return false; } return true; }
function tabMenu(x, cx, cy) {
  const m = $('ctx'); m.innerHTML = ''; const i = tabs.indexOf(x);
  const add = (label, fn, dis, kbd) => m.append(el('button', { disabled: dis, onclick: () => { closePopups(); fn(); } }, el('span', { text: label }), kbd ? el('kbd', { text: kbd }) : null));
  add(t('Close'), () => closeTab(x), false, 'Ctrl+W');
  add(t('Close other tabs'), () => closeTabs(tabs.filter(o => o !== x)), tabs.length < 2);
  add(t('Close tabs after this one'), () => closeTabs(tabs.slice(i + 1)), i === tabs.length - 1);
  add(t('Close tabs before this one'), () => closeTabs(tabs.slice(0, i)), i === 0);
  add(t('Close all tabs'), () => closeTabs([...tabs]));
  m.append(el('hr'));
  add(t('Move to the start'), () => moveTab(x, -tabs.length), i === 0);
  add(t('Move to the end'), () => moveTab(x, tabs.length), i === tabs.length - 1);
  add(t('Move to new window'), () => moveTabToWindow(x, 0, 0, true), tabs.length < 2 || !N);
  m.append(el('hr'));
  add(t('Save'), () => save(x), x.restricted);
  add(t('Copy file path'), async () => { await navigator.clipboard.writeText(x.path); toast(t('Copied')); }, !x.path);
  add(t('Show in folder'), () => N.showInFolder(x.path), !x.path || !N);
  m.append(el('hr'));
  add(t('Reopen closed tab'), reopenClosed, !closedTabs.length, 'Ctrl+Shift+T');
  openPopup(m, cx, cy);
}
async function reopenClosed() { const c = closedTabs.pop(); if (!c) return toast(t('No recently closed tabs')); await openPath(c.path, c.page); }
$('tabs').addEventListener('wheel', e => { const b = $('tabs'); if (b.scrollWidth <= b.clientWidth) return; e.preventDefault(); b.scrollLeft += (e.deltaY || e.deltaX) * (getComputedStyle(b).direction === 'rtl' ? -1 : 1); }, { passive: false });
$('tabbar').addEventListener('dblclick', e => { if (e.target === $('tabbar') || e.target === $('tabs')) openFiles(); });

function activate(tab) {
  if (active && active !== tab) active.container.hidden = true;
  active = tab; $('welcome').hidden = !!tab; hideBanner();
  document.querySelectorAll('[data-need]').forEach(b => b.disabled = !tab);
  if (!tab) { renderTabs(); N && N.setTitle(t('Awraq PDF')); $('pageCount').textContent = '/ 0'; $('pageInput').value = ''; ['p-thumbs', 'p-outline', 'p-bookmarks', 'p-annots', 'p-attach'].forEach(i => $(i).innerHTML = ''); $('stLeft').textContent = ''; $('stRight').textContent = ''; renderRecent(); return; }
  tab.container.hidden = false; tab.container.focus({ preventScroll: true });
  if (tab.restricted) { $('bTools').disabled = true; $('toolsbar').classList.remove('open'); }
  if (tab.noPrint) $('bPrint').disabled = true;
  renderTabs(); applyToolClass(); syncUI(); rebuildSide();
  if ($('searchbar').classList.contains('open') && $('q').value) doFind('');
}
async function closeTab(tab) {
  if (tab.dirty) {
    activate(tab);
    const c = await confirmBox(t('Save changes to "{name}"?', { name: tab.name }), t('Your changes will be lost if you don\'t save them.'), [t('Save'), t('Don\'t save'), t('Cancel')]);
    if (c === 2) return false; if (c === 0 && !(await save(tab))) return false;
  }
  if (tab.path) { closedTabs.push({ path: tab.path, page: tab.viewer.currentPageNumber }); if (closedTabs.length > 20) closedTabs.shift(); }
  stopSpeak(); const i = tabs.indexOf(tab); const wasActive = tab === active; tabs.splice(i, 1);
  tab.container.remove(); try { tab.pdf.destroy(); } catch {}
  if (wasActive || !tabs.length) { active = null; activate(tabs[Math.min(i, tabs.length - 1)] || null); } else renderTabs();
  saveSession(); return true;
}
function markDirty(tab, v = true) { if (tab.dirty === v) return; tab.dirty = v; renderTabs(); }
window.addEventListener('beforeunload', e => { saveSession(true); if (tabs.some(x => x.dirty)) { e.preventDefault(); e.returnValue = ''; } });
let posT; function savePos(tab) { clearTimeout(posT); posT = setTimeout(() => { const v = tab.viewer; if (!v.pagesCount) return; store.set('pos:' + (tab.path || tab.name), { page: v.currentPageNumber, zoom: v.currentScaleValue, scroll: v.scrollMode, spread: v.spreadMode }); saveSession(); }, 400); }
function saveSession(now) { const f = () => N && N.sessionUpdate(tabs.filter(x => x.path).map(x => ({ path: x.path, page: x.viewer.pagesCount ? x.viewer.currentPageNumber : 1, active: x === active }))); if (now) f(); else { clearTimeout(saveSession.t); saveSession.t = setTimeout(f, 500); } }
function canModify(tab = T()) { if (tab && tab.restricted) { toast(t('The owner of this file restricted changes.')); return false; } return true; }
function banner(msg, buttons = []) {
  $('bannerMsg').textContent = msg; const b = $('bannerBtns'); b.innerHTML = '';
  buttons.forEach(x => b.append(el('button', { onclick: x.onclick }, x.label))); b.append(el('button', { title: t('Close'), onclick: hideBanner }, icon('x'))); $('banner').hidden = false;
}
function hideBanner() { $('banner').hidden = true; }

/* ================= toolbar sync ================= */
function syncUI() { if (!T()) return; syncPage(); syncZoom(); syncStatus(); const v = T().viewer; $('scrollSel').value = v.scrollMode; $('spreadSel').value = v.spreadMode; N && N.setTitle(T().name + ' — ' + t('Awraq PDF')); }
function syncPage() {
  const v = T().viewer, n = v.currentPageNumber, c = T().pdf.numPages;
  $('pageInput').value = n; $('pageCount').textContent = '/ ' + c; $('bPrev').disabled = n <= 1; $('bNext').disabled = n >= c;
  document.querySelectorAll('#p-thumbs .thumb.cur').forEach(x => x.classList.remove('cur'));
  const th = $('p-thumbs').querySelector(`.thumb[data-n="${n}"]`); if (th) { th.classList.add('cur'); th.scrollIntoView({ block: 'nearest' }); }
  syncStatus();
}
function syncZoom() {
  const v = T().viewer, s = $('zoomSel'), val = String(v.currentScaleValue);
  if ([...s.options].some(o => o.value === val && o.value !== 'custom')) s.value = val;
  else { const o = s.querySelector('[value=custom]'); o.textContent = Math.round(v.currentScale * 100) + '%'; s.value = 'custom'; }
  syncStatus();
}
function syncStatus() {
  const x = T(); if (!x) return; const v = x.viewer; let size = '';
  try { const pv = v.getPageView(v.currentPageNumber - 1); const vw = pv.pdfPage.view; size = `${Math.round((vw[2] - vw[0]) * 25.4 / 72)} × ${Math.round((vw[3] - vw[1]) * 25.4 / 72)} mm`; } catch {}
  $('stLeft').textContent = x.path || x.name;
  $('stRight').textContent = [x.protection ? t('Password protected') : '', size, Math.round(v.currentScale * 100) + '%', v.pagesRotation ? t('Rotated {d}°', { d: v.pagesRotation }) : '', x.annots.length ? t('{n} comments', { n: num(x.annots.length) }) : ''].filter(Boolean).join('   |   ');
}

/* ================= navigation & zoom ================= */
$('bOpen').onclick = $('bOpen2').onclick = $('bNewTab').onclick = openFiles;
$('bImages2').onclick = () => imagesToPdf();
$('bPrev').onclick = () => T().viewer.previousPage();
$('bNext').onclick = () => T().viewer.nextPage();
$('pageInput').addEventListener('keydown', e => { if (e.key === 'Enter') { const v = T().viewer; const n = +e.target.value; if (n >= 1 && n <= v.pagesCount) v.currentPageNumber = n; else syncPage(); T().container.focus(); } });
$('pageInput').addEventListener('focus', e => e.target.select());
function zoomStep(d) { const v = T().viewer; if (d > 0) v.increaseScale(); else v.decreaseScale(); }
$('bZoomIn').onclick = () => zoomStep(1); $('bZoomOut').onclick = () => zoomStep(-1);
$('zoomSel').onchange = e => { if (e.target.value !== 'custom') T().viewer.currentScaleValue = e.target.value; };
$('bRotR').onclick = () => rotateView(90); $('bRotL').onclick = () => rotateView(-90);
function rotateView(d) { const v = T().viewer; v.pagesRotation = (v.pagesRotation + d + 360) % 360; if (!T().restricted) markDirty(T()); }
$('scrollSel').onchange = e => { T().viewer.scrollMode = +e.target.value; savePos(T()); };
$('spreadSel').onchange = e => { T().viewer.spreadMode = +e.target.value; savePos(T()); };
$('bNight').onclick = toggleNight;
$('bFull').onclick = toggleFull;
function toggleFull() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
$('bSide').onclick = () => { const h = $('side').classList.toggle('hidden'); $('bSide').setAttribute('aria-pressed', !h); store.set('side', !h); };

/* ================= presentation ================= */
let presState = null, presMouseT;
async function presentation(on) {
  const x = T(); if (!x) return;
  if (on && !presState) {
    const v = x.viewer; presState = { tab: x, scroll: v.scrollMode, spread: v.spreadMode, zoom: v.currentScaleValue, page: v.currentPageNumber };
    document.body.classList.add('presenting'); try { await document.documentElement.requestFullscreen(); } catch {}
    v.scrollMode = 3; v.spreadMode = 0; await sleep(120); v.currentScaleValue = 'page-fit'; v.currentPageNumber = presState.page;
    toast(t('Presentation: arrows or click to move, Esc to exit'));
  } else if (!on && presState) {
    const s = presState; presState = null; document.body.classList.remove('presenting', 'cursor');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const v = s.tab.viewer, p = v.currentPageNumber; v.scrollMode = s.scroll; v.spreadMode = s.spread; v.currentScaleValue = s.zoom; v.currentPageNumber = p;
  }
}
$('bPresent').onclick = () => presentation(true);
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && presState) presentation(false); else if (presState) setTimeout(() => { if (presState) presState.tab.viewer.currentScaleValue = 'page-fit'; }, 150); });
document.addEventListener('mousemove', () => { if (!presState) return; document.body.classList.add('cursor'); clearTimeout(presMouseT); presMouseT = setTimeout(() => document.body.classList.remove('cursor'), 1500); });
document.addEventListener('click', e => { if (!presState || e.target.closest('a,.annotationLayer section')) return; presState.tab.viewer.nextPage(); });
document.addEventListener('contextmenu', e => { if (presState) { e.preventDefault(); presState.tab.viewer.previousPage(); } });

/* ================= search ================= */
function openSearch() { $('searchbar').classList.add('open'); $('bSearch').setAttribute('aria-pressed', 'true'); const s = window.getSelection().toString().trim(); if (s && s.length < 80) $('q').value = s; $('q').focus(); $('q').select(); if ($('q').value) doFind(''); }
function closeSearch() { $('searchbar').classList.remove('open'); $('bSearch').setAttribute('aria-pressed', 'false'); $('qinfo').textContent = ''; T() && T().eventBus.dispatch('findbarclose', { source: window }); T() && T().container.focus(); }
$('bSearch').onclick = () => $('searchbar').classList.contains('open') ? closeSearch() : openSearch();
$('qClose').onclick = closeSearch;
function doFind(type, prev = false) {
  const x = T(); if (!x) return; const q = $('q').value;
  if (!q) { $('qinfo').textContent = ''; x.eventBus.dispatch('findbarclose', { source: window }); return; }
  x.eventBus.dispatch('find', { source: window, type, query: q, caseSensitive: $('qCase').checked, entireWord: $('qWord').checked, highlightAll: $('qAll').checked, findPrevious: prev, matchDiacritics: $('qDia').checked });
}
let qT; $('q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => doFind(''), 200); });
$('q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doFind('again', e.shiftKey); } else if (e.key === 'Escape') closeSearch(); });
['qCase', 'qWord', 'qAll', 'qDia'].forEach(id => $(id).onchange = () => doFind(''));
$('qNext').onclick = () => doFind('again', false); $('qPrev').onclick = () => doFind('again', true);
function showFindCount(m) { if (!m) return; const i = $('qinfo'); i.classList.toggle('bad', !m.total); i.textContent = m.total ? t('{a} of {b}', { a: num(m.current), b: num(m.total) + (m.total >= 1000 ? '+' : '') }) : t('No results'); }
function showFindState(state, m) { if (state === 1) { $('qinfo').textContent = t('No results'); $('qinfo').classList.add('bad'); } else if (state === 2) toast(t('Wrapped to the start of the document'), 1200); if (m) showFindCount(m); }
$('qRedact').onclick = () => redactMatches();

/* ================= sidebar ================= */
let panel = store.get('panel') || 'thumbs';
document.querySelectorAll('.sidetabs button').forEach(b => b.onclick = () => showPanel(b.dataset.panel));
function showPanel(p) {
  panel = p; store.set('panel', p);
  document.querySelectorAll('.sidetabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.panel === p));
  document.querySelectorAll('#side .panel').forEach(x => x.hidden = x.id !== 'p-' + p);
  if ($('side').classList.contains('hidden')) $('bSide').click();
}
showPanel(panel); if (store.get('side') === false) { $('side').classList.add('hidden'); $('bSide').setAttribute('aria-pressed', 'false'); }
function rebuildSide() { buildThumbs(); buildOutline(); buildBookmarks(); buildAnnotList(); buildAttachments(); }

let thumbIO;
function buildThumbs() {
  const x = T(), box = $('p-thumbs'); box.innerHTML = ''; if (thumbIO) thumbIO.disconnect(); if (!x) return;
  thumbIO = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { thumbIO.unobserve(en.target); drawThumb(x, en.target); } }), { root: box, rootMargin: '400px' });
  for (let n = 1; n <= x.pdf.numPages; n++) {
    const b = el('button', { class: 'thumb', 'data-n': n, draggable: 'true', title: t('Page {n} — drag to reorder, right-click for options', { n }) }, el('div', { class: 'tc', style: 'width:140px;height:198px' }), el('span', { text: num(n) }));
    b.onclick = () => { x.viewer.currentPageNumber = n; };
    b.oncontextmenu = e => { e.preventDefault(); pageMenu(n, e.clientX, e.clientY); };
    b.ondragstart = e => { e.dataTransfer.setData('text/x-page', String(n)); e.dataTransfer.effectAllowed = 'move'; };
    b.ondragover = e => { if (e.dataTransfer.types.includes('text/x-page')) { e.preventDefault(); b.classList.add('dragover'); } };
    b.ondragleave = () => b.classList.remove('dragover');
    b.ondrop = e => { e.preventDefault(); e.stopPropagation(); b.classList.remove('dragover'); const from = +e.dataTransfer.getData('text/x-page'); if (from && from !== n) movePage(from, n); };
    box.append(b); thumbIO.observe(b);
  }
  syncPage();
}
async function drawThumb(x, b) {
  try {
    const n = +b.dataset.n, page = await x.pdf.getPage(n), rot = (page.rotate + x.viewer.pagesRotation) % 360;
    const v1 = page.getViewport({ scale: 1, rotation: rot }), vp = page.getViewport({ scale: 140 / v1.width * DPR(), rotation: rot });
    const c = el('canvas', { class: 'tc' }); c.width = vp.width; c.height = vp.height; c.style.width = '140px';
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const ctx = c.getContext('2d'); x.annots.filter(a => a.page === n).forEach(a => drawAnnot(ctx, vp, a));
    b.querySelector('.tc').replaceWith(c);
  } catch (e) {}
}
function refreshThumb(n) { const x = T(); const b = $('p-thumbs').querySelector(`.thumb[data-n="${n}"]`); if (x && b) drawThumb(x, b); }
async function buildOutline() {
  const x = T(), box = $('p-outline'); box.innerHTML = ''; if (!x) return;
  let ol = null; try { ol = await x.pdf.getOutline(); } catch {}
  if (!ol || !ol.length) { box.append(el('p', { class: 'empty', text: t('This document has no outline.') })); return; }
  const mk = (items, depth) => { const ul = el('ul'); for (const it of items) {
    const li = el('li', { class: depth > 0 && it.items?.length ? 'closed' : '' });
    const a = el('a', { text: it.title, dir: 'auto', tabindex: '0', title: it.title });
    if (it.bold || it.italic) a.style.cssText = (it.bold ? 'font-weight:600;' : '') + (it.italic ? 'font-style:italic' : '');
    a.onclick = () => { if (it.dest) x.linkService.goToDestination(it.dest); else if (it.url) window.open(it.url); };
    li.append(el('div', {}, it.items?.length ? el('button', { class: 'tg', onclick: () => li.classList.toggle('closed') }, icon('down')) : el('span', { class: 'tg' }), a));
    if (it.items?.length) li.append(mk(it.items, depth + 1)); ul.append(li);
  } return ul; };
  box.classList.add('tree'); box.append(mk(ol, 0));
}
const bmKey = () => 'bm:' + (T().path || T().name);
function buildBookmarks() {
  const x = T(), box = $('p-bookmarks'); box.innerHTML = ''; if (!x) return;
  box.append(el('button', { class: 'primary', style: 'width:100%;justify-content:center;margin-bottom:8px', onclick: addBookmark }, icon('bm'), t('Bookmark this page')));
  const list = store.get(bmKey(), []);
  if (!list.length) box.append(el('p', { class: 'empty', text: t('Bookmarks take you back to important places quickly. Press Ctrl+B to add one.') }));
  list.sort((a, b) => a.page - b.page).forEach((bm, i) => box.append(el('div', { class: 'item', tabindex: '0', onclick: () => x.viewer.currentPageNumber = bm.page,
    ondblclick: async () => { const v = await prompt(t('Rename bookmark'), t('Name'), bm.title); if (v) { bm.title = v; store.set(bmKey(), list); buildBookmarks(); } } },
    icon('bm'), el('div', { class: 'body' }, el('div', { text: bm.title, dir: 'auto' }), el('div', { class: 'meta', text: t('Page {n}', { n: num(bm.page) }) })),
    el('button', { class: 'del', title: t('Delete'), onclick: e => { e.stopPropagation(); list.splice(i, 1); store.set(bmKey(), list); buildBookmarks(); } }, icon('trash')))));
}
async function addBookmark() {
  const x = T(); if (!x) return; const n = x.viewer.currentPageNumber;
  const title = await prompt(t('Add bookmark'), t('Name'), t('Page {n}', { n })); if (!title) return;
  const list = store.get(bmKey(), []); list.push({ page: n, title }); store.set(bmKey(), list); buildBookmarks(); showPanel('bookmarks'); toast(t('Bookmark added'));
}
const TYPE_NAMES = { highlight: 'Highlight', underline: 'Underline', strike: 'Strike-out', ink: 'Drawing', marker: 'Freehand highlight', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', text: 'Text', note: 'Note', image: 'Image', stamp: 'Stamp', sign: 'Signature', redact: 'Redaction' };
function buildAnnotList() {
  const x = T(), box = $('p-annots'); box.innerHTML = ''; if (!x) return;
  if (!x.annots.length) { box.append(el('p', { class: 'empty', text: t('No comments yet. Open the Comment bar to add highlights, notes or a signature.') })); return; }
  [...x.annots].sort((a, b) => a.page - b.page).forEach(a => {
    const snip = a.text || a.quote || '';
    box.append(el('div', { class: 'item' + (x.sel === a ? ' sel' : ''), tabindex: '0', onclick: () => revealAnnot(a), ondblclick: () => { if (a.type === 'note' || a.type === 'text') editAnnotText(a); } },
      el('span', { class: 'dot', style: 'background:' + (a.type === 'redact' ? '#000' : a.color) }),
      el('div', { class: 'body' }, el('div', { text: t(TYPE_NAMES[a.kind || a.type] || a.type) }), snip ? el('div', { class: 'meta', dir: 'auto', text: snip.slice(0, 140) }) : null,
        el('div', { class: 'meta', text: t('Page {n}', { n: num(a.page) }) + (a.author ? ' · ' + a.author : '') + ' · ' + new Date(a.date).toLocaleString(LOC(), { dateStyle: 'short', timeStyle: 'short' }) })),
      el('button', { class: 'del', title: t('Delete'), onclick: e => { e.stopPropagation(); mutate(x, () => x.annots.splice(x.annots.indexOf(a), 1)); } }, icon('trash'))));
  });
}
function revealAnnot(a) {
  const x = T(); x.viewer.scrollPageIntoView({ pageNumber: a.page });
  setTimeout(() => { const pv = x.viewer.getPageView(a.page - 1); const bb = bbox(a, pv.viewport); x.container.scrollTo({ top: pv.div.offsetTop + bb.y - x.container.clientHeight / 3, behavior: 'smooth' }); }, 60);
  x.sel = a; redrawPage(x, a.page); buildAnnotList();
  if (a.type === 'note') setTimeout(() => showNoteTip(x, a), 400);
}
async function buildAttachments() {
  const x = T(), box = $('p-attach'); box.innerHTML = ''; if (!x) return;
  let at = null; try { at = await x.pdf.getAttachments(); } catch {}
  const items = at ? Object.values(at) : [];
  if (!items.length) { box.append(el('p', { class: 'empty', text: t('This document has no attached files.') })); return; }
  items.forEach(f => box.append(el('div', { class: 'item', tabindex: '0', title: t('Save attachment'), onclick: () => saveBytes(f.content, f.filename, [{ name: 'File', extensions: [(f.filename.split('.').pop() || '*')] }]) },
    icon('file'), el('div', { class: 'body' }, el('div', { text: f.filename, dir: 'auto' }), el('div', { class: 'meta', text: fmtSize(f.content.length) + ' — ' + t('click to save') })))));
}

/* ================= popups ================= */
function openPopup(pop, x, y) { closePopups(); pop.hidden = false; const r = pop.getBoundingClientRect(); pop.style.left = Math.max(6, Math.min(x, innerWidth - r.width - 6)) + 'px'; pop.style.top = Math.max(6, Math.min(y, innerHeight - r.height - 6)) + 'px'; }
function closePopups() { $('menu').hidden = true; $('ctx').hidden = true; }
document.addEventListener('mousedown', e => { if (!e.target.closest('.popup') && !e.target.closest('#bMenu')) closePopups(); });
$('bMenu').onclick = () => { if (!$('menu').hidden) return closePopups(); const r = $('bMenu').getBoundingClientRect(); openPopup($('menu'), langInfo().dir === 'rtl' ? r.left : r.right - 260, r.bottom + 4); };
$('menu').addEventListener('click', e => { const b = e.target.closest('button[data-act]'); if (!b || b.disabled) return; closePopups(); action(b.dataset.act); });
$('bSettings').onclick = () => showSettings();
function pageMenu(n, x, y) {
  const tb = T(), m = $('ctx'); m.innerHTML = '';
  const add = (label, fn, dis) => m.append(el('button', { disabled: dis, onclick: () => { closePopups(); fn(); } }, label));
  add(t('Go to page {n}', { n }), () => tb.viewer.currentPageNumber = n);
  m.append(el('hr'));
  add(t('Rotate page right'), () => rotatePages([n], 90)); add(t('Rotate page left'), () => rotatePages([n], -90));
  add(t('Move up'), () => movePage(n, n - 1), n === 1); add(t('Move down'), () => movePage(n, n + 1), n === tb.pdf.numPages);
  add(t('Insert blank page after'), () => insertBlank(n)); add(t('Extract this page…'), () => extractPages([n])); add(t('Export as PNG…'), () => exportPng(n));
  add(t('Recognize text on this page (OCR)'), () => runOcr([n]));
  m.append(el('hr'));
  m.append(el('button', { class: 'danger', disabled: tb.pdf.numPages < 2, onclick: () => { closePopups(); deletePages([n]); } }, t('Delete page')));
  openPopup(m, x, y);
}

/* ================= annotation tools ================= */
const COLORS = ['#FFD400', '#FF6B6B', '#2ECC71', '#1D5FD1', '#9B59B6', '#111111', '#E67E22', '#FFFFFF'];
const TOOL_HINTS = {
  select: 'Select text to copy it. Double-click a note to edit it.', hand: 'Drag to move around the page.', edit: 'Click a comment to select it, drag to move, drag the small square to resize, Delete to remove.',
  highlight: 'Select text to highlight it.', underline: 'Select text to underline it.', strike: 'Select text to strike it out.', ink: 'Draw with the mouse or a pen.', marker: 'Draw to highlight any area.',
  rect: 'Drag to draw a rectangle.', ellipse: 'Drag to draw an ellipse.', line: 'Drag to draw a line. Hold Shift for straight angles.', arrow: 'Drag to draw an arrow. Hold Shift for straight angles.', text: 'Click to type. Ctrl+Enter to finish.', note: 'Click to add a sticky note.',
  place: 'Click on the page to place it.', redact: 'Drag over anything you want to remove for good, then press "Apply redactions".'
};
const tool = { name: 'select', color: store.get('color', '#FFD400'), width: store.get('width', 3), fs: 14, fill: false, pending: null };
COLORS.forEach(c => $('swatches').append(el('button', { class: 'swatch', style: 'background:' + c, 'data-c': c, title: c, onclick: () => setColor(c) })));
function setColor(c) {
  tool.color = c; store.set('color', c); $('colorPick').value = c.length === 7 ? c : '#000000';
  document.querySelectorAll('.swatch').forEach(s => s.setAttribute('aria-pressed', s.dataset.c.toLowerCase() === c.toLowerCase()));
  const x = T(); if (x && x.sel && tool.name === 'edit' && x.sel.type !== 'redact') mutate(x, () => { x.sel.color = c; });
}
setColor(tool.color);
$('colorPick').oninput = e => setColor(e.target.value);
$('widthIn').value = tool.width; $('widthIn').oninput = e => { tool.width = +e.target.value; store.set('width', tool.width); const x = T(); if (x && x.sel && tool.name === 'edit' && 'w' in x.sel) mutate(x, () => x.sel.w = tool.width); };
$('fontSize').onchange = e => tool.fs = +e.target.value;
$('fillIn').onchange = e => tool.fill = e.target.checked;
$('bTools').onclick = () => { if (!canModify()) return; const o = $('toolsbar').classList.toggle('open'); $('bTools').setAttribute('aria-pressed', o); if (!o) setTool('select'); };
$('toolBtns').addEventListener('click', e => { const b = e.target.closest('button[data-tool]'); if (b) setTool(b.dataset.tool); });
$('bApplyRedact').onclick = () => applyRedactions();

async function setTool(name) {
  if (name !== 'select' && name !== 'hand' && !canModify()) return;
  if (name === 'stamp') { const img = await pickStamp(); if (!img) return; tool.pending = { ...img, kind: 'stamp' }; name = 'place'; }
  else if (name === 'sign') { const img = await pickSignature(); if (!img) return; tool.pending = { ...img, kind: 'sign' }; name = 'place'; }
  else if (name === 'image') { const img = await pickImage(); if (!img) return; tool.pending = { ...img, kind: 'image' }; name = 'place'; }
  else tool.pending = null;
  tool.name = name;
  const shown = name === 'place' ? tool.pending.kind : name;
  document.querySelectorAll('#toolBtns button[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === shown));
  $('toolHint').textContent = t(TOOL_HINTS[name] || '');
  const x = T(); if (x && name !== 'edit' && x.sel) { const p = x.sel.page; x.sel = null; redrawPage(x, p); }
  applyToolClass();
  if (['highlight', 'underline', 'strike'].includes(name)) applyMarkupFromSelection();
}
function applyToolClass() {
  const x = T(); if (!x) return; const c = x.container, n = tool.name;
  c.classList.remove('tool-draw', 'tool-edit', 'tool-place', 'tool-hand', 'tool-hl');
  if (['ink', 'marker', 'rect', 'ellipse', 'line', 'arrow', 'text', 'note', 'redact'].includes(n)) c.classList.add('tool-draw');
  else if (n === 'edit') c.classList.add('tool-edit'); else if (n === 'place') c.classList.add('tool-place');
  else if (n === 'hand') c.classList.add('tool-hand'); else if (['highlight', 'underline', 'strike'].includes(n)) c.classList.add('tool-hl');
}

/* ---------- geometry ---------- */
const toVp = (vp, p) => vp.convertToViewportPoint(p[0], p[1]);
const toPdf = (vp, x, y) => vp.convertToPdfPoint(x, y);
function vpRect(vp, r) { const a = toVp(vp, r[0]), b = toVp(vp, r[1]); return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) }; }
function bbox(a, vp) {
  const s = vp.scale;
  if (a.pts) { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const p of a.pts) { const [x, y] = toVp(vp, p); x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); } const pad = (a.w || 2) * s * (a.type === 'marker' ? 3 : 1) / 2 + 3; return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 }; }
  if (a.rects) { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const r of a.rects) { const q = vpRect(vp, r); x1 = Math.min(x1, q.x); y1 = Math.min(y1, q.y); x2 = Math.max(x2, q.x + q.w); y2 = Math.max(y2, q.y + q.h); } return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; }
  if (a.type === 'note') { const [x, y] = toVp(vp, a.at); const z = 22 * Math.max(.6, s); return { x, y, w: z, h: z }; }
  if (a.p1) { const q = vpRect(vp, [a.p1, a.p2]); const pad = a.type === 'redact' ? 0 : (a.w || 2) * s / 2 + 3; return { x: q.x - pad, y: q.y - pad, w: q.w + pad * 2, h: q.h + pad * 2 }; }
  return { x: 0, y: 0, w: 0, h: 0 };
}
function translate(a, dx, dy) { const mv = p => { p[0] += dx; p[1] += dy; }; if (a.pts) a.pts.forEach(mv); if (a.rects) a.rects.forEach(r => { mv(r[0]); mv(r[1]); }); if (a.at) mv(a.at); if (a.p1) { mv(a.p1); mv(a.p2); } }
function hexA(hex, alpha) { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${alpha})`; }

/* ---------- drawing ---------- */
const imgCache = new Map();
function getImg(src) { let im = imgCache.get(src); if (!im) { im = new Image(); im.src = src; imgCache.set(src, im); im.onload = () => { const x = T(); x && x.annots.forEach(a => { if (a.src === src) redrawPage(x, a.page); }); }; } return im; }
function drawAnnot(ctx, vp, a, opts = {}) {
  const s = vp.scale; ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (a.type) {
    case 'highlight': ctx.fillStyle = hexA(a.color, .38); ctx.globalCompositeOperation = 'multiply'; a.rects.forEach(r => { const q = vpRect(vp, r); ctx.fillRect(q.x, q.y, q.w, q.h); }); break;
    case 'underline': case 'strike': {
      ctx.strokeStyle = a.color; a.rects.forEach(r => { const q = vpRect(vp, r); const th = Math.max(1, Math.min(q.h, q.w) * .07); ctx.lineWidth = th; ctx.beginPath();
        if (vp.rotation % 180 === 0) { const y = a.type === 'underline' ? (vp.rotation === 180 ? q.y + th : q.y + q.h - th) : q.y + q.h / 2; ctx.moveTo(q.x, y); ctx.lineTo(q.x + q.w, y); }
        else { const x = a.type === 'underline' ? (vp.rotation === 90 ? q.x + th : q.x + q.w - th) : q.x + q.w / 2; ctx.moveTo(x, q.y); ctx.lineTo(x, q.y + q.h); }
        ctx.stroke(); }); break; }
    case 'ink': case 'marker': {
      ctx.strokeStyle = a.type === 'marker' ? hexA(a.color, .4) : a.color; ctx.lineWidth = Math.max(.5, a.w * s * (a.type === 'marker' ? 3 : 1));
      if (a.type === 'marker') { ctx.lineCap = 'butt'; ctx.globalCompositeOperation = 'multiply'; }
      ctx.beginPath(); a.pts.forEach((p, i) => { const [x, y] = toVp(vp, p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); if (a.pts.length === 1) { const [x, y] = toVp(vp, a.pts[0]); ctx.lineTo(x + .1, y); } ctx.stroke(); break; }
    case 'rect': case 'ellipse': {
      const q = vpRect(vp, [a.p1, a.p2]); ctx.strokeStyle = a.color; ctx.lineWidth = Math.max(.5, a.w * s); ctx.beginPath();
      if (a.type === 'rect') ctx.rect(q.x, q.y, q.w, q.h); else ctx.ellipse(q.x + q.w / 2, q.y + q.h / 2, q.w / 2, q.h / 2, 0, 0, Math.PI * 2);
      if (a.fill) { ctx.fillStyle = hexA(a.color, .25); ctx.fill(); } ctx.stroke(); break; }
    case 'redact': {
      const q = vpRect(vp, [a.p1, a.p2]);
      if (opts.final) { ctx.fillStyle = '#000'; ctx.fillRect(q.x, q.y, q.w, q.h); break; }
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(q.x, q.y, q.w, q.h); ctx.strokeStyle = '#E53935'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); ctx.strokeRect(q.x, q.y, q.w, q.h); break; }
    case 'line': case 'arrow': {
      const [x1, y1] = toVp(vp, a.p1), [x2, y2] = toVp(vp, a.p2); ctx.strokeStyle = ctx.fillStyle = a.color; const lw = Math.max(.5, a.w * s); ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (a.type === 'arrow') { const ang = Math.atan2(y2 - y1, x2 - x1), L2 = Math.max(10 * s, lw * 4); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - L2 * Math.cos(ang - .45), y2 - L2 * Math.sin(ang - .45)); ctx.lineTo(x2 - L2 * Math.cos(ang + .45), y2 - L2 * Math.sin(ang + .45)); ctx.closePath(); ctx.fill(); }
      break; }
    case 'note': {
      const [x, y] = toVp(vp, a.at); const z = 22 * Math.max(.6, s);
      ctx.fillStyle = a.color; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + z, y); ctx.lineTo(x + z, y + z * .7); ctx.lineTo(x + z * .7, y + z); ctx.lineTo(x, y + z); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); for (let i = 1; i <= 3; i++) { ctx.moveTo(x + z * .2, y + z * .22 * i); ctx.lineTo(x + z * (i === 3 ? .55 : .8), y + z * .22 * i); } ctx.stroke(); break; }
    case 'text': case 'image': {
      const q = vpRect(vp, [a.p1, a.p2]); const d = ((vp.rotation - a.rot) % 360 + 360) % 360;
      ctx.translate(q.x + q.w / 2, q.y + q.h / 2); ctx.rotate(d * Math.PI / 180);
      const w = d % 180 ? q.h : q.w, h = d % 180 ? q.w : q.h;
      if (a.type === 'image') { const im = getImg(a.src); if (im.complete && im.naturalWidth) ctx.drawImage(im, -w / 2, -h / 2, w, h); }
      else {
        if (a.bg) { ctx.fillStyle = a.bg; ctx.fillRect(-w / 2, -h / 2, w, h); }
        const fs = a.fs * s; ctx.font = `${fs}px "Segoe UI", Tahoma, sans-serif`; ctx.fillStyle = a.color; ctx.textBaseline = 'top';
        const rtl = ARABIC.test(a.text); ctx.direction = rtl ? 'rtl' : 'ltr'; ctx.textAlign = rtl ? 'right' : 'left';
        const pad = fs * .25; a.text.split('\n').forEach((ln, i) => ctx.fillText(ln, rtl ? w / 2 - pad : -w / 2 + pad, -h / 2 + pad + i * fs * 1.25));
      }
      break; }
  }
  ctx.restore();
}
function attachOverlay(tab, pv) { let c = pv.div.querySelector(':scope > canvas.annotOverlay'); if (!c) { c = el('canvas', { class: 'annotOverlay' }); pv.div.append(c); } drawOverlay(tab, pv, c); }
function drawOverlay(tab, pv, c) {
  const vp = pv.viewport, d = DPR(), W = Math.round(vp.width * d), H = Math.round(vp.height * d);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } c.style.width = vp.width + 'px'; c.style.height = vp.height + 'px';
  const ctx = c.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, vp.width, vp.height);
  for (const a of tab.annots) if (a.page === pv.id) drawAnnot(ctx, vp, a);
  if (tab.draft && tab.draft.page === pv.id) drawAnnot(ctx, vp, tab.draft);
  if (tab.sel && tab.sel.page === pv.id && tool.name === 'edit') {
    const b = bbox(tab.sel, vp); ctx.save(); ctx.strokeStyle = '#1D5FD1'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.strokeRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
    if (resizable(tab.sel)) { ctx.setLineDash([]); ctx.fillStyle = '#1D5FD1'; ctx.fillRect(b.x + b.w - 5, b.y + b.h - 5, 10, 10); } ctx.restore();
  }
}
function redrawPage(tab, n) { const pv = tab.viewer.getPageView(n - 1); const c = pv && pv.div.querySelector(':scope > canvas.annotOverlay'); if (c) drawOverlay(tab, pv, c); }
const resizable = a => ['rect', 'ellipse', 'image', 'text', 'redact'].includes(a.type);

/* ---------- undo / mutate ---------- */
function mutate(tab, fn, pages) {
  if (!canModify(tab)) return;
  tab.undo.push(structuredClone(tab.annots)); if (tab.undo.length > 150) tab.undo.shift(); tab.redo = [];
  const before = new Set(tab.annots.map(a => a.page)); fn();
  afterAnnotChange(tab, pages || new Set([...before, ...tab.annots.map(a => a.page)]));
}
function afterAnnotChange(tab, pages) {
  if (tab.sel && !tab.annots.includes(tab.sel)) tab.sel = null;
  markDirty(tab); for (const p of pages) { redrawPage(tab, p); refreshThumb(p); }
  if (tab === T()) { buildAnnotList(); syncStatus(); }
}
function undo() { const x = T(); if (!x) return; if (!x.undo.length) return toast(t('Nothing to undo')); const pages = new Set(x.annots.map(a => a.page)); x.redo.push(x.annots); x.annots = x.undo.pop(); x.sel = null; x.annots.forEach(a => pages.add(a.page)); afterAnnotChange(x, pages); }
function redo() { const x = T(); if (!x || !x.redo.length) return; const pages = new Set(x.annots.map(a => a.page)); x.undo.push(x.annots); x.annots = x.redo.pop(); x.sel = null; x.annots.forEach(a => pages.add(a.page)); afterAnnotChange(x, pages); }
$('bUndo').onclick = undo; $('bRedo').onclick = redo;
const newAnnot = o => ({ id: uid(), date: Date.now(), author: settings.author || '', color: tool.color, ...o });

/* ---------- text markup ---------- */
function applyMarkupFromSelection() {
  const x = T(); const sel = window.getSelection(); if (!x || !sel || sel.isCollapsed) return false;
  const byPage = new Map(); const quote = sel.toString();
  for (let i = 0; i < sel.rangeCount; i++) for (const r of sel.getRangeAt(i).getClientRects()) {
    if (r.width < 1 || r.height < 1) continue;
    const hit = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find(e => e.closest && e.closest('.page'));
    const pageEl = hit && hit.closest('.page'); if (!pageEl || !x.container.contains(pageEl)) continue;
    const n = +pageEl.dataset.pageNumber, pv = x.viewer.getPageView(n - 1), br = (pageEl.querySelector('.canvasWrapper') || pageEl).getBoundingClientRect();
    const x1 = r.left - br.left, y1 = r.top - br.top;
    if (!byPage.has(n)) byPage.set(n, { pv, list: [] }); byPage.get(n).list.push({ x1, y1, x2: x1 + r.width, y2: y1 + r.height });
  }
  if (!byPage.size) return false;
  mutate(x, () => { for (const [n, { pv, list }] of byPage) x.annots.push(newAnnot({ type: tool.name, page: n, quote, rects: mergeRects(list).map(q => [toPdf(pv.viewport, q.x1, q.y1), toPdf(pv.viewport, q.x2, q.y2)]) })); });
  sel.removeAllRanges(); return true;
}
function mergeRects(list) {
  list.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1); const out = [];
  for (const r of list) {
    const m = out.find(o => { const ov = Math.min(o.y2, r.y2) - Math.max(o.y1, r.y1); return ov > Math.min(o.y2 - o.y1, r.y2 - r.y1) * .6 && r.x1 <= o.x2 + 3 && r.x2 >= o.x1 - 3; });
    if (m) { m.x1 = Math.min(m.x1, r.x1); m.x2 = Math.max(m.x2, r.x2); m.y1 = Math.min(m.y1, r.y1); m.y2 = Math.max(m.y2, r.y2); } else out.push({ ...r });
  }
  return out;
}

/* ---------- pointer ---------- */
function pageAt(tab, e) {
  const pageEl = e.target.closest && e.target.closest('.page'); if (!pageEl) return null;
  const n = +pageEl.dataset.pageNumber, pv = tab.viewer.getPageView(n - 1);
  const r = (pageEl.querySelector(':scope > canvas.annotOverlay') || pageEl).getBoundingClientRect();
  return { n, pv, vp: pv.viewport, x: e.clientX - r.left, y: e.clientY - r.top };
}
function hitAnnot(tab, P) { for (let i = tab.annots.length - 1; i >= 0; i--) { const a = tab.annots[i]; if (a.page !== P.n) continue; const b = bbox(a, P.vp); if (P.x >= b.x - 4 && P.x <= b.x + b.w + 4 && P.y >= b.y - 4 && P.y <= b.y + b.h + 4) return a; } return null; }
function setupPointer(tab) {
  const c = tab.container; let drag = null;
  c.addEventListener('pointerdown', e => {
    if (e.button !== 0 || presState) return;
    if (tool.name === 'hand') { drag = { pan: true, sx: e.clientX, sy: e.clientY, sl: c.scrollLeft, st: c.scrollTop }; c.classList.add('panning'); c.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    if (!e.target.classList.contains('annotOverlay')) return;
    const P = pageAt(tab, e); if (!P) return; e.preventDefault(); c.setPointerCapture(e.pointerId);
    const pdfP = toPdf(P.vp, P.x, P.y), n = tool.name;
    if (n === 'edit') {
      const s = tab.sel; if (s && s.page === P.n && resizable(s)) { const b = bbox(s, P.vp); if (Math.abs(P.x - (b.x + b.w)) < 9 && Math.abs(P.y - (b.y + b.h)) < 9) { tab.undo.push(structuredClone(tab.annots)); tab.redo = []; drag = { resize: s, P }; return; } }
      const a = hitAnnot(tab, P), old = tab.sel; tab.sel = a; if (old && old !== a) redrawPage(tab, old.page); redrawPage(tab, P.n);
      if (a) { tab.undo.push(structuredClone(tab.annots)); tab.redo = []; drag = { move: a, last: pdfP, P, moved: false }; }
      return;
    }
    if (n === 'place') { placePending(tab, P); return; }
    if (n === 'text') { openTextEditor(tab, P); return; }
    if (n === 'note') { addNote(tab, P, pdfP); return; }
    if (n === 'ink' || n === 'marker') tab.draft = newAnnot({ type: n, page: P.n, w: tool.width, pts: [pdfP] });
    else if (['rect', 'ellipse', 'line', 'arrow', 'redact'].includes(n)) tab.draft = newAnnot({ type: n, page: P.n, w: tool.width, fill: tool.fill, p1: pdfP, p2: pdfP.slice(), ...(n === 'redact' ? { color: '#000000' } : {}) });
    drag = { draw: true, P };
  });
  c.addEventListener('pointermove', e => {
    if (!drag) { hoverNote(tab, e); return; }
    if (drag.pan) { c.scrollLeft = drag.sl - (e.clientX - drag.sx); c.scrollTop = drag.st - (e.clientY - drag.sy); return; }
    const r = drag.P.pv.div.querySelector(':scope > canvas.annotOverlay').getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top, pdfP = toPdf(drag.P.vp, x, y);
    if (drag.move) { translate(drag.move, pdfP[0] - drag.last[0], pdfP[1] - drag.last[1]); drag.last = pdfP; drag.moved = true; redrawPage(tab, drag.move.page); return; }
    if (drag.resize) { const a = drag.resize, q = vpRect(drag.P.vp, [a.p1, a.p2]);
      if (a.type === 'image') { const ratio = q.h / q.w, w = Math.max(12, x - q.x); a.p1 = toPdf(drag.P.vp, q.x, q.y); a.p2 = toPdf(drag.P.vp, q.x + w, q.y + w * ratio); }
      else { a.p1 = toPdf(drag.P.vp, q.x, q.y); a.p2 = toPdf(drag.P.vp, Math.max(q.x + 8, x), Math.max(q.y + 8, y)); }
      redrawPage(tab, a.page); return; }
    if (drag.draw && tab.draft) { const d = tab.draft;
      if (d.pts) { const ces = e.getCoalescedEvents ? e.getCoalescedEvents() : null; if (ces && ces.length) for (const ce of ces) d.pts.push(toPdf(drag.P.vp, ce.clientX - r.left, ce.clientY - r.top)); else d.pts.push(pdfP); }
      else if (e.shiftKey && (d.type === 'line' || d.type === 'arrow')) { const [x1, y1] = toVp(drag.P.vp, d.p1); const ang = Math.round(Math.atan2(y - y1, x - x1) / (Math.PI / 4)) * Math.PI / 4, len = Math.hypot(x - x1, y - y1); d.p2 = toPdf(drag.P.vp, x1 + len * Math.cos(ang), y1 + len * Math.sin(ang)); }
      else d.p2 = pdfP;
      redrawPage(tab, d.page); }
  });
  const end = () => {
    if (!drag) return; c.classList.remove('panning');
    if (drag.move || drag.resize) { if (drag.move && !drag.moved) tab.undo.pop(); else { markDirty(tab); refreshThumb((drag.move || drag.resize).page); } }
    if (drag.draw && tab.draft) { const d = tab.draft; tab.draft = null; const b = bbox(d, drag.P.vp); const tiny = d.pts ? false : (b.w < 6 && b.h < 6);
      if (!tiny) mutate(tab, () => tab.annots.push(d)); else redrawPage(tab, d.page); }
    drag = null;
  };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  c.addEventListener('mouseup', () => { if (['highlight', 'underline', 'strike'].includes(tool.name)) setTimeout(applyMarkupFromSelection, 0); });
  c.addEventListener('dblclick', e => { const P = pageAt(tab, e); if (!P) return; const a = hitAnnot(tab, P); if (a && (a.type === 'note' || a.type === 'text')) { e.preventDefault(); editAnnotText(a); } });
  c.addEventListener('mouseleave', () => hideNoteTip());
}
let tipEl = null;
function hoverNote(tab, e) {
  if (!e.target.closest || !e.target.closest('.page')) return hideNoteTip();
  const P = pageAt(tab, e); if (!P) return hideNoteTip();
  const a = tab.annots.find(a => a.type === 'note' && a.page === P.n && (() => { const b = bbox(a, P.vp); return P.x >= b.x && P.x <= b.x + b.w && P.y >= b.y && P.y <= b.y + b.h; })());
  if (a) showNoteTip(tab, a); else hideNoteTip();
}
function showNoteTip(tab, a) {
  const pv = tab.viewer.getPageView(a.page - 1), b = bbox(a, pv.viewport);
  if (!tipEl) tipEl = el('div', { class: 'noteTip', dir: 'auto' });
  tipEl.textContent = (a.author ? a.author + ': ' : '') + (a.text || t('(empty note)')); pv.div.append(tipEl);
  tipEl.style.left = Math.max(0, Math.min(b.x + b.w + 6, pv.viewport.width - 290)) + 'px'; tipEl.style.top = b.y + 'px';
}
function hideNoteTip() { tipEl && tipEl.remove(); }
async function addNote(tab, P, pdfP) {
  const txt = await prompt(t('New note'), t('Note text'), '', { multiline: true }); if (txt === null) return;
  mutate(tab, () => tab.annots.push(newAnnot({ type: 'note', page: P.n, at: pdfP, text: txt, color: tool.color === '#FFFFFF' ? '#FFD400' : tool.color })));
}
async function editAnnotText(a) {
  const x = T(); const v = await prompt(a.type === 'note' ? t('Edit note') : t('Edit text'), '', a.text, { multiline: true }); if (v === null) return;
  mutate(x, () => { a.text = v; if (a.type === 'text') fitTextBox(x, a); });
}
function measureText(text, fsPx) {
  const ctx = document.createElement('canvas').getContext('2d'); ctx.font = `${fsPx}px "Segoe UI", Tahoma, sans-serif`;
  const lines = text.split('\n'); return { w: Math.max(...lines.map(l => ctx.measureText(l).width)) + fsPx * .5, h: lines.length * fsPx * 1.25 + fsPx * .5 };
}
function fitTextBox(x, a) {
  const vp = x.viewer.getPageView(a.page - 1).viewport, d = ((vp.rotation - a.rot) % 360 + 360) % 360;
  const m = measureText(a.text, a.fs * vp.scale), q = vpRect(vp, [a.p1, a.p2]); const w = d % 180 ? m.h : m.w, h = d % 180 ? m.w : m.h;
  const xs = ARABIC.test(a.text) && d === 0 ? q.x + q.w - w : q.x; a.p1 = toPdf(vp, xs, q.y); a.p2 = toPdf(vp, xs + w, q.y + h);
}
function openTextEditor(tab, P) {
  const ta = el('textarea', { class: 'textEditor', dir: 'auto', placeholder: t('Type here…') });
  const fsPx = tool.fs * P.vp.scale; ta.style.fontSize = fsPx + 'px'; ta.style.color = tool.color === '#FFFFFF' ? '#000' : tool.color;
  ta.style.left = P.x + 'px'; ta.style.top = P.y + 'px'; P.pv.div.append(ta); setTimeout(() => ta.focus(), 0);
  let done = false;
  const commit = () => {
    if (done) return; done = true; const text = ta.value.replace(/\s+$/, ''); const taW = ta.offsetWidth; ta.remove(); if (!text) return;
    const m = measureText(text, fsPx), xs = ARABIC.test(text) ? Math.max(0, P.x + taW - m.w) : P.x;
    mutate(tab, () => tab.annots.push(newAnnot({ type: 'text', page: P.n, text, fs: tool.fs, rot: P.vp.rotation, bg: tool.fill ? 'rgba(255,255,255,.9)' : null, color: tool.color === '#FFFFFF' ? '#000000' : tool.color, p1: toPdf(P.vp, xs, P.y), p2: toPdf(P.vp, xs + m.w, P.y + m.h) })));
  };
  ta.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { done = true; ta.remove(); } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit(); });
  ta.addEventListener('blur', commit); ta.addEventListener('pointerdown', e => e.stopPropagation());
}
function placePending(tab, P) {
  const p = tool.pending, s = P.vp.scale, wCss = p.kind === 'sign' ? 170 * s : p.kind === 'stamp' ? 150 * s : Math.min(260 * s, p.w), hCss = wCss * p.h / p.w, x = P.x - wCss / 2, y = P.y - hCss / 2; let a;
  mutate(tab, () => { a = newAnnot({ type: 'image', kind: p.kind, page: P.n, src: p.src, rot: P.vp.rotation, p1: toPdf(P.vp, x, y), p2: toPdf(P.vp, x + wCss, y + hCss) }); tab.annots.push(a); });
  tool.pending = null; setTool('edit').then(() => { tab.sel = a; redrawPage(tab, a.page); });
}

/* ---------- stamps / signatures / images ---------- */
function makeStamp(text, color, withDate) {
  const c = document.createElement('canvas'), ctx = c.getContext('2d'), fs = 64, F = w => `${w} ${fs}px "Segoe UI", Tahoma, sans-serif`;
  const date = withDate ? new Date().toLocaleDateString(LOC(), { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  ctx.font = F('bold'); const tw = ctx.measureText(text).width; ctx.font = `${fs * .42}px "Segoe UI", Tahoma, sans-serif`; const dw = date ? ctx.measureText(date).width : 0;
  const w = Math.max(tw, dw) + 80, h = fs * (date ? 1.95 : 1.45) + 30; c.width = w; c.height = h;
  ctx.strokeStyle = ctx.fillStyle = color; ctx.globalAlpha = .9; ctx.lineWidth = 7; ctx.beginPath(); ctx.roundRect(8, 8, w - 16, h - 16, 18); ctx.stroke(); ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(17, 17, w - 34, h - 34, 12); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = ARABIC.test(text) ? 'rtl' : 'ltr'; ctx.font = F('bold'); ctx.fillText(text, w / 2, date ? h * .4 : h / 2 + 2);
  if (date) { ctx.font = `${fs * .42}px "Segoe UI", Tahoma, sans-serif`; ctx.direction = langInfo().dir; ctx.fillText(date, w / 2, h * .74); }
  return { src: c.toDataURL('image/png'), w, h };
}
async function pickStamp() {
  const presets = [['Approved', '#1E8E3E'], ['Rejected', '#C62828'], ['Reviewed', '#1D5FD1'], ['Confidential', '#C62828'], ['Draft', '#6B7280'], ['Urgent', '#E65100'], ['Paid', '#1D5FD1'], ['Final', '#1E8E3E']];
  let chosen = null; const dateChk = el('input', { type: 'checkbox', checked: true }); const grid = el('div', { class: 'stamps' });
  const render = () => { grid.innerHTML = ''; presets.forEach(([tx, col]) => { const s = makeStamp(t(tx), col, dateChk.checked); grid.append(el('button', { type: 'button', onclick: () => { chosen = s; $('dlg').close(); } }, el('img', { src: s.src, alt: t(tx) }))); }); };
  dateChk.onchange = render; render();
  const custom = el('input', { type: 'text', placeholder: t('Custom stamp text'), dir: 'auto' }), colIn = el('input', { type: 'color', value: '#C62828' });
  const body = el('div', {}, el('label', { class: 'mini', style: 'margin-bottom:10px' }, dateChk, t('Add today\'s date')), grid, el('div', { class: 'field', style: 'margin-top:12px;flex-direction:row;align-items:center' }, custom, colIn));
  const r = await modal(t('Choose a stamp'), body, [{ label: t('Use custom text'), value: 'custom', primary: true }, { label: t('Cancel'), value: null }]);
  if (r === 'custom' && custom.value.trim()) return makeStamp(custom.value.trim(), colIn.value, dateChk.checked);
  return chosen;
}
function trimCanvas(c) {
  const ctx = c.getContext('2d'), { width: w, height: h } = c, d = ctx.getImageData(0, 0, w, h).data; let x1 = w, y1 = h, x2 = 0, y2 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
  if (x2 < x1) return null; x1 = Math.max(0, x1 - 6); y1 = Math.max(0, y1 - 6); x2 = Math.min(w - 1, x2 + 6); y2 = Math.min(h - 1, y2 + 6);
  const o = document.createElement('canvas'); o.width = x2 - x1 + 1; o.height = y2 - y1 + 1; o.getContext('2d').drawImage(c, x1, y1, o.width, o.height, 0, 0, o.width, o.height);
  return { src: o.toDataURL('image/png'), w: o.width, h: o.height };
}
async function pickSignature() {
  let chosen = null; const saved = store.get('sigs', []); const list = el('div', { class: 'sigs' });
  const renderSaved = () => { list.innerHTML = ''; saved.forEach((s, i) => list.append(el('div', { class: 's' }, el('img', { src: s.src, title: t('Use this signature'), style: 'cursor:pointer', onclick: () => { chosen = s; $('dlg').close(); } }),
    el('button', { type: 'button', class: 'del', title: t('Delete'), onclick: () => { saved.splice(i, 1); store.set('sigs', saved); renderSaved(); } }, icon('x'))))); };
  renderSaved();
  const pad = el('canvas', { class: 'sigpad' }), col = el('input', { type: 'color', value: '#0B2A6B' }), typed = el('input', { type: 'text', placeholder: t('Or type your name to turn it into a signature'), dir: 'auto' }), keep = el('input', { type: 'checkbox', checked: true });
  const body = el('div', {}, saved.length ? el('div', { class: 'hint', text: t('Saved signatures — click one to use it:') }) : null, list, el('div', { class: 'hint', text: t('Draw your signature in the box:') }), pad,
    el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:8px' }, el('button', { type: 'button', onclick: () => pad.getContext('2d').clearRect(0, 0, pad.width, pad.height) }, t('Clear')), col, el('span', { class: 'grow' }), el('label', { class: 'mini' }, keep, t('Save for later'))),
    el('div', { class: 'field', style: 'margin-top:10px' }, typed));
  const r = await modal(t('Signature'), body, [{ label: t('Use'), value: 'use', primary: true }, { label: t('Cancel'), value: null }], () => {
    const rect = pad.getBoundingClientRect(); pad.width = rect.width * 2; pad.height = rect.height * 2; const ctx = pad.getContext('2d'); ctx.scale(2, 2); ctx.lineCap = ctx.lineJoin = 'round'; let down = false, last = null;
    pad.onpointerdown = e => { down = true; pad.setPointerCapture(e.pointerId); last = [e.offsetX, e.offsetY]; };
    pad.onpointermove = e => { if (!down) return; ctx.strokeStyle = col.value; ctx.lineWidth = 2.6 * (e.pressure && e.pointerType === 'pen' ? e.pressure * 1.6 + .4 : 1); ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); last = [e.offsetX, e.offsetY]; };
    pad.onpointerup = () => down = false;
  });
  if (chosen) return chosen; if (r !== 'use') return null;
  let s = trimCanvas(pad);
  if (!s && typed.value.trim()) { const c = document.createElement('canvas'); c.width = 900; c.height = 220; const ctx = c.getContext('2d'); ctx.fillStyle = col.value; ctx.font = 'italic 110px "Segoe Script", "Brush Script MT", "Lucida Handwriting", "Segoe UI", cursive'; ctx.textBaseline = 'middle'; ctx.direction = ARABIC.test(typed.value) ? 'rtl' : 'ltr'; ctx.textAlign = 'center'; ctx.fillText(typed.value.trim(), 450, 115); s = trimCanvas(c); }
  if (!s) { toast(t('Draw your signature or type your name first')); return null; }
  if (keep.checked) { saved.unshift(s); store.set('sigs', saved.slice(0, 8)); }
  return s;
}
async function decodeImage(blob) { const bmp = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); bmp.close && bmp.close(); return c; }
function pickImage() {
  return new Promise(res => {
    const i = $('imgFile'); i.value = '';
    i.onchange = async () => { const f = i.files[0]; if (!f) return res(null); try { const c0 = await decodeImage(f); const k = Math.min(1, 2000 / Math.max(c0.width, c0.height)); const c = document.createElement('canvas'); c.width = c0.width * k; c.height = c0.height * k; c.getContext('2d').drawImage(c0, 0, 0, c.width, c.height); res({ src: c.toDataURL(f.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', .92), w: c.width, h: c.height }); } catch { toast(t('Could not read this image')); res(null); } };
    window.addEventListener('focus', () => setTimeout(() => { if (!i.files.length) res(null); }, 600), { once: true });
    i.click();
  });
}

/* ================= writing real PDF annotations ================= */
const hexRgb = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const norm = (p, q) => [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
function ellipseOps(x1, y1, x2, y2) {
  const k = .5522847498, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = (x2 - x1) / 2, ry = (y2 - y1) / 2;
  return [PL.moveTo(cx + rx, cy), PL.appendBezierCurve(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry), PL.appendBezierCurve(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy),
    PL.appendBezierCurve(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry), PL.appendBezierCurve(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy), PL.closePath()];
}
async function annotImage(a, R, K) {
  const [x1, y1, x2, y2] = R, w = x2 - x1, h = y2 - y1;
  const fvp = { scale: K, rotation: 0, convertToViewportPoint: (x, y) => [(x - x1) * K, (y2 - y) * K], convertToPdfPoint: (px, py) => [px / K + x1, y2 - py / K] };
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w * K)); c.height = Math.max(1, Math.ceil(h * K));
  if (a.src) { try { await getImg(a.src).decode(); } catch {} }
  drawAnnot(c.getContext('2d'), fvp, a);
  return new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer());
}
async function writeAnnot(doc, page, pageRot, a) {
  const ctx = doc.context, H = PL.PDFHexString.fromText, rgb = hexRgb(a.color || '#000000'); const data = { ...a }; delete data.page;
  const D = { Type: 'Annot', F: 4, C: rgb, M: PL.PDFString.fromDate(new Date(a.date)), CreationDate: PL.PDFString.fromDate(new Date(a.date)), NM: H('pr-' + a.id), T: H(a.author || ''), PRData: H(JSON.stringify(data)) };
  let R, ops = [], res = {}, w = a.w || 1;
  const gs = (ca, mult) => { res.ExtGState = { G0: { Type: 'ExtGState', ca, CA: ca, ...(mult ? { BM: 'Multiply' } : {}) } }; return PL.setGraphicsState('G0'); };
  switch (a.type) {
    case 'highlight': case 'underline': case 'strike': case 'redact': {
      const rects = a.rects ? a.rects.map(r => norm(r[0], r[1])) : [norm(a.p1, a.p2)];
      R = [Math.min(...rects.map(r => r[0])) - 1, Math.min(...rects.map(r => r[1])) - 1, Math.max(...rects.map(r => r[2])) + 1, Math.max(...rects.map(r => r[3])) + 1];
      D.Subtype = { highlight: 'Highlight', underline: 'Underline', strike: 'StrikeOut', redact: 'Redact' }[a.type];
      D.QuadPoints = rects.flatMap(([x1, y1, x2, y2]) => [x1, y2, x2, y2, x1, y1, x2, y1]);
      if (a.quote) D.Contents = H(a.quote);
      ops.push(PL.pushGraphicsState());
      if (a.type === 'highlight') { D.CA = .4; ops.push(gs(.4, true), PL.setFillingRgbColor(...rgb)); rects.forEach(([x1, y1, x2, y2]) => ops.push(PL.rectangle(x1, y1, x2 - x1, y2 - y1), PL.fill())); }
      else if (a.type === 'redact') { D.IC = [0, 0, 0]; D.OC = [1, 0, 0]; D.C = [1, 0, 0]; ops.push(PL.setStrokingRgbColor(.9, .2, .2), PL.setLineWidth(1)); rects.forEach(([x1, y1, x2, y2]) => ops.push(PL.rectangle(x1, y1, x2 - x1, y2 - y1), PL.stroke())); }
      else { ops.push(PL.setStrokingRgbColor(...rgb)); rects.forEach(([x1, y1, x2, y2]) => { const vert = pageRot % 180 !== 0, th = Math.max(.6, Math.min(x2 - x1, y2 - y1) * .07); ops.push(PL.setLineWidth(th));
        if (!vert) { const y = a.type === 'strike' ? (y1 + y2) / 2 : pageRot === 180 ? y2 - th / 2 : y1 + th / 2; ops.push(PL.moveTo(x1, y), PL.lineTo(x2, y), PL.stroke()); }
        else { const x = a.type === 'strike' ? (x1 + x2) / 2 : pageRot === 90 ? x1 + th / 2 : x2 - th / 2; ops.push(PL.moveTo(x, y1), PL.lineTo(x, y2), PL.stroke()); } }); }
      ops.push(PL.popGraphicsState()); break; }
    case 'ink': case 'marker': {
      const lw = a.type === 'marker' ? w * 3 : w, xs = a.pts.map(p => p[0]), ys = a.pts.map(p => p[1]);
      R = [Math.min(...xs) - lw, Math.min(...ys) - lw, Math.max(...xs) + lw, Math.max(...ys) + lw];
      D.Subtype = 'Ink'; D.InkList = [a.pts.flat()]; D.BS = { W: lw };
      ops.push(PL.pushGraphicsState()); if (a.type === 'marker') { D.CA = .4; ops.push(gs(.4, true), PL.setLineCap(PL.LineCapStyle.Butt)); } else ops.push(PL.setLineCap(PL.LineCapStyle.Round));
      ops.push(PL.setLineJoin(PL.LineJoinStyle.Round), PL.setStrokingRgbColor(...rgb), PL.setLineWidth(lw), PL.moveTo(...a.pts[0]));
      (a.pts.length > 1 ? a.pts.slice(1) : [[a.pts[0][0] + .1, a.pts[0][1]]]).forEach(p => ops.push(PL.lineTo(...p)));
      ops.push(PL.stroke(), PL.popGraphicsState()); break; }
    case 'rect': case 'ellipse': {
      const [x1, y1, x2, y2] = norm(a.p1, a.p2); R = [x1 - w, y1 - w, x2 + w, y2 + w];
      D.Subtype = a.type === 'rect' ? 'Square' : 'Circle'; D.BS = { W: w }; if (a.fill) D.IC = rgb;
      const path = a.type === 'rect' ? [PL.rectangle(x1, y1, x2 - x1, y2 - y1)] : ellipseOps(x1, y1, x2, y2);
      ops.push(PL.pushGraphicsState());
      if (a.fill) ops.push(PL.pushGraphicsState(), gs(.25), PL.setFillingRgbColor(...rgb), ...path, PL.fill(), PL.popGraphicsState());
      ops.push(PL.setStrokingRgbColor(...rgb), PL.setLineWidth(w), ...path, PL.stroke(), PL.popGraphicsState()); break; }
    case 'line': case 'arrow': {
      const [x1, y1] = a.p1, [x2, y2] = a.p2, L2 = Math.max(10, w * 4); R = [Math.min(x1, x2) - L2, Math.min(y1, y2) - L2, Math.max(x1, x2) + L2, Math.max(y1, y2) + L2];
      D.Subtype = 'Line'; D.L = [x1, y1, x2, y2]; D.BS = { W: w }; if (a.type === 'arrow') { D.LE = ['None', 'ClosedArrow']; D.IC = rgb; }
      ops.push(PL.pushGraphicsState(), PL.setStrokingRgbColor(...rgb), PL.setFillingRgbColor(...rgb), PL.setLineWidth(w), PL.setLineCap(PL.LineCapStyle.Round), PL.moveTo(x1, y1), PL.lineTo(x2, y2), PL.stroke());
      if (a.type === 'arrow') { const ang = Math.atan2(y2 - y1, x2 - x1); ops.push(PL.moveTo(x2, y2), PL.lineTo(x2 - L2 * Math.cos(ang - .45), y2 - L2 * Math.sin(ang - .45)), PL.lineTo(x2 - L2 * Math.cos(ang + .45), y2 - L2 * Math.sin(ang + .45)), PL.closePath(), PL.fill()); }
      ops.push(PL.popGraphicsState()); break; }
    case 'note': {
      const [x, y] = a.at; R = [x, y - 20, x + 20, y];
      Object.assign(D, { Subtype: 'Text', Contents: H(a.text || ''), Name: 'Comment', Open: false }); ops = null; break; }
    case 'text': case 'image': {
      R = norm(a.p1, a.p2); const ww = R[2] - R[0], hh = R[3] - R[1];
      const K = a.type === 'text' ? 4 : Math.min(6, Math.max(2, (getImg(a.src).naturalWidth || 400) / Math.max(1, ww)));
      const img = await doc.embedPng(await annotImage(a, R, K)); res.XObject = { Im0: img.ref };
      if (a.type === 'text') { Object.assign(D, { Subtype: 'FreeText', Contents: H(a.text), DA: PL.PDFString.of(`/Helv ${a.fs} Tf ${rgb.map(v => v.toFixed(3)).join(' ')} rg`) }); }
      else Object.assign(D, { Subtype: 'Stamp', Name: a.kind === 'sign' ? 'Signature' : a.kind === 'stamp' ? 'Approved' : 'Image', ...(a.kind === 'sign' ? { Contents: H('Signature') } : {}) });
      ops.push(PL.pushGraphicsState(), PL.concatTransformationMatrix(ww, 0, 0, hh, R[0], R[1]), PL.drawObject('Im0'), PL.popGraphicsState()); break; }
    default: return;
  }
  D.Rect = R;
  if (ops) D.AP = { N: ctx.register(ctx.formXObject(ops, { BBox: R, Resources: res })) };
  page.node.addAnnot(ctx.register(ctx.obj(D)));
}

/* ================= saving ================= */
async function baseBytes(x) { try { if (x.pdf.annotationStorage.size > 0) return await x.pdf.saveDocument(); } catch (e) { console.warn(e); } return await x.pdf.getData(); }
async function loadLib(bytes) {
  const doc = await PL.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  if (doc.isEncrypted) throw Object.assign(new Error('enc'), { userMsg: t('This file is encrypted and can\'t be changed.') });
  return doc;
}
function wrapContent(doc, page) {
  const key = PL.PDFName.of('Contents'), raw = page.node.get(key); if (!raw) return;
  const q = doc.context.register(doc.context.stream('q\n')), Q = doc.context.register(doc.context.stream('\nQ\n')), arr = page.node.Contents();
  if (arr instanceof PL.PDFArray) { arr.insert(0, q); arr.push(Q); } else page.node.set(key, doc.context.obj([q, raw, Q]));
}
async function encryptBytes(bytes, p) {
  const owner = p.owner || p.user;
  const r = await N.qpdf(['--encrypt', p.user, owner, '256', '--print=' + (p.print ? 'full' : 'none'), '--extract=' + (p.copy ? 'y' : 'n'), '--modify=' + (p.modify ? 'all' : 'none'), ...(p.modify ? [] : ['--annotate=n']), '--', '{in}', '{out}'], bytes);
  if (!r.data || (r.code !== 0 && r.code !== 3)) throw Object.assign(new Error(r.stderr), { userMsg: t('Could not apply the password: {e}', { e: r.stderr.slice(0, 200) }) });
  return r.data;
}
/** Build the final bytes: real annotations + view rotation + optional password */
async function buildBytes(x, { encrypt = true } = {}) {
  const rot = x.viewer.pagesRotation; let out;
  if (!x.annots.length && !rot) out = await baseBytes(x);
  else {
    const doc = await loadLib(await baseBytes(x)); const pages = doc.getPages();
    for (const a of x.annots) { const p = pages[a.page - 1]; if (p) await writeAnnot(doc, p, p.getRotation().angle, a); }
    if (rot) pages.forEach(p => p.setRotation(PL.degrees((p.getRotation().angle + rot) % 360)));
    out = await doc.save({ useObjectStreams: false });
  }
  if (encrypt && x.protection) out = await encryptBytes(out, x.protection);
  return out;
}
async function saveBytes(data, name, filters) {
  if (N) return N.saveDialog({ defaultPath: name, data, filters });
  const a = el('a', { href: URL.createObjectURL(new Blob([data])), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); return { name, path: '' };
}
const stem = x => x.name.replace(/\.pdf$/i, '');
async function save(x = T(), as = false) {
  if (!x) return false; if (x.restricted) { canModify(x); return false; }
  busy(t('Saving…'));
  try {
    const data = await buildBytes(x);
    if (x.path && !as && N) await N.writePath(x.path, data);
    else { busy(); const r = await saveBytes(data, stem(x) + '.pdf'); if (!r) return false; if (r.path) { x.path = r.path; x.name = r.name; } }
    markDirty(x, false); renderTabs(); syncUI(); saveSession(); toast(t('Saved')); return true;
  } catch (e) { console.error(e); toast(e.userMsg || t('Could not save: {e}', { e: e.message }), 4000); return false; }
  finally { busy(); }
}
async function saveFlattened() {
  const x = T(); busy(t('Saving…'));
  try {
    const doc = await loadLib(await baseBytes(x)); const rot = x.viewer.pagesRotation;
    for (const n of [...new Set(x.annots.map(a => a.page))]) {
      const list = x.annots.filter(a => a.page === n && a.type !== 'redact'); if (!list.length) continue;
      const page = await x.pdf.getPage(n), v1 = page.getViewport({ scale: 1, rotation: 0 }), K = Math.min(3, 4200 / Math.max(v1.width, v1.height)), vp = page.getViewport({ scale: K, rotation: 0 });
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); const ctx = c.getContext('2d');
      for (const a of list) if (a.src) { try { await getImg(a.src).decode(); } catch {} }
      list.forEach(a => drawAnnot(ctx, vp, a));
      const img = await doc.embedPng(new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer()));
      const p = doc.getPage(n - 1); wrapContent(doc, p); const v = page.view; p.drawImage(img, { x: v[0], y: v[1], width: v[2] - v[0], height: v[3] - v[1] });
    }
    if (rot) doc.getPages().forEach(p => p.setRotation(PL.degrees((p.getRotation().angle + rot) % 360)));
    let out = await doc.save(); if (x.protection) out = await encryptBytes(out, x.protection);
    busy(); const r = await saveBytes(out, t('{name} (flattened)', { name: stem(x) }) + '.pdf'); if (r) toast(t('Saved'));
  } catch (e) { toast(e.userMsg || t('Could not save: {e}', { e: e.message })); } finally { busy(); }
}

/* ================= page organisation ================= */
async function pageOp(label, fn, remap, newPage) {
  const x = T(); if (!canModify(x)) return false; busy(label);
  try {
    const doc = await loadLib(await baseBytes(x)); await fn(doc); const out = await doc.save();
    const pdf = await loadPdf(out); const old = x.pdf, v = x.viewer;
    x.restore = { page: typeof newPage === 'function' ? newPage() : newPage ?? v.currentPageNumber, zoom: v.currentScaleValue, scroll: v.scrollMode, spread: v.spreadMode, rot: v.pagesRotation };
    x.annots = x.annots.map(a => { const p = remap(a.page, a); return p ? { ...a, page: p } : null; }).filter(Boolean);
    x.undo = []; x.redo = []; x.sel = null; x.pdf = pdf; x.bytes = out;
    attachDoc(x); try { old.destroy(); } catch {}
    markDirty(x); rebuildSide(); return true;
  } catch (e) { console.error(e); toast(e.userMsg || t('The operation failed: {e}', { e: e.message }), 4000); return false; }
  finally { busy(); }
}
function deletePages(list) {
  const x = T(); if (list.length >= x.pdf.numPages) return toast(t('You can\'t delete every page'));
  const set = new Set(list);
  return pageOp(t('Deleting pages…'), doc => { [...list].sort((a, b) => b - a).forEach(n => doc.removePage(n - 1)); }, p => set.has(p) ? null : p - list.filter(n => n < p).length, Math.min(list[0], x.pdf.numPages - list.length));
}
function rotatePages(list, d) { return pageOp(t('Rotating…'), doc => list.forEach(n => { const p = doc.getPage(n - 1); p.setRotation(PL.degrees(((p.getRotation().angle + d) % 360 + 360) % 360)); }), p => p); }
function movePage(from, to) {
  const x = T(); if (to < 1 || to > x.pdf.numPages) return;
  return pageOp(t('Moving page…'), doc => { const p = doc.getPage(from - 1); doc.removePage(from - 1); doc.insertPage(to - 1, p); }, p => p === from ? to : (from < to ? (p > from && p <= to ? p - 1 : p) : (p >= to && p < from ? p + 1 : p)), to);
}
function insertBlank(after) { return pageOp(t('Inserting page…'), doc => { const { width, height } = doc.getPage(after - 1).getSize(); doc.insertPage(after, [width, height]); }, p => p > after ? p + 1 : p, after + 1); }
async function mergeFiles() {
  const x = T(); if (!canModify(x)) return; const files = N ? await N.openDialog({ title: t('Choose PDF files to merge'), raw: true }) : []; if (!files.length) return;
  const where = await modal(t('Where should the pages go?'), t('Add the pages of the chosen files:'), [{ label: t('At the end'), value: 'end', primary: true }, { label: t('After the current page'), value: 'after' }, { label: t('Cancel'), value: null }]);
  if (!where) return; const cur = x.viewer.currentPageNumber; let added = 0;
  const ok = await pageOp(t('Merging…'), async doc => {
    let idx = where === 'end' ? doc.getPageCount() : cur;
    for (const f of files) {
      let data = f.data; const u = await unlock(data); if (!u) throw Object.assign(new Error('cancelled'), { userMsg: t('Cancelled') }); data = u.bytes;
      const src = await PL.PDFDocument.load(data, { ignoreEncryption: true }); if (src.isEncrypted) throw Object.assign(new Error('enc'), { userMsg: t('"{name}" is encrypted and can\'t be merged.', { name: f.name }) });
      for (const p of await doc.copyPages(src, src.getPageIndices())) { doc.insertPage(idx++, p); added++; }
    }
  }, p => where === 'after' && p > cur ? p + added : p, () => where === 'end' ? x.viewer.currentPageNumber : cur + 1);
  if (ok) toast(t('{n} pages added', { n: num(added) }));
}
async function extractPages(preset) {
  const x = T(); let list = preset;
  if (!list) { const s = await prompt(t('Extract pages'), t('Pages'), String(x.viewer.currentPageNumber), { hint: t('Example: 1-3, 5, 8-10') }); if (s === null) return; list = parseRange(s, x.pdf.numPages); if (!list) return toast(t('Invalid page range')); }
  busy(t('Extracting…'));
  try { const src = await loadLib(await buildBytes(x, { encrypt: false })); const out = await PL.PDFDocument.create(); (await out.copyPages(src, list.map(n => n - 1))).forEach(p => out.addPage(p));
    let data = await out.save(); if (x.protection) data = await encryptBytes(data, x.protection); busy();
    const r = await saveBytes(data, `${stem(x)} - ${t('pages')} ${list.length === 1 ? list[0] : list[0] + '-' + list[list.length - 1]}.pdf`); if (r) toast(t('Extracted pages saved'));
  } catch (e) { toast(e.userMsg || t('The operation failed: {e}', { e: e.message })); } finally { busy(); }
}
async function splitDoc() {
  const x = T(); const s = await prompt(t('Split document'), t('Pages per part'), '1', { hint: t('The document has {n} pages. You\'ll choose where to save the first part; the rest are saved next to it.', { n: num(x.pdf.numPages) }) });
  const k = parseInt(s); if (!k || k < 1) return; busy(t('Splitting…'));
  try {
    const src = await loadLib(await buildBytes(x, { encrypt: false })); const total = src.getPageCount(), parts = [];
    for (let i = 0; i < total; i += k) { const out = await PL.PDFDocument.create(); (await out.copyPages(src, Array.from({ length: Math.min(k, total - i) }, (_, j) => i + j))).forEach(p => out.addPage(p)); let d = await out.save(); if (x.protection) d = await encryptBytes(d, x.protection); parts.push(d); }
    busy(); const r = await saveBytes(parts[0], `${stem(x)}-1.pdf`); if (!r) return;
    if (N && r.path) { const sep = r.path.includes('\\') ? '\\' : '/', dir = r.path.slice(0, r.path.lastIndexOf(sep)), base = r.name.replace(/-?1?\.pdf$/i, '');
      for (let i = 1; i < parts.length; i++) await N.writePath(`${dir}${sep}${base}-${i + 1}.pdf`, parts[i]); N.showInFolder(r.path); }
    toast(t('Split into {n} files', { n: num(parts.length) }));
  } catch (e) { toast(e.userMsg || t('The operation failed: {e}', { e: e.message })); } finally { busy(); }
}

/* ================= password protection ================= */
async function protectDialog() {
  const x = T(); if (!canModify(x)) return;
  if (!(await hasQpdf())) return toast(t('This feature isn\'t available in this build.'));
  const p = x.protection || { user: '', owner: '', print: true, copy: true, modify: true };
  const u = el('input', { type: 'password', value: p.user }), u2 = el('input', { type: 'password', value: p.user }), o = el('input', { type: 'password', value: p.owner });
  const cb = (k, label) => { const i = el('input', { type: 'checkbox' }); i.checked = p[k]; i.dataset.k = k; return el('label', {}, i, label); };
  const checks = el('div', { class: 'checks' }, cb('print', t('Allow printing')), cb('copy', t('Allow copying text')), cb('modify', t('Allow editing')));
  const body = el('div', {},
    el('div', { class: 'field' }, el('label', { text: t('Password to open the file') }), u), el('div', { class: 'field' }, el('label', { text: t('Confirm password') }), u2),
    el('div', { class: 'field' }, el('label', { text: t('Permissions password (optional)') }), o, el('div', { class: 'hint', text: t('Anyone who opens the file with this password gets full rights, whatever the restrictions below.') })),
    checks, el('div', { class: 'hint', text: t('Uses AES-256 encryption. The password is applied when you save.') }));
  const btns = [{ label: t('Apply'), value: 'set', primary: true, check: () => { if (!u.value) { toast(t('Enter a password')); return false; } if (u.value !== u2.value) { toast(t('The passwords don\'t match')); return false; } return true; } }];
  if (x.protection) btns.push({ label: t('Remove password'), value: 'remove', danger: true });
  btns.push({ label: t('Cancel'), value: null });
  const r = await modal(t('Password protection'), body, btns); if (!r) return;
  if (r === 'remove') { x.protection = null; toast(t('Password will be removed when you save')); }
  else { const q = { user: u.value, owner: o.value }; checks.querySelectorAll('input').forEach(i => q[i.dataset.k] = i.checked); x.protection = q; toast(t('Password will be applied when you save')); }
  markDirty(x); renderTabs(); syncStatus();
}

/* ================= reduce file size ================= */
async function compressDoc() {
  const x = T(); if (!canModify(x)) return;
  const sel = el('select', {}, el('option', { value: 0 }, t('Light — best quality')), el('option', { value: 1, selected: true }, t('Medium — recommended')), el('option', { value: 2 }, t('Strong — smallest file')));
  const body = el('div', {}, el('div', { class: 'row' }, el('label', { text: t('Compression') }), sel), el('div', { class: 'hint', text: t('Images are scaled down and re-compressed, and the file structure is optimized. The result is saved as a new file; the original stays as it is.') }));
  if (!(await modal(t('Reduce file size'), body, [{ label: t('Compress'), value: true, primary: true }, { label: t('Cancel'), value: null }]))) return;
  const lv = +sel.value, maxPx = [2600, 1800, 1200][lv], q = [.82, .68, .52][lv];
  try {
    busy(t('Preparing…'), 0); const before = (await baseBytes(x)).length;
    const doc = await loadLib(await buildBytes(x, { encrypt: false })); const objs = doc.context.enumerateIndirectObjects(); let i = 0, changed = 0;
    for (const [ref, obj] of objs) {
      i++; if (i % 20 === 0) busy(t('Compressing images…'), i / objs.length);
      if (!(obj instanceof PL.PDFRawStream)) continue; const d = obj.dict;
      if (d.get(PL.PDFName.of('Subtype')) !== PL.PDFName.of('Image')) continue;
      let f = d.get(PL.PDFName.of('Filter')); if (f instanceof PL.PDFArray) f = f.size() === 1 ? f.get(0) : null; if (f !== PL.PDFName.of('DCTDecode')) continue;
      let cs = d.lookup(PL.PDFName.of('ColorSpace')); if (cs instanceof PL.PDFArray) { const n = cs.lookup(1); const nn = n && n.get && n.get(PL.PDFName.of('N')); if (!nn || nn.asNumber() === 4) continue; } else if (cs !== PL.PDFName.of('DeviceRGB') && cs !== PL.PDFName.of('DeviceGray')) continue;
      if (d.has(PL.PDFName.of('Decode'))) continue;
      const W = d.lookup(PL.PDFName.of('Width')).asNumber(), Hh = d.lookup(PL.PDFName.of('Height')).asNumber(); if (W * Hh < 150000) continue;
      try {
        const bmp = await createImageBitmap(new Blob([obj.contents], { type: 'image/jpeg' })); const k = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
        const nw = Math.max(1, Math.round(bmp.width * k)), nh = Math.max(1, Math.round(bmp.height * k)); const c = document.createElement('canvas'); c.width = nw; c.height = nh; const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
        const nb = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', q))).arrayBuffer()); c.width = c.height = 0;
        if (nb.length > obj.contents.length * .9) continue;
        d.set(PL.PDFName.of('Width'), PL.PDFNumber.of(nw)); d.set(PL.PDFName.of('Height'), PL.PDFNumber.of(nh));
        d.set(PL.PDFName.of('ColorSpace'), PL.PDFName.of('DeviceRGB')); d.set(PL.PDFName.of('BitsPerComponent'), PL.PDFNumber.of(8)); d.delete(PL.PDFName.of('DecodeParms')); d.set(PL.PDFName.of('Length'), PL.PDFNumber.of(nb.length));
        doc.context.assign(ref, PL.PDFRawStream.of(d, nb)); changed++;
      } catch (e) { console.warn('image skipped', e); }
    }
    busy(t('Optimizing structure…'));
    let out = await doc.save({ useObjectStreams: true });
    if (await hasQpdf()) { const r = await N.qpdf(['--object-streams=generate', '--compress-streams=y', '--recompress-flate', '--compression-level=9', ...(lv > 0 ? ['--optimize-images'] : []), '{in}', '{out}'], out); if (r.data && (r.code === 0 || r.code === 3) && r.data.length < out.length) out = r.data; }
    if (x.protection) out = await encryptBytes(out, x.protection);
    busy();
    if (out.length >= before * .98) return modal(t('Reduce file size'), t('This file is already well compressed; no meaningful reduction was possible.'));
    const pct = Math.round((1 - out.length / before) * 100);
    const r = await saveBytes(out, t('{name} (compressed)', { name: stem(x) }) + '.pdf');
    if (r) modal(t('Reduce file size'), t('Done: {a} → {b} ({p}% smaller).', { a: fmtSize(before), b: fmtSize(out.length), p: num(pct) }));
  } catch (e) { console.error(e); toast(e.userMsg || t('The operation failed: {e}', { e: e.message })); } finally { busy(); }
}

/* ================= OCR ================= */
const OCR_LANGS = [['ara', 'Arabic'], ['eng', 'English'], ['fra', 'French'], ['spa', 'Spanish'], ['deu', 'German'], ['tur', 'Turkish']];
const latin1 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
const fromLatin1 = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
/** An OCR layer is a form XObject whose only font is Tesseract's invisible GlyphLessFont */
function ocrLayerKeys(doc, page) {
  const keys = [];
  try {
    const res = page.node.Resources(); const xo = res && res.lookup(PL.PDFName.of('XObject')); if (!(xo instanceof PL.PDFDict)) return keys;
    for (const [k, ref] of xo.entries()) {
      const obj = doc.context.lookup(ref); if (!obj || !obj.dict) continue;
      const r = obj.dict.lookup(PL.PDFName.of('Resources')); const fonts = r instanceof PL.PDFDict ? r.lookup(PL.PDFName.of('Font')) : null; if (!(fonts instanceof PL.PDFDict)) continue;
      const names = fonts.entries().map(([, f]) => { const fd = doc.context.lookup(f); const bf = fd && fd.lookup && fd.lookup(PL.PDFName.of('BaseFont')); return bf ? bf.toString() : ''; });
      if (names.length && names.every(n => /GlyphLessFont/i.test(n))) keys.push(k.asString().slice(1));
    }
  } catch (e) { console.warn(e); }
  return keys;
}
function stripOcrLayers(doc, page) {
  const keys = ocrLayerKeys(doc, page); if (!keys.length) return 0;
  const raw = page.node.get(PL.PDFName.of('Contents')); const refs = raw instanceof PL.PDFRef ? (doc.context.lookup(raw) instanceof PL.PDFArray ? doc.context.lookup(raw).asArray() : [raw]) : raw instanceof PL.PDFArray ? raw.asArray() : [];
  const re = new RegExp('/(' + keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\s+Do', 'g');
  for (const ref of refs) {
    if (!(ref instanceof PL.PDFRef)) continue; const st = doc.context.lookup(ref); if (!(st instanceof PL.PDFRawStream)) continue;
    let text; try { text = latin1(PL.decodePDFRawStream(st).decode()); } catch { continue; }
    if (!re.test(text)) continue; re.lastIndex = 0;
    doc.context.assign(ref, doc.context.stream(fromLatin1(text.replace(re, ''))));
  }
  const xo = page.node.Resources().lookup(PL.PDFName.of('XObject')); keys.forEach(k => xo.delete(PL.PDFName.of(k)));
  return keys.length;
}
async function pageHasText(pdf, n) { const tc = await (await pdf.getPage(n)).getTextContent(); return tc.items.reduce((s, it) => s + (it.str ? it.str.trim().length : 0), 0) > 3; }
async function removeOcrText() {
  const x = T(); if (!canModify(x)) return; let removed = 0;
  const ok = await pageOp(t('Removing recognized text…'), doc => { doc.getPages().forEach(p => { removed += stripOcrLayers(doc, p) ? 1 : 0; }); }, p => p);
  if (ok) toast(removed ? t('Recognized text removed from {n} pages', { n: num(removed) }) : t('This file has no recognized-text layer'));
}
async function runOcr(preset) {
  const x = T(); if (!canModify(x)) return;
  const defaults = store.get('ocrLangs', ({ ar: ['ara', 'eng'], en: ['eng'], fr: ['fra', 'eng'], es: ['spa', 'eng'], de: ['deu', 'eng'], tr: ['tur', 'eng'] })[lang] || ['eng']);
  const checks = el('div', { class: 'checks' }, ...OCR_LANGS.map(([c, nm]) => { const i = el('input', { type: 'checkbox', value: c }); i.checked = defaults.includes(c); return el('label', {}, i, t(nm)); }));
  const mode = el('select', {}, el('option', { value: 'all' }, t('All pages')), el('option', { value: 'range' }, t('Specific pages…')));
  const range = el('input', { type: 'text', placeholder: t('Example: 1-3, 5, 8-10'), style: 'display:none' }); mode.onchange = () => range.style.display = mode.value === 'range' ? '' : 'none';
  const existing = el('select', {}, el('option', { value: 'skip' }, t('Leave it as is (recommended)')), el('option', { value: 'replace' }, t('Replace it with recognized text')));
  const body = el('div', {}, el('div', { class: 'hint', text: t('Text recognition makes scanned pages searchable and copyable. The page image stays exactly as it is; an invisible text layer is added on top.') }),
    el('h3', { text: t('Document languages'), style: 'font-size:14px;margin:12px 0 2px' }), checks,
    ...(preset ? [] : [el('div', { class: 'row' }, el('label', { text: t('Pages') }), mode, range)]),
    el('div', { class: 'row' }, el('label', { text: t('If a page already has text') }), existing),
    el('div', { class: 'hint', text: t('Choose "Replace" only when the existing text is broken — for example, when copied Arabic comes out garbled or reversed. The page is turned into an image and the recognized text replaces the old text.') }));
  const r = await modal(t('Recognize text (OCR)'), body, [{ label: t('Start'), value: 'go', primary: true }, { label: t('Remove recognized text'), value: 'remove' }, { label: t('Cancel'), value: null }]);
  if (r === 'remove') return removeOcrText(); if (!r) return;
  const langs = [...checks.querySelectorAll('input:checked')].map(i => i.value); if (!langs.length) return toast(t('Choose at least one language'));
  store.set('ocrLangs', langs);
  let pages = preset || (mode.value === 'range' ? parseRange(range.value, x.pdf.numPages) : Array.from({ length: x.pdf.numPages }, (_, i) => i + 1));
  if (!pages) return toast(t('Invalid page range'));
  let cancelled = false, worker = null, clean = null; const results = [];
  try {
    busy(t('Checking pages…'));
    // Look at the pages without any earlier OCR layer, so re-running replaces it instead of stacking a second one
    const doc0 = await loadLib(await baseBytes(x)); let hadOcr = false; doc0.getPages().forEach(p => { if (stripOcrLayers(doc0, p)) hadOcr = true; });
    clean = hadOcr ? await loadPdf(await doc0.save()) : x.pdf;
    const plan = [];
    for (const n of pages) { const real = await pageHasText(clean, n); if (!real) plan.push({ n, replace: false }); else if (existing.value === 'replace') plan.push({ n, replace: true }); }
    if (!plan.length) { busy(); if (clean !== x.pdf) clean.destroy(); return modal(t('Recognize text (OCR)'), t('Every selected page already has real text, so recognition isn\'t needed. If that text copies incorrectly, run OCR again and choose "Replace it with recognized text".')); }
    banner(t('Recognizing text…'), [{ label: t('Stop'), onclick: () => { cancelled = true; hideBanner(); } }]);
    busy(t('Loading the text recognition engine…'));
    const abs = p => new URL(p, location.href).href;
    worker = await Tesseract.createWorker(langs.join('+'), 1, { workerPath: abs('lib/tesseract/worker.min.js'), corePath: abs('lib/tesseract/core'), langPath: abs('lib/tesseract/lang'), gzip: true, workerBlobURL: false, cacheMethod: 'none' });
    const DPI = 250; await worker.setParameters({ user_defined_dpi: String(DPI), preserve_interword_spaces: '1' });
    for (let i = 0; i < plan.length && !cancelled; i++) {
      const { n, replace } = plan[i]; busy(t('Recognizing page {n} ({i} of {c})…', { n: num(n), i: num(i + 1), c: num(plan.length) }), i / plan.length);
      const page = await clean.getPage(n), vp = page.getViewport({ scale: DPI / 72, rotation: 0 });
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp, intent: 'print', annotationMode: replace ? L.AnnotationMode.DISABLE : L.AnnotationMode.ENABLE_STORAGE }).promise;
      const res = await worker.recognize(c, { pdfTextOnly: true }, { pdf: true, text: true });
      const jpg = replace ? new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', .9))).arrayBuffer()) : null;
      c.width = c.height = 0;
      if (res.data.text && res.data.text.trim()) results.push({ n, replace, jpg, pdf: new Uint8Array(res.data.pdf), view: page.view });
    }
  } catch (e) { console.error(e); busy(); hideBanner(); try { worker && await worker.terminate(); } catch {} if (clean && clean !== x.pdf) clean.destroy(); return toast(t('Text recognition failed: {e}', { e: e.message || e })); }
  try { await worker.terminate(); } catch {}
  if (clean && clean !== x.pdf) clean.destroy();
  hideBanner(); busy();
  if (!results.length) return modal(t('Recognize text (OCR)'), t('No text was found on the selected pages.'));
  const ok = await pageOp(t('Adding the text layer…'), async doc => {
    for (const r of results) {
      const p = doc.getPage(r.n - 1); stripOcrLayers(doc, p);
      const [x0, y0, x1, y1] = r.view, w = x1 - x0, h = y1 - y0;
      if (r.replace) { p.node.delete(PL.PDFName.of('Contents')); p.node.set(PL.PDFName.of('Resources'), doc.context.obj({})); p.drawImage(await doc.embedJpg(r.jpg), { x: x0, y: y0, width: w, height: h }); }
      else wrapContent(doc, p);
      const [emb] = await doc.embedPdf(r.pdf, [0]); const name = p.node.newXObject('PROCR', emb.ref);
      const sx = w / emb.width, sy = h / emb.height;
      p.node.addContentStream(doc.context.register(doc.context.stream(`q\n${sx.toFixed(6)} 0 0 ${sy.toFixed(6)} ${x0} ${y0} cm\n/${name.asString().slice(1)} Do\nQ\n`)));
    }
  }, p => p);
  if (ok) toast(t('Text recognized on {n} pages. You can now search and copy it.', { n: num(results.length) }), 4000);
}

/* ================= redaction ================= */
async function redactMatches() {
  const x = T(); if (!canModify(x)) return; const q = $('q').value.trim().replace(/\s+/g, ' '); if (!q) return toast(t('Type what to search for first'));
  const cs = $('qCase').checked, needle = cs ? q : q.toLocaleLowerCase(); const found = [];
  busy(t('Searching…'));
  for (let n = 1; n <= x.pdf.numPages; n++) {
    const tc = await (await x.pdf.getPage(n)).getTextContent(); let hay = ''; const pieces = [];
    for (const it of tc.items) {
      if (!it.str) { if (it.hasEOL && hay && !hay.endsWith(' ')) hay += ' '; continue; }
      let str = it.str.replace(/\s+/g, ' '); if (hay.endsWith(' ')) str = str.replace(/^ /, ''); if (!str) continue;
      pieces.push({ it, start: hay.length, end: hay.length + str.length }); hay += str;
      if (it.hasEOL && !hay.endsWith(' ')) hay += ' ';
    }
    if (!cs) hay = hay.toLocaleLowerCase();
    for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) {
      const ms = i, me = i + needle.length; const boxes = [];
      for (const pc of pieces) {
        if (pc.end <= ms || pc.start >= me) continue; const it = pc.it, tr = it.transform; if (Math.abs(tr[1]) > .01 || Math.abs(tr[2]) > .01) continue;
        const len = pc.end - pc.start || 1, a = (Math.max(ms, pc.start) - pc.start) / len, b = (Math.min(me, pc.end) - pc.start) / len, fh = Math.hypot(tr[2], tr[3]) || it.height, rtl = ARABIC.test(it.str);
        const xs = tr[4] + it.width * (rtl ? 1 - b : a), xe = tr[4] + it.width * (rtl ? 1 - a : b);
        const bx = { x1: xs - fh * .15, x2: xe + fh * .2, y1: tr[5] - fh * .25, y2: tr[5] + fh * .95 };
        const same = boxes.find(o => Math.abs(o.y1 - bx.y1) < fh * .5); if (same) { same.x1 = Math.min(same.x1, bx.x1); same.x2 = Math.max(same.x2, bx.x2); same.y2 = Math.max(same.y2, bx.y2); } else boxes.push(bx);
      }
      boxes.forEach(b => found.push(newAnnot({ type: 'redact', page: n, color: '#000000', quote: q, p1: [b.x1, b.y2], p2: [b.x2, b.y1] })));
    }
  }
  busy(); if (!found.length) return toast(t('No results'));
  mutate(x, () => x.annots.push(...found));
  if (!$('toolsbar').classList.contains('open')) $('bTools').click();
  toast(t('{n} matches marked. Review them, then press "Apply redactions".', { n: num(found.length) }), 4500);
}
async function applyRedactions() {
  const x = T(); if (!canModify(x)) return; const marks = x.annots.filter(a => a.type === 'redact');
  if (!marks.length) return modal(t('Apply redactions'), t('Nothing is marked yet. Use the redaction tool to drag over content, or search and press "Redact matches".'));
  const pages = [...new Set(marks.map(a => a.page))].sort((a, b) => a - b); const meta = el('input', { type: 'checkbox', checked: true });
  const body = el('div', {}, el('div', { class: 'warnbox', text: t('Redaction permanently removes the marked content. Affected pages ({p}) are converted to images so the hidden text can\'t be recovered; text on those pages will no longer be selectable unless you run OCR afterwards. This can\'t be undone once you save.', { p: pages.join(', ') }) }),
    el('label', { class: 'mini' }, meta, t('Also remove document information (author, title, etc.)')));
  if (!(await modal(t('Apply redactions'), body, [{ label: t('Redact permanently'), value: true, danger: true }, { label: t('Cancel'), value: null }]))) return;
  const imgs = [];
  for (let i = 0; i < pages.length; i++) {
    busy(t('Redacting page {n}…', { n: num(pages[i]) }), i / pages.length);
    const n = pages[i], page = await x.pdf.getPage(n), DPI = 200, vp = page.getViewport({ scale: DPI / 72, rotation: 0 });
    const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp, intent: 'print', annotationMode: L.AnnotationMode.ENABLE_STORAGE, printAnnotationStorage: x.pdf.annotationStorage }).promise;
    const list = x.annots.filter(a => a.page === n); for (const a of list) if (a.src) { try { await getImg(a.src).decode(); } catch {} }
    list.filter(a => a.type !== 'redact').forEach(a => drawAnnot(ctx, vp, a)); list.filter(a => a.type === 'redact').forEach(a => drawAnnot(ctx, vp, a, { final: true }));
    imgs.push({ n, jpg: new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', .9))).arrayBuffer()), view: page.view }); c.width = c.height = 0;
  }
  const set = new Set(pages);
  const ok = await pageOp(t('Redacting…'), async doc => {
    for (const r of imgs) {
      const old = doc.getPage(r.n - 1), rot = old.getRotation().angle, w = r.view[2] - r.view[0], h = r.view[3] - r.view[1];
      const np = doc.insertPage(r.n - 1, [w, h]); np.drawImage(await doc.embedJpg(r.jpg), { x: 0, y: 0, width: w, height: h }); np.setRotation(PL.degrees(rot)); doc.removePage(r.n);
    }
    if (meta.checked) { doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setCreator(''); doc.setProducer(''); doc.catalog.delete(PL.PDFName.of('Metadata')); }
  }, (p, a) => set.has(p) || a.type === 'redact' ? null : p);
  if (ok) toast(t('Redactions applied. Save the file to keep them.'), 4000);
}

/* ================= images → PDF ================= */
async function imagesToPdf(files) {
  if (!files) { if (!N) return; files = await N.openDialog({ title: t('Choose images'), raw: true, filters: [{ name: t('Images'), extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'] }] }); }
  if (!files || !files.length) return;
  const size = el('select', {}, el('option', { value: 'fit' }, t('Same as image')), el('option', { value: 'a4', selected: true }, 'A4'), el('option', { value: 'letter' }, 'Letter'));
  const margin = el('select', {}, el('option', { value: 0 }, t('None')), el('option', { value: 18, selected: true }, t('Small')), el('option', { value: 40 }, t('Normal')));
  const body = el('div', {}, el('p', { text: t('{n} images selected. Each image becomes one page, in the order shown.', { n: num(files.length) }) }), el('div', { class: 'row' }, el('label', { text: t('Page size') }), size), el('div', { class: 'row' }, el('label', { text: t('Margins') }), margin));
  if (!(await modal(t('Create PDF from images'), body, [{ label: t('Create'), value: true, primary: true }, { label: t('Cancel'), value: null }]))) return;
  const doc = await PL.PDFDocument.create(); const m = +margin.value;
  try {
    for (let i = 0; i < files.length; i++) {
      busy(t('Adding image {i} of {c}…', { i: num(i + 1), c: num(files.length) }), i / files.length);
      const f = files[i], isJpg = /\.jpe?g$/i.test(f.name); const c = await decodeImage(new Blob([f.data]));
      const b = await new Promise(r => c.toBlob(r, isJpg ? 'image/jpeg' : 'image/png', .92)); const bytes = new Uint8Array(await b.arrayBuffer());
      const img = isJpg ? await doc.embedJpg(bytes) : await doc.embedPng(bytes); const iw = c.width * .75, ih = c.height * .75; c.width = c.height = 0;
      let pw, ph; if (size.value === 'fit') { pw = iw + m * 2; ph = ih + m * 2; } else { [pw, ph] = size.value === 'a4' ? [595.28, 841.89] : [612, 792]; if (iw > ih) [pw, ph] = [ph, pw]; }
      const k = Math.min((pw - m * 2) / iw, (ph - m * 2) / ih, size.value === 'fit' ? 1 : Infinity); const dw = iw * k, dh = ih * k;
      doc.addPage([pw, ph]).drawImage(img, { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
    }
    busy(); await openData(await doc.save(), t('Images') + '.pdf', ''); const x = T(); if (x) { markDirty(x); }
  } catch (e) { console.error(e); toast(t('Could not read this image')); } finally { busy(); }
}

/* ================= print / export ================= */
async function renderFull(x, n, dpi, { annots = true } = {}) {
  const page = await x.pdf.getPage(n), vp = page.getViewport({ scale: dpi / 72, rotation: (page.rotate + x.viewer.pagesRotation) % 360 });
  const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height); const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp, intent: 'print', annotationMode: L.AnnotationMode.ENABLE_STORAGE, printAnnotationStorage: x.pdf.annotationStorage }).promise;
  if (annots) { const list = x.annots.filter(a => a.page === n); for (const a of list) if (a.src) { try { await getImg(a.src).decode(); } catch {} }
    list.filter(a => a.type !== 'redact' && a.type !== 'note').forEach(a => drawAnnot(ctx, vp, a)); }
  return c;
}

/* ================= print dialog with live preview ================= */
const PAPERS = { A4: [210, 297], Letter: [215.9, 279.4], Legal: [215.9, 355.6], A3: [297, 420], A5: [148, 210] };
async function pageDims(x, n) { const p = await x.pdf.getPage(n); const v = p.getViewport({ scale: 1, rotation: (p.rotate + x.viewer.pagesRotation) % 360 }); return [v.width, v.height]; }
/** Decide sheet orientation and which pages get turned to fit the paper */
async function printPlan(x, list, orient) {
  const dims = await Promise.all(list.map(n => pageDims(x, n))); const land = dims.map(([w, h]) => w > h);
  let landscape = orient === 'landscape';
  if (orient === 'auto') landscape = land.length > 0 && land.every(Boolean);
  return { landscape, rotate: list.map((_, i) => orient === 'auto' && !landscape && land[i]) };
}
function sheetCanvas(src, rotate, gray) {
  const c = document.createElement('canvas'); c.width = rotate ? src.height : src.width; c.height = rotate ? src.width : src.height;
  const ctx = c.getContext('2d'); if (gray) ctx.filter = 'grayscale(1)';
  if (rotate) { ctx.translate(c.width, 0); ctx.rotate(Math.PI / 2); } ctx.drawImage(src, 0, 0); return c;
}
async function printDoc() {
  const x = T(); if (!x) return; if (x.noPrint) return toast(t('The owner of this file doesn\'t allow printing.'));
  const printers = N ? await N.printers() : [];
  const lastPrinter = store.get('printer'), saved = Object.assign({ paper: 'A4', orient: 'auto', color: 'color', sides: 'simplex', margins: 'printer', annots: true }, store.get('printOpts', {}));
  const opt = (v, label, sel) => el('option', { value: v, selected: sel }, label);
  const printerSel = el('select', {}, ...(printers.length ? printers.map(p => opt(p.name, p.displayName, lastPrinter ? p.name === lastPrinter : p.isDefault)) : [opt('', t('Default printer'), true)]));
  const copies = el('input', { type: 'number', min: 1, max: 999, value: 1, style: 'width:80px' });
  const pagesSel = el('select', {}, opt('all', t('All pages'), true), opt('current', t('Current page')), opt('range', t('Specific pages…')));
  const range = el('input', { type: 'text', placeholder: t('Example: 1-3, 5, 8-10'), style: 'display:none;width:100%' });
  const paperSel = el('select', {}, ...Object.keys(PAPERS).map(k => opt(k, k, k === saved.paper)));
  const orientSel = el('select', {}, opt('auto', t('Automatic'), saved.orient === 'auto'), opt('portrait', t('Portrait'), saved.orient === 'portrait'), opt('landscape', t('Landscape'), saved.orient === 'landscape'));
  const colorSel = el('select', {}, opt('color', t('Color'), saved.color === 'color'), opt('gray', t('Black and white'), saved.color === 'gray'));
  const sidesSel = el('select', {}, opt('simplex', t('One-sided'), saved.sides === 'simplex'), opt('longEdge', t('Two-sided (flip on long edge)'), saved.sides === 'longEdge'), opt('shortEdge', t('Two-sided (flip on short edge)'), saved.sides === 'shortEdge'));
  const marginSel = el('select', {}, opt('printer', t('Printer margins'), saved.margins === 'printer'), opt('none', t('No margins (borderless)'), saved.margins === 'none'));
  const annChk = el('input', { type: 'checkbox' }); annChk.checked = saved.annots;
  const row = (label, ...ctl) => el('div', { class: 'prow' }, el('label', { text: label }), el('div', { class: 'pctl' }, ...ctl));
  const prev = el('canvas', { class: 'pprev' }), info = el('span', { class: 'pinfo' }), bPrev = el('button', { type: 'button', title: t('Previous page') }, icon('up')), bNext = el('button', { type: 'button', title: t('Next page') }, icon('down'));
  const body = el('div', { class: 'pgrid' },
    el('div', { class: 'popts' }, row(t('Printer'), printerSel), row(t('Copies'), copies), row(t('Pages'), pagesSel, range), row(t('Paper size'), paperSel), row(t('Orientation'), orientSel),
      row(t('Color mode'), colorSel), row(t('Sides'), sidesSel), row(t('Margins'), marginSel), el('label', { class: 'mini', style: 'margin-top:4px;color:var(--ink)' }, annChk, t('Print comments and signatures'))),
    el('div', { class: 'pview' }, el('div', { class: 'pstage' }, prev), el('div', { class: 'pnav' }, bPrev, info, bNext)));
  let list = [], idx = 0, plan = null, token = 0;
  const pages = () => pagesSel.value === 'all' ? Array.from({ length: x.pdf.numPages }, (_, i) => i + 1) : pagesSel.value === 'current' ? [x.viewer.currentPageNumber] : parseRange(range.value, x.pdf.numPages);
  async function refresh(resetIdx) {
    range.style.display = pagesSel.value === 'range' ? '' : 'none';
    const l = pages(); if (!l || !l.length) { info.textContent = t('Invalid page range'); prev.getContext('2d').clearRect(0, 0, prev.width, prev.height); list = []; return; }
    list = l; if (resetIdx) idx = 0; idx = Math.min(idx, list.length - 1);
    const my = ++token; plan = await printPlan(x, list, orientSel.value); if (my !== token) return;
    info.textContent = t('Page {a} of {b}', { a: num(idx + 1), b: num(list.length) }) + (+copies.value > 1 ? ' · ' + t('{n} copies', { n: num(+copies.value) }) : '');
    bPrev.disabled = idx === 0; bNext.disabled = idx >= list.length - 1;
    // paper sheet
    let [pw, ph] = PAPERS[paperSel.value]; if (plan.landscape) [pw, ph] = [ph, pw];
    const box = prev.parentElement.getBoundingClientRect(), maxW = Math.max(200, box.width - 24), maxH = Math.max(260, box.height - 24);
    const k = Math.min(maxW / pw, maxH / ph), W = Math.round(pw * k), H = Math.round(ph * k), d = DPR();
    prev.width = W * d; prev.height = H * d; prev.style.width = W + 'px'; prev.style.height = H + 'px';
    const src = await renderFull(x, list[idx], Math.min(110, 72 * W * d / 400), { annots: annChk.checked }); if (my !== token) return;
    const sh = sheetCanvas(src, plan.rotate[idx], colorSel.value === 'gray');
    const ctx = prev.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    const m = marginSel.value === 'none' ? 0 : 6.35 * k, aw = W - 2 * m, ah = H - 2 * m, s = Math.min(aw / sh.width, ah / sh.height);
    ctx.drawImage(sh, (W - sh.width * s) / 2, (H - sh.height * s) / 2, sh.width * s, sh.height * s);
    if (m) { ctx.strokeStyle = 'rgba(29,95,209,.35)'; ctx.setLineDash([4, 4]); ctx.strokeRect(m, m, aw, ah); }
  }
  [pagesSel, paperSel, orientSel, colorSel, marginSel, annChk].forEach(c => c.addEventListener('change', () => refresh(c === pagesSel)));
  range.addEventListener('input', () => { clearTimeout(range.t); range.t = setTimeout(() => refresh(true), 300); }); copies.addEventListener('input', () => refresh());
  bPrev.onclick = () => { idx--; refresh(); }; bNext.onclick = () => { idx++; refresh(); };
  const r = await modal(t('Print'), body, [
    { label: t('Print'), value: 'print', primary: true, check: () => { if (!list.length) { toast(t('Invalid page range')); return false; } return true; } },
    { label: t('More printer settings…'), value: 'system', check: () => { if (!list.length) { toast(t('Invalid page range')); return false; } return true; } },
    { label: t('Cancel'), value: null }], d => { d.classList.add('wide'); setTimeout(() => refresh(true), 30); });
  if (!r) return;
  store.set('printer', printerSel.value); store.set('printOpts', { paper: paperSel.value, orient: orientSel.value, color: colorSel.value, sides: sidesSel.value, margins: marginSel.value, annots: annChk.checked });
  await runPrintJob(x, list, { system: r === 'system', deviceName: printerSel.value, copies: Math.max(1, Math.min(999, parseInt(copies.value) || 1)), paper: paperSel.value, orient: orientSel.value,
    gray: colorSel.value === 'gray', sides: sidesSel.value, margins: marginSel.value, annots: annChk.checked });
}
async function runPrintJob(x, list, o, toPdf) {
  if (!N) { window.print(); return; }
  const plan = await printPlan(x, list, o.orient); const id = await N.printBegin();
  try {
    for (let i = 0; i < list.length; i++) {
      busy(t('Preparing page {i} of {c}…', { i: num(i + 1), c: num(list.length) }), i / list.length);
      const src = await renderFull(x, list[i], list.length > 150 ? 150 : 200, { annots: o.annots }); const sh = sheetCanvas(src, plan.rotate[i], o.gray); src.width = src.height = 0;
      await N.printAdd(id, i, new Uint8Array(await (await new Promise(r => sh.toBlob(r, 'image/jpeg', .92))).arrayBuffer())); sh.width = sh.height = 0;
    }
    busy(t('Sending to the printer…'));
    const res = await N.printRun(id, { system: o.system, deviceName: o.deviceName, copies: o.copies, landscape: plan.landscape, color: !o.gray, pageSize: o.paper, marginType: o.margins === 'none' ? 'none' : 'printableArea', duplexMode: o.sides, toPdf });
    busy();
    if (res.ok) toast(t('Sent to the printer')); else if (!/cancel/i.test(res.reason)) toast(t('Printing failed') + (res.reason ? ': ' + res.reason : ''), 4000);
    return res;
  } catch (e) { console.error(e); N.printCancel(id); toast(t('Printing failed')); }
  finally { busy(); }
}
async function exportPng(n) {
  const x = T(); n = n || x.viewer.currentPageNumber;
  const dpi = await modal(t('Export page {n} as an image', { n: num(n) }), t('Choose the resolution:'), [{ label: '300 DPI', value: 300, primary: true }, { label: '150 DPI', value: 150 }, { label: '72 DPI', value: 72 }, { label: t('Cancel'), value: null }]);
  if (!dpi) return; busy(t('Exporting…'));
  try { const c = await renderFull(x, n, dpi); const b = await new Promise(r => c.toBlob(r, 'image/png')); busy();
    const r = await saveBytes(new Uint8Array(await b.arrayBuffer()), `${stem(x)} - ${n}.png`, [{ name: 'PNG', extensions: ['png'] }]); if (r) toast(t('Image saved'));
  } catch (e) { toast(t('Export failed')); } finally { busy(); }
}
async function pageText(x, n) {
  const tc = await (await x.pdf.getPage(n)).getTextContent(); let s = '';
  for (const it of tc.items) { if (!('str' in it)) continue; s += it.str; if (it.hasEOL) s += '\n'; else if (it.str && !/\s$/.test(it.str)) s += ' '; }
  return s.replace(/[ \t]+\n/g, '\n').trim();
}
async function exportTxt() {
  const x = T(); let out = '';
  try { for (let n = 1; n <= x.pdf.numPages; n++) { busy(t('Extracting text…'), n / x.pdf.numPages); out += `\n\n——— ${t('Page {n}', { n })} ———\n\n` + await pageText(x, n); }
    busy(); const r = await saveBytes(new TextEncoder().encode('\uFEFF' + out.trim()), stem(x) + '.txt', [{ name: 'Text', extensions: ['txt'] }]); if (r) toast(t('Text saved'));
  } finally { busy(); }
}
async function copyPageText() { const x = T(); const s = await pageText(x, x.viewer.currentPageNumber); if (!s) return toast(t('This page has no text. If it is scanned, run text recognition (OCR) first.'), 3500); await navigator.clipboard.writeText(s); toast(t('Page text copied')); }

/* ================= read aloud ================= */
let speaking = null;
function stopSpeak() { speaking = null; try { speechSynthesis.cancel(); } catch {} $('bSpeak').setAttribute('aria-pressed', 'false'); }
async function speakFrom(x, n) {
  const token = speaking = {}; $('bSpeak').setAttribute('aria-pressed', 'true');
  for (; n <= x.pdf.numPages && speaking === token; n++) {
    x.viewer.currentPageNumber = n; const text = await pageText(x, n); if (!text) continue;
    for (const ch of text.match(/[^.!?؟\n]{1,220}[.!?؟\n]*/g) || [text]) {
      if (speaking !== token) return;
      await new Promise(res => { const u = new SpeechSynthesisUtterance(ch); const ar = ARABIC.test(ch); const want = ar ? 'ar' : lang === 'ar' ? 'en' : lang;
        const v = speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith(want)) || speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith(ar ? 'ar' : 'en'));
        if (v) { u.voice = v; u.lang = v.lang; } u.rate = settings.rate; u.onend = u.onerror = res; speechSynthesis.speak(u); });
    }
  }
  if (speaking === token) stopSpeak();
}
$('bSpeak').onclick = () => { if (speaking) return stopSpeak(); if (!('speechSynthesis' in window)) return toast(t('Read aloud isn\'t available on this computer')); speakFrom(T(), T().viewer.currentPageNumber); toast(t('Reading aloud — press again to stop')); };

/* ================= dialogs: properties, settings, keys, about ================= */
async function showProps() {
  const x = T(), i = x.meta?.info || {};
  const fmt = d => { if (!d) return '—'; const m = /D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(d); return m ? new Date(+m[1], (+m[2] || 1) - 1, +m[3] || 1, +m[4] || 0, +m[5] || 0).toLocaleString(LOC()) : d; };
  const page = await x.pdf.getPage(x.viewer.currentPageNumber), v = page.view; const yes = b => b ? t('Yes') : t('No');
  const rows = [['File name', x.name], ['Location', x.path], ['File size', x.bytes ? fmtSize(x.bytes.length) : ''], ['Title', i.Title], ['Author', i.Author], ['Subject', i.Subject], ['Keywords', i.Keywords],
    ['Created', fmt(i.CreationDate)], ['Modified', fmt(i.ModDate)], ['Application', i.Creator], ['PDF producer', i.Producer], ['PDF version', i.PDFFormatVersion], ['Pages', num(x.pdf.numPages)],
    ['Page size', `${Math.round((v[2] - v[0]) * 25.4 / 72)} × ${Math.round((v[3] - v[1]) * 25.4 / 72)} mm (${Math.round(v[2] - v[0])} × ${Math.round(v[3] - v[1])} pt)`],
    ['Fast web view', yes(i.IsLinearized)], ['Contains forms', yes(i.IsAcroFormPresent || i.IsXFAPresent)], ['Password protected', yes(x.protection || x.password)], ['Restrictions', yes(x.restricted || x.noPrint)]];
  const tb = el('table'); rows.forEach(([k, val]) => { const tr = tb.insertRow(); tr.insertCell().textContent = t(k); const td = tr.insertCell(); td.textContent = (val === undefined || val === '' || val === null) ? '—' : val; td.dir = 'auto'; });
  modal(t('Document properties'), tb, [{ label: t('Close'), value: true, primary: true }]);
}
async function showSettings() {
  const ls = el('select', {}, ...LANGS.map(l => el('option', { value: l.code, selected: l.code === lang }, l.name)));
  const th = el('select', {}, ...[['system', 'Same as Windows'], ['light', 'Light'], ['dark', 'Dark']].map(([v, n]) => el('option', { value: v, selected: settings.theme === v }, t(n))));
  const au = el('input', { type: 'text', value: settings.author, dir: 'auto', placeholder: t('Your name') });
  const rt = el('select', {}, ...[.75, 1, 1.25, 1.5, 2].map(r => el('option', { value: r, selected: settings.rate === r }, r + '×')));
  const rs = el('input', { type: 'checkbox' }); rs.checked = settings.restore;
  const body = el('div', {},
    el('div', { class: 'row' }, el('label', { text: t('Language') }), ls), el('div', { class: 'row' }, el('label', { text: t('Appearance') }), th),
    el('div', { class: 'row' }, el('label', { text: t('Author name for comments') }), au), el('div', { class: 'row' }, el('label', { text: t('Read-aloud speed') }), rt),
    el('label', { class: 'mini', style: 'font-size:13.5px;color:var(--ink)' }, rs, t('Reopen the files that were open last time')));
  if (!(await modal(t('Settings'), body, [{ label: t('Save'), value: true, primary: true }, { label: t('Cancel'), value: null }]))) return;
  Object.assign(settings, { theme: th.value, author: au.value.trim(), rate: +rt.value, restore: rs.checked }); store.set('settings', settings); applyTheme(); N && N.setPrefs({ restore: settings.restore });
  if (ls.value !== lang) { lang = ls.value; store.set('lang', lang); applyI18n(); }
}
function showKeys() {
  const k = [['Open a file', 'Ctrl+O'], ['New window', 'Ctrl+N'], ['Save / Save as', 'Ctrl+S / Ctrl+Shift+S'], ['Print', 'Ctrl+P'], ['Close tab', 'Ctrl+W'], ['Next / previous tab', 'Ctrl+Tab / Ctrl+Shift+Tab'], ['Move tab left / right', 'Ctrl+Shift+PageUp / PageDown'], ['Reopen closed tab', 'Ctrl+Shift+T'], ['Find / next / previous', 'Ctrl+F / F3 / Shift+F3'],
    ['Go to page', 'Ctrl+G'], ['First / last page', 'Home / End'], ['Next / previous page', 'J / K'], ['Zoom in / out', 'Ctrl + / Ctrl -'], ['Automatic / actual size / fit page / fit width', 'Ctrl+0 / 1 / 2 / 3'],
    ['Rotate left / right', 'Ctrl+L / Ctrl+R'], ['Night reading', 'Ctrl+I'], ['Bookmark', 'Ctrl+B'], ['Document properties', 'Ctrl+D'], ['Sidebar', 'F4'], ['Presentation', 'F5'], ['Full screen', 'F11'],
    ['Undo / redo', 'Ctrl+Z / Ctrl+Y'], ['Tools: select, hand, move, pen, text, note', 'V  H  E  P  T  N'], ['Delete the selected comment', 'Delete']];
  const tb = el('table', { class: 'keysTbl' }); k.forEach(([a, b]) => { const tr = tb.insertRow(); tr.insertCell().textContent = t(a); tr.insertCell().textContent = b; });
  modal(t('Keyboard shortcuts'), tb, [{ label: t('Close'), value: true, primary: true }]);
}
const REPO_URL = 'https://github.com/SoCalledBlackBurn/awraq-pdf';
async function showAbout() {
  const info = N ? await N.appInfo() : { version: '' };
  const body = el('div', { class: 'about' },
    el('img', { src: 'brand/symbol.png', alt: '', class: 'about-logo' }),
    el('div', { class: 'wordmark', dir: 'ltr', style: 'font-size:26px;text-align:center' }, el('span', { text: 'Awraq' }), el('span', { class: 'pdf', text: 'PDF' })),
    el('p', { class: 'tagline', style: 'text-align:center', text: t('Open Source PDF Reader & Editor') + (info.version ? ' · v' + info.version : '') }),
    el('p', { style: 'text-align:center;margin:14px 0 4px;font-weight:600', dir: 'ltr', text: '© 2026 Amr Mustafa M. M.' }),
    el('p', { class: 'hint', style: 'text-align:center;margin:0 0 12px', text: t('Developed by Amr Mustafa M. M.') }),
    el('p', { class: 'hint', style: 'line-height:1.7', text: t('This program is free software, licensed under the GNU General Public License version 3 or later. You may use, study, share and modify it. It comes with ABSOLUTELY NO WARRANTY.') }),
    el('p', { class: 'hint', style: 'line-height:1.7', text: t('Built with open-source components:') + ' PDF.js (Apache-2.0) · pdf-lib (MIT) · Tesseract.js (Apache-2.0) · qpdf (Apache-2.0) · Electron (MIT)' }));
  const r = await modal(t('About'), body, [{ label: t('Close'), value: null, primary: true }, { label: t('Source code'), value: 'src' }, { label: t('License'), value: 'lic' }]);
  if (r === 'src') window.open(REPO_URL); else if (r === 'lic') window.open('https://www.gnu.org/licenses/gpl-3.0.html');
}
async function checkUpdates() {
  const info = N ? await N.appInfo() : {};
  if (!info.updates) return modal(t('Check for updates'), info.portable ? t('The portable version doesn\'t update itself. Download the latest version from the project page.') : t('Automatic updates work in the installed version once the project is published on GitHub.'));
  toast(t('Checking for updates…')); await N.checkUpdate();
}
if (N) N.onUpdate(u => {
  if (u.state === 'available') toast(t('Downloading version {v}…', { v: u.version }), 3500);
  else if (u.state === 'downloaded') banner(t('Version {v} is ready.', { v: u.version }), [{ label: t('Restart and update'), onclick: () => N.installUpdate() }]);
  else if (u.state === 'none') toast(t('You have the latest version'));
});

/* ================= text selection: copy, select all, context menu ================= */
function selectedPageText() {
  const sel = window.getSelection(); if (!sel || sel.isCollapsed) return '';
  const n = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
  if (!n || !n.closest || !n.closest('.vc')) return '';
  return sel.toString().replace(/[ \t]+\n/g, '\n').replace(/\u00a0/g, ' ').trim();
}
async function copyText(txt) { try { await navigator.clipboard.writeText(txt); } catch { document.execCommand('copy'); } toast(t('Copied')); }
function selectPageText(n) {
  const x = T(); const tl = x && x.viewer.getPageView(n - 1)?.div.querySelector('.textLayer'); if (!tl || !tl.textContent.trim()) return toast(t('This page has no text. If it is scanned, run text recognition (OCR) first.'), 3500);
  const r = document.createRange(); r.selectNodeContents(tl); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
}
document.addEventListener('contextmenu', e => {
  if (presState) return; const x = T(); if (!x || !e.target.closest || !e.target.closest('.vc .page')) return;
  const txt = selectedPageText(); e.preventDefault();
  const m = $('ctx'); m.innerHTML = ''; const add = (label, fn, dis) => m.append(el('button', { disabled: dis, onclick: () => { closePopups(); fn(); } }, label));
  add(t('Copy'), () => copyText(txt), !txt);
  add(t('Select all text on this page'), () => selectPageText(+e.target.closest('.page').dataset.pageNumber));
  if (txt && !x.restricted) {
    m.append(el('hr'));
    const mark = type => { const prev = tool.name; tool.name = type; applyMarkupFromSelection(); tool.name = prev; };
    add(t('Highlight'), () => mark('highlight')); add(t('Underline'), () => mark('underline')); add(t('Strike-out'), () => mark('strike'));
  }
  if (txt && txt.length < 120) { m.append(el('hr')); add(t('Search for "{q}"', { q: txt.length > 30 ? txt.slice(0, 30) + '…' : txt }), () => { $('q').value = txt; openSearch(); doFind(''); }); }
  openPopup(m, e.clientX, e.clientY);
});

/* ================= actions & keyboard ================= */
function action(a) {
  const x = T(); if (!x && !['open', 'newwin', 'images', 'settings', 'keys', 'about', 'update'].includes(a)) return;
  ({ open: openFiles, newwin: () => N && N.newWindow(), images: () => imagesToPdf(), save: () => save(), saveas: () => save(x, true), flatten: saveFlattened, print: printDoc, folder: () => x.path && N ? N.showInFolder(x.path) : toast(t('This file hasn\'t been saved yet')),
    protect: protectDialog, compress: compressDoc, ocr: () => runOcr(), redact: applyRedactions,
    merge: mergeFiles, extract: () => extractPages(), split: splitDoc, blank: () => insertBlank(x.viewer.currentPageNumber), delpage: () => deletePages([x.viewer.currentPageNumber]),
    rotpage: () => rotatePages([x.viewer.currentPageNumber], 90), png: () => exportPng(), txt: exportTxt, copytext: copyPageText, bookmark: addBookmark, goto: gotoPrompt, props: showProps,
    settings: showSettings, keys: showKeys, about: showAbout, update: checkUpdates })[a]?.();
}
async function gotoPrompt() { const x = T(); const s = await prompt(t('Go to page'), t('Page number (1 – {n})', { n: x.pdf.numPages }), String(x.viewer.currentPageNumber)); const n = parseInt(s); if (n >= 1 && n <= x.pdf.numPages) x.viewer.currentPageNumber = n; }
$('bSave').onclick = () => save(); $('bPrint').onclick = printDoc;
document.addEventListener('keydown', e => {
  const x = T(), mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if ($('dlg').open) return;
  if (presState) { const v = presState.tab.viewer; if (['arrowright', 'arrowdown', 'pagedown', ' ', 'enter'].includes(k)) { e.preventDefault(); v.nextPage(); } else if (['arrowleft', 'arrowup', 'pageup', 'backspace'].includes(k)) { e.preventDefault(); v.previousPage(); } else if (k === 'escape' || k === 'f5') { e.preventDefault(); presentation(false); } else if (k === 'home') v.currentPageNumber = 1; else if (k === 'end') v.currentPageNumber = presState.tab.pdf.numPages; return; }
  const go = fn => { e.preventDefault(); fn(); };
  if (mod && k === 'o') return go(openFiles);
  if (mod && e.shiftKey && k === 't') return go(reopenClosed);
  if (mod && !e.shiftKey && k === 'n') return go(() => N && N.newWindow());
  if (k === 'f11') return go(toggleFull);
  if (!x) return;
  if (mod) {
    if (k === 's') return go(() => save(x, e.shiftKey)); if (k === 'p') return go(printDoc); if (k === 'w') return go(() => closeTab(x));
    if (k === 'tab') return go(() => { const i = tabs.indexOf(x); activate(tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length]); });
    if (k === 'pagedown' || k === 'pageup') { const d = k === 'pagedown' ? 1 : -1; if (e.shiftKey) return go(() => moveTab(x, d)); return go(() => { const i = tabs.indexOf(x); activate(tabs[(i + d + tabs.length) % tabs.length]); }); }
    if (k === 'f') return go(openSearch); if (k === 'g') return go(gotoPrompt); if (k === 'b') return go(addBookmark); if (k === 'd') return go(showProps); if (k === 'i') return go(toggleNight);
    if (k === 'l') return go(() => rotateView(-90)); if (k === 'r') return go(() => rotateView(90));
    if (typing) return;
    if (k === 'c') { const txt = selectedPageText(); if (txt) return go(() => copyText(txt)); return; }
    if (k === 'a') return go(() => selectPageText(x.viewer.currentPageNumber));
    if (k === 'z' && !e.shiftKey) return go(undo); if (k === 'y' || (k === 'z' && e.shiftKey)) return go(redo);
    if (k === '=' || k === '+') return go(() => zoomStep(1)); if (k === '-') return go(() => zoomStep(-1));
    const z = { '0': 'auto', '1': 'page-actual', '2': 'page-fit', '3': 'page-width' }[k]; if (z) return go(() => x.viewer.currentScaleValue = z);
    return;
  }
  if (k === 'f3') return go(() => { if (!$('searchbar').classList.contains('open')) openSearch(); else doFind('again', e.shiftKey); });
  if (k === 'f4') return go(() => $('bSide').click()); if (k === 'f5') return go(() => presentation(true));
  if (k === 'escape') { closePopups(); if (tool.name !== 'select') setTool('select'); else if ($('searchbar').classList.contains('open')) closeSearch(); return; }
  if (typing) return;
  if ((k === 'delete' || k === 'backspace') && x.sel) return go(() => mutate(x, () => x.annots.splice(x.annots.indexOf(x.sel), 1)));
  const v = x.viewer;
  if (k === 'home') return go(() => v.currentPageNumber = 1); if (k === 'end') return go(() => v.currentPageNumber = x.pdf.numPages);
  const paged = v.scrollMode === 3 || v.scrollMode === 1, rtl = langInfo().dir === 'rtl';
  if ((k === 'arrowright' || k === 'arrowleft') && (paged || x.container.scrollWidth <= x.container.clientWidth + 2)) return go(() => ((k === 'arrowleft') === rtl) ? v.nextPage() : v.previousPage());
  if (paged && (k === 'pagedown' || k === 'arrowdown')) return go(() => v.nextPage()); if (paged && (k === 'pageup' || k === 'arrowup')) return go(() => v.previousPage());
  if (k === 'j') return go(() => v.nextPage()); if (k === 'k') return go(() => v.previousPage());
  const toolKeys = { v: 'select', h: 'hand', e: 'edit', p: 'ink', t: 'text', n: 'note' };
  if (toolKeys[k] && !x.restricted) return go(() => { if (!$('toolsbar').classList.contains('open')) $('bTools').click(); setTool(toolKeys[k]); });
});

/* ================= drag & drop, recent, startup ================= */
document.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); document.body.classList.add('dragover'); } });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('dragover'); });
document.addEventListener('drop', async e => {
  if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); document.body.classList.remove('dragover');
  const all = [...e.dataTransfer.files], pdfs = all.filter(f => /\.pdf$/i.test(f.name)), imgs = all.filter(f => /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name));
  for (const f of pdfs) { const p = N && N.pathForFile(f); if (p) await openPath(p); else await openData(new Uint8Array(await f.arrayBuffer()), f.name, ''); }
  if (imgs.length) await imagesToPdf(await Promise.all(imgs.map(async f => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))));
  if (!pdfs.length && !imgs.length) toast(t('Drop PDF files or images'));
});
async function renderRecent() {
  if (!N) return; const list = await N.recent(), box = $('recentList'); box.innerHTML = ''; $('recentBox').hidden = !list.length;
  list.slice(0, 8).forEach(p => box.append(el('li', {}, el('button', { class: 'r', onclick: () => openPath(p) }, el('span', { text: p.split(/[\\/]/).pop(), dir: 'auto' }), el('span', { class: 'pth', text: p })),
    el('button', { title: t('Remove from list'), onclick: async () => { await N.recentRemove(p); renderRecent(); } }, icon('x')))));
}
window.addEventListener('resize', () => { const x = T(); if (x && ['auto', 'page-fit', 'page-width'].includes(x.viewer.currentScaleValue)) x.viewer.currentScaleValue = x.viewer.currentScaleValue; });

window.addEventListener('storage', e => { // keep every window in sync when settings change in one of them
  if (e.key === 'lang') { lang = store.get('lang') || lang; applyI18n(); }
  else if (e.key === 'settings') { Object.assign(settings, store.get('settings', {})); applyTheme(); }
  else if (e.key === 'night') { document.body.classList.toggle('night', !!store.get('night')); $('bNight').setAttribute('aria-pressed', document.body.classList.contains('night')); }
});
(async () => {
  applyI18n(); activate(null);
  if (!N) return;
  N.onOpenPath(p => openPath(p)); N.onAdopt(p => adoptTab(p)); N.setPrefs({ restore: settings.restore });
  const adopted = await N.pendingAdopt(); if (adopted) { await adoptTab(adopted); return; }
  const init = await N.initial();
  if (init.files && init.files.length) { for (const p of init.files) await openPath(p); return; }
  if (settings.restore && init.session) {
    let act = null;
    for (const s of init.session) { if (await N.exists(s.path)) { await openPath(s.path, s.page); if (s.active) act = tabs.find(x => x.path === s.path); } }
    if (act) activate(act);
  }
})();
})();
