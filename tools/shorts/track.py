# Original upbeat background track + UI sound effects, synthesized (no third-party audio).
import numpy as np, wave, sys, json
SR = 44100
dur = float(sys.argv[2]); out = sys.argv[1]
events = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
bpm = float(events.get('bpm', 118)); key = float(events.get('key', 0))  # semitone shift so each video sounds a bit different
n = int(SR * dur); t = np.arange(n) / SR
mix = np.zeros(n)
f = lambda m: 440 * 2 ** ((m + key - 69) / 12)
def add(sig, at, gain=1.0):
    i = int(at * SR); j = min(n, i + len(sig))
    if i < n and j > i: mix[i:j] += sig[: j - i] * gain
def env(L, a=0.005, d=0.3):
    x = np.arange(int(L * SR)) / SR; return np.minimum(1, x / a) * np.exp(-x / d)
def tone(m, L, d=0.3, a=0.005, harm=(1, .5, .25)):
    x = np.arange(int(L * SR)) / SR; fr = f(m)
    return sum(h * np.sin(2 * np.pi * fr * (k + 1) * x) for k, h in enumerate(harm)) * env(L, a, d)
beat = 60 / bpm
prog = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]  # C G Am F
bar = 4 * beat
k = 0; tb = 0
while tb < dur:
    ch = prog[k % 4]
    # soft pad
    L = bar; x = np.arange(int(L * SR)) / SR
    pad = sum(np.sin(2 * np.pi * f(m) * x) + 0.3 * np.sin(2 * np.pi * f(m) * 2.005 * x) for m in ch)
    pad *= np.minimum(1, x / 0.25) * np.minimum(1, (L - x) / 0.25)
    add(pad, tb, 0.035)
    # bass
    for b in range(4): add(tone(ch[0] - 24, beat * 0.9, d=0.25, harm=(1, .3)), tb + b * beat, 0.22)
    # pluck arpeggio, 8th notes
    arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12]
    for s in range(8): add(tone(arp[s % 4], 0.4, d=0.12, harm=(1, .4, .15)), tb + s * beat / 2, 0.07)
    # kick on beats, hat on off-beats
    for b in range(4):
        L = 0.25; x = np.arange(int(L * SR)) / SR
        kick = np.sin(2 * np.pi * (50 + 90 * np.exp(-x * 30)) * x) * np.exp(-x * 14)
        add(kick, tb + b * beat, 0.35)
        hat = np.random.default_rng(b + k * 4).standard_normal(int(0.05 * SR)) * np.exp(-np.arange(int(0.05 * SR)) / SR * 90)
        hat = np.diff(hat, prepend=0)
        add(hat, tb + b * beat + beat / 2, 0.04)
    tb += bar; k += 1
# sound effects
def whoosh(L=0.45):
    m = int(L * SR); x = np.arange(m) / SR
    noise = np.random.default_rng(7).standard_normal(m)
    # sweep a simple low-pass by mixing smoothed versions
    sm = np.convolve(noise, np.ones(30) / 30, mode='same')
    return sm * np.sin(np.pi * x / L) ** 2 * 3
def pop(m=84): return tone(m, 0.12, d=0.04, harm=(1, .2))
def ding(): return tone(84, 1.2, d=0.5, harm=(1, .3, .1)) + tone(91, 1.2, d=0.5, harm=(1, .2)) * 0.6
for at in events.get('whoosh', []): add(whoosh(), at, 0.5)
for i, at in enumerate(events.get('pop', [])): add(pop(79 + (i % 5) * 2), at, 0.18)
for at in events.get('tick', []): add(pop(96), at, 0.09)
for at in events.get('ding', []): add(ding(), at, 0.22)
# fade in/out, normalise
fade = np.ones(n); fi = int(0.2 * SR); fo = int(1.2 * SR)
fade[:fi] = np.linspace(0, 1, fi); fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
mix *= fade; mix = np.tanh(mix * 1.2); mix *= 0.85 / max(1e-9, np.abs(mix).max())
st = np.stack([mix, np.roll(mix, 220)], 1)  # light stereo width
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype('<i2').tobytes())
