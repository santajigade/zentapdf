"""Tell Bing (and other IndexNow engines) which pages changed in this publish.

Usage: python3 tools/indexnow.py <old_site_tree.txt> <new_site_dir>
old_site_tree.txt = output of `git ls-tree -r <previous site commit>` (may be empty on the first run).
Only URLs listed in the sitemap are sent, and only when their HTML changed or is new.
Never fails the publish: any error is printed and the script exits 0.
"""
import sys, os, re, json, glob, hashlib, urllib.request, urllib.error

HOST = 'zentapdf.com'
KEY = next((os.path.basename(p)[:-4] for p in glob.glob('public/*.txt') if re.fullmatch(r'[0-9a-f]{32}\.txt', os.path.basename(p))), None)

def blob_hash(path):  # same hash git uses, so it matches `git ls-tree`
    data = open(path, 'rb').read()
    return hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest()

def main():
    old_tree, site = sys.argv[1], sys.argv[2]
    old = {}
    if os.path.exists(old_tree):
        for line in open(old_tree):
            m = re.match(r'\d+ blob ([0-9a-f]+)\t(.+)', line.strip())
            if m: old[m.group(2)] = m.group(1)
    urls = re.findall(r'<loc>(https://[^<]+)</loc>', ''.join(open(f).read() for f in glob.glob(f'{site}/sitemap-*.xml') if 'index' not in f))
    changed = []
    for u in urls:
        rel = u.split(HOST, 1)[1].strip('/')
        f = (rel + '/index.html') if rel else 'index.html'
        p = os.path.join(site, f)
        if os.path.exists(p) and old.get(f) != blob_hash(p): changed.append(u)
    print(f'IndexNow: {len(changed)} of {len(urls)} sitemap URLs changed')
    if not changed or not KEY: return
    body = json.dumps({'host': HOST, 'key': KEY, 'keyLocation': f'https://{HOST}/{KEY}.txt', 'urlList': changed[:10000]}).encode()
    req = urllib.request.Request('https://api.indexnow.org/indexnow', data=body, headers={'Content-Type': 'application/json; charset=utf-8'})
    with urllib.request.urlopen(req, timeout=30) as r: print('IndexNow response:', r.status)

try: main()
except urllib.error.HTTPError as e: print('IndexNow skipped:', e, e.read()[:300])
except Exception as e: print('IndexNow skipped:', e)
