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
- [x] P2 Office (LIVE 2026-11-02): pdf-to-word (docx lib; editable text with headings/bold/sizes, or exact-look images), pdf-to-excel (SheetJS; modal-column template, Indian number parsing), word-to-pdf (mammoth → blocks), excel-to-pdf / ods-to-pdf (SheetJS → tables), odt-to-pdf (own ODT parser), ppt-to-pdf / odp-to-pdf (own slide renderer on canvas: theme colours, layouts/masters, shapes, pictures, tables). Code: src/lib/office.ts, pdfread.ts. Tests: tools/test/e2e-p2.mjs (20 checks)
- [ ] Next: P3 OCR (tesseract.js, eng+hin+mar)

## Device Test hub (/device-test/) — owner's build plan 2026-11-03
- [x] Phase 1 (LIVE 2026-11-03): hub + keyboard-test, mouse-test, mic-test, webcam-test, speaker-test, internet-speed-test (M-Lab ndt7, consent checkbox, /vendor/ndt7/). Data: src/data/devicetests.ts, pages src/pages/device-test/, components src/components/device/. Test: tools/test/e2e-device.mjs. Share images: tools/og/make-device-og.mjs. Privacy policy updated (mic/camera/M-Lab).
- [x] Phase 2 (LIVE 2026-11-03): ping-test (Cloudflare, Google, own /api/ping.php), what-is-my-ip (/api/ip.php PHP endpoint + Cloudflare trace for IPv4/IPv6/country), dead-pixel-test (+ stuck pixel fixer), refresh-rate-test, double-click-test (chatter < 80 ms)
- [x] Phase 3 (LIVE 2026-11-03): touch-screen-test (multi-touch + dead-zone grid), gamepad-test (buttons, sticks/drift, triggers, vibration), battery-test (Battery API + health steps), guides: mic-not-working-windows, webcam-not-working, laptop-keyboard-not-working, mouse-double-clicking-fix (guides use tool: "dt:<slug>")
- Ads: never inside the test area (AdSlot only below the tool and between content sections)

## Quality pass (PDF tools)
- PPT to PDF: new renderer (master/layout text styles, bullets, charts bar/column/line/pie/area, gradients, table styles, Office fonts). Done.
- PDF to Excel: table lines → rows/columns/merged cells; borders, fills, bold, font size kept; row-ruled statements. Done.
- Compress PDF: new engine (DPI-aware, CMYK via pdf.js decoder, ICC swap, tiny JPEG icons, dedupe, edit-locked PDFs) + live sizes for all levels, custom DPI/quality, before/after zoom, batch ZIP. Beats Ghostscript on quality at similar size. Done.
- Edit PDF: whole-line text edit, real background patch, embedded Unicode fonts (₹, symbols) incl. Calibri/Cambria, circle/line/arrow, opacity, fill, tick/cross/date, redo, duplicate, nudge, page thumbnails, edit-locked PDFs. Done.
- Next (Phase 1): Sign PDF polish (saved signature, initials, all pages), Organise tools (big thumbnails, drag and drop), large files.

## SEO (2026-11-04)
- Internal links: "More <category> tools" + "Popular tools" on every tool page, all device tests on each test page (median 15 links in, was ~3).
- IndexNow: GitHub Action on branch site (tools/github/indexnow.yml, copied by deploy.sh) pings all sitemap URLs 2 min after each publish. Key file public/9462406b2206d2f064e7fd4a0a8cd013.txt. First run: 202 accepted.
