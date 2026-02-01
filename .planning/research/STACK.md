# Technology Stack

**Project:** claw.fm -- 24/7 AI-generated music radio station
**Researched:** 2026-01-31
**Scope:** Additional libraries beyond base CF Workers + Hono + React + Vite stack
**Overall confidence:** MEDIUM-HIGH (versions verified via npm registry; API behavior claims based on training data for browser APIs)

---

## Decision Context

The base stack is decided: Cloudflare Workers + Hono (API), React + Vite (frontend on CF Pages), D1 (database), R2 (audio storage), with x402/USDC payments on Base. This document covers the **additional** libraries needed for audio playback, visualization, audio processing, wallet integration, and upload handling.

---

## Recommended Stack

### 1. Browser Audio Playback (Gapless/Crossfade)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Native Web Audio API + HTMLAudioElement** | Browser built-in | Core audio playback, crossfade, gapless transitions | Zero dependencies, full control over crossfade timing, required anyway for visualization |

**Recommendation: Do NOT use Howler.js. Use native Web Audio API directly.**

**Rationale:**

Howler.js (v2.2.4) is an audio convenience library, but for claw.fm it adds complexity without solving the actual hard problem. Here is why:

1. **Crossfade requires Web Audio API regardless.** Howler uses Web Audio API under the hood. To crossfade two tracks, you need two audio sources with independent gain nodes. Howler abstracts this but in a way that makes crossfade control harder, not easier.

2. **Gapless playback needs precise scheduling.** The Web Audio API's `AudioContext.currentTime` provides sample-accurate scheduling. You pre-buffer the next track and schedule it to start exactly when the current track ends (or overlapping for crossfade). This is a ~50 line implementation, not a library problem.

3. **Visualization requires direct AnalyserNode access.** You need `AnalyserNode.getByteFrequencyData()` for the frequency visualizer. With Howler, you would still need to reach into its internal AudioContext. Going native means one consistent audio graph.

**Architecture for crossfade playback:**

```
AudioContext
  +-- GainNode (Track A) -- connected to destination
  |     +-- MediaElementAudioSourceNode (current track)
  +-- GainNode (Track B) -- connected to destination
  |     +-- MediaElementAudioSourceNode (next track)
  +-- AnalyserNode -- for visualization (connected before destination)
```

- Two `<audio>` elements, alternating roles (A plays, B pre-buffers)
- Each routed through its own `GainNode` for volume control
- Crossfade = ramp GainNode A down while ramping GainNode B up over ~3 seconds
- Both feed into an `AnalyserNode` before reaching `AudioContext.destination`
- Use `audio.duration` and `timeupdate` events to trigger crossfade ~5s before track end
- Pre-fetch next track URL from API when current track is ~30s from ending

**Key browser API methods:**
- `new AudioContext()` -- create audio context
- `audioContext.createMediaElementSource(audioElement)` -- connect HTML audio to Web Audio graph
- `audioContext.createGain()` -- volume control per track
- `audioContext.createAnalyser()` -- frequency data for visualizer
- `gainNode.gain.linearRampToValueAtTime(value, time)` -- smooth crossfade
- `analyserNode.getByteFrequencyData(dataArray)` -- frequency bins for visualizer

**No library needed.** The implementation is straightforward and avoids a dependency that would fight against direct Web Audio API access.

### 2. Frequency Visualizer

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Web Audio API AnalyserNode** | Browser built-in | Extract frequency data from playing audio | Only way to get real-time frequency data; no library alternative |
| **Canvas 2D / requestAnimationFrame** | Browser built-in | Render frequency bars | Simpler than WebGL, sufficient for bar visualization |

**Recommendation: Native AnalyserNode + Canvas 2D. No libraries.**

**Rationale:**

Tone.js (v15.1.22) is a full music synthesis framework -- massively overkill for reading frequency data. The visualizer needs exactly two things:

1. `AnalyserNode.getByteFrequencyData()` to get 64-128 frequency bins per frame
2. `<canvas>` with `requestAnimationFrame` to draw bars

This is ~80 lines of code. A React component that takes an `AnalyserNode` ref and renders bars on a canvas. No library provides meaningful value here.

**Implementation sketch:**

```typescript
// In the audio engine (not React)
const analyser = audioContext.createAnalyser();
analyser.fftSize = 256; // gives 128 frequency bins
analyser.smoothingTimeConstant = 0.8;

// In React component
function Visualizer({ analyserNode }: { analyserNode: AnalyserNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
    let animId: number;

    function draw() {
      analyserNode.getByteFrequencyData(dataArray);
      // Draw bars on canvas using dataArray values (0-255)
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      // ... draw bars
      animId = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(animId);
  }, [analyserNode]);

  return <canvas ref={canvasRef} />;
}
```

### 3. Server-Side Audio Processing (CF Workers)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **music-metadata** | ^11.11.1 | Extract duration, format, bitrate from uploaded audio | Has non-Node `default` export path via `core.js`; supports MP3, WAV; pure JS parsing |
| **Custom MP3 header parser (fallback)** | N/A | Lightweight MP3 duration extraction if music-metadata fails in Workers | Zero-dependency, ~100 lines, reads MP3 frame headers to calculate duration |

**Confidence: MEDIUM -- music-metadata CF Workers compatibility needs validation.**

**Rationale and risk assessment:**

The critical constraint: CF Workers cannot use Node.js native modules, `fs`, `path`, or Node streams. We need to parse audio metadata from an `ArrayBuffer` (from the multipart upload).

**music-metadata** (v11.11.1) is the gold standard for audio metadata parsing. Key compatibility signals:

- It exports a `default` (non-Node) path: `./lib/core.js` -- this suggests edge/browser runtime support
- Its dependency `strtok3` also has a `default: './lib/core.js'` path separate from Node
- `file-type` (its dep) also has `default: './core.js'` separate from Node
- The library has `parseBuffer()` and `parseBlob()` methods that work on `Uint8Array`/`Buffer` data, not just file streams

**However:** The library's `engines` field says `node: '>=18'`, and some transitive deps (`debug`, `win-guid`) may reference Node globals. This MUST be validated during implementation.

**Validation plan:**
1. First attempt: `import { parseBuffer } from 'music-metadata'` in a CF Worker
2. If it fails on Node-specific imports: try `import { parseBuffer } from 'music-metadata/lib/core.js'` explicitly
3. If that also fails: fall back to custom MP3 header parser

**Custom MP3 header parser (fallback):**

MP3 files have a predictable header structure. Duration can be calculated by:
- Reading the first MP3 frame header (bytes 0-3 of frame) for bitrate and sample rate
- If CBR (constant bitrate): `duration = fileSize / (bitrate / 8)`
- If VBR: Check for Xing/VBRI header in first frame, which contains total frame count
- WAV: Read RIFF header -- duration = data chunk size / (sample rate * channels * bits per sample / 8)

This is ~100-150 lines of code, zero dependencies, guaranteed to work in CF Workers. It handles the two formats claw.fm supports (MP3 and WAV).

**Format validation approach:**
- MP3: Check first bytes for `0xFF 0xFB` / `0xFF 0xF3` / `0xFF 0xF2` (MPEG frame sync) or `ID3` (ID3 tag before frames)
- WAV: Check first 4 bytes for `RIFF` and bytes 8-11 for `WAVE`
- Reject everything else at the byte level -- no library needed for format validation

### 4. Embedded Wallet Creation (Base Network)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **@coinbase/onchainkit** | ^1.1.2 | Wallet connection UI, identity components, transaction components for Base | Built by Coinbase specifically for Base; includes wallet connector, identity display, and transaction components |
| **wagmi** | ^2.19.5 | React hooks for wallet interactions | Required by OnchainKit; provides useAccount, useConnect, useWriteContract etc. |
| **viem** | ^2.45.1 | Low-level blockchain interactions, contract encoding, USDC transfers | Already in existing x402 stack; used server-side too |
| **@tanstack/react-query** | ^5.90.20 | Async state management for wallet/blockchain queries | Required peer dep of wagmi |
| **@coinbase/wallet-sdk** | ^4.3.7 | Coinbase Smart Wallet connector | Enables "Create Wallet" flow -- users get a wallet with just an email/passkey, no extension needed |

**Recommendation: Coinbase OnchainKit + Smart Wallet. NOT Privy, NOT Dynamic.**

**Rationale:**

The core requirement is: listeners should be able to tip/buy tracks without having an existing wallet. They need **embedded wallet creation** -- click a button, get a wallet, make a payment.

**Why Coinbase OnchainKit + Smart Wallet:**

1. **Native Base support.** OnchainKit is built by Coinbase specifically for the Base ecosystem. Since all claw.fm payments are on Base with USDC, this is the most aligned choice.

2. **Smart Wallet = zero-friction onboarding.** Coinbase Smart Wallet lets users create a wallet with just a passkey (biometric) or email -- no browser extension, no seed phrase. This matches claw.fm's "zero signup" philosophy.

3. **Pre-built React components.** OnchainKit provides `<Wallet>`, `<ConnectWallet>`, `<WalletDropdown>` components that handle the full connection flow. Less custom UI to build.

4. **Transaction components.** OnchainKit includes `<Transaction>` and `<TransactionButton>` components that can handle USDC transfers with built-in status/error handling.

5. **Compatible with existing x402 stack.** Uses viem under the hood (same as x402), wagmi for React hooks. No conflicting abstractions.

**Why NOT Privy (v3.13.0):**
- Privy is a paid service ($0 free tier exists but limited)
- Adds a third-party dependency for wallet creation that could go down or change pricing
- More complex -- supports Solana, email/SMS/social login, which is feature bloat for claw.fm
- Requires `@abstract-foundation/agw-client` and Solana deps as peer dependencies -- unnecessary weight
- claw.fm only needs Base + USDC, making Privy's multi-chain support wasted complexity

**Why NOT Dynamic (v4.59.1):**
- Also a paid SaaS dependency
- Dashboard/API key management overhead
- More general-purpose than needed

**Why NOT Thirdweb (v5.118.0):**
- Large bundle, general-purpose SDK
- Less Base-specific optimization than OnchainKit

**Peer dependency chain:**
```
@coinbase/onchainkit ^1.1.2
  requires: react ^19, react-dom ^19, wagmi ^2.16, viem ^2.27
    wagmi ^2.19.5
      requires: react >=18, viem 2.x, @tanstack/react-query >=5.0.0, typescript >=5.0.4
        @tanstack/react-query ^5.90.20
        viem ^2.45.1
```

**IMPORTANT version constraint:** OnchainKit requires React ^19. The frontend MUST use React 19. This is not optional. React 19 (v19.2.4) is stable and current, so this is fine for a new project.

### 5. Multipart Upload Handling (Hono / CF Workers)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Hono built-in `c.req.parseBody()`** | (part of hono ^4.11.7) | Parse multipart/form-data uploads | Native Hono feature, no additional dependency; works in CF Workers |
| **Hono body-limit middleware** | (part of hono ^4.11.7) | Enforce 50MB upload size limit | Built into Hono, import from `hono/body-limit` |
| **@hono/zod-validator** | ^0.7.6 | Validate metadata fields in upload requests | Type-safe validation of title, genre, etc. alongside file upload |

**Recommendation: Use Hono's built-in body parsing. No additional upload libraries.**

**Rationale:**

Hono's `c.req.parseBody()` natively handles `multipart/form-data` in Cloudflare Workers. It returns an object where file fields are `File` objects (with `.arrayBuffer()`, `.name`, `.type`, `.size` properties). This is exactly what CF Workers provides through the standard `Request` API.

**Upload flow:**
```typescript
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

app.post('/tracks',
  bodyLimit({ maxSize: 50 * 1024 * 1024 }), // 50MB
  async (c) => {
    const body = await c.req.parseBody();
    const audioFile = body['audio']; // File object
    if (!(audioFile instanceof File)) throw new Error('No audio file');

    const arrayBuffer = await audioFile.arrayBuffer();
    // Validate format (check magic bytes)
    // Extract duration (music-metadata or custom parser)
    // Upload to R2
    await c.env.R2_BUCKET.put(key, arrayBuffer);
  }
);
```

**No need for:** `multer`, `busboy`, `formidable`, or any Node.js upload middleware. These are Node-specific and will not work in CF Workers. Hono + the Web API `File` interface handle everything.

### 6. Supporting Libraries

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| **zustand** | ^5.0.11 | Client-side state for audio player, queue, now-playing | Lightweight (1KB), works great with React 19, no boilerplate. Handles audio engine state (playing, current track, volume) outside React render cycle |
| **jdenticon** | ^3.3.0 | Generate identicon SVGs from wallet addresses for fallback cover art | Zero dependencies, works in both browser and CF Workers (SVG generation), deterministic output from any string |
| **zod** | ^4.3.6 | Schema validation for API inputs (track metadata, payment params) | Already required by @x402/core; use consistently across API |
| **@hono/zod-validator** | ^0.7.6 | Integrate zod schemas with Hono route validation | Clean middleware pattern for request validation |
| **hono-rate-limiter** | ^0.5.3 | Rate limit track submissions and API endpoints | Already in existing x402 infra pattern |

### 7. Development & Infrastructure

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **wrangler** | ^4.61.1 | CF Workers local dev, deployment, D1/R2 management | Required for CF Workers development |
| **@cloudflare/workers-types** | ^4.20260131.0 | TypeScript types for Workers runtime APIs | Type safety for D1, R2, KV bindings |
| **vite** | ^7.3.1 | Frontend build tool and dev server | Already decided; latest version |
| **typescript** | ^5.9.3 | Type safety across frontend and API | Required by wagmi, needed everywhere |
| **tailwindcss** | ^4.1.18 | Utility-first CSS for frontend | Fast UI development, good for responsive radio UI |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Audio playback | Native Web Audio API | Howler.js v2.2.4 | Adds abstraction layer that fights crossfade control; still need Web Audio API for visualizer; 10KB gzipped for no benefit |
| Audio playback | Native Web Audio API | Tone.js v15.1.22 | Full synthesis framework (150KB+), massive overkill for playback-only use case |
| Visualization | Canvas 2D + AnalyserNode | Three.js / WebGL | Overkill for 2D bar chart; adds 50KB+ for no visual benefit |
| Visualization | Canvas 2D + AnalyserNode | D3.js | DOM-based rendering is too slow for 60fps audio visualization; Canvas is the right tool |
| Audio metadata | music-metadata v11 | ffprobe/ffmpeg | Cannot run native binaries in CF Workers |
| Audio metadata | music-metadata v11 | mp3-duration v1.1.0 | Only handles MP3, not WAV; less metadata extraction; keep as fallback concept |
| Wallet | OnchainKit + Smart Wallet | Privy v3.13.0 | Paid SaaS, multi-chain bloat, unnecessary Solana deps |
| Wallet | OnchainKit + Smart Wallet | Dynamic v4.59.1 | Paid SaaS, dashboard overhead, less Base-native |
| Wallet | OnchainKit + Smart Wallet | Thirdweb v5.118.0 | Large bundle, general-purpose, less Base-optimized |
| Wallet | OnchainKit + Smart Wallet | Raw wagmi + viem only | Would work but requires building all wallet UI from scratch; OnchainKit's pre-built components save significant time |
| State management | zustand v5 | Redux Toolkit | Overkill for this app's state needs; zustand is 1KB vs 30KB+ |
| State management | zustand v5 | Jotai v2.17.0 | Atomic model is fine but zustand's store pattern maps better to audio engine state |
| Upload handling | Hono built-in | Multer / Busboy | Node.js libraries, incompatible with CF Workers |
| Identicons | jdenticon v3.3.0 | ethereum-blockies-base64 v1.0.2 | jdenticon produces cleaner SVGs, works server-side too (for OG images), more visually distinctive |
| CSS | Tailwind CSS v4 | CSS Modules / Styled Components | Tailwind is faster for building UIs; v4 has zero-config with Vite |

---

## What NOT to Use

### Do NOT use Howler.js
**Why it seems attractive:** Popular audio library, nice API, handles browser quirks.
**Why it is wrong here:** claw.fm needs crossfade between two simultaneous audio sources with shared visualization. Howler's abstraction makes this harder, not easier. You end up fighting the library to access the underlying Web Audio API nodes. For a jukebox app that plays one sound at a time, Howler is great. For a radio station with crossfade and real-time visualization, go native.

### Do NOT use Tone.js
**Why it seems attractive:** Powerful Web Audio API framework.
**Why it is wrong here:** Tone.js is designed for music creation/synthesis (scheduling notes, effects chains, instruments). claw.fm plays pre-rendered audio files. Using Tone.js for this is like using Photoshop to display a JPEG.

### Do NOT use MediaSource Extensions (MSE)
**Why it seems attractive:** Enables streaming-like playback, used by YouTube/Spotify.
**Why it is wrong here:** MSE is for adaptive bitrate streaming (DASH/HLS) where you feed chunks into a buffer. claw.fm serves complete audio files from R2. Using `<audio src="...">` with pre-fetching is simpler, more reliable, and sufficient. MSE adds complexity with no benefit when files are small (max 10 min, max 50MB).

### Do NOT use ffmpeg/ffprobe (server-side)
**Why it seems attractive:** Gold standard for audio processing.
**Why it is wrong here:** Cannot run native binaries in CF Workers. Period. No ffmpeg.wasm either -- it requires SharedArrayBuffer and significant memory, both constrained in Workers (which has 128MB memory limit and 30s CPU time for paid plans).

### Do NOT use Node.js stream-based upload libraries
Examples: multer, busboy, formidable, express-fileupload.
**Why wrong:** All depend on Node.js streams. CF Workers use Web API `Request`/`Response`. Hono's built-in body parser uses the correct Web APIs.

### Do NOT use Web Streams API for audio playback
**Why it seems attractive:** Could stream audio progressively.
**Why it is wrong here:** R2 serves files via HTTP range requests natively. The `<audio>` element handles progressive loading automatically. Adding Web Streams adds complexity for no user-visible benefit.

---

## Installation Commands

### API (CF Workers)

```bash
# Core (already decided)
npm install hono@^4.11.7 @openfacilitator/sdk@^0.7.2 @x402/core@^2.2.0 viem@^2.45.1

# Audio metadata extraction
npm install music-metadata@^11.11.1

# Validation and middleware
npm install zod@^4.3.6 @hono/zod-validator@^0.7.6 hono-rate-limiter@^0.5.3

# Identicon generation (server-side for OG images)
npm install jdenticon@^3.3.0

# Dev dependencies
npm install -D wrangler@^4.61.1 @cloudflare/workers-types@^4.20260131.0 typescript@^5.9.3
```

### Frontend (React + Vite on CF Pages)

```bash
# Core (already decided)
npm install react@^19.2.4 react-dom@^19.2.4

# Wallet integration
npm install @coinbase/onchainkit@^1.1.2 wagmi@^2.19.5 viem@^2.45.1 @tanstack/react-query@^5.90.20

# State management
npm install zustand@^5.0.11

# Identicon generation (client-side fallback art)
npm install jdenticon@^3.3.0

# Styling
npm install tailwindcss@^4.1.18

# Dev dependencies
npm install -D typescript@^5.9.3 @types/react@^19 @types/react-dom@^19 vite@^7.3.1
```

---

## Version Compatibility Matrix

| Package | Version | Constraint Source | Notes |
|---------|---------|-------------------|-------|
| react | ^19.2.4 | @coinbase/onchainkit requires ^19 | MUST be React 19, not 18 |
| react-dom | ^19.2.4 | @coinbase/onchainkit requires ^19 | Matches react |
| wagmi | ^2.19.5 | @coinbase/onchainkit requires ^2.16 | Must be 2.x, NOT 3.x (OnchainKit not yet compatible) |
| viem | ^2.45.1 | wagmi requires 2.x, OnchainKit requires ^2.27 | Shared across frontend and API |
| @tanstack/react-query | ^5.90.20 | wagmi requires >=5.0.0 | Peer dep |
| typescript | ^5.9.3 | wagmi requires >=5.0.4 (v2) or >=5.7.3 (v3) | Use latest 5.x |
| zod | ^4.3.6 | @x402/core requires ^3.24.2 | **WARNING: Potential conflict.** x402/core pins zod ^3.24.2. Zod 4 may not be backward compatible. Verify x402/core works with zod 4, or pin to zod ^3.24.2 and match x402. |
| hono | ^4.11.7 | Base stack decision | Latest 4.x |

**Critical note on Zod version:** The `@x402/core` package depends on `zod ^3.24.2`. Zod v4 (4.3.6) is the latest major release but may have breaking changes from v3. **Resolution: Use `zod@^3.24.2` to match x402/core's requirement, NOT zod v4.** Update the install commands accordingly if x402/core has not updated to support zod v4.

**Corrected zod version for API:**
```bash
npm install zod@^3.24.2
```

---

## Architecture Implications

### Monorepo vs Separate Repos

Recommend a **monorepo with two packages** (or a single repo with `/api` and `/web` directories):
- `/api` -- CF Workers + Hono (deployed via wrangler)
- `/web` -- React + Vite (deployed to CF Pages)
- `/shared` -- Types, constants (track schema, payment amounts, API types)

This keeps the `viem` dependency shared and ensures API response types match frontend expectations.

### Audio Engine as Singleton (Not React State)

The audio playback engine (AudioContext, gain nodes, analyser, crossfade logic) should be a **singleton class outside React**, not managed via React state. React re-renders must not disrupt audio playback. Zustand connects the engine's state to React for UI updates.

```
AudioEngine (singleton, imperative)
  |-- manages AudioContext, gain nodes, <audio> elements
  |-- exposes: play(), pause(), setVolume(), getAnalyserNode()
  |-- fires events on track change, playback state change

Zustand Store (reactive)
  |-- subscribes to AudioEngine events
  |-- exposes: isPlaying, currentTrack, volume, queue
  |-- React components subscribe to store
```

### R2 Serving Strategy

Audio files should be served directly from R2 via public bucket or presigned URLs. The `<audio>` element fetches directly from R2 -- do NOT proxy audio through the Worker (would consume CPU time and egress unnecessarily). Use R2 custom domain or CF Pages + R2 binding for public serving.

---

## Open Questions / Validation Needed

1. **music-metadata in CF Workers** -- MEDIUM confidence. The `default` export path avoids Node-specific imports in theory, but this needs a real test. If it fails, implement the custom MP3/WAV header parser (~150 lines, zero dependencies, guaranteed to work).

2. **Zod v3 vs v4 compatibility** -- Need to verify whether `@x402/core@^2.2.0` works with zod v4 or requires v3. Safe default: use zod v3.

3. **OnchainKit Smart Wallet flow** -- Need to verify the exact "Create Wallet" UX flow. Does it require a Coinbase account? Does it work with just a passkey? This affects the "zero signup" promise.

4. **R2 public access for audio files** -- Need to confirm the best pattern for serving R2 audio files publicly (custom domain, CF Pages binding, or presigned URLs with expiry).

5. **Audio autoplay policy** -- Browsers block audio autoplay without user gesture. The radio station needs a "Press play to start listening" interaction on first visit. This is a UX consideration, not a library issue.

---

## Sources

All version numbers verified via `npm view [package] version` on 2026-01-31 against the npm registry. Browser API information (Web Audio API, Canvas, HTMLAudioElement) is based on established web standards (stable since 2014+). CF Workers constraints based on Cloudflare Workers documentation (training data -- HIGH confidence as these are well-established constraints). OnchainKit/wagmi/viem compatibility based on peer dependency analysis from npm registry (HIGH confidence).

| Claim | Source | Confidence |
|-------|--------|------------|
| All npm package versions | npm registry (live query 2026-01-31) | HIGH |
| Peer dependency chains | npm registry (live query) | HIGH |
| Web Audio API crossfade architecture | Web Audio API spec (stable standard) | HIGH |
| CF Workers cannot run native modules | Cloudflare Workers docs (established constraint) | HIGH |
| music-metadata edge runtime compatibility | Package exports analysis + training data | MEDIUM |
| OnchainKit Smart Wallet UX flow | Training data, needs validation | MEDIUM |
| Zod v3/v4 compatibility with x402 | Needs testing | LOW |
