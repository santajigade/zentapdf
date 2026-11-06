# ZentaPDF YouTube Shorts maker

Makes vertical 1080 × 1920 MP4 Shorts (16.5 s, 30 fps, H.264 + AAC) in the style of batch 1.

## Style rules (always)
- Layout: cover (0 to 1.7 s) → tool card demo, 3 cycles of 4.2 s → closing "Try it free today" cover.
- Main screen: logo header, eyebrow pill, 2-line headline (2nd line in accent colour), white tool card with a live demo,
  "100+ FREE TOOLS · TRY THESE" chips (one lights up per cycle), bottom colour band with zentapdf.com and a QR code to the tool page.
- Every video has its own **light colour theme** (never reuse one from earlier batches, see `videos-batch*.js`).
- Every video has a **soundtrack**: `track.py` makes original music plus pops, ticks, whooshes and dings timed to the demo.
  Change `bpm` and `key` for each video so they sound different.
- No dashes (em/en dash) in any on-screen text, titles or descriptions.
- Demo numbers must be realistic. Where possible, run the real tool on zentapdf.com and use its real result.
- Text and the tool card must fill the vertical frame (no big empty gaps).

## Files
- `videos.js`: the list of videos (text, theme, scene, chips, bpm, key). Edit this for a new batch.
- `scenes.js`: one demo function per scene (`SCENES.name(tl, ci)`) and its sound cues (`SOUND.name`). Add new scenes here.
- `short.html`: the layout. `short.html?v=N&t=SECONDS` shows video N at a time.
- `track.py`: soundtrack generator. `build.sh N`: frames → audio → MP4 + thumbnail in `out/`.
- `snap.mjs` + `sheet.py`: contact sheets for checking frames.

## Steps
```bash
cd tools/shorts            # inside the zentapdf repo, after npm install (needs playwright, qrcode, ffmpeg, python numpy)
node -e "global.window={};require('./videos.js');require('fs').writeFileSync('urls.json',JSON.stringify(window.VIDEOS.flatMap(v=>[v.url,...(v.qrExtra||[])])))"
node qr.mjs                # makes qr.js
mkdir -p /tmp/sn && node snap.mjs 0,1,2 0.8,3,4.5,9,15.5 && python3 sheet.py 0,1,2 0.8,3,4.5,9,15.5   # check /tmp/sheet.png
seq 0 9 | xargs -P 4 -I{} ./build.sh {}    # about 1 minute per video
```
Then check frames of every MP4, zip `out/`, and give a table of title + description for each video.

## Batch 1 (done, 4 Nov 2026)
PDF to Word (blue), PDF to Excel (emerald), Compress PDF (rose), Merge PDF (violet), JPG to PDF (orange),
Compress image to 100 KB (teal), HEIC to JPG (pink), Sign PDF (indigo), Keyboard test (amber), Internet speed test (cyan).
Full settings in `videos-batch1.js`.

## Batch 2 (done, 4 Nov 2026)
Split PDF (red), PDF to JPG (lime), Word to PDF (sky), Protect PDF (slate), Unlock PDF (gold),
Add watermark (purple), Resize image (green), Video to GIF (fuchsia), Mic test (mocha), Webcam test (coral).
New scenes in `scenes.js` (split, pdf2jpg, word2pdf, protect, unlock, watermark, resize, vid2gif, mic, webcam). Full settings in `videos-batch2.js`.
Demo numbers for Split, PDF to JPG, Resize, Video to GIF and Protect come from running the real tools on the built site.

## Batch 3 (done, 6 Nov 2026)
Edit PDF (navy), Rotate PDF (olive), Add page numbers (wine), Reorder pages (graphite), Excel to PDF (pine),
PPT to PDF (brick), Redact PDF (steel), Crop image (mauve), WebP to JPG (khaki), QR code generator (dusk).
No device tests (owner's choice). New scenes: editpdf, rotate, pagenum, reorder, excel2pdf, ppt2pdf, redact, cropimg, webp2jpg, qr.
`qrExtra` in a video adds demo QR codes to `qr.js` (used by the qr scene). WebP to JPG numbers come from the real tool. Full settings in `videos-batch3.js`.
