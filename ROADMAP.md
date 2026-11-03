# Roadmap

Ideas for the next releases, roughly in order of value for the effort. Each one builds on code that already exists.

## Done in 2.5

Edit existing text (cover and retype), smarter Arabic plurals, compare two versions (word-level, in a sidebar panel), per-file notes. See CHANGELOG.md.

## Next (2.6)

**Edit text, part two.** Match bold and italic, edit several lines as a paragraph, and offer "remove the old words for good" by redacting the line underneath before writing the new words.

**Side-by-side compare.** Show the other version next to this one with synchronized scrolling, in addition to today's list of changes.

**Export notes and bookmarks** to a text or Markdown file, and optionally embed notes in the PDF as a hidden attachment.

## Later

**Real digital signatures (PAdES).** Today's signatures are images. Signing with a certificate (from a .pfx file or the Windows certificate store) would make documents legally verifiable. This needs a signing library and careful handling of incremental saves.

**Forms designer.** Add text fields, checkboxes and signature fields to any PDF (pdf-lib can create AcroForm fields).

**Batch tools.** Apply OCR, compression, watermark or page numbers to a whole folder of files.

**Export to Word.** Rebuild paragraphs from the text layer (and OCR) into a .docx. Good results need layout analysis; start with plain paragraphs.

**macOS and Linux builds.** Most code is already cross-platform; the gaps are the bundled qpdf and the installer configuration.

**Accessibility pass.** Screen-reader labels for thumbnails and comments, full keyboard use of the comment tools, and a high-contrast theme.

## Housekeeping

- Split `renderer/app.js` (now ~2,300 lines) into modules (tabs, annotations, page tools, print, dialogs) using plain ES modules; no build step needed.
- Code-sign the Windows installer so SmartScreen stops warning on first run.
- Add the tests to the release workflow so a failing test blocks a release.
