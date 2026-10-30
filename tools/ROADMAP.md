# ZentaPDF roadmap (backlog)

Brand: ZentaPDF · colour Indigo #4F46E5 · domain TBD (placeholder zentapdf.com in src/config.js)

## Batch 1 — LIVE in code (tested 2026-10-30)
- [x] Merge PDF · [x] Split PDF · [x] Compress image · [x] JPG to PDF · [x] PDF to JPG

## Batch 2 — Organise
- [ ] Remove pages (thumbnail grid, click to mark)
- [ ] Extract pages
- [ ] Reorder pages (drag & drop thumbnails — reuse pdf.js thumbnails from PDF to JPG)
- [ ] Rotate PDF (all / selected pages)
- [ ] Add blank page

## Batch 3 — Images
- [ ] Resize image · [ ] Crop image · [ ] Convert image (JPG/PNG/WebP/AVIF) · [ ] Rotate/flip image · [ ] Image to Base64

## Batch 4 — Edit
- [ ] Add page numbers · [ ] Add watermark (text/image) · [ ] Add text / signature · [ ] Crop PDF · [ ] Flatten PDF · [ ] Edit metadata

## Batch 5 — Convert & security
- [ ] Images to single PDF (may merge into JPG to PDF page — check keyword overlap) · [ ] PDF to text · [ ] Basic PDF compress
- [ ] Protect PDF (needs an encryption lib — pdf-lib can't encrypt; evaluate @cantoo/pdf-lib or qpdf-wasm)
- [ ] Unlock PDF (qpdf-wasm or pdf.js decrypt + re-save)

## Site / launch
- [ ] Owner: create empty private GitHub repo `santajigade/zentapdf`, then Claude pushes `main` + `site`
- [ ] Owner: buy domain → update SITE_URL in src/config.js + public/robots.txt
- [ ] GA4 ID, Search Console verification, AdSense (after content + traffic)
- [ ] Drag-and-drop reordering for file lists (currently ↑ ↓ buttons)
- [ ] Hindi (/hi/) after English pages rank

## Known gaps / to test manually
- Automated tests run on Chromium only (Firefox/WebKit not installed in the build box) → check Firefox, Safari/iOS, Edge by hand on the preview.
