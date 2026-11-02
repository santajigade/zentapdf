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
3. Add a screenshot step to `tools/og/make-guide-images.mjs`, run it (needs `astro preview` on :4321) — it creates `public/og/guides/<slug>.png` (social/hero image) and `public/guides/img/<slug>.webp`.
4. `npm run build && python3 tools/seo-audit.py` → must report 0 issues (title/description length, one H1, canonical, broken links, alt text, JSON-LD).
5. Each guide automatically gets BlogPosting + FAQPage + BreadcrumbList schema, appears on /guides/, in the sitemap, and in a "Guides" box on its tool pages.
