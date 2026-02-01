# Project Research Summary

**Project:** claw.fm -- 24/7 AI-generated music web radio station
**Domain:** Web radio + crypto micropayments + AI-agent content platform
**Researched:** 2026-01-31
**Confidence:** MEDIUM-HIGH

## Executive Summary

claw.fm is a 24/7 web radio station where AI agents create music tracks with CLI tools, submit them via an x402-gated API (paying 0.01 USDC), and earn tips and sales from human listeners. The product sits at the intersection of web radio, crypto-native music platforms, and AI-agent tooling -- a genuinely novel combination with no direct precedent. Research across stack, features, architecture, and pitfalls reveals a system that is architecturally straightforward (Cloudflare Workers + client-side Web Audio playback) but with several critical implementation traps that will cause rewrites if not addressed from day one.

The recommended approach is a serverless architecture using CF Workers (Hono) for the API, D1 for metadata, R2 for audio storage, KV for fast now-playing cache, and a Cron Trigger for queue advancement. The frontend uses React 19 + Vite on CF Pages with native Web Audio API for crossfade playback and frequency visualization -- no audio libraries needed. Wallet integration uses Coinbase OnchainKit + Smart Wallet for zero-friction listener tipping on Base. The key architectural insight is that "radio" does not require server-side streaming: each browser fetches the full audio file from R2 and syncs playback position using server-provided timestamps. This makes the entire system stateless at the server level, with the Cron Trigger as the only scheduled process.

The top risks are: (1) browser autoplay policies silently breaking the "open and listen" experience -- must design a deliberate "press play" interaction; (2) CF Workers memory limits crashing on large audio uploads -- must use streaming uploads to R2, not buffering; (3) Web Audio API memory leaks from improper node management during crossfade -- must use a double-buffer pattern with exactly two audio elements from the start; and (4) x402 payment verification must be entirely server-side with transaction replay prevention. All four of these are Phase 1 concerns that, if deferred, will require rewrites.

## Key Findings

### Recommended Stack

The base stack is decided (CF Workers + Hono + D1 + R2 + React/Vite). Research focused on additional libraries. The overwhelming finding: **use fewer libraries, not more.** Native Web Audio API beats Howler.js and Tone.js for crossfade + visualization. Hono's built-in `c.req.parseBody()` beats Multer/Busboy for uploads. The main additions needed are wallet/payment libraries and lightweight utilities.

**Core additional technologies:**
- **Native Web Audio API** (AudioContext, GainNode, AnalyserNode): audio playback, crossfade, visualization -- zero dependencies, full control over the audio graph
- **@coinbase/onchainkit ^1.1.2 + wagmi ^2.19.5 + viem ^2.45.1**: wallet connection, embedded wallet creation, USDC payments on Base -- the most aligned stack for Base-native payments
- **zustand ^5.0.11**: client-side state bridging the imperative AudioEngine singleton to React's reactive model -- 1KB, no boilerplate
- **zod ^3.24.2** (NOT v4 -- must match @x402/core dependency): API input validation
- **music-metadata ^11.11.1** (needs Workers validation) or custom MP3/WAV header parser as fallback: server-side audio duration extraction

**Critical version constraints:**
- React must be ^19 (OnchainKit peer dep)
- Zod must be ^3.24.2 (x402/core compatibility -- zod v4 may break)
- wagmi must be ^2.x (OnchainKit not compatible with v3)

### Expected Features

Research confirms claw.fm's "radio" framing dramatically reduces the required feature set. Radio is passive. Most interactive music platform features are anti-features here.

**Must have (table stakes):**
- Instant audio playback after a single user gesture (play button)
- Now-playing display (track title + agent name/wallet + identicon)
- Play/pause and volume controls
- Visual feedback (frequency visualizer)
- Gapless or crossfade track transitions (dead air kills retention)
- Prominent tip/buy CTAs (the business model depends on visibility)
- Mobile-responsive player with Media Session API
- Error recovery and auto-reconnection (mobile browsers aggressively suspend tabs)
- Loading/buffering states (users must always know what's happening)

**Should have (differentiators):**
- Agent-as-artist identity (wallet IS identity, novel concept)
- Instant crypto tipping with embedded wallet creation (zero-friction)
- Agent onboarding prompt (copy-paste to your AI agent)
- x402 submission paywall (economic spam prevention, elegant)
- Decay-based rotation (fresh content surfaces naturally)
- Track purchase/download
- Transparent 95/5 economics

**Defer to v2+:**
- Multiple channels/genres (splits small audience)
- Listener count display (anti-proof when count is 3)
- Agent dashboard (API stats are sufficient)
- Social features (moderation burden)
- Audio fingerprinting (solve when it becomes a real problem)
- Skip/next button (breaks radio metaphor)
- User accounts (wallet IS identity)

### Architecture Approach

The architecture is a stateless CF Workers API with time-based shared state. All listeners hear the same track because the server stores "Track X started at timestamp T" and each client calculates its seek position from `Date.now() - T`. Queue advancement is handled by a Cron Trigger every 30 seconds, with KV as a globally-distributed fast-read cache for now-playing state. This avoids Durable Objects entirely for MVP, which saves significant complexity and cost while providing acceptable latency (the frontend handles transitions client-side using timestamps, making the 30-second cron interval invisible to listeners).

**Major components:**
1. **Hono API (CF Worker)** -- track submission (x402-gated), now-playing endpoint, tip/purchase payment processing, queue management
2. **Audio Engine (browser singleton)** -- dual-GainNode crossfade, AnalyserNode for visualizer, HTMLAudioElement double-buffer pattern; lives outside React, connected via zustand
3. **Queue Manager (Cron + D1 + KV)** -- decay-weighted random track selection via SQL, cron advances queue, KV caches now-playing globally
4. **R2 Public Bucket** -- audio file delivery via custom domain with CDN caching, CORS configured for Web Audio API
5. **Payment Layer (x402/OpenFacilitator)** -- submission fees, tips, and purchases; MVP uses single-payment-to-platform with tracked artist payouts

**Key architectural decisions:**
- Polling + KV + Cron over Durable Objects (simpler, globally distributed, sufficient for radio)
- Client-side playback sync via timestamps over server-side streaming (stateless, scalable)
- Single payment to platform over dual-payment split (simpler for MVP, trustless split later)
- Audio Engine as imperative singleton outside React (re-renders must not disrupt playback)
- Monorepo with `/api`, `/web`, `/packages/shared` structure

### Critical Pitfalls

The top 5 pitfalls that will cause rewrites or broken experiences if not addressed proactively:

1. **Browser autoplay policy (CP-1)** -- AudioContext must be created lazily inside a user gesture handler, not on page load. Safari is the strictest. Design a deliberate "press play" splash. Handle `NotAllowedError` from `audio.play()`. This affects every listener on first visit.

2. **CF Workers memory limits on uploads (CP-2)** -- Workers buffer the full request body into memory (~128MB limit). A 50MB audio file plus processing can OOM. Must stream uploads directly to R2 using `request.body` ReadableStream. Validate only file headers (first few KB), not the full file in-memory. This must be designed as streaming from day one -- retrofitting is a rewrite.

3. **Web Audio API memory leaks during crossfade (CP-5)** -- Creating new audio nodes per track without disconnecting old ones causes monotonic memory growth. After 10-20 transitions, tabs crash. Must use exactly two `<audio>` elements (double-buffer) and reuse `MediaElementSourceNode` instances by changing `src`, not recreating nodes. Use `AudioContext.currentTime` for crossfade scheduling, not `setTimeout` (throttled in background tabs).

4. **Audio format validation ("audio bombs") (CP-7)** -- A malformed file claiming to be 3-minute MP3 but decoding to hours of audio blocks the entire shared queue. Must parse audio headers server-side (MP3 frame headers for bitrate/duration, WAV RIFF headers), enforce hard limits (max 10 min, max 2 channels, 22050-48000Hz sample rate), and double-validate on client.

5. **x402 payment verification bypass (CP-4)** -- Payment verification must be entirely server-side. Transaction hashes must be stored in D1 and checked for replay across all endpoints. Amount, recipient, and token must all be verified. Identity comes from the payment's `from` address, not client-supplied headers.

## Implications for Roadmap

Based on combined research, the system has a clear critical path with two parallel workstreams that converge. Six phases are suggested.

### Phase 1: Foundation and Infrastructure
**Rationale:** Everything depends on the D1 schema, R2 bucket, and project scaffolding. The monorepo structure, shared types, and CF Worker config must exist before any feature work.
**Delivers:** Deployable (empty) API and frontend, D1 schema, R2 bucket with public domain and CORS, shared types package, wrangler.toml with all bindings.
**Addresses:** Infrastructure foundation for all subsequent phases.
**Avoids:** CP-2 (design upload pipeline as streaming from the start), integration gotchas around CF Pages vs Workers routing.

### Phase 2: Submission Pipeline
**Rationale:** No tracks means no station. The supply side must work first. This phase produces the data that all other phases consume.
**Delivers:** Working `POST /api/submit` endpoint that accepts multipart audio uploads, validates format/duration/size, stores to R2, writes metadata to D1, and gates submission behind x402 payment (0.01 USDC).
**Addresses:** T8 (empty state becomes possible to exit), D4 (x402 paywall), D3 (agent onboarding prompt makes sense once submission works).
**Avoids:** CP-2 (streaming upload to R2), CP-4 (server-side payment verification from day one), CP-7 (audio header validation), security pitfalls (tx hash replay, content-type enforcement, input sanitization).
**Uses:** Hono `c.req.parseBody()`, x402 middleware (port from x402-storage-api), music-metadata or custom header parser, zod validation.

### Phase 3: Queue and Now-Playing
**Rationale:** With tracks in D1/R2, the queue system can select and schedule them. This is the "brain" of the radio station.
**Delivers:** Cron Trigger advancing queue every 30s, decay-weighted random track selection, KV-cached now-playing state, `GET /api/now-playing` and `GET /api/queue` endpoints, first-track-submitted auto-start logic, empty queue handling.
**Addresses:** D5 (decay rotation), T9 (track transitions at the data level -- client handles audio transitions).
**Avoids:** CP-3 (race conditions -- cron is the only writer, KV is the read cache; no concurrent mutations), anti-pattern of storing queue as an ordered list.
**Implements:** KV-Cached Queue State pattern, decay-weighted selection query.

### Phase 4: Frontend Player
**Rationale:** With the API serving now-playing data and R2 serving audio files, the frontend can render the full listening experience. This is the most complex client-side phase.
**Delivers:** React app with audio engine (crossfade, double-buffer), frequency visualizer, now-playing display, playback sync (seek to correct position), play/pause, volume control, loading/buffering/error states, empty queue UI, mobile-responsive layout.
**Addresses:** T1 (instant playback), T2 (now-playing), T3 (play/pause), T4 (volume), T5 (visualizer), T6 (mobile responsive), T9 (crossfade transitions), T10 (error recovery), D1 (agent identity display), D6 (visualizer), D9 (shared real-time state).
**Avoids:** CP-1 (autoplay -- lazy AudioContext creation), CP-5 (memory leaks -- double-buffer from start), performance traps (30fps cap on visualizer, pause when tab hidden, preload next track at 30s remaining).
**Uses:** Native Web Audio API, zustand, Canvas 2D, React 19.

### Phase 5: Payments and Wallet
**Rationale:** With the listening experience working, add the monetization layer. This requires wallet integration and x402 payment flows for tips and purchases.
**Delivers:** Embedded wallet creation (OnchainKit + Smart Wallet), tip buttons (fixed presets: $0.25, $0.50, $1.00, $5.00), buy/download button (fixed price), payment recording in D1, artist payout tracking, signed R2 URLs for purchased downloads.
**Addresses:** T7 (visible tip action), D2 (instant crypto tipping), D7 (track purchase), D8 (transparent economics).
**Avoids:** UX pitfall of wallet creation interrupting listening (modal over playing audio), security mistake of predictable R2 URLs bypassing purchases.
**Uses:** @coinbase/onchainkit, wagmi, viem, @tanstack/react-query.

### Phase 6: Polish and Hardening
**Rationale:** With the full loop working (submit, play, tip, buy), harden for real-world use.
**Delivers:** Agent onboarding section with copy-paste prompt, fallback identicon cover art (jdenticon), rate limiting tuning (per-wallet submission limits), Media Session API (lock screen controls), OG meta tags, keyboard shortcuts, admin skip endpoint for stuck tracks, error tracking.
**Addresses:** D3 (agent onboarding), remaining UX polish, security hardening, recovery strategies.
**Avoids:** Rogue agent flooding, queue monopolization.

### Phase Ordering Rationale

- **Phases 1-3 are strictly sequential** (infrastructure, then data, then queue logic). Each depends on the prior phase's output.
- **Phase 4 depends on Phase 3** (needs now-playing API to drive the player). However, audio engine development (crossfade, visualizer) can start with mock data in parallel with Phase 3.
- **Phase 5 can partially overlap with Phase 4** -- API payment routes can be built while frontend player is in progress.
- **Phase 6 is independent polish** that can be sprinkled throughout or done as a final pass.
- **The critical path is: Phase 1 -> Phase 2 -> Phase 3 -> Phase 4.** This is the shortest path to a listenable station.

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 2 (Submission Pipeline):** music-metadata CF Workers compatibility is MEDIUM confidence. Must validate `parseBuffer` import works in Workers runtime. Have the custom MP3/WAV header parser ready as fallback. Streaming upload to R2 from multipart body needs testing.
- **Phase 5 (Payments/Wallet):** OnchainKit Smart Wallet "create wallet" UX flow needs validation. Does it require a Coinbase account? Does it work with just a passkey? Mobile Safari compatibility with embedded wallet flows is uncertain. The two-payment split for trustless artist payouts is untested in the x402 ecosystem.

**Phases with standard, well-documented patterns (skip research):**
- **Phase 1 (Foundation):** Standard CF Workers + Hono scaffolding, D1 schema, R2 bucket config. Well-documented in Cloudflare docs.
- **Phase 3 (Queue):** KV caching + Cron Triggers are standard CF patterns. Decay-weighted random selection is a well-known scheduling algorithm.
- **Phase 4 (Frontend Player):** Web Audio API crossfade and AnalyserNode visualization are well-established patterns with extensive MDN documentation.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | npm versions verified via registry. music-metadata Workers compatibility unverified. Zod v3/v4 conflict needs testing. |
| Features | HIGH | Radio UX patterns are well-established. Anti-feature decisions are clear and well-reasoned. AI-agent-as-artist is novel (LOW confidence on agent-specific patterns). |
| Architecture | HIGH | Patterns derived from existing x402-storage-api codebase (direct code reference) + well-established CF Workers primitives. Polling+KV+Cron approach is proven. |
| Pitfalls | MEDIUM-HIGH | Browser API pitfalls are HIGH confidence. CF Workers memory limits and Durable Object specifics are MEDIUM (training data, not live-verified). |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **music-metadata in CF Workers:** MEDIUM confidence. The `default` export path avoids Node-specific imports in theory but needs a real test. Mitigation: have the custom MP3/WAV header parser (~150 lines, zero deps) ready as immediate fallback.
- **Zod v3 vs v4:** @x402/core pins zod ^3.24.2. Zod v4 may have breaking changes. Resolution: use zod ^3.24.2 for the API to match x402/core. Verify before considering upgrade.
- **OnchainKit Smart Wallet UX:** Does "Create Wallet" require a Coinbase account or work with just a passkey? This directly affects the "zero signup" promise. Must test with real users early in Phase 5.
- **R2 CORS for Web Audio API:** The `crossOrigin="anonymous"` attribute on `<audio>` elements requires specific CORS headers from R2. The exact R2 CORS configuration needs testing to confirm AnalyserNode receives data (not silence from a tainted AudioContext).
- **CF Workers memory limits (current):** Training data says ~128MB. Verify against current Cloudflare documentation, especially for paid plans.
- **WAV file serving:** Uncompressed WAV files are huge (~30MB for 3 minutes). No transcoding pipeline exists in CF Workers. Consider: accept WAV uploads but flag for async transcoding, or require MP3 only for MVP.

## Sources

### Primary (HIGH confidence)
- x402-storage-api codebase (`/Users/rawgroundbeef/Projects/x402-storage-api/`) -- x402 middleware patterns, Hono structure, D1/R2 patterns, facilitator wrapper
- x402.storage web codebase (`/Users/rawgroundbeef/Projects/x402.storage/packages/web/`) -- embedded wallet pattern, funding flow
- npm registry (live queries 2026-01-31) -- all package versions and peer dependency chains verified
- Web Audio API (W3C spec, MDN) -- AudioContext, AnalyserNode, GainNode, MediaElementSourceNode; stable standards since 2014+
- Cloudflare Workers core primitives (KV, D1, R2, Cron) -- well-documented, established platform

### Secondary (MEDIUM confidence)
- Cloudflare Workers limits (memory, request size, CPU time) -- training data, verify against current docs
- x402 protocol flow (HTTP 402 + payment proof pattern) -- training data + x402 repos
- Crypto music platform patterns (Sound.xyz, Audius, Catalog) -- training data, platforms may have evolved
- OnchainKit/Smart Wallet UX flow -- training data, needs real-device validation
- music-metadata CF Workers compatibility -- export path analysis, untested in runtime

### Tertiary (LOW confidence)
- AI-agent-as-artist patterns -- genuinely novel territory, no precedents exist; recommendations are reasoned hypotheses
- Zod v3/v4 interoperability with @x402/core -- needs direct testing
- R2 CORS behavior with Web Audio API crossOrigin attribute -- needs testing

---
*Research completed: 2026-01-31*
*Ready for roadmap: yes*
