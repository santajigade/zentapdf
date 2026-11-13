"""Pinterest pin schedule and bulk upload.

Needs a fresh build (reads dist/pins/index.json).
  python3 tools/pins/pins.py make            # first time only: schedule every page, popular first, then round robin by category, 5 a day from tomorrow
  python3 tools/pins/pins.py add-new         # give pages that have no date yet (new tools or tests) tomorrow's date
  python3 tools/pins/pins.py csv [28]        # scheduled .csv: every pin not yet uploaded, 5 a day from tomorrow, Publish date filled in (main way now)
  python3 tools/pins/pins.py lot [10]        # "a lot now": next 10 scheduled pins released today, kept out of the feed, .csv written
Board name for the .csv: BOARD below.
"""
import sys, json, csv, datetime, os

BOARD = 'Free PDF Tools Online'
PER_DAY = 5
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

elif cmd == 'csv':
    # Scheduled .csv: every pin not yet uploaded, 5 a day at fixed IST times, up to DAYS days ahead (Pinterest allows about 30).
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 28
    times = ['10:00', '13:00', '16:00', '19:00', '21:30'][:PER_DAY]
    todo = [i for i, d in sorted(sched.items(), key=lambda x: (x[1], list(sched).index(x[0]))) if i not in manual and i in byid]
    todo += [p['id'] for p in pins if p['id'] not in sched and p['id'] not in manual and p['id'] not in todo]
    pick = todo[:days * PER_DAY]
    start = today + datetime.timedelta(days=1)
    out = f'pins-csv-{iso(start)}.csv'
    with open(out, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['Title', 'Media URL', 'Pinterest board', 'Thumbnail', 'Description', 'Link', 'Publish date', 'Keywords'])
        for n, i in enumerate(pick):
            day = start + datetime.timedelta(days=n // PER_DAY)
            hh, mm = map(int, times[n % PER_DAY].split(':'))
            utc = datetime.datetime(day.year, day.month, day.day, hh, mm, tzinfo=IST).astimezone(datetime.timezone.utc)
            p = byid[i]
            w.writerow([p['title'][:100], p['image'], BOARD, '', p['description'][:500], p['link'], utc.strftime('%Y-%m-%dT%H:%M:%S'), p['keywords']])
            sched[i] = iso(day); manual.append(i)
    save(SCHED, sched); save(MANUAL, manual)
    print(f'{len(pick)} pins, {iso(start)} to {iso(start + datetime.timedelta(days=(len(pick) - 1) // PER_DAY))}; wrote {out}. Deploy first, then upload.')

else:
    print(__doc__)
