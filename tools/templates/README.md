# Free Templates section (zentapdf.com/templates/)

One SEO page per template, built by Astro from one JSON file per template. Files (DOCX, XLSX, PDF) and previews are generated
in the Claude sandbox and committed, because Hostinger cannot run LibreOffice. Publishing = push to `main` (the Deploy workflow builds and uploads).

## Where things live
| What | Where |
|---|---|
| Template data + design (one file each) | `src/data/templates/<slug>.json` |
| Categories (7) | `src/data/template-categories.json` |
| File sizes and page counts (written by build) | `src/data/template-files.json` |
| Pages | `src/pages/templates/index.astro`, `[category]/index.astro`, `[category]/[slug].astro`, `search.json.ts` |
| Loader | `src/lib/templates.ts` · cards `src/components/TemplateCard.astro`, `TemplateBrowser.astro` (filters + pages) |
| Generated files | `public/templates/files/<slug>/<slug>.(docx|xlsx|pdf)` |
| Previews | `public/templates/img/<slug>.webp`, `-2.webp`, `-3.webp`, `-sm.webp` · share image `public/og/templates/<slug>.jpg` |
| Download counter | `public/templates/download.php` (files are rewritten to it in `public/.htaccess`; counts in `../zentapdf-data/downloads.json`, outside public_html) |
| Keyword queue | `tools/templates/QUEUE.json` (`perDay` = how many to add per day) |
| Engines | `docx-engine.mjs` (Word), `xlsx-engine.mjs` (Excel), `build.mjs` (all files + PDF + previews), `images.py`, `check.mjs` (quality gate) |

URL: `/templates/<category-slug>/<template-slug>/`. Category slugs: resume, invoice-billing, excel-sheets, letters, business-forms, certificates, planners.

## Commands
```bash
npm ci
node tools/templates/build.mjs            # builds new or changed templates (slug1 slug2 for some, "all" for everything)
node tools/templates/check.mjs            # must say 0 problems
npx astro build && python3 tools/seo-audit.py   # must say 0 issues
```
Look at every new preview image (`public/templates/img/<slug>.webp`) before publishing: nothing cut off, nothing overlapping, page count right.

## Daily run (scheduled task "ZentaPDF daily templates")
1. Pull `main`. Read `QUEUE.json`; take the next `perDay` items with status `queued` (lowest priority number first, then file order).
2. For each item: research the topic with web search (what people need in this document; official rules where they exist, such as GST invoice fields). Never invent legal or tax facts; tell readers to check official rules where they vary.
3. Write `src/data/templates/<slug>.json` (copy the shape of an existing one in the same category) with an **original** design:
   vary the layout, accent colour, header style and fonts from the last templates in that category. Never copy Canva, Microsoft, Vertex42, Smartsheet or any other template.
4. Set status `generated`, run `build.mjs <slug>`, look at the previews, fix and rebuild until clean.
5. Run `check.mjs`. If a template cannot be made clean, set `"draft": true` in its JSON and status `review` with a note (it stays off the site).
6. Otherwise set status `published` with today's date, then build the site, run the SEO audit (0 issues), commit and push to `main`.
7. When fewer than 15 items are `queued`, research and add new keywords (people search for "<document> format", "<document> template", "<document> in excel").

## Content rules (every page)
- `metaTitle` 30 to 60 chars, keyword first. `metaDescription` 120 to 160 chars. `h1` names the formats.
- 500 to 750 words in total: `intro` (2 to 3 sentences), `howTo` (4 to 8 steps), 2 to 4 `guide` sections, 3 to 6 `tips`, 4 to 6 `faqs`.
- Plain, simple English for Indian and global readers. **No em or en dashes anywhere** (hyphens inside words are fine). `**bold**` works in text.
- Describe only what the file really contains. Sample data must be realistic. Use `[placeholders]` for things the user must replace.
- `tools`: 3 or 4 live ZentaPDF tool slugs that fit (word-to-pdf, excel-to-pdf, edit-pdf, sign-pdf, compress-pdf, merge-pdf, pdf-to-word, pdf-to-excel, jpg-to-pdf, pdf-to-jpg).
- `useCases` and `industries` power the filters: reuse existing values where they fit (see other JSON files) so filters stay short.

## Design spec cheat sheet
**Word (`doc`)**: `page` {size A4|Letter, orientation, margin mm, border {double,size,space}}, `size` (pt), `font`, `headFont`, `titleSize`, `blocks`:
`title` {text, sub, size, align, band}, `header` {left[], right[], split, rule}, `heading` {text, pagebreak}, `p` {text, align, size, bold, italic, muted, color, line, after},
`fields` {items [[label, value]], cols, labelWidth, lines}, `table` {columns [{h,w,align}], rows, blank, totals [[label,value]], grid, zebra, rowHeight, headFill, headText},
`bullets` {items, numbered}, `checklist`, `box` {title, lines}, `columns` {cols [{title, lines, fill}]}, `signature` {items, space, align}, `spacer`, `rule`, `pagebreak`.
Header lines: `# Big title`, `## Bold`, `~ small muted`. Text markup: `**bold**`, `_italic_`, `[placeholder]` (grey).

**Excel (`sheet`)**: `sheets` [{name, cols [widths], freeze, gridlines, page {orientation, area, titles, fitHeight, pageNumbers}, cells [ops]}].
Ops: `{c, v, s, m, fmt, align, wrap}`, `{row, from, v[], s}`, `{rows [r1,r2], cols {A: {v with {r}, s, fmt}}}`, `{data [[...]], at}`, `{list, items|ref}`,
`{cf, rule neg|pos|over|done, ref}`, `{height [row, pt]}`, `{note, text}`. Styles: title, sub, header, label, input, calc, total, big, band, note, plain, check.
Formats: money, int, num, pct, pct1, date, time, hours or any Excel format. Formulas start with `=`. White cells = user input, tinted cells = formulas.
No macros. Every formula must work in Excel, Google Sheets and LibreOffice (check.mjs recalculates in LibreOffice).
