---
name: cli-music
description: "Generate music tracks using CLI audio tools (ffmpeg + SoX). Zero-dependency local audio generation — no API keys, no cloud services, works offline. Use when the user explicitly asks to: use ffmpeg for music, use sox for music, synthesize audio with CLI tools, make a beat with ffmpeg, generate audio offline, cli music, cli audio synthesis. This skill produces lo-fi synthesized electronic music only — for professional quality tracks with vocals, use mureka-music instead."
---

# cli-music

Generate music tracks locally using CLI audio tools — no API keys, no cloud services, no external dependencies.

> **This skill produces lo-fi synthesized electronic music.** It generates audio from raw waveform math (sine waves, noise) — there are no vocals, no sampled instruments, no AI generation. Output quality is comparable to chiptune or basic synthesizer demos. For professional-quality tracks with real vocals and full production, use the [`mureka-music`](../mureka-music/SKILL.md) skill instead (~$0.04/song via Mureka API).

**Related skills:**
- [claw-fm](../claw-fm/SKILL.md) — Platform submission, profiles, earning, cover art
- [mureka-music](../mureka-music/SKILL.md) — Professional AI music generation with vocals (recommended)

---

## Quick Recipe

Generate a working lo-fi track in one shot. Estimated generation time: 10-30 seconds.

```bash
TMPDIR=$(mktemp -d)
BPM=85; BEAT=0.706; BAR=$(echo "$BEAT * 4" | bc); DUR=60

# Pad — detuned chord
sox -n -r 44100 "$TMPDIR/pad.wav" synth $DUR sawtooth 220 sawtooth 220.8 sawtooth 261.63 sawtooth 262.4 sawtooth 329.63 sawtooth 330.4 chorus 0.6 0.9 40 0.4 0.25 2 lowpass 700 reverb 50 gain -12

# Bass — root note
sox -n -r 44100 "$TMPDIR/bass.wav" synth $DUR sawtooth 110 lowpass 350 gain -8

# Kick
sox -n -r 44100 "$TMPDIR/kick.wav" synth 0.3 sine 160:45 fade t 0.005 0.3 0.2 gain -3

# Texture — pink noise bed
ffmpeg -y -f lavfi -i "anoisesrc=color=pink:d=$DUR:s=44100" -af "lowpass=f=3000,highpass=f=200,volume=0.04" "$TMPDIR/texture.wav"

# Loop kick to fill duration
sox "$TMPDIR/kick.wav" "$TMPDIR/kick_bar.wav" repeat 3
ffmpeg -y -stream_loop $(echo "$DUR / ($BAR)" | bc) -i "$TMPDIR/kick_bar.wav" -t $DUR -c copy "$TMPDIR/kick_full.wav"

# Mix and export
ffmpeg -y -i "$TMPDIR/pad.wav" -i "$TMPDIR/bass.wav" -i "$TMPDIR/kick_full.wav" -i "$TMPDIR/texture.wav" \
  -filter_complex "[0][1][2][3]amix=inputs=4:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=3,afade=t=out:st=57:d=3" \
  -ar 44100 -ac 2 -codec:a libmp3lame -b:a 192k track.mp3

rm -rf "$TMPDIR"
ffprobe -v error -show_entries format=duration,bit_rate -show_entries stream=sample_rate,channels,codec_name -of default=noprint_wrappers=1 track.mp3
```

For better results, read the full guide below to add melody, drum patterns, and arrangement.

After generating your track, use the [`claw-fm`](../claw-fm/SKILL.md) skill for cover art, metadata, submission, and profile setup.

---

## Overview & Constraints

**Output target:** MP3, 192 kbps, 44100 Hz, stereo, 1–3 minutes.

**Approach:** Generate individual WAV layers (melody, bass, drums, pad), mix them together, then export as MP3.

**Tools:**

| Tool | Install | Use for |
|------|---------|---------|
| **ffmpeg** | Usually pre-installed | Mixing, filter graphs, MP3 encoding, `aevalsrc` expression synthesis |
| **SoX** | `brew install sox` / `apt install sox` | Waveform synthesis (native sawtooth/square/triangle/pluck), effects, sequencing |
| **ffprobe** | Bundled with ffmpeg | Verifying output (duration, bitrate, format) |

Prefer SoX for tone generation when available — native waveforms eliminate manual harmonic stacking. Fall back to ffmpeg `aevalsrc` if SoX isn't installed. Always use ffmpeg for final mix and MP3 export.

**Temp directory workflow:**
```bash
TMPDIR=$(mktemp -d)
# Generate layers into $TMPDIR/
# Mix layers
# Export final MP3
# Clean up: rm -rf "$TMPDIR"
```

All ffmpeg commands use `-y` to overwrite without prompting.

---

## Rhythm & Timing Math

**BPM to beat duration:**
```
beat_duration = 60 / BPM
```

**Note values at common BPMs:**

| BPM | Whole (s) | Half (s) | Quarter (s) | Eighth (s) | Sixteenth (s) |
|-----|-----------|----------|-------------|------------|----------------|
| 80  | 3.000     | 1.500    | 0.750       | 0.375      | 0.1875         |
| 90  | 2.667     | 1.333    | 0.667       | 0.333      | 0.167          |
| 100 | 2.400     | 1.200    | 0.600       | 0.300      | 0.150          |
| 110 | 2.182     | 1.091    | 0.545       | 0.273      | 0.136          |
| 120 | 2.000     | 1.000    | 0.500       | 0.250      | 0.125          |
| 130 | 1.846     | 0.923    | 0.462       | 0.231      | 0.115          |
| 140 | 1.714     | 0.857    | 0.429       | 0.214      | 0.107          |

**Measure duration (4/4 time):** `4 * beat_duration`

**Loop math:** To fill N seconds, loop a bar `ceil(N / measure_duration)` times.

---

## Note Frequency Reference

### Chromatic Scale (Hz) — Octaves 2–6

| Note | Oct 2   | Oct 3   | Oct 4    | Oct 5    | Oct 6    |
|------|---------|---------|----------|----------|----------|
| C    | 65.41   | 130.81  | 261.63   | 523.25   | 1046.50  |
| C#   | 69.30   | 138.59  | 277.18   | 554.37   | 1108.73  |
| D    | 73.42   | 146.83  | 293.66   | 587.33   | 1174.66  |
| D#   | 77.78   | 155.56  | 311.13   | 622.25   | 1244.51  |
| E    | 82.41   | 164.81  | 329.63   | 659.26   | 1318.51  |
| F    | 87.31   | 174.61  | 349.23   | 698.46   | 1396.91  |
| F#   | 92.50   | 185.00  | 369.99   | 739.99   | 1479.98  |
| G    | 98.00   | 196.00  | 392.00   | 783.99   | 1567.98  |
| G#   | 103.83  | 207.65  | 415.30   | 830.61   | 1661.22  |
| A    | 110.00  | 220.00  | 440.00   | 880.00   | 1760.00  |
| A#   | 116.54  | 233.08  | 466.16   | 932.33   | 1864.66  |
| B    | 123.47  | 246.94  | 493.88   | 987.77   | 1975.53  |

### Common Scales (Hz values at octave 4)

**C Major:** 261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88
**A Minor (natural):** 440.00, 493.88, 523.25, 587.33, 659.26, 698.46, 783.99
**C Minor:** 261.63, 293.66, 311.13, 349.23, 392.00, 415.30, 466.16
**A Minor Pentatonic:** 440.00, 523.25, 587.33, 659.26, 783.99
**C Major Pentatonic:** 261.63, 329.63, 392.00, 440.00, 523.25

### Chord Formulas

| Type         | Intervals   | Example (C4)                   |
|--------------|-------------|--------------------------------|
| Major triad  | root, M3, P5 | 261.63, 329.63, 392.00       |
| Minor triad  | root, m3, P5 | 261.63, 311.13, 392.00       |
| Major 7th    | root, M3, P5, M7 | 261.63, 329.63, 392.00, 493.88 |
| Minor 7th    | root, m3, P5, m7 | 261.63, 311.13, 392.00, 466.16 |
| Dominant 7th | root, M3, P5, m7 | 261.63, 329.63, 392.00, 466.16 |

### Common Progressions with Hz

**I–V–vi–IV in C Major:**
- C: 261.63, 329.63, 392.00
- G: 392.00, 493.88, 587.33
- Am: 440.00, 523.25, 659.26
- F: 349.23, 440.00, 523.25

**ii–V–I in C Major:**
- Dm: 293.66, 349.23, 440.00
- G: 392.00, 493.88, 587.33
- C: 261.63, 329.63, 392.00

**i–iv–v in A Minor:**
- Am: 220.00, 261.63, 329.63
- Dm: 146.83, 174.61, 220.00
- Em: 164.81, 196.00, 246.94

---

## Composition Principles

Practical rules that directly affect output quality:

- **Stay in the scale.** Every melody and bass note should come from the chosen scale's Hz values. Random frequencies sound wrong instantly.
- **Resolve to the root.** End phrases on the root note or 5th. End the track on the root chord. This creates a sense of completion.
- **Leave space.** Don't fill every beat with notes. Rests make melodies musical. A quarter-note rest every 2–4 notes is a good baseline.
- **Separate frequency ranges.** Bass in octaves 2–3, pads in octaves 3–4, melody in octaves 4–5. Stacking everything in octave 4 creates mud.
- **Contrary motion.** When melody moves up, bass moves down (or stays put). Parallel motion sounds flat.
- **Repeat, then vary.** Play a 2–4 bar phrase, then repeat it with one note changed. Humans expect patterns with small surprises.
- **Voice the root low.** In chord voicings, put the root note in the lowest octave. The 3rd and 5th sit above it.
- **Tension needs release.** A dissonant chord (dominant 7th, diminished) must resolve to a consonant chord. Don't leave tension hanging at the end of a phrase.

---

## Core Synthesis Techniques

> **CRITICAL: Never use bare `sin()` tones.** A single sine wave sounds like a test tone, not music.
> Always use harmonic stacking (sawtooth or square approximations below) for any melodic or bass content.
> The waveform recipe is what makes ffmpeg synthesis sound like actual instruments vs. a hearing test.

### Waveform Recipes (use these, not bare sine)

**Sawtooth approximation** (warm, buzzy — bass, pads, leads):
```
saw(f,t) = sin(f*2*PI*t) - sin(2*f*2*PI*t)/2 + sin(3*f*2*PI*t)/3 - sin(4*f*2*PI*t)/4 + sin(5*f*2*PI*t)/5
```
More harmonics = brighter/buzzier. 5–6 harmonics is a good default. Divide by ~3 to normalize amplitude.

**Square approximation** (hollow, reedy — melody, leads, chiptune):
```
sq(f,t) = sin(f*2*PI*t) + sin(3*f*2*PI*t)/3 + sin(5*f*2*PI*t)/5 + sin(7*f*2*PI*t)/7
```
Only odd harmonics. 4 terms is a good default. Divide by ~2 to normalize.

**Vibrato via frequency modulation** (adds life to sustained notes):
```
sin(f * (1 + 0.004*sin(5*2*PI*t)) * 2*PI*t)
```
Depth 0.003–0.005 is subtle, 5–6 Hz rate is natural. Apply to the fundamental frequency.

**Detuned pair** (width, movement — pads, ambient):
```
(sin(f*2*PI*t) + sin((f+0.8)*2*PI*t)) / 2
```
Offset 0.5–1.5 Hz creates slow beating. Apply to each note in a chord for lush pads.

### `aevalsrc` — Expression-based synthesis (primary tool)

The `aevalsrc` filter evaluates a math expression over time variable `t` (seconds) and sample number `n`. Use it for melodies, bass lines, and complex tones.

**Available functions:** `sin()`, `cos()`, `exp()`, `log()`, `abs()`, `mod(a,b)`, `between(x,lo,hi)` (returns 1 if lo<=x<=hi), `gt(a,b)`, `lt(a,b)`, `gte()`, `lte()`, `if(cond,then,else)`, `min()`, `max()`, `pow()`, `sqrt()`, `PI`, `E`

**Sawtooth bass note (use this as the baseline, not bare sine):**
```bash
# A2 sawtooth bass with 5 harmonics
ffmpeg -y -f lavfi -i "aevalsrc='\
  (sin(110*2*PI*t)-sin(220*2*PI*t)/2+sin(330*2*PI*t)/3-sin(440*2*PI*t)/4+sin(550*2*PI*t)/5)/3 \
':s=44100:d=2" out.wav
```

**Square-wave melody note with vibrato:**
```bash
# A4 square-ish lead with vibrato
ffmpeg -y -f lavfi -i "aevalsrc='\
  (sin(440*(1+0.004*sin(5*2*PI*t))*2*PI*t)+sin(1320*2*PI*t)/3+sin(2200*2*PI*t)/5+sin(3080*2*PI*t)/7)/2 \
':s=44100:d=2" out.wav
```

**Tone with amplitude envelope (attack + decay):**
```bash
# Fast attack (0.01s), exponential decay
ffmpeg -y -f lavfi -i "aevalsrc='sin(440*2*PI*t) * min(t/0.01, 1) * exp(-3*t)':s=44100:d=2" out.wav
```

**Chord (sum of detuned pairs for width):**
```bash
# C major chord with detuned pairs — sounds full, not thin
ffmpeg -y -f lavfi -i "aevalsrc='\
  (sin(261.63*2*PI*t)+sin(262.4*2*PI*t) + sin(329.63*2*PI*t)+sin(330.4*2*PI*t) + sin(392*2*PI*t)+sin(392.8*2*PI*t))/6 \
':s=44100:d=2" out.wav
```

**Sequencing notes with `between(mod(t,...), ...)`:**
```bash
# Play 4 notes in sequence, each 0.5s, looping every 2s
# C4 -> E4 -> G4 -> C5
ffmpeg -y -f lavfi -i "aevalsrc='\
  sin(261.63*2*PI*t)*between(mod(t,2),0,0.5) + \
  sin(329.63*2*PI*t)*between(mod(t,2),0.5,1.0) + \
  sin(392.00*2*PI*t)*between(mod(t,2),1.0,1.5) + \
  sin(523.25*2*PI*t)*between(mod(t,2),1.5,2.0) \
':s=44100:d=8" out.wav
```

**Note with per-note envelope (avoid clicks):**
```bash
# Each note gets its own attack/release envelope
# mt = position within the current 0.5s slot
ffmpeg -y -f lavfi -i "aevalsrc='\
  sin(261.63*2*PI*t) * between(mod(t,2),0,0.5) * min(mod(t,0.5)/0.01,1) * min((0.5-mod(t,0.5))/0.01,1) + \
  sin(329.63*2*PI*t) * between(mod(t,2),0.5,1.0) * min((mod(t,2)-0.5)/0.01,1) * min((1.0-mod(t,2))/0.01,1) + \
  sin(392.00*2*PI*t) * between(mod(t,2),1.0,1.5) * min((mod(t,2)-1.0)/0.01,1) * min((1.5-mod(t,2))/0.01,1) + \
  sin(523.25*2*PI*t) * between(mod(t,2),1.5,2.0) * min((mod(t,2)-1.5)/0.01,1) * min((2.0-mod(t,2))/0.01,1) \
':s=44100:d=8" out.wav
```

### `anoisesrc` — Noise-based percussion

```bash
# White noise (hihats)
ffmpeg -y -f lavfi -i "anoisesrc=color=white:d=0.1:s=44100" hihat.wav

# Pink noise (snare body)
ffmpeg -y -f lavfi -i "anoisesrc=color=pink:d=0.2:s=44100" snare_body.wav
```

### Drum sample recipes (always layer, never single-source)

Single-source drum hits sound thin and fake. Always layer multiple components:

**Kick** — sine sweep body + sub layer:
```bash
ffmpeg -y -f lavfi -i "aevalsrc='\
  0.9*sin(2*PI*(160*exp(-8*t)+45)*t)*exp(-4*t) \
  + 0.4*sin(2*PI*(80*exp(-15*t)+30)*t)*exp(-3*t) \
':s=44100:d=0.4" -af "lowpass=f=200,volume=1.5" kick.wav
```

**Snare** — pitched tone body + noise crack (generate separately, then mix):
```bash
# Tone body (~200Hz, fast decay)
ffmpeg -y -f lavfi -i "aevalsrc='0.6*sin(200*2*PI*t)*exp(-15*t)':s=44100:d=0.25" snare_tone.wav
# Noise crack (pink noise, bandpassed, shaped)
ffmpeg -y -f lavfi -i "anoisesrc=color=pink:d=0.2:s=44100" \
  -af "bandpass=f=1200:width_type=h:w=2000,afade=t=in:d=0.001,afade=t=out:st=0.05:d=0.15,volume=0.8" snare_noise.wav
# Layer them
ffmpeg -y -i snare_tone.wav -i snare_noise.wav -filter_complex "[0][1]amix=inputs=2:normalize=0" snare.wav
```

**Closed hihat** — white noise, tight envelope, high-passed:
```bash
ffmpeg -y -f lavfi -i "anoisesrc=color=white:d=0.08:s=44100" \
  -af "highpass=f=7000,bandpass=f=10000:width_type=h:w=4000,afade=t=out:st=0.015:d=0.065,volume=0.35" hihat.wav
```

**Open hihat** — longer decay for accent/variation:
```bash
ffmpeg -y -f lavfi -i "anoisesrc=color=white:d=0.2:s=44100" \
  -af "highpass=f=6000,bandpass=f=9000:width_type=h:w=5000,afade=t=out:st=0.05:d=0.15,volume=0.25" openhat.wav
```

---

## SoX Synthesis

SoX has native waveform types — no harmonic stacking needed. Prefer SoX for tone generation when it's available.

**Check:** `which sox` | **Install:** `brew install sox` (macOS) or `apt install sox` (Linux)

### Waveform types

`sine`, `square`, `sawtooth`, `triangle`, `trapezium`, `pluck`, `whitenoise`, `pinknoise`, `brownnoise`

### Single tone

```bash
# Sawtooth A4 for 2 seconds — one command vs 5-line aevalsrc expression
sox -n -r 44100 out.wav synth 2 sawtooth 440
```

### Chord (multiple oscillators)

```bash
# C major chord — three sawtooth oscillators summed
sox -n -r 44100 out.wav synth 2 sawtooth 261.63 sawtooth 329.63 sawtooth 392
```

### Note sequence

```bash
# 4-note melody: C4 → E4 → G4 → C5, each 0.5s
sox -n -r 44100 out.wav synth 0.5 sawtooth 261.63 : synth 0.5 sawtooth 329.63 : synth 0.5 sawtooth 392 : synth 0.5 sawtooth 523.25
```

### Kick drum (frequency sweep)

```bash
# Sine sweep 160→45Hz with fade — replaces the complex aevalsrc kick recipe
sox -n -r 44100 kick.wav synth 0.3 sine 160:45 fade t 0.005 0.3 0.2 gain -3
```

### Plucked string

```bash
# Karplus-Strong pluck — great for lo-fi guitar sounds, not possible with ffmpeg
sox -n -r 44100 pluck.wav synth 1.5 pluck 220 fade t 0.005 1.5 0.5
```

### Effects

```bash
# Effects chain left-to-right after filename
sox in.wav out.wav reverb 50 chorus 0.6 0.9 40 0.4 0.25 2 lowpass 800 gain -2
```

| Effect | Usage | Example |
|--------|-------|---------|
| `reverb` | Room ambience (30–80 useful range) | `reverb 50` |
| `chorus` | Stereo widening | `chorus 0.6 0.9 40 0.4 0.25 2` |
| `overdrive` | Harmonic saturation (5–10 subtle, 20+ aggressive) | `overdrive 10` |
| `lowpass` | Warmth | `lowpass 800` |
| `highpass` | Clarity for non-bass | `highpass 200` |
| `tremolo` | Amplitude modulation | `tremolo 5 60` |
| `fade` | Fade in/out | `fade t 2 60 3` |
| `gain` | Volume in dB | `gain -3` |

### Mixing & looping with SoX

```bash
# Mix files (sum)
sox -m melody.wav bass.wav mix.wav

# Concatenate files
sox bar.wav bar.wav bar.wav long.wav

# Repeat a bar 30 times (29 additional plays)
sox in.wav out.wav repeat 29

# Trim to exact duration
sox in.wav out.wav trim 0 2.824
```

### When to use SoX vs ffmpeg

| Task | SoX | ffmpeg |
|------|-----|--------|
| Sawtooth/square/triangle tone | `synth 2 sawtooth 440` | 5-line `aevalsrc` harmonic series |
| Kick drum (freq sweep) | `synth 0.3 sine 160:45` | `aevalsrc` with `exp()` sweep |
| Plucked string sound | `synth 1.5 pluck 220` | Not practical |
| Reverb | `reverb 50` — simple, good | `aecho` — workable but not true reverb |
| Complex time-sequenced patterns | Clunky `:` concat syntax | `between(mod(t,...))` — flexible |
| Place hits at exact ms positions | Not supported | `adelay` + `amix` |
| Mix 5+ layers with per-layer volume | Possible but awkward | `amix=normalize=0` + `volume` per input |
| Final MP3 encode + loudnorm | No MP3 encoding | `libmp3lame` + `loudnorm` |

> **Recommended workflow:** Use SoX to generate individual tones, chords, and drum hits (simpler, better waveforms). Use ffmpeg for assembling patterns (`adelay`+`amix`), mixing layers, and MP3 export.

---

## Building Patterns

### Drum hits with `adelay` + `amix`

Place individual hits at precise times using `adelay` (in milliseconds):

```bash
BPM=120
BEAT_MS=500  # 60000/120

# Kick on beats 1 and 3 (0ms and 1000ms)
# Snare on beats 2 and 4 (500ms and 1500ms)
# Hihat on every eighth note (0, 250, 500, 750, 1000, 1250, 1500, 1750)

ffmpeg -y \
  -f lavfi -i "aevalsrc='sin(2*PI*(150*exp(-10*t))*t)*exp(-5*t)':s=44100:d=0.3" \
  -f lavfi -i "anoisesrc=color=pink:d=0.15:s=44100" \
  -f lavfi -i "anoisesrc=color=white:d=0.05:s=44100" \
  -filter_complex "\
    [0]asplit=2[k1][k2]; \
    [1]asplit=2[s1][s2]; \
    [2]asplit=8[h1][h2][h3][h4][h5][h6][h7][h8]; \
    [k1]adelay=0|0[dk1]; [k2]adelay=1000|1000[dk2]; \
    [s1]adelay=500|500,highpass=f=200,bandpass=f=300:width_type=h:w=200[ds1]; \
    [s2]adelay=1500|1500,highpass=f=200,bandpass=f=300:width_type=h:w=200[ds2]; \
    [h1]adelay=0|0,highpass=f=8000[dh1]; \
    [h2]adelay=250|250,highpass=f=8000[dh2]; \
    [h3]adelay=500|500,highpass=f=8000[dh3]; \
    [h4]adelay=750|750,highpass=f=8000[dh4]; \
    [h5]adelay=1000|1000,highpass=f=8000[dh5]; \
    [h6]adelay=1250|1250,highpass=f=8000[dh6]; \
    [h7]adelay=1500|1500,highpass=f=8000[dh7]; \
    [h8]adelay=1750|1750,highpass=f=8000[dh8]; \
    [dk1][dk2][ds1][ds2][dh1][dh2][dh3][dh4][dh5][dh6][dh7][dh8]amix=inputs=12:normalize=0,volume=0.8,apad=whole_dur=2 \
  " -t 2 drum_bar.wav
```

> **IMPORTANT:** `amix` output duration = longest input stream. With `adelay`, the last hit's
> delayed sample + its decay is shorter than a full bar, so the bar gets truncated.
> Always append `apad=whole_dur=BAR_DURATION` after `amix` to pad to the exact bar length.

### Looping bars to fill duration with `-stream_loop`

```bash
# Loop a 2-second bar to fill 60 seconds
ffmpeg -y -stream_loop 29 -i drum_bar.wav -t 60 -c copy drums_full.wav
```

### Melodic sequences with `aevalsrc`

Use the `between(mod(t, bar_duration), start, end)` pattern to sequence notes within a looping bar. Always add per-note envelopes (short fade in/out of ~10ms) to avoid clicks at note boundaries.

---

## Layer Recipes

### Melody Layer

Use square-wave harmonics (odd harmonics) for a clear, musical tone. Add vibrato for life, tremolo for movement. Always include per-note envelopes.

```bash
# Square-ish melody with vibrato, 4 notes at 120 BPM
# Pattern: C5, D5, E5, C5 — each note has attack/release envelope
ffmpeg -y -f lavfi -i "aevalsrc='\
  (sin(523.25*(1+0.004*sin(5*2*PI*t))*2*PI*t)+sin(1569.75*2*PI*t)/3+sin(2616.25*2*PI*t)/5)*0.3 \
  * between(mod(t,2),0,0.5) * min(mod(t,2)/0.015,1) * min((0.5-mod(t,2))/0.04,1) + \
  (sin(587.33*(1+0.004*sin(5*2*PI*t))*2*PI*t)+sin(1761.99*2*PI*t)/3+sin(2936.65*2*PI*t)/5)*0.3 \
  * between(mod(t,2),0.5,1.0) * min((mod(t,2)-0.5)/0.015,1) * min((1.0-mod(t,2))/0.04,1) + \
  (sin(659.26*(1+0.004*sin(5*2*PI*t))*2*PI*t)+sin(1977.78*2*PI*t)/3+sin(3296.3*2*PI*t)/5)*0.3 \
  * between(mod(t,2),1.0,1.5) * min((mod(t,2)-1.0)/0.015,1) * min((1.5-mod(t,2))/0.04,1) + \
  (sin(523.25*(1+0.004*sin(5*2*PI*t))*2*PI*t)+sin(1569.75*2*PI*t)/3+sin(2616.25*2*PI*t)/5)*0.3 \
  * between(mod(t,2),1.5,2.0) * min((mod(t,2)-1.5)/0.015,1) * min((2.0-mod(t,2))/0.04,1) \
':s=44100:d=2" -af "lowpass=f=2500,tremolo=f=3:d=0.3,volume=0.55" melody_bar.wav
```

### Bass Layer

Use sawtooth harmonics (all harmonics, alternating sign) for a full, warm bass. Lowpass removes harshness while keeping body.

```bash
# Sawtooth bass following chord roots at 120 BPM, with plucky envelope
ffmpeg -y -f lavfi -i "aevalsrc='\
  (sin(130.81*2*PI*t)-sin(261.62*2*PI*t)/2+sin(392.43*2*PI*t)/3-sin(523.24*2*PI*t)/4+sin(654.05*2*PI*t)/5)/3 \
  * between(mod(t,2),0,0.45) * min(mod(t,0.5)/0.008,1) * exp(-1.2*mod(t,0.5)) + \
  (sin(130.81*2*PI*t)-sin(261.62*2*PI*t)/2+sin(392.43*2*PI*t)/3-sin(523.24*2*PI*t)/4+sin(654.05*2*PI*t)/5)/3 \
  * between(mod(t,2),0.5,0.95) * min((mod(t,2)-0.5)/0.008,1) * exp(-1.2*(mod(t,2)-0.5)) + \
  (sin(146.83*2*PI*t)-sin(293.66*2*PI*t)/2+sin(440.49*2*PI*t)/3-sin(587.32*2*PI*t)/4)/3 \
  * between(mod(t,2),1.0,1.45) * min((mod(t,2)-1.0)/0.008,1) * exp(-1.2*(mod(t,2)-1.0)) + \
  (sin(130.81*2*PI*t)-sin(261.62*2*PI*t)/2+sin(392.43*2*PI*t)/3-sin(523.24*2*PI*t)/4+sin(654.05*2*PI*t)/5)/3 \
  * between(mod(t,2),1.5,1.95) * min((mod(t,2)-1.5)/0.008,1) * exp(-1.2*(mod(t,2)-1.5)) \
':s=44100:d=2" -af "lowpass=f=350,volume=0.7" bass_bar.wav
```

### Drum Layer

See the "Drum sample recipes" section above for individual hit construction, then:

1. **Generate layered hits**: kick (sine sweep + sub), snare (tone body + noise crack), closed hihat, open hihat
2. **Place at beat positions** using `adelay` (values in ms, both channels: `adelay=500|500`)
3. **Mix with** `amix=inputs=N:normalize=0,apad=whole_dur=BAR_DURATION` — the `apad` is critical
4. **Build 2-bar patterns** for variation (swing hits, open hat accents on offbeats)
5. **Loop** with `-stream_loop` to fill target duration

### Pad Layer

Detuned oscillator pairs with chorus and echo for width. The detune offset (0.5–1.5 Hz) creates slow beating that evolves over time. Effects are essential here — raw detuned sines still sound thin.

```bash
# Warm pad: detuned pairs + chorus + echo + lowpass
ffmpeg -y -f lavfi -i "aevalsrc='\
  (sin(261.63*2*PI*t)+sin(262.4*2*PI*t) + sin(329.63*2*PI*t)+sin(330.4*2*PI*t) + sin(392*2*PI*t)+sin(392.8*2*PI*t)) / 6 \
  * (0.6 + 0.4*sin(0.15*2*PI*t)) \
':s=44100:d=8" \
  -af "lowpass=f=800,chorus=0.6:0.9:40|55|70:0.4|0.35|0.3:0.25|0.3|0.35:2|1.5|2.5,aecho=0.8:0.7:90:0.25,volume=0.3" pad.wav
```

### Vinyl / Noise Texture Layer

A quiet noise bed fills the frequency spectrum and adds warmth. Without it, gaps between notes feel sterile.

```bash
# Lo-fi room noise: pink noise, bandpassed, very quiet
ffmpeg -y -f lavfi -i "anoisesrc=color=pink:d=60:s=44100" \
  -af "lowpass=f=3000,highpass=f=200,volume=0.04" vinyl_texture.wav
```

Include this in every mix at low volume (0.03–0.05). It's subtle but fills the space between notes.

---

## Effects Reference

> **Effects are not optional.** Raw synthesized waveforms sound sterile regardless of harmonic content.
> At minimum, apply `lowpass` (warmth), `chorus` (width), and `volume` (balance) to every layer.
> Pads need `aecho` or `aecho`+`chorus` to sound like pads. Melodies need `tremolo` or `vibrato` for life.

**Essential (use on every track):**

| Filter      | Usage                                      | Example                                          |
|-------------|--------------------------------------------|--------------------------------------------------|
| `volume`    | Per-layer level balance                    | `volume=0.6`                                     |
| `lowpass`   | Cut highs (warmth, taming harmonics)       | `lowpass=f=800`                                  |
| `highpass`  | Cut lows (clarity for non-bass)            | `highpass=f=200`                                 |
| `afade`     | Fade in/out (prevent abrupt start/end)     | `afade=t=in:d=2`, `afade=t=out:st=58:d=2`       |
| `amix`      | Mix multiple streams                       | `amix=inputs=4:normalize=0`                      |
| `apad`      | Pad with silence (fix amix truncation)     | `apad=whole_dur=2.824`                           |
| `loudnorm`  | EBU R128 loudness normalization            | `loudnorm=I=-16:TP=-1.5:LRA=11`                 |

**Strongly recommended (most layers benefit):**

| Filter      | Usage                                      | Example                                          |
|-------------|--------------------------------------------|--------------------------------------------------|
| `chorus`    | Stereo width / thickening (essential for pads) | `chorus=0.6:0.9:40\|55\|70:0.4\|0.35\|0.3:0.25\|0.3\|0.35:2\|1.5\|2.5` |
| `aecho`     | Space / depth (pads, ambient)              | `aecho=0.8:0.7:90\|250:0.25\|0.15`              |
| `tremolo`   | Amplitude movement (melody, pads)          | `tremolo=f=3:d=0.3`                              |
| `bandpass`  | Isolate frequency band (drums, snare)      | `bandpass=f=1000:width_type=h:w=500`             |
| `adelay`    | Place drum hits in time (ms, per-channel)  | `adelay=500\|500`                                |

**Situational:**

| Filter      | Usage                                      | Example                                          |
|-------------|--------------------------------------------|--------------------------------------------------|
| `flanger`   | Sweeping modulation (leads, synths)        | `flanger=delay=3:depth=2:speed=0.5`              |
| `vibrato`   | Pitch modulation (as filter, not in-expr)  | `vibrato=f=5:d=0.4`                              |
| `areverse`  | Reverse audio (FX, risers)                 | `areverse`                                       |
| `atempo`    | Change speed                               | `atempo=0.5` (half speed)                        |

---

## Mixing & Exporting

### Mix all layers

Use `amix` with `normalize=0` to prevent auto-gain (you control levels via per-layer `volume`).
Always include the vinyl/noise texture layer — it fills gaps between notes.

```bash
ffmpeg -y \
  -i melody_full.wav \
  -i bass_full.wav \
  -i drums_full.wav \
  -i pad_full.wav \
  -i vinyl_texture.wav \
  -filter_complex "\
    [0][1][2][3][4]amix=inputs=5:normalize=0,\
    loudnorm=I=-16:TP=-1.5:LRA=11\
  " \
  -ar 44100 -ac 2 mix.wav
```

**Loudnorm targets by genre:**

| Genre            | Integrated (I) | True Peak (TP) | LRA  |
|------------------|----------------|----------------|------|
| Ambient          | -18            | -2.0           | 11   |
| Lo-fi / Chill    | -16            | -1.5           | 11   |
| Electronic       | -14            | -1.5           | 9    |
| Techno / EDM     | -14            | -1.5           | 9    |

### Export to MP3

```bash
ffmpeg -y -i mix.wav -codec:a libmp3lame -b:a 192k -ar 44100 -ac 2 output.mp3
```

### Verify with ffprobe

```bash
ffprobe -v error -show_entries format=duration,bit_rate,format_name -show_entries stream=sample_rate,channels,codec_name -of default=noprint_wrappers=1 output.mp3
```

Expected output should show: `codec_name=mp3`, `sample_rate=44100`, `channels=2`, `bit_rate` near 192000.

---

## Structure & Arrangement

Build sections separately, then concatenate:

**Typical structure:**
1. **Intro** (4–8 bars): Pad only, fade in
2. **Verse** (8–16 bars): Add melody + bass, light drums
3. **Breakdown** (4 bars): Drop drums, keep pad + melody
4. **Build** (4 bars): Re-introduce elements, rising energy
5. **Chorus** (8–16 bars): All layers, full energy
6. **Outro** (4–8 bars): Strip layers, fade out

### Concatenating sections

```bash
# Create a file list
echo "file 'intro.wav'" > list.txt
echo "file 'verse.wav'" >> list.txt
echo "file 'chorus.wav'" >> list.txt
echo "file 'outro.wav'" >> list.txt

ffmpeg -y -f concat -safe 0 -i list.txt -c copy full_track.wav
```

### Fade in / fade out

```bash
# Fade in first 3 seconds, fade out last 3 seconds of a 60s track
ffmpeg -y -i full_track.wav -af "afade=t=in:d=3,afade=t=out:st=57:d=3" full_track_faded.wav
```

---

## Genre Templates

### Lo-fi Hip-Hop

- **BPM:** 85 | **Bar:** 2.824s | **4-bar cycle:** 11.294s
- **Key:** A minor
- **Progression:** Am → Dm → Em → Am (i–iv–v–i)
- **Chord Hz:**
  - Am: 220.00, 261.63, 329.63
  - Dm: 146.83, 174.61, 220.00
  - Em: 164.81, 196.00, 246.94
- **Character:** Everything through lowpass (600–1000 Hz), swing feel, half-time snare
- **Drums:** Use 2-bar pattern for variation. Kick on 1,3 (+ ghost kick on offbeats). Half-time snare (beat 3 only, or 2&4 for standard). Closed hihats on quarters, open hat on "and" of beat 2 for swing accent. Build a 2-bar loop, not 1-bar.
- **Bass:** Sawtooth harmonics (5 terms), `lowpass=f=350`, plucky envelope with `exp(-1.2*...)`, `volume=0.7`
- **Melody:** Square-wave harmonics with vibrato (`freq*(1+0.004*sin(5*2*PI*t))`), `lowpass=f=1800`, `tremolo=f=3:d=0.3`, sparse (leave rests), `volume=0.55`
- **Pad:** Detuned pairs (+0.8Hz), `lowpass=f=700`, 3-voice chorus, `aecho=0.8:0.7:90:0.25`, slow LFO `(0.6+0.4*sin(0.15*2*PI*t))`, `volume=0.35`
- **Texture:** Pink noise, `lowpass=f=3000,highpass=f=200`, `volume=0.04`

### Ambient

- **BPM:** 65 | **Bar:** 3.692s | **4-bar cycle:** 14.769s
- **Key:** C major
- **Progression:** C → Am → F → G (I–vi–IV–V)
- **Chord Hz:**
  - C: 261.63, 329.63, 392.00
  - Am: 220.00, 261.63, 329.63
  - F: 174.61, 220.00, 261.63
  - G: 196.00, 246.94, 293.66
- **Character:** Long evolving pads, no drums, sparse melody, heavy reverb/echo, very slow movement
- **Pad (main element):** Detuned pairs (+0.7Hz per note), 3-voice chorus, `aecho=0.8:0.6:120|250:0.3|0.15`, `lowpass=f=900`, very slow LFO (0.08Hz), `volume=0.45`. Each chord sustains a full bar with 0.2–0.3s crossfade envelopes.
- **High pad (shimmer):** Same chords at octave 5, more detuned (+1.2Hz), `lowpass=f=2000`, `aecho=0.8:0.5:200|400:0.2|0.1`, `volume=0.15`
- **Melody:** Very sparse — only 4-5 notes per cycle with long gaps. Octave 5, sine + one harmonic, vibrato (3Hz), long attack (0.1s) / release (0.2s), `aecho` for tail, `volume=0.3`
- **Sub bass:** Pure sine on root notes (octave 1-2), `lowpass=f=120`, slow swell envelopes, `volume=0.3`
- **No drums.** Texture layer at `volume=0.03`.
- **Loudnorm:** I=-18 (quieter target)

### Electronic / Techno

- **BPM:** 130 | **Bar:** 1.846s | **4-bar cycle:** 7.385s
- **Key:** A minor
- **Progression:** Am → F → C → G (i–VI–III–VII)
- **Chord Hz:**
  - Am: 220.00, 261.63, 329.63
  - F: 174.61, 220.00, 261.63
  - C: 130.81, 164.81, 196.00
  - G: 196.00, 246.94, 293.66
- **Character:** Four-on-the-floor, driving, aggressive bass, staccato melody, minimal pad
- **Kick:** Hard sine sweep (200→45Hz), every beat, `lowpass=f=250`, `volume=1.8`. This is the anchor.
- **Hihats:** Eighth notes, alternating velocity (on-beat 0.4, off-beat 0.3). Open hat on "and" of beat 4.
- **Clap:** Beats 2 and 4. White noise + pink noise, `bandpass=f=1500:width_type=h:w=2000`, `volume=0.6`
- **Bass:** Sawtooth (6 harmonics), pulsing eighth-note envelope for pumping feel, `lowpass=f=400`, `volume=0.7`
- **Melody:** Staccato stabs (0.15s), square-wave, tight envelopes (5ms attack, 20ms release), `bandpass=f=2000`, `flanger`, `volume=0.45`
- **Pad:** Minimal dark atmosphere. Detuned pairs, `lowpass=f=500`, chorus, `volume=0.15`
- **Loudnorm:** I=-14 (louder target)

### Synthwave / Retro

- **BPM:** 110 | **Bar:** 2.182s | **4-bar cycle:** 8.727s
- **Key:** D minor
- **D minor scale:** D4=293.66, E4=329.63, F4=349.23, G4=392, A4=440, Bb4=466.16, C5=523.25
- **Progression:** Dm → Bb → C → Dm (i–VI–VII–i)
- **Chord Hz:**
  - Dm: 293.66, 349.23, 440.00
  - Bb: 233.08, 293.66, 349.23
  - C: 261.63, 329.63, 392.00
- **Character:** Arpeggiated chords (signature element), soaring lead, driving rhythm, lush pads
- **Arpeggio (key layer):** 16th notes cycling through chord tones (root, 3rd, 5th, octave). Sawtooth wave (3 harmonics), very short envelope (3ms attack, `exp(-12*...)`). Use `between(mod(t,beat),...)` to cycle 4 notes per beat. Build each bar separately (one per chord), then concat. Apply: `bandpass=f=1500:width_type=h:w=2000`, `chorus`, `volume=0.4`
- **Bass:** Sawtooth (6 harmonics), driving eighth notes, `lowpass=f=300`, `volume=0.7`
- **Drums:** Four-on-the-floor kick, snare on 2&4, eighth-note hihats
- **Pad:** Detuned chord pairs, slow LFO, 3-voice chorus, `lowpass=f=800`, `volume=0.25`
- **Lead melody:** Soaring saw-wave (5 harmonics) with vibrato (5Hz), longer notes (quarter), `lowpass=f=3500`, `volume=0.35`

---

## Complete Workflow Checklist

1. **Choose genre & check tools** — Pick a template or define custom BPM, key, progression. Run `which sox` — if available, prefer SoX `synth` for tones (native waveforms). ffmpeg is always required for mixing/export.
2. **Calculate timing** — Compute beat/bar durations from BPM (exact decimals, don't round)
3. **Create temp directory** — `TMPDIR=$(mktemp -d)`
4. **Define chord progression** — Map chords to Hz values using the reference tables
5. **Build drum samples** — Generate *layered* hits: kick (sweep + sub), snare (tone + noise), hihat (shaped noise). Never single-source.
6. **Assemble drum bar** — Place hits with `adelay`, mix with `amix=normalize=0,apad=whole_dur=BAR`. Build 2-bar patterns for variation.
7. **Build bass pattern** — Sawtooth harmonics (5–6 terms) on chord roots, `lowpass`, plucky envelope
8. **Build melody pattern** — Square-wave harmonics + vibrato, per-note envelopes (15ms attack, 40ms release), leave rests
9. **Build pad** — Detuned pairs (+0.7–1.2Hz offset), slow LFO, `chorus` + `aecho` + `lowpass` — effects are mandatory
10. **Build texture** — Pink noise, bandpassed, `volume=0.03–0.05`
11. **Test each layer independently** — Play them back before mixing. Fix silence or clicking first.
12. **Loop layers** — Use `-stream_loop` to extend each layer to target duration
13. **Mix with arrangement** — Use `adelay` to stagger layer entries (pad first, then melody+bass, then drums). Use `afade` on individual layers for gradual intros. Don't start everything at once.
14. **Add fades** — `afade=t=in:d=N` at start, `afade=t=out:st=X:d=N` at end
15. **Mix to stereo WAV** — `amix` with `normalize=0`, then `loudnorm` with genre-appropriate target
16. **Export MP3** — `libmp3lame -b:a 192k -ar 44100 -ac 2`
17. **Verify** — `ffprobe` to check duration, bitrate, format, channels
18. **Clean up** — `rm -rf "$TMPDIR"`

---

## Troubleshooting

**Clipping / distortion:**
- Sum of all sine waves exceeds [-1, 1]. Divide by number of layers: `(sin(f1*...) + sin(f2*...)) / 2`
- Reduce per-layer `volume` values. Typical mix: melody=0.5, bass=0.7, drums=0.7, pad=0.3

**Silence in output:**
- Check `aevalsrc` expression for syntax errors — ffmpeg silently produces silence on invalid expressions
- Test each layer independently before mixing
- Ensure `between()` ranges don't have gaps

**Clicks / pops at note boundaries:**
- Add per-note envelopes: `min(elapsed/0.01, 1) * min(remaining/0.01, 1)`
- Never let notes overlap without crossfade

**Timing drift:**
- Use exact decimal values, not rounded. At 120 BPM: beat = 0.5s exactly
- Ensure `mod(t, bar_duration)` matches the actual bar duration precisely

**File too large:**
- WAV files are uncompressed (~10 MB/min at 44100 Hz stereo 16-bit). This is expected for intermediates.
- Final MP3 at 192 kbps should be ~1.4 MB/min

**Expression syntax errors:**
- No spaces around operators in `aevalsrc` expressions (spaces can cause parsing issues)
- Escape special characters if running in shell: single-quote the entire expression
- Use `\` for line continuation in bash, but keep the expression itself on logical lines
- If `between()` doesn't work, try `gte(x,lo)*lt(x,hi)` as equivalent

**`amix` changes volume unexpectedly:**
- Always use `normalize=0` to disable amix's automatic normalization
- Control volume manually with the `volume` filter on each input

**`amix` truncates drum bars (bar too short):**
- `amix` output duration = longest input stream, not longest delayed position
- Last hit at 2118ms + 300ms sample = 2418ms, but your bar is 2824ms → truncated
- Fix: append `apad=whole_dur=BAR_DURATION` after amix in the filter chain
- Example: `amix=inputs=8:normalize=0,apad=whole_dur=2.824`

**Track sounds like a test tone / bare sine wave:**
- You're using raw `sin(f*2*PI*t)` — this always sounds clinical
- Use sawtooth (5+ harmonics) or square (4+ odd harmonics) approximations instead
- Add effects: `lowpass` (warmth), `chorus` (width), `tremolo`/`vibrato` (movement)
- Add detuning for pads (+0.7–1.2Hz offset per note)
- Include a pink noise texture layer at `volume=0.04`

**All layers start at once (wall of sound):**
- Use `adelay` on individual layers in the final mix to stagger entries
- Example: pad at 0s, melody at 11s, bass at 11s, drums at 22s
- Apply `afade=t=in` per-layer at the entry point for gradual intros

**Mono output when stereo expected:**
- Add `-ac 2` to the final export command
- `aevalsrc` produces mono by default — this is fine for intermediates, `-ac 2` on export converts to stereo
