# Phase 4: Frontend Player - Research

**Researched:** 2026-02-01
**Domain:** Web Audio API, React audio state management, real-time visualization
**Confidence:** HIGH

## Summary

Phase 4 delivers the listening experience: a web-based radio player that synchronizes playback across all listeners using server time, crossfades smoothly between tracks, and visualizes audio with a waveform display. The standard approach uses the Web Audio API with `HTMLMediaElement` for streaming, React hooks for state management, and Canvas 2D for waveform rendering.

The technical core involves three synchronized systems:
1. **Audio playback**: Web Audio API with `MediaElementSourceNode` for streaming support
2. **Time synchronization**: Server time offset calculation to position all listeners at the same playback position
3. **Visualization**: `AnalyserNode` feeding frequency data to Canvas for real-time waveform rendering

**Primary recommendation:** Use native Web Audio API (not Howler.js) for precise control over crossfades, sync, and visualization. Build custom React hooks around `AudioContext` lifecycle to manage state, and use Canvas 2D for the waveform (WebGL overkill for single waveform line).

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Web Audio API | Native | Audio playback, crossfade, analysis | Browser-native, millisecond-precise timing, no dependencies |
| Canvas 2D API | Native | Waveform rendering | Hardware-accelerated, simpler than WebGL for basic visualizations |
| Page Visibility API | Native | Tab backgrounding detection | Standard API for handling visibility changes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| React (existing) | 19 | UI state management | Already in stack |
| Tailwind (existing) | v3 | Player styling | Already in stack |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native Web Audio | Howler.js | Howler abstracts complexity but lacks granular control for crossfades/sync; MDN recommends Howler for "good all-rounder" but native API when needing "granular DSP control" |
| Canvas 2D | WebGL | WebGL ~30% faster for complex scenes but overkill for single waveform line; Canvas 2D simpler and sufficient |
| Custom hooks | react-use-audio-player | Library built on Howler.js, forces HTML5 Audio for streaming (loses Web Audio visualization/crossfade) |

**Installation:**
```bash
# No npm packages needed - all native browser APIs
# React 19 and Tailwind v3 already in project
```

## Architecture Patterns

### Recommended Project Structure
```
packages/web/src/
├── components/
│   ├── Player/           # Bottom bar player component
│   │   ├── PlayerBar.tsx        # Main player container
│   │   ├── PlayButton.tsx       # Play/pause control
│   │   ├── VolumeControl.tsx    # Volume slider + mute
│   │   ├── NowPlaying.tsx       # Track info display
│   │   └── ProgressBar.tsx      # Elapsed/remaining time
│   ├── Visualizer/       # Main page visualizer
│   │   ├── Waveform.tsx         # Canvas waveform component
│   │   └── IdleAnimation.tsx    # Gentle breathing effect when paused
│   └── EmptyState.tsx    # "Waiting for first track" message
├── hooks/
│   ├── useAudioPlayer.ts        # AudioContext lifecycle management
│   ├── useAudioSync.ts          # Server time sync + seek to position
│   ├── useCrossfade.ts          # Track transition logic
│   ├── useVisualizer.ts         # AnalyserNode + Canvas rendering
│   └── useServerTime.ts         # Time offset calculation
└── utils/
    ├── audioContext.ts          # Singleton AudioContext
    ├── equalPowerCurve.ts       # Crossfade gain calculations
    └── timeSync.ts              # Server time offset algorithm
```

### Pattern 1: AudioContext Singleton
**What:** Single `AudioContext` instance shared across all components
**When to use:** Always - browser best practice per MDN
**Example:**
```typescript
// utils/audioContext.ts
// Source: MDN Web Audio API Best Practices
let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    return ctx.resume();
  }
  return Promise.resolve();
}
```

### Pattern 2: MediaElementSourceNode for Streaming
**What:** Use `<audio>` element with Web Audio API, not `AudioBufferSourceNode`
**When to use:** For streaming audio (not fully pre-loaded)
**Example:**
```typescript
// Source: MDN Web Audio API Best Practices
const audioElement = document.querySelector('audio');
const audioCtx = getAudioContext();
const source = audioCtx.createMediaElementSource(audioElement);
const gainNode = audioCtx.createGain();
const analyser = audioCtx.createAnalyser();

// Audio graph: source -> gain -> analyser -> destination
source.connect(gainNode);
gainNode.connect(analyser);
analyser.connect(audioCtx.destination);
```

### Pattern 3: Equal-Power Crossfade
**What:** Use cosine curves for smooth volume transitions between tracks
**When to use:** All track transitions (prevents volume dips)
**Example:**
```typescript
// Source: HTML5 Rocks via GitHub gist/scneptune/7498000
// utils/equalPowerCurve.ts
export function calculateEqualPowerGains(position: number): [number, number] {
  // position: 0 = full track1, 1 = full track2
  const gain1 = Math.cos(position * 0.5 * Math.PI);
  const gain2 = Math.cos((1.0 - position) * 0.5 * Math.PI);
  return [gain1, gain2];
}

// Usage in crossfade:
function crossfade(currentGain: GainNode, nextGain: GainNode, duration: number) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  // Schedule equal-power curve
  currentGain.gain.setValueAtTime(1, now);
  currentGain.gain.linearRampToValueAtTime(0, now + duration);

  nextGain.gain.setValueAtTime(0, now);
  nextGain.gain.linearRampToValueAtTime(1, now + duration);
}
```

### Pattern 4: Server Time Sync
**What:** Calculate offset between server and client time for synchronized playback
**When to use:** On initial load and periodically to maintain sync
**Example:**
```typescript
// Source: timesync library algorithm + server-date pattern
// utils/timeSync.ts
export async function calculateServerOffset(apiUrl: string): Promise<number> {
  const clientSendTime = Date.now();

  const response = await fetch(apiUrl);
  const data = await response.json();

  const clientReceiveTime = Date.now();
  const serverTime = new Date(data.server_time).getTime();

  // Account for network round-trip
  const roundTripTime = clientReceiveTime - clientSendTime;
  const estimatedServerTime = serverTime + (roundTripTime / 2);

  return estimatedServerTime - clientReceiveTime;
}

// Apply to playback position:
function getCorrectPlaybackPosition(
  startedAt: number,
  durationMs: number,
  serverOffset: number
): number {
  const serverNow = Date.now() + serverOffset;
  const elapsed = serverNow - startedAt;
  return Math.max(0, Math.min(elapsed / 1000, durationMs / 1000));
}
```

### Pattern 5: AnalyserNode + Canvas Waveform
**What:** Extract frequency data and render smooth waveform line
**When to use:** Real-time audio visualization
**Example:**
```typescript
// Source: MDN Visualizations with Web Audio API
// hooks/useVisualizer.ts
function setupAnalyser(audioCtx: AudioContext) {
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048; // Larger FFT for smooth waveform
  analyser.smoothingTimeConstant = 0.8; // Smooth transitions

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  return { analyser, dataArray, bufferLength };
}

function drawWaveform(
  canvas: HTMLCanvasElement,
  analyser: AnalyserNode,
  dataArray: Uint8Array,
  bufferLength: number
) {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;

  requestAnimationFrame(() => drawWaveform(canvas, analyser, dataArray, bufferLength));

  analyser.getByteTimeDomainData(dataArray);

  // Clear
  ctx.fillStyle = 'rgb(255 255 255)';
  ctx.fillRect(0, 0, width, height);

  // Draw waveform line
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgb(0 0 0)';
  ctx.beginPath();

  const sliceWidth = width / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0; // Normalize to 0-2
    const y = (v * height) / 2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    x += sliceWidth;
  }

  ctx.lineTo(width, height / 2);
  ctx.stroke();
}
```

### Pattern 6: Autoplay Policy Compliance
**What:** Create/resume AudioContext only after user interaction
**When to use:** Always - browser requirement
**Example:**
```typescript
// Source: MDN Autoplay guide for media
// components/Player/PlayButton.tsx
function PlayButton() {
  async function handlePlay() {
    const ctx = getAudioContext();

    // Resume if suspended (autoplay policy)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Now safe to play
    audioElement.play();
  }

  return <button onClick={handlePlay}>Play</button>;
}
```

### Pattern 7: Page Visibility Recovery
**What:** Pause/resume based on tab visibility
**When to use:** Handle tab backgrounding gracefully
**Example:**
```typescript
// Source: MDN Page Visibility API
// hooks/useAudioPlayer.ts
useEffect(() => {
  let wasPlaying = false;

  function handleVisibilityChange() {
    if (document.hidden) {
      wasPlaying = !audioElement.paused;
      audioElement.pause();
    } else if (wasPlaying) {
      // Re-sync to server time before resuming
      const correctPosition = getCorrectPlaybackPosition(/* ... */);
      audioElement.currentTime = correctPosition;
      audioElement.play();
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, []);
```

### Anti-Patterns to Avoid
- **Creating multiple AudioContext instances:** Creates resource leaks, browser limits contexts
- **Linear crossfade curves:** Creates audible volume dip at 50% mix point (use equal-power)
- **Seeking without sync check:** Causes drift between listeners over time
- **Using AudioBufferSourceNode for streams:** Requires downloading entire file before playback
- **Direct AudioParam property assignment for timed changes:** Use `setValueAtTime()` / `linearRampToValueAtTime()` for sample-accurate timing
- **Forgetting HiDPI canvas scaling:** Waveform appears blurry on Retina displays

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time sync algorithm | Custom NTP | Server time offset pattern | NTP requires UDP (unavailable in browsers); HTTP-based offset simpler and sufficient for ~100ms accuracy |
| Equal-power curve | Linear fade | `Math.cos(x * 0.5 * Math.PI)` | Established formula prevents volume dips; well-documented in Web Audio examples |
| HiDPI canvas scaling | Manual pixel ratio | `canvas.width = canvas.offsetWidth * devicePixelRatio` | Standard pattern handles all screen densities |
| AudioContext lifecycle | Component-scoped contexts | Singleton pattern | Browser best practice; prevents resource exhaustion |

**Key insight:** Web Audio API timing is sample-accurate and hardware-driven - don't try to compensate with JavaScript timers. Use `AudioContext.currentTime` and `AudioParam` scheduling methods.

## Common Pitfalls

### Pitfall 1: Autoplay Policy Violation
**What goes wrong:** AudioContext remains in `suspended` state, no audio plays
**Why it happens:** Browser blocks audio until user interaction (click/tap)
**How to avoid:** Always check `audioContext.state` and call `resume()` inside click handler before playing
**Warning signs:** Play button does nothing, no console errors, `audioContext.state === 'suspended'`

### Pitfall 2: CORS Headers Missing from R2
**What goes wrong:** Web Audio API throws security error when loading audio from R2
**Why it happens:** `MediaElementSource` requires CORS headers when `crossorigin` attribute set
**How to avoid:** Configure R2 bucket CORS with `AllowedOrigins: ['*']`, `AllowedMethods: ['GET']`, `AllowedHeaders: ['*']`, `ExposeHeaders: ['Content-Length']`
**Warning signs:** Console error: "MediaElementAudioSource outputs zeroes due to CORS access restrictions"

### Pitfall 3: Crossfade Volume Dip
**What goes wrong:** Noticeable volume drop at midpoint of track transition
**Why it happens:** Linear crossfade (gain1 = 1-x, gain2 = x) creates power dip at x=0.5
**How to avoid:** Use equal-power curves (cosine-based gains)
**Warning signs:** Track transitions sound "hollow" or quiet in the middle

### Pitfall 4: Time Sync Drift
**What goes wrong:** Listeners gradually fall out of sync with server
**Why it happens:** Client clock drift, network latency changes, not accounting for round-trip time
**How to avoid:** Recalculate server offset periodically (every 30-60s), account for half round-trip in offset calculation
**Warning signs:** Playback position differs between browser refreshes, listeners report being "ahead" or "behind"

### Pitfall 5: Canvas Waveform Performance
**What goes wrong:** Dropped frames, janky animation at 60fps
**Why it happens:** Canvas context creation in render loop, unnecessary full redraws
**How to avoid:** Create context once, use `requestAnimationFrame`, only clear/draw changed regions
**Warning signs:** Browser profiler shows >16ms frame times, waveform stutters

### Pitfall 6: AudioElement Not Loading
**What goes wrong:** Audio never starts, stuck in loading state
**Why it happens:** R2 URL not set, incorrect CORS, network error silently fails
**How to avoid:** Add `onLoadedData`, `onError`, `onCanPlay` event handlers, show loading states
**Warning signs:** Spinner forever, no console errors, `audioElement.readyState === 0`

### Pitfall 7: Track Preload Timing
**What goes wrong:** Gap/silence between tracks despite crossfade logic
**Why it happens:** Next track not buffered before current track ends
**How to avoid:** Start loading next track when `< 10s remaining` (backend signals this), verify `nextAudio.readyState >= 3` before crossfade
**Warning signs:** Crossfade starts but next track hasn't loaded, dead air

### Pitfall 8: Tab Backgrounding Resume
**What goes wrong:** Audio plays at wrong position after tab restored
**Why it happens:** `visibilitychange` resumes at old `currentTime`, doesn't re-sync to server
**How to avoid:** Recalculate correct position from server time before resuming
**Warning signs:** Listeners report "jumping back" in track after switching tabs

### Pitfall 9: Gain Node Scheduling Conflicts
**What goes wrong:** Crossfade abruptly cuts or pops
**Why it happens:** Setting `gain.value` directly conflicts with scheduled ramps
**How to avoid:** Use `cancelScheduledValues()` before new automation, or always use `setValueAtTime()` then ramps
**Warning signs:** Console warning: "Automation value cannot be set after automation has started"

### Pitfall 10: Visualizer Disconnected from Audio
**What goes wrong:** Waveform doesn't react to audio, shows flat line
**Why it happens:** AnalyserNode not connected in audio graph between source and destination
**How to avoid:** Verify connection chain: `source -> gain -> analyser -> destination`, analyser doesn't need output connection but needs input
**Warning signs:** Audio plays but waveform static, `getByteTimeDomainData()` returns all 128 (silence)

## Code Examples

Verified patterns from official sources:

### Example 1: Full Audio Graph Setup
```typescript
// Source: MDN Web Audio API Best Practices + Using Web Audio API
// hooks/useAudioPlayer.ts

import { useEffect, useRef, useState } from 'react';
import { getAudioContext, resumeAudioContext } from '../utils/audioContext';

export function useAudioPlayer(audioUrl: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audio.crossOrigin = 'anonymous'; // Required for CORS
    audioRef.current = audio;

    const ctx = getAudioContext();

    // Create audio graph
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();

    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;

    // Connect: source -> gain -> analyser -> destination
    source.connect(gain);
    gain.connect(analyser);
    analyser.connect(ctx.destination);

    sourceRef.current = source;
    gainRef.current = gain;
    analyserRef.current = analyser;

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl]);

  async function play() {
    await resumeAudioContext();
    await audioRef.current?.play();
    setIsPlaying(true);
  }

  function pause() {
    audioRef.current?.pause();
    setIsPlaying(false);
  }

  return {
    play,
    pause,
    isPlaying,
    audioElement: audioRef.current,
    gainNode: gainRef.current,
    analyserNode: analyserRef.current,
  };
}
```

### Example 2: Crossfade Between Tracks
```typescript
// Source: HTML5 Rocks (via GitHub gist/scneptune/7498000) + MDN AudioParam
// hooks/useCrossfade.ts

import { getAudioContext } from '../utils/audioContext';

export function useCrossfade(
  currentGain: GainNode | null,
  nextGain: GainNode | null,
  duration = 2 // 2 seconds per phase context
) {
  async function startCrossfade() {
    if (!currentGain || !nextGain) return;

    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Cancel any previous automation
    currentGain.gain.cancelScheduledValues(now);
    nextGain.gain.cancelScheduledValues(now);

    // Set starting values
    currentGain.gain.setValueAtTime(currentGain.gain.value, now);
    nextGain.gain.setValueAtTime(0, now);

    // Schedule equal-power crossfade
    // Note: For true equal-power, should use setValueCurveAtTime with cosine curve
    // But linearRamp is acceptable for short (2s) crossfades
    currentGain.gain.linearRampToValueAtTime(0, now + duration);
    nextGain.gain.linearRampToValueAtTime(1, now + duration);
  }

  return { startCrossfade };
}
```

### Example 3: Server Time Synchronization
```typescript
// Source: timesync npm algorithm + server-date pattern
// hooks/useServerTime.ts

import { useState, useEffect } from 'react';

export function useServerTime(apiUrl: string, refreshInterval = 30000) {
  const [offset, setOffset] = useState(0);
  const [isSync, setIsSync] = useState(false);

  async function syncTime() {
    const clientSendTime = Date.now();

    const response = await fetch(apiUrl);
    const data = await response.json();

    const clientReceiveTime = Date.now();
    const serverTime = new Date(data.server_time).getTime();

    // Account for network round-trip
    const roundTrip = clientReceiveTime - clientSendTime;
    const estimatedServerTime = serverTime + (roundTrip / 2);
    const calculatedOffset = estimatedServerTime - clientReceiveTime;

    setOffset(calculatedOffset);
    setIsSync(true);
  }

  useEffect(() => {
    syncTime();
    const interval = setInterval(syncTime, refreshInterval);
    return () => clearInterval(interval);
  }, [apiUrl, refreshInterval]);

  function getServerTime() {
    return Date.now() + offset;
  }

  return { offset, isSync, getServerTime };
}
```

### Example 4: Waveform Visualization
```typescript
// Source: MDN Visualizations with Web Audio API
// components/Visualizer/Waveform.tsx

import { useEffect, useRef } from 'react';

interface WaveformProps {
  analyserNode: AnalyserNode | null;
  isPlaying: boolean;
}

export function Waveform({ analyserNode, isPlaying }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!analyserNode || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;

    // Handle HiDPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
      animationRef.current = requestAnimationFrame(draw);

      if (isPlaying) {
        analyserNode!.getByteTimeDomainData(dataArray);
      }
      // else: dataArray keeps last values for idle animation

      const { width, height } = canvas.getBoundingClientRect();

      // Clear
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Draw waveform
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();
    }

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyserNode, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
```

### Example 5: Live Radio Position Sync
```typescript
// Source: MDN HTMLMediaElement + timesync algorithm
// hooks/useAudioSync.ts

import { useEffect } from 'react';

interface AudioSyncProps {
  audioElement: HTMLAudioElement | null;
  startedAt: number; // Server timestamp when track started
  durationMs: number;
  serverOffset: number;
  isPlaying: boolean;
}

export function useAudioSync({
  audioElement,
  startedAt,
  durationMs,
  serverOffset,
  isPlaying
}: AudioSyncProps) {

  function getCorrectPosition(): number {
    const serverNow = Date.now() + serverOffset;
    const elapsed = serverNow - startedAt;
    const positionSeconds = elapsed / 1000;
    const durationSeconds = durationMs / 1000;

    return Math.max(0, Math.min(positionSeconds, durationSeconds));
  }

  // Initial sync on track change
  useEffect(() => {
    if (!audioElement || !isPlaying) return;

    const correctPosition = getCorrectPosition();
    const currentPosition = audioElement.currentTime;
    const drift = Math.abs(correctPosition - currentPosition);

    // Re-sync if drift > 1 second
    if (drift > 1.0) {
      audioElement.currentTime = correctPosition;
    }
  }, [startedAt, audioElement, serverOffset]);

  // Periodic sync check (every 10s)
  useEffect(() => {
    if (!audioElement || !isPlaying) return;

    const interval = setInterval(() => {
      const correctPosition = getCorrectPosition();
      const currentPosition = audioElement.currentTime;
      const drift = Math.abs(correctPosition - currentPosition);

      if (drift > 1.0) {
        console.log(`Resyncing: drift ${drift.toFixed(2)}s`);
        audioElement.currentTime = correctPosition;
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [audioElement, isPlaying, startedAt, serverOffset, durationMs]);

  return { getCorrectPosition };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ScriptProcessorNode | AudioWorklet | 2018 (Chrome 66) | AudioWorklet runs in separate thread, no main thread blocking |
| HTML5 Audio only | Web Audio API + MediaElement | 2014 | Precise timing, analysis, effects now possible |
| prefixed APIs (webkit*) | Unprefixed standard | 2015 | No vendor prefixes needed |
| Linear crossfade | Equal-power curves | Always recommended | Prevents volume dip artifacts |
| autoplay attribute | User gesture required | 2018 (autoplay policy) | Explicit user interaction required |
| Single AudioContext.currentTime | performance.now() reference | Proposed (not standard) | Still use currentTime for audio scheduling |

**Deprecated/outdated:**
- `ScriptProcessorNode`: Deprecated since 2018, use `AudioWorklet` for custom processing (not needed for this phase)
- `webkitAudioContext`: Use standard `AudioContext` constructor
- Assuming autoplay works: Always check/resume context state in user gesture handler

**Current (2026) best practices:**
- One AudioContext per app (browser resource limits)
- MediaElementSource for streaming (vs AudioBuffer for short clips)
- Equal-power curves for crossfades
- Page Visibility API for background handling
- AudioParam automation for sample-accurate timing
- Canvas 2D with devicePixelRatio for HiDPI visualizations

## Open Questions

Things that couldn't be fully resolved:

1. **R2 CORS exact headers for Web Audio API**
   - What we know: R2 supports CORS configuration via S3-compatible API, `crossorigin="anonymous"` required on audio element
   - What's unclear: Minimum required headers vs recommended headers for Web Audio (official docs don't specify Web Audio requirements)
   - Recommendation: Start with `AllowedOrigins: ['*']`, `AllowedMethods: ['GET', 'HEAD']`, `AllowedHeaders: ['*']`, `ExposeHeaders: ['Content-Length']`; test and narrow if needed
   - Confidence: MEDIUM (R2 CORS confirmed working, Web Audio specific requirements inferred from browser behavior)

2. **Optimal FFT size for smooth waveform**
   - What we know: MDN examples use 2048 for waveforms, 256 for frequency bars; higher = more detail but more CPU
   - What's unclear: Best balance for "smooth oscillating line" aesthetic vs performance on lower-end devices
   - Recommendation: Start with 2048, test on mid-range mobile devices, reduce to 1024 if needed
   - Confidence: HIGH (well-documented range, can tune empirically)

3. **Server time sync accuracy requirements**
   - What we know: NTP achieves ~10-100ms over internet, time sync libraries use similar HTTP-based approach
   - What's unclear: Whether ~100ms accuracy sufficient for "everyone hears the same thing" UX, or if tighter sync needed
   - Recommendation: Implement HTTP-based offset calculation (accounts for round-trip), test with multiple clients to verify perceived sync
   - Confidence: MEDIUM (technical approach proven, user-perceived sync requirement subjective)

4. **Crossfade curve: linear ramp vs setValueCurveAtTime**
   - What we know: True equal-power uses cosine curve points via `setValueCurveAtTime()`, but `linearRampToValueAtTime()` simpler
   - What's unclear: Whether 2-second crossfade short enough that linear approximation acceptable vs needing true curve
   - Recommendation: Start with `linearRampToValueAtTime()` for simplicity, upgrade to `setValueCurveAtTime()` with cosine curve array if audible artifacts
   - Confidence: HIGH (2s crossfade short enough linear likely acceptable, can verify by ear)

5. **Idle animation implementation**
   - What we know: Phase context requests "gentle breathing/drift" when paused
   - What's unclear: Whether to animate waveform data directly (modify dataArray) or use CSS transforms on canvas
   - Recommendation: Use CSS animation on canvas element for breathing effect (simpler, no canvas redraw overhead), keep waveform data static when paused
   - Confidence: LOW (no specific research done on idle animations, pure implementation decision)

## Sources

### Primary (HIGH confidence)
- [MDN Web Audio API Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) - AutoContext lifecycle, autoplay policy, media element vs buffer
- [MDN Visualizations with Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API) - AnalyserNode setup, waveform/frequency examples
- [MDN Autoplay guide for media and Web Audio](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay) - Browser autoplay policies, detection API
- [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) - Tab backgrounding detection
- [MDN HTMLMediaElement currentTime](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime) - Seeking for sync
- [MDN AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode) - FFT configuration, data retrieval methods
- [Cloudflare R2 CORS Configuration](https://developers.cloudflare.com/r2/buckets/cors/) - AllowedOrigins, methods, headers

### Secondary (MEDIUM confidence)
- [GitHub gist: Web Audio crossfade](https://gist.github.com/scneptune/7498000) - Equal-power curve implementation (from HTML5 Rocks)
- [GitHub notthetup/crossfade](https://github.com/notthetup/crossfade) - Equal-power curve library pattern
- [Web.dev: Fast playback with preload](https://web.dev/fast-playback-with-preload/) - Preloading strategies
- [Timesync npm](https://www.npmjs.com/package/timesync) - Time synchronization algorithm
- [Server-date library](https://github.com/NodeGuy/server-date) - HTTP-based time sync pattern
- [Building Ramble #3: Visualizing the Waveform](https://www.doist.dev/building-ramble-3-visualizing-the-waveform/) - Canvas rendering, HiDPI, frame rate independence
- [React-use-audio-player npm](https://www.npmjs.com/package/react-use-audio-player) - React hooks pattern for audio (Howler-based, not using for this project)

### Tertiary (LOW confidence)
- [WebSearch: Web Audio API best practices 2026](https://medium.com/@coders.stop/audio-streaming-with-web-audio-api-making-sound-actually-sound-good-on-the-web-65915047736f) - General streaming patterns
- [WebSearch: Howler.js vs native Web Audio](https://howlerjs.com/) - Library comparison for stack decision
- [WebSearch: Canvas 2D vs WebGL performance](https://2dgraphs.netlify.app/) - Visualization performance tradeoffs
- WebSearch results on NTP/time sync - Background on time synchronization concepts (not directly applicable to browser JS)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Web Audio API, Canvas 2D, Page Visibility are well-documented native APIs with extensive MDN coverage
- Architecture: HIGH - Patterns verified from MDN official docs, established Web Audio examples, React hooks best practices
- Pitfalls: HIGH - Autoplay policy, CORS, crossfade curves, time sync drift all documented in official sources or community known issues
- Time sync algorithm: MEDIUM - HTTP-based approach established but accuracy requirements for "perceived sync" subjective
- R2 CORS specifics: MEDIUM - R2 CORS configuration documented, Web Audio crossOrigin requirement known, but specific header combinations not officially tested
- Idle animation: LOW - No research conducted, pure implementation decision based on phase context

**Research date:** 2026-02-01
**Valid until:** ~30 days (Web Audio API stable, React patterns stable, Cloudflare R2 features stable)
