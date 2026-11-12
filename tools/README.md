# ZentaPDF — playbook for adding tools

Read `tools/ROADMAP.md` first; take the next unchecked batch.

## How a tool is built
1. **Data/SEO**: add or complete the entry in `src/data/tools.ts` (`live: true`, title keyword-first, metaDescription 120–160 chars, intro 2–3 sentences with keyword, 4 steps, 4–6 FAQs, 4 related slugs, accept).
2. **UI**: `src/components/tools/<Name>.tsx` (Preact). Reuse `shared.tsx` (DropZone, ProgressBar, ErrorBox, MoveButtons, sizeWarning) and `lib/utils.ts` (downloadBlob, zipFiles, friendlyError, parseRanges).
3. **Heavy work in a Web Worker**: PDF edits → add an `op` to `src/lib/pdf.worker.ts`, call with `runPdfJob`. Rendering → pdf.js legacy build, loaded with dynamic `import()` only when the user clicks.
4. **Route**: add one line in `src/pages/[tool].astro` (`{tool.slug === '...' && <X client:load />}`).
5. Rules: files never leave the device; no third-party scripts (only GA4/AdSense via config); no ads between drop zone and Download; friendly error for encrypted / broken / too-large files.

## Verify
```
node tools/testfiles-gen/make.mjs && node tools/testfiles-gen/big.mjs   # test files (+ PIL images, qpdf-encrypted copy)
npx astro build && (setsid npx astro preview --port 4321 &)
node tools/test/e2e.mjs chromium          # all PASS, 0 console errors, 0 overflow at 360 px
npx lighthouse http://localhost:4321/<slug>/ --form-factor=mobile   # target 95+
```

## Publish
`bash deploy.sh` → builds and pushes `dist/` to branch `site` (Hostinger Git auto-deploy to public_html). Commit source to `main`.

## Guides (blog) — how to add one
1. Create `src/content/guides/<slug>.md` with frontmatter: `title` (≤ 60 chars, keyword first), `h1`, `description` (120–160 chars), `date`, optional `updated`, `tool` (main tool slug), `tools` (related slugs), `faqs` (3–4 q/a).
2. Body: short intro answering the question, `##` sections (they become the table of contents), numbered steps, at least one table, internal links to tools and other guides, one screenshot `![alt](/guides/img/<slug>.webp)`. Aim for 800–1,200 words including FAQs. Never invent facts or numbers; tell readers to check official rules where they vary.
3. Add a screenshot step to `tools/og/make-guide-og.mjs (thumbnails, run with node --experimental-strip-types) and make-guide-images.mjs (screenshots)`, run it (needs `astro preview` on :4321) — it creates `public/og/guides/<slug>.png` (social/hero image) and `public/guides/img/<slug>.webp`.
4. `npm run build && python3 tools/seo-audit.py` → must report 0 issues (title/description length, one H1, canonical, broken links, alt text, JSON-LD).
5. Each guide automatically gets BlogPosting + FAQPage + BreadcrumbList schema, appears on /guides/, in the sitemap, and in a "Guides" box on its tool pages.
- Share images: run `node tools/og/make-tool-images.mjs` after adding a tool (creates public/og/tools/<slug>.png).

## Auto deploy
- `.github/workflows/deploy.yml` runs on every push to main: build, SEO audit (must be 0 issues), `deploy.sh`, then IndexNow.
- Publish again by hand: GitHub > Actions > Deploy > Run workflow. Running `bash deploy.sh` by hand still works.
- The daily guides task only pushes to main (that publishes); it does not run deploy.sh.

## Daily guides (scheduled task)
- Publishing: push to main; the Deploy workflow publishes automatically.
- Queue: `tools/guides/QUEUE.md` (take the next open items, tick them with the date).
- Sample files for screenshots: `python3 tools/guides/make-samples.py` (writes /tmp/gfiles).
- Screenshot: serve dist on :4321, then `node tools/guides/shot.mjs <slug> /<tool>/ <files> [wait-selector]`.
- Thumbnails: `node --experimental-strip-types tools/og/make-guide-og.mjs`.
- Text rules: no em or en dashes, plain simple English, Indian readers, never invent facts (search official sources first), 800 to 1,200 words, one table, one screenshot, 3 to 4 FAQs, links to tools and other guides.

## Free Templates (/templates/)
- Full playbook: `tools/templates/README.md`. Queue: `tools/templates/QUEUE.json`. Daily scheduled task adds `perDay` templates.
- `node tools/templates/build.mjs` then `node tools/templates/check.mjs` (0 problems) before pushing.

## Audio tools (category `audio`, /audio-tools/)
- Screens: `src/components/tools/audio/` (AudioCutter: cutter + ringtone, AudioConvert: converter, format pages, compressor, video to MP3, AudioEffect: volume, normalize, reverse, pitch, speed, AudioJoiner, BpmFinder, VoiceRecorder, ToneGenerator).
- Engine: `src/lib/audio/` (core.ts decode/encode, dsp.ts effects and BPM, mp3.worker.ts LAME, stretch.worker.ts SoundTouch, ffmpeg.ts lazy loader).
- ffmpeg.wasm single-thread core is self-hosted in `public/ffmpeg/0.12.10/` and loaded only when needed (OGG, FLAC, WMA/AMR/MKV input, AAC when the browser has no AAC encoder, files over 100 MB).
- Every audio page shows the "Your files never leave your device" note (template in `[tool].astro`), plus Supported formats and Privacy sections.
- Tests: `node tools/test/e2e-audio.mjs [cut|ring|conv|comp|vol|video|bpm|fx|join|rec|tone]` (test files in sandbox testfiles/audio).

## Traffic plumbing (IndexNow + Pinterest)
- IndexNow: key file `public/9462406b2206d2f064e7fd4a0a8cd013.txt`. After each publish `deploy.sh` runs `tools/indexnow.py`, which sends only sitemap pages whose HTML changed since the last deployed build. It never fails the deploy. Send every page once: Actions > "IndexNow (submit all pages)".
- Pinterest verify tag and profile link: `PINTEREST_VERIFY` and `PINTEREST_URL` in `src/config.js`.
- Pins: `src/lib/pins.ts` (which pages, colours, ticks, hashtags), `src/lib/pinimg.ts` (1000x1500 JPG, cached in `.og-cache/`). Images are built only for released pins (`PINS_ALL=1 npx astro build` renders all for a preview).
- Schedule: `src/data/pins.json` (page id to release date, 4 a day). New guides are pinned the day after their date; new tools and tests get tomorrow's date automatically in the deploy workflow (`tools/pins/pins.py add-new`).
- Feed: `/pins/feed.xml` (latest 60). The deploy workflow also runs daily at 06:00 IST to release the day's pins. Check it from outside: Actions > "Check pin feed".
- "A lot now": `npx astro build && python3 tools/pins/pins.py lot 10`, then commit, push and upload the `pins-lot-DATE.csv` in Pinterest. Those pages go in `src/data/pins-manual.json` and stay out of the feed.
