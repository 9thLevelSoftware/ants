#!/usr/bin/env python3
"""Print per-window RMS (dBFS) and spectral centroid (Hz) of an audio file. usage: analyze_audio.py FILE [window_s]"""
import subprocess, sys, numpy as np
f = sys.argv[1]; w = float(sys.argv[2]) if len(sys.argv) > 2 else 5.0
sr = 22050
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True).stdout
x = np.frombuffer(raw, dtype=np.float32)
n = int(w * sr); out = []
for i in range(0, len(x) - n // 2, n):
    s = x[i:i + n]
    if len(s) < 256: break
    rms = 20 * np.log10(np.sqrt(np.mean(s ** 2)) + 1e-9)
    sp = np.abs(np.fft.rfft(s * np.hanning(len(s)))); fr = np.fft.rfftfreq(len(s), 1 / sr)
    cen = (sp * fr).sum() / (sp.sum() + 1e-9)
    out.append("%5.0fs rms %6.1f dB  centroid %5.0f Hz  peak %5.2f" % (i / sr, rms, cen, np.abs(s).max()))
print(f.split("/")[-1], "dur %.1fs" % (len(x) / sr)); print("\n".join(out[:40]))
