"""Pinterest pin schedule and bulk upload.

Needs a fresh build (reads dist/pins/index.json).
  python3 tools/pins/pins.py make            # first time only: schedule every page, popular first, then round robin by category, 4 a day from tomorrow
  python3 tools/pins/pins.py add-new         # give pages that have no date yet (new tools or tests) tomorrow's date
  python3 tools/pins/pins.py lot [10]        # "a lot now": next 10 scheduled pins released today, kept out of the feed, .csv written
Board name for the .csv: BOARD below.
"""
import sys, json, csv, datetime, os

BOARD = 'Free PDF Tools Online'
PER_DAY = 4
SCHED = 'src/data/pins.json'
MANUAL = 'src/data/pins-manual.json'
POPULAR = ['edit-pdf', 'merge-pdf', 'compress-pdf', 'pdf-to-word', 'reduce-image-size-in-kb', 'sign-pdf', 'jpg-to-pdf', 'split-pdf',
           'pdf-to-jpg', 'word-to-pdf', 'compress-image', 'mp3-cutter', 'resize-image', 'pdf-to-excel', 'ringtone-maker', 'video-to-mp3']
POPULAR_TESTS = ['internet-speed-test', 'keyboard-test', 'mic-test', 'webcam-test']

IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
today = datetime.datetime.now(IST).date()
iso = lambda d: d.isoformat()

def load(p, default):
    return json.load(open(p)) if os.path.exists(p) else default

def save(p, v):
    open(p, 'w').write(json.dumps(v, indent=1, ensure_ascii=False) + '\n')

pins = json.load(open('dist/pins/index.json'))
byid = {p['id']: p for p in pins}
sched = load(SCHED, {})
manual = load(MANUAL, [])
cmd = sys.argv[1] if len(sys.argv) > 1 else ''

if cmd == 'make':
    order = [f'tool/{s}' for s in POPULAR] + [f'test/{s}' for s in POPULAR_TESTS]
    order = [i for i in order if i in byid]
    groups = {}
    for p in pins:
        if p['id'] not in order: groups.setdefault(p['group'], []).append(p['id'])
    queues = list(groups.values())
    while any(queues):  # round robin across categories
        for q in queues:
            if q: order.append(q.pop(0))
    sched = {i: iso(today + datetime.timedelta(days=1 + n // PER_DAY)) for n, i in enumerate(order)}
    save(SCHED, sched)
    print(f'{len(sched)} pins scheduled, {iso(today + datetime.timedelta(days=1))} to {max(sched.values())}')

elif cmd == 'add-new':
    new = [p['id'] for p in pins if p['id'] not in sched and not p['date']]
    for i in new: sched[i] = iso(today + datetime.timedelta(days=1))
    if new: save(SCHED, sched)
    print('new pins:', len(new), new)

elif cmd == 'lot':
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    future = sorted((d, i) for i, d in sched.items() if d > iso(today) and i not in manual and i in byid)
    pick = [i for _, i in future[:n]]
    for i in pick: sched[i] = iso(today); manual.append(i)
    save(SCHED, sched); save(MANUAL, manual)
    out = f'pins-lot-{iso(today)}.csv'
    with open(out, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['Title', 'Media URL', 'Pinterest board', 'Thumbnail', 'Description', 'Link', 'Publish date', 'Keywords'])
        for i in pick:
            p = byid[i]
            w.writerow([p['title'][:100], p['image'], BOARD, '', p['description'][:500], p['link'], '', p['keywords']])
    print(f'{len(pick)} pins moved to today and to pins-manual.json; wrote {out}. Deploy, then upload the .csv.')

else:
    print(__doc__)
