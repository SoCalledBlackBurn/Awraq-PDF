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
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const inv = (c, a) => ipcRenderer.invoke(c, a);
contextBridge.exposeInMainWorld('native', {
  initial: () => inv('initial'),
  pendingAdopt: () => inv('pending-adopt'),
  setPrefs: p => inv('set-prefs', p),
  sessionUpdate: list => inv('session-update', list),
  newWindow: () => inv('new-window'),
  closeWindow: () => inv('close-window'),
  tabDrop: o => inv('tab-drop', o),
  onAdopt: cb => ipcRenderer.on('adopt-tab', (_e, p) => cb(p)),
  strings: s => inv('strings', s),
  recent: () => inv('recent'),
  recentRemove: p => inv('recent-remove', p),
  readPath: p => inv('read-path', p),
  exists: p => inv('exists', p),
  openDialog: o => inv('open-dialog', o),
  saveDialog: o => inv('save-dialog', o),
  writePath: (path, data) => inv('write-path', { path, data }),
  showInFolder: p => inv('show-in-folder', p),
  setTitle: t => inv('set-title', t),
  confirm: o => inv('confirm', o),
  qpdf: (args, input) => inv('qpdf', { args, input }),
  qpdfAvailable: () => inv('qpdf-available'),
  appInfo: () => inv('app-info'),
  checkUpdate: () => inv('check-update'),
  installUpdate: () => inv('install-update'),
  printers: () => inv('printers'),
  printBegin: () => inv('print-begin'),
  printAdd: (id, index, data) => inv('print-add', { id, index, data }),
  printRun: (id, opts) => inv('print-run', { id, opts }),
  printCancel: id => inv('print-cancel', id),
  pathForFile: f => { try { return webUtils.getPathForFile(f); } catch { return ''; } },
  onOpenPath: cb => ipcRenderer.on('open-path', (_e, p) => cb(p)),
  onUpdate: cb => ipcRenderer.on('update', (_e, u) => cb(u))
});
