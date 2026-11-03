# Changelog

## 2.5.0

### A new look, with more room for the page
- **One toolbar row.** At a normal window size the toolbar used to wrap onto a second line, and the comment bar did too. Now each is a single row that never wraps; on narrow windows less-used buttons step aside (everything stays in the menu and the command palette).
- **Floating page and zoom controls** at the bottom of the document: page number, zoom, rotate and page layout. They fade while you read and come back when you move the mouse.
- **"Find a command or a page…"** box in the middle of the toolbar opens the command palette (Ctrl+K), so it's easy to discover.
- **Find** is now a floating panel over the page, like in a web browser, with option chips (match case, whole words, diacritics).
- **The menu is organized** into File, Create and export, Pages, Protect and review, and View, with icons; toggles such as night reading show a check mark.
- **The editing bar only shows what the current tool uses**: the font size for text boxes, line width for pens and shapes, fill for shapes, and colors where they apply.
- **New start screen:** a large drop zone, quick actions (Combine PDFs, Images to PDF, Compare two PDFs), **Continue reading** with your progress, reading-progress bars on recent files, and a filter when the list is long.
- A refreshed visual style for light and dark themes, a **high-contrast theme**, and **six accent colors** (Settings).
- Unsaved tabs show a dot in place of the close button; the sidebar has clearer tabs and the current page stands out.

### New features
- **Edit text.** Click a line of text, type new words and press Enter. The line is covered in the page's own background colour and the new words are written on top in a matching size, colour and style (serif, sans or monospace). Leave it empty to remove the line. The edit stays movable and editable, and can be undone. Because PDF text can't be safely rewritten in place, the original words remain underneath in the file; use redaction to remove text for good.
- **Compare two versions.** *Compare with another PDF…* (or *Compare two PDFs* on the start screen) lists every change word by word, highlights added words on the page and marks removed ones, and takes you to each change with a click.
- **My notes:** a private notes panel for each file, kept on this computer only. Mention a page ("p. 12") and it becomes a link.
- **Combine PDFs** into a new document, choosing the order first.
- **Duplicate pages** (one or several), including their comments.
- **Comments panel:** filter by kind, and **Export comment summary…** to a text file listing every comment, highlight and text edit by page.
- **Focus mode (F9):** only the pages and the floating controls stay on screen.
- **Sepia pages** for long reading sessions, alongside night reading (Settings → Page color).
- **Correct plurals:** "1 page" in English, and proper Arabic forms (صفحة واحدة، صفحتان، ٣ صفحات، ١١ صفحة).
- Bookmarks and notes now follow a file when it's saved under a new name.

### For developers
- New end-to-end tests for every 2.5 feature (`test/v25.test.js`); the translation test now also covers plural strings.
- The Release workflow runs the tests first and publishes only if they pass. It is started from the Actions tab (Run workflow), so uploading a release by hand no longer triggers a second build.

## 2.4.0

### Your work is safer
- **Crash recovery.** Unsaved changes (comments, page changes, rotation, filled-in forms, edited properties) are mirrored to disk every few seconds. If the app or the computer crashes, reopening the file offers to restore them. Password-protected files are never mirrored, so their decrypted content never touches the disk.
- **Safe saving.** Saving writes a temporary copy next to the file and swaps it in, so a crash, power cut or full disk can no longer leave a half-written PDF. If the file is open in another program, a clear message explains it and offers "Save as…".
- **Closing a window asks about each changed file** (Save / Don't save / Cancel), instead of only offering "Quit without saving".
- **Page operations can be undone.** Deleting, rotating, moving and inserting pages, merging, page numbers, watermarks, OCR and redaction now work with Ctrl+Z / Ctrl+Y. Messages after these operations have an **Undo** button.
- **Files changed by another program are noticed**, with a one-click Reload.

### New features
- **Command palette (Ctrl+K):** find any command by typing, in any interface language (English command names work too). Type a number to jump to that page.
- **Watermarks:** any text in any script, color, opacity, size, angle, once or repeated across the page, with a live preview. Upright on rotated pages.
- **Page numbers:** six positions, four formats, start number, font size, page selection. Upright on rotated pages.
- **Select several pages** in the sidebar (Ctrl+click, Shift+click, Ctrl+A) and rotate, extract, OCR or delete them together. Delete removes the selected pages.
- **Insert images as pages** at any position, sized like the current page. Dropping images on an open document asks whether to add them to it or make a new PDF.
- **Search results list:** "List all" shows every match in the sidebar with the words around it; click one to go there.
- **Comment menu:** right-click a comment to copy, duplicate, copy it to all pages or chosen pages (handy for a signature or stamp on every page), bring it to front or delete it. Ctrl+C / Ctrl+V copy and paste comments; arrow keys nudge the selected comment (Shift for bigger steps).
- **Edit document properties:** title, author, subject and keywords (Arabic works).

### Interface
- Recent files on the start screen are cards with a first-page preview, the page count and when you last opened them. Pin files to keep them at the top.
- The sidebar can be resized by dragging its edge; thumbnails grow with it. Double-click the edge to reset.
- Numbers in the status bar and dialogs no longer appear scrambled in the Arabic interface.
- Closing the last document also closes the search and comment bars.
- Press **?** to see keyboard shortcuts.

### Security
- Passwords are passed to qpdf through a private temporary file instead of the command line, where other programs could read them.
- The app window now runs in Electron's sandbox.

### For developers
- End-to-end tests (`npm test`) drive the real app with Playwright: editing, saving, recovery, passwords, OCR, watermarks, search and translation coverage. They run on every push via GitHub Actions.

## 2.3.2

- **Fixed:** Arabic (and other right-to-left) text recognized by OCR was stored with each word's letters reversed in PDF.js-based readers, so it could not be searched or copied correctly. The OCR text layer is now written in the standard layout that every PDF reader reads correctly.
- **Fixed:** Arabic file names were displayed scrambled in the recent files list and tabs.
- **Fixed:** the file path in the status bar was scrambled in the Arabic interface.
- **Fixed:** tall dialogs (such as Print) could be cut off on smaller screens; their content now scrolls and the buttons always stay visible.
- **Improved:** more compact print options.
- **Improved:** the empty sidebar is hidden on the start screen.
- **Fixed:** dialogs showed an unnecessary scrollbar and a focus outline around their content; the first field is now focused instead.
- **Fixed:** the redaction message read "1 matches marked".
- **Fixed:** the "Drop PDF files here" overlay always appeared in Arabic; it now follows the interface language.
- **Added:** screenshots of every main feature in the README.
- **Changed:** the README is now in English only.

## 2.3.1

- First public release: GPL-3.0 license, attribution, GitHub Releases and auto-update.
