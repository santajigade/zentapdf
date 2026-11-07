#!/usr/bin/env python3
"""Page previews for templates: PNG pages from pdftoppm -> WebP.
   public/templates/img/<slug>.webp (page 1, 900 px wide), <slug>-2.webp, <slug>-3.webp, <slug>-sm.webp (card, 420 px)."""
import os, sys, glob, re
from PIL import Image
TMP, slugs = sys.argv[1], sys.argv[2:]
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'public', 'templates', 'img')
os.makedirs(OUT, exist_ok=True)
for slug in slugs:
    for old in glob.glob(os.path.join(OUT, slug + '*.webp')):
        if re.fullmatch(re.escape(slug) + r'(-\d|-sm)?\.webp', os.path.basename(old)): os.remove(old)
    pages = sorted(glob.glob(os.path.join(TMP, slug + '-*.png')), key=lambda p: int(re.search(r'-(\d+)\.png$', p).group(1)))
    pages = [p for p in pages if re.fullmatch(re.escape(slug) + r'-\d+\.png', os.path.basename(p))]
    for i, p in enumerate(pages, 1):
        im = Image.open(p).convert('RGB')
        big = im.copy(); big.thumbnail((900, 1400), Image.LANCZOS)
        big.save(os.path.join(OUT, f'{slug}.webp' if i == 1 else f'{slug}-{i}.webp'), 'WEBP', quality=82, method=6)
        if i == 1:
            sm = im.copy(); sm.thumbnail((420, 640), Image.LANCZOS)
            sm.save(os.path.join(OUT, f'{slug}-sm.webp'), 'WEBP', quality=78, method=6)
            im.save(os.path.join(TMP, f'{slug}-og-src.png'))
    print('previews', slug, len(pages))
