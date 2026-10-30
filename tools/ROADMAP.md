# ZentaPDF roadmap (backlog)

Brand: ZentaPDF · colour Indigo #4F46E5 · domain TBD (placeholder zentapdf.com in src/config.js)

## Batch 1 — LIVE in code (tested 2026-10-30)
- [x] Merge PDF · [x] Split PDF · [x] Compress image · [x] JPG to PDF · [x] PDF to JPG

## Batch 2 — Organise
- [x] Remove pages · [x] Extract pages · [x] Reorder pages · [x] Rotate PDF · [x] Add blank page (live 2026-10-30; one component PdfPages.tsx + worker op 'build'; tests: tools/test/e2e-organise.mjs)

## Batch 3 — Images
- [x] Resize image · [x] Crop image · [x] Convert image · [x] Rotate/flip image · [x] Image to Base64 (live 2026-10-30; tests: tools/test/e2e-images.mjs)

## Batch 4 — Edit
- [x] Add page numbers · [x] Add watermark · [x] Crop PDF · [x] Flatten PDF (form fields) · [x] Edit metadata (live 2026-10-30; PdfEdit.tsx + worker op "edit"; tests: tools/test/e2e-edit.mjs)
- [x] Edit PDF (Level 1 editor: text, white-out, highlight, rectangle, draw, image, signature, undo) + Sign PDF page — live 2026-10-30; PdfEditor.tsx, SignaturePad.tsx, worker op "annotate"; tests: tools/test/e2e-editor.mjs
- [x] Edit PDF Level 2: Aa tool — click existing text → auto white-out (sampled bg colour) + replace (sampled colour, size, bold, serif/sans/mono) — live 2026-10-30; test: tools/test/e2e-edittext.mjs
- [ ] Edit PDF: Unicode font (Noto) for Hindi etc.; zoom; copy/paste items; page thumbnails sidebar
- [ ] Phase 2/Pro: true text editing via commercial SDK or server
- [ ] Text watermark: embed a Unicode font (Noto) so Hindi etc. work

## Batch 5 — Convert & security
- [ ] Images to single PDF (may merge into JPG to PDF page — check keyword overlap) · [ ] PDF to text · [ ] Basic PDF compress
- [ ] Protect PDF (needs an encryption lib — pdf-lib can't encrypt; evaluate @cantoo/pdf-lib or qpdf-wasm)
- [ ] Unlock PDF (qpdf-wasm or pdf.js decrypt + re-save)

## Phase 2 (agreed 2026-10-30)
- [ ] Optional sign-in (Google + email/password via Firebase or Supabase) — only with server tools / Pro plan; tools must keep working without login

## Site / launch
- [ ] Owner: create empty private GitHub repo `santajigade/zentapdf`, then Claude pushes `main` + `site`
- [ ] Owner: buy domain → update SITE_URL in src/config.js + public/robots.txt
- [ ] GA4 ID, Search Console verification, AdSense (after content + traffic)
- [ ] Drag-and-drop reordering for file lists (currently ↑ ↓ buttons)
- [ ] Hindi (/hi/) after English pages rank

## Known gaps / to test manually
- Automated tests run on Chromium only (Firefox/WebKit not installed in the build box) → check Firefox, Safari/iOS, Edge by hand on the preview.
