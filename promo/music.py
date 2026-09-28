# Tiny chiptune bed: 120 bpm, C G Am F, square lead + triangle bass + soft drums.
import wave, struct, math, random
SR = 44100; BPM = 120; BEAT = 60 / BPM; DUR = 26.0
N = int(SR * DUR); buf = [0.0] * N
def hz(m): return 440 * 2 ** ((m - 69) / 12)
def add(start, length, freq, vol, kind, decay=6.0):
    s0 = int(start * SR); n = int(length * SR)
    ph = 0.0; inc = freq / SR
    for i in range(n):
        j = s0 + i
        if j >= N: break
        t = i / SR
        env = min(1, t * 200) * math.exp(-decay * t) * min(1, (n - i) / (SR * 0.01))
        ph = (ph + inc) % 1
        if kind == 'sq': v = 1 if ph < 0.25 else -1          # 25% pulse
        elif kind == 'tri': v = 4 * abs(ph - 0.5) - 1
        else: v = random.uniform(-1, 1)
        buf[j] += v * vol * env
def kick(start):
    s0 = int(start * SR)
    for i in range(int(0.15 * SR)):
        if s0 + i >= N: break
        t = i / SR; f = 120 * math.exp(-t * 25) + 45
        buf[s0 + i] += math.sin(2 * math.pi * f * t) * 0.35 * math.exp(-t * 18)
chords = [(60, [60, 64, 67, 72]), (55, [55, 59, 62, 67]), (57, [57, 60, 64, 69]), (53, [53, 57, 60, 65])]
# melody per bar (8 eighths, None = rest), cheerful and simple
mel = [[72, 76, 79, 76, 77, 76, 74, 72], [74, 71, 67, 71, 74, None, 79, 77],
       [76, 72, 69, 72, 76, 77, 79, 76], [77, 76, 74, 72, 74, None, 72, None]]
bars = int(DUR / (4 * BEAT)) + 1
for b in range(bars):
    t0 = b * 4 * BEAT
    root, notes = chords[b % 4]
    intro = b < 1
    for q in range(4):
        add(t0 + q * BEAT, BEAT * 0.9, hz(root - 24 + (12 if q % 2 else 0)), 0.22, 'tri', 3)
        if not intro:
            kick(t0 + q * BEAT) if q % 2 == 0 else add(t0 + q * BEAT, 0.08, 0, 0.10, 'noise', 40)
        add(t0 + q * BEAT + BEAT / 2, 0.04, 0, 0.05, 'noise', 60)
    for e in range(8):   # soft arpeggio
        add(t0 + e * BEAT / 2, BEAT / 2 * 0.9, hz(notes[e % 4]), 0.05, 'sq', 8)
    if not intro:
        for e, m in enumerate(mel[b % 4]):
            if m: add(t0 + e * BEAT / 2, BEAT / 2 * 0.95, hz(m), 0.11, 'sq', 3)
# fade the last 1.5 s
for i in range(N):
    t = i / SR
    if t > DUR - 1.5: buf[i] *= max(0, (DUR - t) / 1.5)
peak = max(abs(x) for x in buf) or 1
with wave.open('music.wav', 'w') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<h', int(x / peak * 0.85 * 32767)) for x in buf))
print('ok', bars, 'bars')
