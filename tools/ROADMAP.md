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

## Batch 5 — Convert & security (DONE 2026-11-02)
- [x] Images to PDF (reuses JpgToPdf) · [x] PDF to Text · [x] Compress PDF (basic: re-encode images in worker + qpdf lossless pass) · [x] Protect PDF (qpdf-wasm AES-256) · [x] Unlock PDF — tests: tools/test/e2e-last5.mjs

### old notes
- [ ] Images to single PDF (may merge into JPG to PDF page — check keyword overlap) · [ ] PDF to text · [ ] Basic PDF compress
- [ ] Protect PDF (needs an encryption lib — pdf-lib can't encrypt; evaluate @cantoo/pdf-lib or qpdf-wasm)
- [ ] Unlock PDF (qpdf-wasm or pdf.js decrypt + re-save)

## Image format converters (live 2026-10-30)
- [x] 14 pages: png/jpg/webp/avif/gif/bmp/svg → jpg/png/webp — max 5 images per conversion (owner decision); FormatConvert.tsx; tests: tools/test/e2e-formats.mjs
- [ ] More pairs later: heic-to-jpg (needs decoder), jpg-to-avif, png-to-avif, webp-to-gif

## Guides & SEO (2026-11-02)
- [x] /guides/ section with 10 guides (BlogPosting/FAQ/Breadcrumb schema, OG images, screenshots, TOC, CTA to tool, related guides on tool pages)
- [x] Reduce Image Size in KB + Compress Image to 20/50/100/200KB pages (TargetSize.tsx; test tools/test/e2e-kb.mjs)
- [x] Organization schema with logo + sameAs (social profiles); sitemap lastmod/priority; tools/seo-audit.py (0 issues)
- [x] 2026-11-02 batch 2: compress PDF to 100KB · passport size photo · scan to PDF with phone · HEIC to JPG · unlock PDF (15 guides total)
- [x] HEIC support everywhere (heic-to / libheif wasm, loaded on demand) + HEIC to JPG / HEIC to PNG pages (test e2e-heic.mjs)
- [x] Share images for every tool (tools/og/make-tool-images.mjs → public/og/tools/)
- [ ] Next guide ideas: PDF to JPG on phone, fill a PDF form, split PDF by pages, signature size for exam forms, PDF vs Word for resumes, compress image without losing quality, add page numbers for project reports, watermark documents
- [ ] Hindi versions of top pages

## Batch A – utilities (2026-11-02, inspired by ezgif.com)
- [x] QR code generator (+ UPI QR page), barcode generator, favicon generator, PNG to ICO, EXIF viewer, remove EXIF data, WhatsApp sticker maker — test tools/test/e2e-utility.mjs
- [x] Homepage compacted: popular tools + category tiles + compact all-tools list (search filters it)
- [x] Owner decision: removed the "files never leave your device" slogan (hero badge, drop-zone note, footer, CTAs, share images). Factual privacy FAQ, privacy policy and guides still explain in-browser processing.
- [x] Batch B – GIF tools (LIVE 2026-11-02): category /gif-tools/ with gif-maker, video-to-gif, pdf-to-gif, resize-gif, crop-gif, compress-gif, reverse-gif (boomerang), gif-speed, gif-to-mp4 (WebCodecs H.264→VP9→AV1 fallback + mp4-muxer), split-gif (frames ZIP). Code: src/lib/gif.ts, gif.worker.ts (gifenc), GifEdit/GifMaker/VideoToGif/PdfToGif.tsx. Tests: tools/test/e2e-gif.mjs (19 checks). Limits: video 300 frames, PDF 60 pages, maker 100 images.
- [ ] Batch C – video/audio (ffmpeg.wasm, on demand): MP4 to MP3, cut/crop/rotate/speed/join/compress video

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

## Batch P1 – smallpdf-style quick wins (LIVE 2026-11-02)
- [x] New category "Convert to PDF" (/convert-to-pdf/): txt, csv, html, epub, rtf, markdown, zip to PDF + PDF Scanner (camera, 4-corner perspective fix, magic/B&W/grey filters)
- [x] pdf-to-png (PdfToJpg initial=png), pdf-to-ppt (pptxgenjs, page images + text in notes)
- [x] pdf-reader (lazy pages, zoom, search, text layer, rotate, fullscreen, print), pdf-annotator (PdfEditor mode=annotate), pdf-form-filler (pdf-lib fields as HTML inputs on page, flatten, Unicode font), redact-pdf (search/emails/phones/hand boxes; redacted pages rasterised, metadata cleared)
- Engine: src/lib/docpdf.ts (blocks → PDF with DejaVu fonts from /public/fonts; complex scripts like Hindi drawn via canvas). Tests: tools/test/e2e-p1.mjs (40 checks)
- [ ] Next: P2 Office (PDF↔Word/Excel/PPT, ODT/ODS/ODP), P3 OCR (tesseract.js, eng+hin+mar)
