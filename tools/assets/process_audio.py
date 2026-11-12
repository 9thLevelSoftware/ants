#!/usr/bin/env python3
"""Process raw CC0 audio into public/assets/audio/{ambience,sfx}/<name>.mp3 and write assets-src/records_audio.json.
usage: process_audio.py PROJECT_ROOT      (needs ffmpeg/ffprobe + numpy; treats all inputs as untrusted data)
Ambience: loop-ified with an equal-power crossfade of the tail into the head (output wraps seamlessly),
          loudness-normalised to -24 LUFS integrated, 96 kbps MP3.
SFX: mono, trimmed, short fades, peak-normalised to -3 dBFS, 96 kbps MP3."""
import json, os, re, subprocess, sys, tempfile
import numpy as np
root = sys.argv[1]; RAW = os.path.join(root, "assets-src/raw"); OUT = os.path.join(root, "public/assets/audio")
TMP = tempfile.mkdtemp(prefix="foundress_audio_")
IA = "https://archive.org/download/"
def ia_url(ident, path):
    import urllib.parse; return IA + ident + "/" + urllib.parse.quote(path)
OGA = "https://opengameart.org/sites/default/files/"
# ---- source registry: key -> (raw file, title, author, source page, direct url, licence, provenance note)
def oga(key, f, fn, slug, title, author, extra=""):
    return key, (os.path.join(RAW, "opengameart", f), title, author, "https://opengameart.org/content/" + slug, OGA + fn, "CC0 1.0 (as declared on the OpenGameArt page)", extra)
def ia(key, ident, path, dest, title, lib):
    au = "USC Sound Effect Archive / Sunset Editorial Collection (%s); digitised tapes provided by Craig Smith (USC), uploaded to the Internet Archive" % lib
    return key, (os.path.join(RAW, "archive", dest), title, au, "https://archive.org/details/" + ident, ia_url(ident, path), "CC0 1.0 (item licenseurl on archive.org: creativecommons.org/publicdomain/zero/1.0/); uploader-asserted, see provenance caveat", "provenance: archive.org uploader-asserted CC0 on a legacy studio library")
S = dict([
 oga("park_birds", "thimras_park_ambience_birds.wav", "park_ambience_birds.wav", "park-ambiences", "Park ambiences - birds", "Thimras"),
 oga("park_wind", "thimras_park_ambience_wind.wav", "park_ambience_wind.wav", "park-ambiences", "Park ambiences - wind", "Thimras"),
 oga("isaiah_birds", "isaiah658_birds.ogg", "birds-isaiah658_0.ogg", "ambient-bird-sounds", "Ambient Bird Sounds", "isaiah658"),
 oga("rain_k1", "kresiek_amb_rain_loop_1.ogg", "amb_rain_loop_1.ogg", "amb-rain-loop-1", "AMB Rain Loop 1", "Kresiek The Furry"),
 oga("fridge", "kresiek_amb_fridge_loop_1.ogg", "amb_fridge_loop_1.ogg", "fridge-loop-1", "Fridge Loop 1", "Kresiek The Furry"),
 oga("deep_rumble", "gmason_deep_rumble.ogg", "deep_rumble.ogg", "underwater-or-space-engine-rumble", "underwater or space engine rumble (deep_rumble)", "gmason"),
 oga("dig_under", "almitory_dig_underground_1.mp3", "dig_underground_1.mp3", "digging-underground", "Digging Underground", "Almitory", "page lists several licences incl. CC0; CC0 chosen"),
 oga("drip", "dripping_water_atmosbasement.flac", "atmosbasement.mp3_.flac", "dripping-water-loop", "Dripping water loop", "uploader not shown on page"),
 oga("squish_splat", "ezduzziteh_squishsplat_impact.mp3", "squishsplat_impact.mp3", "squish-sounds-effects", "Squish Sounds Effects - squishsplat_impact", "EZduzziteh"),
 oga("slime3", "x_rubberduck_water_splash_slime/slime_03.ogg", "water-splash-slime-sfx.zip", "40-cc0-water-splash-slime-sfx", "40 CC0 water / splash / slime SFX - slime_03", "rubberduck"),
 oga("crunch1", "x_starninjas_crunch_tito/crunch.1.ogg", "crunch_-_tito.zip", "7-eating-crunches", "7 Eating Crunches - crunch.1", "StarNinjas"),
 oga("crunch3", "x_starninjas_crunch_tito/crunch.3.ogg", "crunch_-_tito.zip", "7-eating-crunches", "7 Eating Crunches - crunch.3", "StarNinjas"),
 oga("crunch5", "x_starninjas_crunch_tito/crunch.5.ogg", "crunch_-_tito.zip", "7-eating-crunches", "7 Eating Crunches - crunch.5", "StarNinjas"),
 oga("gravel_step", "x_tinyworlds_differentsteps/gravel.ogg", "%5Bkdd%5DDifferentSteps_0.zip", "different-steps-on-wood-stone-leaves-gravel-and-mud", "Different steps on wood, stone, leaves, gravel and mud - gravel", "TinyWorlds"),
 oga("grasshopper", "x_antumdeluge_grasshopper/grasshopper.flac", "grasshopper.zip", "grasshopper", "Grasshopper (stridulation; original recording by straget, freesound.org/s/401939, CC0)", "AntumDeluge (trim) / straget (recording)"),
 oga("tree_creak", "antumdeluge_tree_creak.ogg", "tree_creak_0.ogg", "tree-creaking", "Tree Creaking", "AntumDeluge"),
 oga("ui_click1", "x_kenney_ui_sfx_set/click1.wav", "UI_SFX_Set.zip", "51-ui-sound-effects-buttons-switches-and-clicks", "51 UI sound effects - click1", "Kenney"),
 oga("ui_click3", "x_kenney_ui_sfx_set/click3.wav", "UI_SFX_Set.zip", "51-ui-sound-effects-buttons-switches-and-clicks", "51 UI sound effects - click3", "Kenney"),
 oga("ui_click5", "x_kenney_ui_sfx_set/mouseclick1.wav", "UI_SFX_Set.zip", "51-ui-sound-effects-buttons-switches-and-clicks", "51 UI sound effects - mouseclick1", "Kenney"),
 oga("ui_hover", "x_kenney_ui_sfx_set/rollover5.wav", "UI_SFX_Set.zip", "51-ui-sound-effects-buttons-switches-and-clicks", "51 UI sound effects - rollover5", "Kenney"),
 oga("ui_switch", "x_kenney_ui_sfx_set/switch10.wav", "UI_SFX_Set.zip", "51-ui-sound-effects-buttons-switches-and-clicks", "51 UI sound effects - switch10", "Kenney"),
 ia("crickets_outside", "Red_Library_Animals_Misc", "R24-14-Cricket Chirps Outside.wav", "Red_Library_Animals_Misc__R24-14-Cricket_Chirps_Outside.wav", "R24-14 Cricket Chirps Outside", "Red Library"),
 ia("crickets_two", "Red_Library_Animals_Misc", "R28-16-Two Competing Crickets.wav", "Red_Library_Animals_Misc__R28-16-Two_Competing_Crickets.wav", "R28-16 Two Competing Crickets", "Red Library"),
 ia("buzz", "Red_Library_Animals_Misc", "R01-30-Buzzing Sound.wav", "Red_Library_Animals_Misc__R01-30-Buzzing_Sound.wav", "R01-30 Buzzing Sound", "Red Library"),
 ia("rain_heavy", "Red_Library_Nature_Rain", "R30-25a-Steady Heavy Rain.wav", "Red_Library_Nature_Rain__R30-25a-Steady_Heavy_Rain.wav", "R30-25a Steady Heavy Rain", "Red Library"),
 ia("suburb", "Red_Library_Ambience_1", "R10-01-Suburban Ambience-Noise.wav", "Red_Library_Ambience_1__R10-01-Suburban_Ambience-Noise.wav", "R10-01 Suburban Ambience-Noise", "Red Library"),
 ia("traffic_city", "Red_Library_Ambience_2", "R20-05-Distant Traffic in City.wav", "Red_Library_Ambience_2__R20-05-Distant_Traffic_in_City.wav", "R20-05 Distant Traffic in City", "Red Library"),
 ia("car1", "Red_Library_Cars_2", "R03-50-Auto Drive By.wav", "Red_Library_Cars_2__R03-50-Auto_Drive_By.wav", "R03-50 Auto Drive By", "Red Library"),
 ia("car2", "Red_Library_Cars_3", "R20-14-Car Passes By in Low Gear.wav", "Red_Library_Cars_3__R20-14-Car_Passes_By_in_Low_Gear.wav", "R20-14 Car Passes By in Low Gear", "Red Library"),
 ia("broom", "Red_Library_Foley_Props_2", "R18-41-Push Broom, Dirty Floor.wav", "Red_Library_Foley_Props_2__R18-41-Push_Broom_Dirty_Floor.wav", "R18-41 Push Broom, Dirty Floor", "Red Library"),
 ia("wood_scrape", "Red_Library_Foley_Props_2", "R18-40-Scrape or Sweep Wood Surface.wav", "Red_Library_Foley_Props_2__R18-40-Scrape_or_Sweep_Wood_Surface.wav", "R18-40 Scrape or Sweep Wood Surface", "Red Library"),
 ia("wood_creaks", "Red_Library_Foley_Props_2", "R22-34-Light Wood Creaks.wav", "Red_Library_Foley_Props_2__R22-34-Light_Wood_Creaks.wav", "R22-34 Light Wood Creaks", "Red Library"),
 ia("creaky_wood", "Red_Library_Creaks", "R04-51-Creaky Wood.wav", "Red_Library_Creaks__R04-51-Creaky_Wood.wav", "R04-51 Creaky Wood", "Red Library"),
 ia("thud_sandbag", "Red_Library_Impacts", "R28-56-Sand Bags Dropped onto Wood Floor.wav", "Red_Library_Impacts__R28-56-Sand_Bags_Dropped_onto_Wood_Floor.wav", "R28-56 Sand Bags Dropped onto Wood Floor", "Red Library"),
 ia("thud_hollow", "Red_Library_Impacts", "R28-55-Thumps on Large Hollow Wooden Surface.wav", "Red_Library_Impacts__R28-55-Thumps_on_Large_Hollow_Wooden_Surface.wav", "R28-55 Thumps on Large Hollow Wooden Surface", "Red Library"),
 ia("gravel_slide", "Red_Library_Footsteps_1", "R10-10-Sliding Steps on Gravel.wav", "Red_Library_Footsteps_1__R10-10-Sliding_Steps_on_Gravel.wav", "R10-10 Sliding Steps on Gravel", "Red Library"),
 ia("crackle", "Red_Library_Foley_Props_4", "R04-38-Crackling and Crunching.wav", "Red_Library_Foley_Props_4__R04-38-Crackling_and_Crunching.wav", "R04-38 Crackling and Crunching", "Red Library"),
 ia("dig_shovel", "Red_Library_Tools", "R08-57-Digging with Shovel.wav", "Red_Library_Tools__R08-57-Digging_with_Shovel.wav", "R08-57 Digging with Shovel", "Red Library"),
 ia("dirt_shovel", "SSE_Library_DIRT_SAND", "MISC/DIRTMisc_Digging with shovel; poking ground_CS_USC.wav", "sse_dirt_digging_shovel.wav", "DIRTMisc Digging with shovel; poking ground", "SSE Library"),
 ia("playground", "SSE_Library_AMBIENCE", "SCHOOL/AMBSchl_Kids play on school playground outdoors_CS_USC.wav", "sse_playground_kids.wav", "AMBSchl Kids play on school playground outdoors", "SSE Library"),
 ia("mower_idle", "SSE_Library_VEHICLES", "ATV/VEHAtv_go cart or lawnmower idling_CS_USC.wav", "sse_lawnmower_idling.wav", "VEHAtv go cart or lawnmower idling", "SSE Library"),
 ia("mower_push", "SSE_Library_MACHINES", "GARDEN/MACHGrdn-MOWER_Manual push lawn mower_CS_USC.wav", "sse_mower_manual_push.wav", "MACHGrdn-MOWER Manual push lawn mower", "SSE Library"),
 ia("bees", "SSE_Library_ANIMALS", "INSECT/ANMLInsc_Bees swarming_CS_USC.wav", "sse_bees_swarming.wav", "ANMLInsc Bees swarming", "SSE Library"),
])
# ---------------- ffmpeg helpers
def ff(*args):
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", *args], capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr[:500])
def decode(path, ar=22050):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(ar), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32), ar
def dur(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip())
def loudest(path, d, t0=0.0, t1=None, pre=0.04):
    x, sr = decode(path); n = int(d * sr); hop = int(0.005 * sr)
    e = np.cumsum(np.concatenate([[0], x.astype(np.float64) ** 2]))
    best, bs = -1, 0
    lo = int(t0 * sr); hi = len(x) - n if t1 is None else min(len(x) - n, int((t1 - d) * sr))
    # window centred on the energy peak: use smoothed 50ms energy to find the peak, then place the window so peak sits `pre` s after the start
    w = int(0.05 * sr); sm = (e[w:] - e[:-w]); a = int(t0 * sr); b = len(sm) if t1 is None else min(len(sm), int(t1 * sr))
    pk = a + int(np.argmax(sm[a:b])); st = max(0, pk - int(pre * sr))
    return st / sr
def measure_lufs(path):
    r = subprocess.run(["ffmpeg", "-v", "info", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", r.stderr); return float(m[-1])
def peak_db(path):
    x, _ = decode(path, 44100); return 20 * np.log10(np.abs(x).max() + 1e-9)
def encode(wav, out, mono, kbps=96):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    ff("-i", wav, "-ar", "44100", "-ac", "1" if mono else "2", "-c:a", "libmp3lame", "-b:a", "%dk" % kbps, "-id3v2_version", "0", "-write_xing", "1", out)
def channels(path):
    return int(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels", "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip())
recs = []
def record(kind, name, src_keys, proc, loop, note=""):
    out = os.path.join(OUT, kind, name + ".mp3")
    srcs = [S[k] for k in src_keys]
    recs.append({"id": "audio/%s/%s" % (kind, name), "path": "public/assets/audio/%s/%s.mp3" % (kind, name), "kind": "audio", "subkind": kind,
                 "title": " + ".join(s[1] for s in srcs), "author": "; ".join(dict.fromkeys(s[2] for s in srcs)),
                 "source_page": "; ".join(dict.fromkeys(s[3] for s in srcs)), "download_url": "; ".join(dict.fromkeys(s[4] for s in srcs)),
                 "license": "; ".join(dict.fromkeys(s[5] for s in srcs)), "processing": proc, "seconds": round(dur(out), 2), "loop": loop,
                 "bytes": os.path.getsize(out), "note": "; ".join(x for x in [note] + [s[6] for s in srcs] if x)})
def loopify(src_wav, L, X, out_wav):
    """src_wav has length >= L+X. Output length L; its end flows into its start (equal-power crossfade of tail into head)."""
    fc = ("[0:a]atrim=start=%g:end=%g,asetpts=PTS-STARTPTS,afade=t=out:st=0:d=%g:curve=qsin[tail];"
          "[0:a]atrim=start=0:end=%g,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=%g:curve=qsin[head];"
          "[0:a]atrim=start=%g:end=%g,asetpts=PTS-STARTPTS[body];"
          "[tail][head]amix=inputs=2:duration=longest:normalize=0[blend];[blend][body]concat=n=2:v=0:a=1[o]") % (L, L + X, X, X, X, X, L)
    ff("-i", src_wav, "-filter_complex", fc, "-map", "[o]", "-c:a", "pcm_f32le", out_wav)
def ambience(name, keys, L, X, start=0.0, pre_filter="", note="", target=-24.0, custom_src=None, proc_extra=""):
    src = os.path.join(RAW, "x") if False else None
    seg = os.path.join(TMP, name + "_seg.wav"); lp = os.path.join(TMP, name + "_loop.wav"); fin = os.path.join(TMP, name + "_final.wav")
    if custom_src: custom_src(seg)
    else:
        af = ["-af", pre_filter] if pre_filter else []
        ff("-ss", str(start), "-t", str(L + X), "-i", S[keys[0]][0], *af, "-c:a", "pcm_f32le", seg)
    assert dur(seg) >= L + X - 0.05, (name, dur(seg))
    loopify(seg, L, X, lp)
    g = target - measure_lufs(lp)
    ff("-i", lp, "-af", "volume=%gdB,alimiter=limit=0.89:level=disabled" % g, "-c:a", "pcm_f32le", fin)
    mono = channels(fin) == 1
    encode(fin, os.path.join(OUT, "ambience", name + ".mp3"), mono)
    record("ambience", name, keys, "excerpt %.0f s (src t=%gs)%s; seamless loop via %g s equal-power tail->head crossfade; loudness-normalised to %g LUFS (gain %+.1f dB) with -1 dBFS-class limiter; %s 96 kbps MP3 (libmp3lame)" % (L + X, start, proc_extra or (", filter: " + pre_filter if pre_filter else ""), X, target, g, "mono" if mono else "stereo"), True, note)
def sfx(name, keys, start=None, d=1.0, auto=None, pre=0.04, fx="", note="", fade_out=None, loop=False, lufs=None, trim_lead=True, X=2.0):
    key = keys[0]; srcp = S[key][0]
    if start is None:
        if auto: start = loudest(srcp, d, auto[0], auto[1], pre)
        else: start = 0.0
    tot = dur(srcp); d = min(d, tot - start - (X if loop else 0))
    raw = os.path.join(TMP, name + "_r.wav"); fin = os.path.join(TMP, name + "_f.wav")
    if loop:
        seg = os.path.join(TMP, name + "_seg.wav")
        ff("-ss", "%g" % start, "-t", "%g" % (d + X), "-i", srcp, "-ac", "1", "-af", ((fx + ",") if fx else "") + "highpass=f=35", "-c:a", "pcm_f32le", seg)
        loopify(seg, d, X, raw)
    else:
        fo = fade_out if fade_out is not None else min(0.12, d * 0.3)
        lead = "silenceremove=start_periods=1:start_duration=0:start_threshold=-50dB:detection=peak," if trim_lead else ""
        af = (fx + "," if fx else "") + "highpass=f=35," + lead + "afade=t=in:d=0.004"
        ff("-ss", "%g" % start, "-t", "%g" % d, "-i", srcp, "-ac", "1", "-af", af, "-c:a", "pcm_f32le", raw + ".pre.wav")
        d2 = dur(raw + ".pre.wav"); fo = min(fo, d2 * 0.4)
        ff("-i", raw + ".pre.wav", "-af", "afade=t=out:st=%g:d=%g" % (max(0, d2 - fo), fo), "-c:a", "pcm_f32le", raw)
        d = d2
    if lufs is not None:
        g = lufs - measure_lufs(raw); norm = "normalised to %g LUFS" % lufs
    else:
        g = -3.0 - peak_db(raw); norm = "peak-normalised to -3 dBFS"
    ff("-i", raw, "-af", "volume=%gdB,alimiter=limit=0.8:level=disabled" % g, "-c:a", "pcm_f32le", fin)
    encode(fin, os.path.join(OUT, "sfx", name + ".mp3"), True)
    record("sfx", name, keys, "excerpt %.2f s at src t=%.2fs, mono%s, 35 Hz high-pass, %s, %s (gain %+.1f dB), 96 kbps mono MP3" % (d, start, (", filter: " + fx) if fx else "", ("seamless loop via %g s equal-power tail->head crossfade" % X) if loop else "leading silence trimmed, fades", norm, g), loop, note)
# ---------------- AMBIENCE
def birds_src(out):
    L = 48.0
    ff("-ss", "120", "-t", str(L), "-i", S["park_birds"][0], "-af", "highpass=f=380,volume=17dB", "-c:a", "pcm_f32le", os.path.join(TMP, "b1.wav"))
    ff("-t", "29.4", "-i", S["isaiah_birds"][0], "-af", "highpass=f=250", "-c:a", "pcm_f32le", os.path.join(TMP, "b2a.wav"))
    ff("-i", os.path.join(TMP, "b2a.wav"), "-i", os.path.join(TMP, "b2a.wav"), "-filter_complex", "[0:a][1:a]acrossfade=d=2:c1=qsin:c2=qsin[o]", "-map", "[o]", "-c:a", "pcm_f32le", os.path.join(TMP, "b2.wav"))
    ff("-i", os.path.join(TMP, "b1.wav"), "-i", os.path.join(TMP, "b2.wav"), "-filter_complex", "[0:a]aformat=channel_layouts=stereo[a];[1:a]aformat=channel_layouts=stereo,volume=-3dB[b];[a][b]amix=inputs=2:duration=first:normalize=0,atrim=0:%g[o]" % L, "-map", "[o]", "-c:a", "pcm_f32le", out)
ambience("birdsong_day", ["park_birds", "isaiah_birds"], 45.0, 3.0, custom_src=birds_src, proc_extra=", layered: Park-ambience birds (120 s offset, +17 dB, 380 Hz HP) + Ambient Bird Sounds (HP 250 Hz, self-crossfaded to 48 s, -3 dB)", note="daytime garden/park birdsong bed; two recordings layered")
ambience("crickets_night", ["crickets_outside"], 45.0, 3.0, start=8.0, note="night crickets/insects (dense, steady)")
ambience("rain_light", ["rain_k1"], 45.0, 3.0, start=5.0, note="light steady rain")
ambience("rain_heavy", ["rain_heavy"], 42.0, 3.0, start=0.0, note="steady heavy rain; recorded from a legacy studio library (somewhat band-limited)")
ambience("wind_leaves", ["park_wind"], 45.0, 3.0, start=104.0, pre_filter="highpass=f=60", note="park wind with gusts; rustle content is modest - no dedicated leaf-rustle bed found")
ambience("street_suburban", ["suburb"], 29.0, 3.0, start=0.0, note="suburban street/neighbourhood ambience; loop is 29 s (source only 32 s)")
ambience("traffic_distant", ["traffic_city"], 45.0, 3.0, start=12.0, note="distant city traffic wash (low rumble character)")
ambience("playground_distant", ["playground"], 45.0, 3.0, start=14.0, pre_filter="lowpass=f=4200,highpass=f=120", note="school playground children; low-passed to read as distant; contains children's voices (non-verbal shouting/play)")
def fridge_src(out):
    # author-provided seamless loop (9.2 s) repeated x4 and trimmed; hum has no distinctive features so repetition is unobtrusive
    ff("-stream_loop", "3", "-i", S["fridge"][0], "-t", "33", "-ar", "44100", "-c:a", "pcm_f32le", out)
ambience("room_fridge_hum", ["fridge"], 30.0, 3.0, custom_src=fridge_src, note="quiet indoor tone/fridge hum; built from a 9.2 s author loop repeated 4x then cross-faded", proc_extra=", author loop (9.2 s) repeated x4")
ambience("underground_rumble", ["deep_rumble"], 40.0, 4.0, start=10.0, pre_filter="lowpass=f=320,highpass=f=25", target=-26.0, note="deep low rumble, low-passed at 320 Hz; very low frequency content - needs subwoofer/headphones to be felt; source is an engine-rumble effect, not a real earth recording")
# ---------------- SFX
sfx("soil_dig_01", ["dig_under"], start=0.0, d=2.4, note="digging in dirt")
sfx("soil_scrape_01", ["dirt_shovel"], d=1.2, auto=(0, 5.7), note="shovel scraping dirt (human scale; pitch/gain to be tuned in game)")
sfx("soil_scrape_02", ["dig_shovel"], d=1.4, auto=(4, 30), note="shovel in soil (human scale)")
sfx("gravel_grit_01", ["gravel_step"], start=0.0, d=1.6, note="single step on gravel")
sfx("gravel_grit_02", ["gravel_slide"], d=0.9, auto=(3, 14), note="grit ticks from sliding steps on gravel")
sfx("gravel_grit_03", ["gravel_slide"], d=0.9, auto=(18, 35), note="grit ticks from sliding steps on gravel")
sfx("wood_creak_01", ["wood_creaks"], d=2.4, auto=(0, 28), pre=0.2, note="light wood creak")
sfx("wood_creak_02", ["creaky_wood"], d=2.2, auto=(0, 11), pre=0.2, note="creaky wood")
sfx("wood_creak_03", ["tree_creak"], start=0.0, d=4.0, note="tree creak")
sfx("wood_rasp_01", ["wood_scrape"], d=1.3, auto=(0, 28), pre=0.1, note="STAND-IN for wood gnaw: scrape/rasp on a wood surface (no CC0 gnawing recording found)")
sfx("wood_rasp_02", ["wood_scrape"], d=1.3, auto=(16, 28), pre=0.1, fx="atempo=1.0,asetrate=44100*1.25,aresample=44100", note="STAND-IN for wood gnaw: scrape on wood, +25% speed/pitch for a finer, ant-scale rasp")
sfx("crunch_01", ["crunch1"], start=0.0, d=0.9, note="crunch (eating-crunch sample; usable as brittle crunch)")
sfx("crunch_02", ["crunch3"], start=0.0, d=0.9, note="crunch")
sfx("crunch_03", ["crackle"], d=1.0, auto=(0, 11), note="crackle/crunch, dry brittle material")
sfx("water_drip_01", ["drip"], d=0.9, auto=(0, 20), pre=0.03, note="water drip")
sfx("water_drip_02", ["drip"], d=0.9, auto=(8, 20), pre=0.03, note="water drip")
sfx("wet_splat_01", ["squish_splat"], start=0.0, d=0.35, note="wet splat/squish")
sfx("wet_splat_02", ["slime3"], start=0.0, d=0.9, note="slimy wet splat")
sfx("thud_giant_step_01", ["thud_sandbag"], d=1.6, auto=(0, 13), pre=0.05, fx="lowpass=f=700,bass=g=6:f=90", note="heavy thud (sandbag drop on wood floor), low-passed 700 Hz + bass shelf for giant-footstep weight")
sfx("thud_giant_step_02", ["thud_hollow"], d=1.6, auto=(0, 15), pre=0.05, fx="lowpass=f=600,bass=g=5:f=80", note="heavy thud (hollow wooden surface), low-passed")
sfx("lawnmower_loop", ["mower_idle"], start=2.0, d=20.0, lufs=-22.0, loop=True, note="engine mower idle/run, seamless loop; source is 'go cart or lawnmower idling'")
sfx("lawnmower_push_loop", ["mower_push"], start=5.0, d=20.0, lufs=-22.0, loop=True, note="manual push reel mower, seamless loop")
sfx("car_pass_01", ["car1"], d=9.0, auto=(0, 17.3), pre=4.5, fade_out=1.0, trim_lead=False, note="car drive-by (old car recording)")
sfx("car_pass_02", ["car2"], d=10.0, auto=(0, 43), pre=5.0, fade_out=1.2, trim_lead=False, note="car passing in low gear")
sfx("broom_sweep_01", ["broom"], d=3.0, auto=(0, 23), pre=0.2, note="push broom on dirty floor")
sfx("broom_sweep_02", ["broom"], d=3.0, auto=(12, 23), pre=0.2, note="push broom on dirty floor (second excerpt)")
sfx("insect_wing_buzz_01", ["buzz"], d=1.6, auto=(0, 14), pre=0.1, fade_out=0.3, note="insect/flying buzz (source titled 'Buzzing Sound'; identity of the buzzer unverified by ear)")
sfx("insect_wing_buzz_02", ["bees"], d=1.6, auto=(0, 33), pre=0.1, fade_out=0.3, note="bee swarm buzz excerpt")
sfx("cricket_chirp_01", ["crickets_two"], start=2.0, d=0.8, note="short cricket chirp excerpt")
sfx("cricket_chirp_02", ["crickets_two"], start=8.0, d=0.8, note="short cricket chirp excerpt")
sfx("stridulation_grasshopper_01", ["grasshopper"], start=0.0, d=2.5, note="grasshopper stridulation")
sfx("ui_click_01", ["ui_click1"], start=0.0, d=0.2, note="soft UI click")
sfx("ui_click_02", ["ui_click3"], start=0.0, d=0.2, note="soft UI click")
sfx("ui_click_03", ["ui_click5"], start=0.0, d=0.2, note="soft UI click")
sfx("ui_hover_01", ["ui_hover"], start=0.0, d=0.25, note="UI hover")
sfx("ui_switch_01", ["ui_switch"], start=0.0, d=0.3, note="UI toggle/switch")
json.dump(recs, open(os.path.join(root, "assets-src/records_audio.json"), "w"), indent=1)
print(len(recs), "audio files,", sum(r["bytes"] for r in recs) / 1e6, "MB")
