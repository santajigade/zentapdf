#!/usr/bin/env python3
"""SEO audit of the built site (dist/): titles, descriptions, H1, canonical, internal links, image alt, JSON-LD."""
import os, re, json, html, sys
D = os.path.join(os.path.dirname(__file__), '..', 'dist')
pages = {}
for root, _, files in os.walk(D):
    for f in files:
        if f.endswith('.html'):
            p = os.path.join(root, f); rel = '/' + os.path.relpath(p, D).replace('index.html', '').replace('\\', '/')
            pages[rel] = open(p, encoding='utf-8').read()
issues = []; titles = {}; descs = {}
for url, s in pages.items():
    if url == '/404.html' or url.startswith('/google'): continue
    t = html.unescape(re.search(r'<title>(.*?)</title>', s).group(1)); d = re.search(r'<meta name="description" content="([^"]*)"', s)
    d = html.unescape(d.group(1)) if d else ''
    if not (20 <= len(t) <= 65): issues.append(f'{url}: title length {len(t)}: {t}')
    if not (110 <= len(d) <= 165): issues.append(f'{url}: description length {len(d)}')
    titles.setdefault(t, []).append(url); descs.setdefault(d, []).append(url)
    h1 = len(re.findall(r'<h1[\s>]', s))
    if h1 != 1: issues.append(f'{url}: {h1} h1 tags')
    if 'rel="canonical"' not in s: issues.append(f'{url}: no canonical')
    for img in re.findall(r'<img [^>]*>', s):
        if 'alt=' not in img: issues.append(f'{url}: img without alt {img[:80]}')
    for js in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S):
        try: json.loads(js)
        except Exception as e: issues.append(f'{url}: bad JSON-LD {e}')
    for href in re.findall(r'href="(/[^"#?]*)', s):
        if href.startswith('/_astro') or re.search(r'\.(svg|png|ico|xml|webp|css|js)$', href): 
            if not os.path.exists(os.path.join(D, href.lstrip('/'))): issues.append(f'{url}: missing asset {href}')
            continue
        if href not in pages and href + '/' not in pages: issues.append(f'{url}: broken link {href}')
for t, u in titles.items():
    if len(u) > 1: issues.append(f'duplicate title on {u}')
for d, u in descs.items():
    if len(u) > 1 and d: issues.append(f'duplicate description on {u}')
print(f'{len(pages)} pages checked, {len(issues)} issues')
for i in sorted(set(issues)): print(' -', i)
