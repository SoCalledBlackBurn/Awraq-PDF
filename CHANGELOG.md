# Changelog

## 2.3.2

- **Fixed:** Arabic (and other right-to-left) text recognized by OCR was stored with each word's letters reversed in PDF.js-based readers, so it could not be searched or copied correctly. The OCR text layer is now written in the standard layout that every PDF reader reads correctly.
- **Fixed:** Arabic file names were displayed scrambled in the recent files list and tabs.
- **Fixed:** the file path in the status bar was scrambled in the Arabic interface.
- **Fixed:** tall dialogs (such as Print) could be cut off on smaller screens; their content now scrolls and the buttons always stay visible.
- **Improved:** more compact print options.
- **Improved:** the empty sidebar is hidden on the start screen.
- **Fixed:** dialogs showed an unnecessary scrollbar and a focus outline around their content; the first field is now focused instead.
- **Fixed:** the redaction message read "1 matches marked".
- **Added:** screenshots of every main feature in the README.

## 2.3.1

- First public release: GPL-3.0 license, attribution, GitHub Releases and auto-update.
