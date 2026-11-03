<p align="center"><img src="docs/landing.jpg" alt="Awraq PDF" width="720"></p>

<h1 align="center">Awraq PDF</h1>

<p align="center"><b>Open Source PDF Reader &amp; Editor for Windows</b></p>

<p align="center">
  <a href="https://github.com/SoCalledBlackBurn/Awraq-PDF/releases/latest"><img alt="Download" src="https://img.shields.io/github/v/release/SoCalledBlackBurn/Awraq-PDF?label=download&color=2F86D0"></a>
  <a href="LICENSE"><img alt="License: GPL v3" src="https://img.shields.io/badge/license-GPL%20v3-blue"></a>
  <img alt="Windows" src="https://img.shields.io/badge/platform-Windows-0F1B2D">
</p>

<p align="center">Available in English, Arabic, French, Spanish and Turkish</p>

## Screenshots

### Reading
Tabs like a browser, page thumbnails, outline and bookmarks, with floating page and zoom controls and a find panel over the page.

<img src="docs/screenshots/01-reading.png" alt="Main window with tabs, page thumbnails and toolbar" width="860">

### Edit text
Click a line, type the new words and press Enter. The size, colour and page background are matched automatically.

<img src="docs/screenshots/14-edit-text.png" alt="A line of text being edited in place" width="860">

### Compare two versions
See every word that was added or removed between two versions of a document, highlighted on the page.

<img src="docs/screenshots/15-compare.png" alt="Comparison panel listing a change, with added words highlighted on the page" width="860">

### Comments & signing
Highlights, underlines, shapes, sticky notes, stamps and signatures, saved as real PDF annotations that open in any reader.

<img src="docs/screenshots/02-comments-and-signing.png" alt="Highlight, underline, box, arrow, sticky note, Approved stamp and a signature on a document, with the comments list" width="860">

### OCR for scanned files
Scanned pages become searchable and copyable, fully offline, in Arabic, English, French, Spanish, German and Turkish.

<img src="docs/screenshots/03-ocr.jpg" alt="Search results highlighted in a scanned page after text recognition" width="860">

### Redaction
Sensitive text is removed for good, not just covered. You can also search for a phrase and redact every match at once.

<img src="docs/screenshots/04-redaction.png" alt="Document with redacted text shown as solid black bars" width="860">

### Password protection
AES-256 encryption with control over printing, copying and editing.

<img src="docs/screenshots/05-password-protection.png" alt="Password protection dialog" width="860">

### Page tools
Right-click a page to rotate, move, extract, export, recognize text, insert a blank page or delete it. Drag thumbnails to reorder.

<img src="docs/screenshots/06-page-tools.png" alt="Right-click menu on a page thumbnail" width="860">

### Print preview
Live preview with paper size, orientation, color, two-sided printing and margins.

<img src="docs/screenshots/07-print-preview.png" alt="Print dialog with live preview" width="860">

### Dark mode
A dark theme for the interface. There is also a high-contrast theme and six accent colours.

<img src="docs/screenshots/08-dark-mode.png" alt="Dark theme with a two-page spread" width="860">

### Start screen
Open or drop a PDF, combine or compare files, turn images into a PDF, continue where you stopped reading, or pick up a recent file. Pin the files you use most.

<img src="docs/screenshots/09-start-screen.png" alt="Start screen with recent files shown as cards with page previews" width="860">

### Command palette
Press **Ctrl+K** and type to find any command, in any interface language. Type a number to jump to that page.

<img src="docs/screenshots/10-command-palette.png" alt="Command palette listing commands that match the word page" width="860">

### Watermarks
Any text, in any language, once or repeated across the page, with a live preview.

<img src="docs/screenshots/11-watermark.png" alt="Watermark dialog with a repeated CONFIDENTIAL pattern in the preview" width="860">

### Search results
List every match in the sidebar, with the words around it.

<img src="docs/screenshots/12-search-results.png" alt="Sidebar listing every search result with highlighted matches" width="860">

### Every tool in one place
The menu groups every command by task; the command palette (Ctrl+K) finds any of them by name.

<img src="docs/screenshots/16-all-tools.png" alt="The menu with File, Pages, Protect and review, and View sections" width="860">

### Arabic and right-to-left
The whole interface mirrors for Arabic, with correct Arabic plural forms.

<img src="docs/screenshots/17-arabic.png" alt="The interface in Arabic, mirrored right to left" width="860">

### Work on several pages at once
Ctrl+click or Shift+click thumbnails, then rotate, extract, recognize or delete them together. Everything can be undone.

<img src="docs/screenshots/13-select-pages.png" alt="Three selected page thumbnails with a menu for acting on all of them" width="860">

## Features

- **Safety:** crash recovery of unsaved work, safe saving that never leaves a half-written file, undo for page operations too, notice when another program changes an open file.
- **Reading:** tabs (drag to reorder, tear off into new windows), thumbnails, outline, bookmarks, private per-file notes, attachments, continuous / single / horizontal / grid layouts, spreads, night and sepia pages, focus mode, presentation mode, read aloud, advanced search, continue reading.
- **Comments (real PDF annotations, editable after reopening):** highlight, underline, strike-out, pen, shapes, arrows, text boxes, sticky notes, stamps, signatures, images.
- **Security:** AES-256 password protection, permissions, true redaction (including "redact every match").
- **Editing:** edit existing text (cover and retype), compare two versions word by word.
- **Tools:** OCR for scanned files (Arabic, English, French, Spanish, German, Turkish), watermarks, page numbers, reduce file size, merge, combine into a new file, split, extract, reorder, rotate, duplicate, delete and insert pages (one or many at a time), insert images as pages, images → PDF, edit document properties, export as PNG / TXT, fill forms.
- **Speed:** command palette (Ctrl+K), search results list, comment filters and summary export, copy a signature or stamp to every page, resizable sidebar.
- **Printing:** built-in print dialog with live preview, paper size, orientation, color, two-sided and margins.

## Download

Download the installer or the portable version from **[Releases](https://github.com/SoCalledBlackBurn/Awraq-PDF/releases/latest)**.
The installed version updates itself automatically.

> Windows may show "Windows protected your PC" because the app isn't code-signed yet. Click **More info → Run anyway**.

## Run from source

Requires [Node.js](https://nodejs.org/) 20+.

```bash
npm install
npm start          # run the app
npm test           # end-to-end tests (Linux: xvfb-run -a npm test; needs qpdf and poppler-utils)
npm run dist       # build installer + portable exe into dist/
```

See [ROADMAP.md](ROADMAP.md) for what's planned next.

## Publishing a release

1. Edit `version` in `package.json` (e.g. `2.5.0`) and push to `main`.
2. Open the **Actions** tab → **Release** → **Run workflow**.
3. The tests run first; if they pass, the installer and portable exe are built and published in **Releases** about 15 minutes later. Installed copies update themselves.

To build locally instead: `npm run dist` puts both exe files in `dist/`. Upload `Awraq-PDF-Setup-<version>.exe`, its `.blockmap`, `latest.yml` and `Awraq-PDF-Portable-<version>.exe` to a new release tagged `v<version>` (without `latest.yml` installed copies won't find the update).

## Author

**Amr Mustafa M. M.** — [@SoCalledBlackBurn](https://github.com/SoCalledBlackBurn)

## License

Copyright © 2026 Amr Mustafa M. M.

Awraq PDF is free software: you can redistribute it and/or modify it under the terms of the
**GNU General Public License v3.0 or later**. See [LICENSE](LICENSE).

It is distributed WITHOUT ANY WARRANTY. Third-party components and their licenses are listed in [NOTICE.md](NOTICE.md).
