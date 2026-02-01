# Domain Pitfalls

**Domain:** 24/7 AI-generated music radio station (browser audio + CF Workers + x402 payments + serverless queue + agent platform)
**Researched:** 2026-01-31
**Overall Confidence:** MEDIUM (based on training data; WebSearch and WebFetch were unavailable for live verification)

> **Confidence note:** All findings below are based on training data (cutoff ~May 2025). Cloudflare limits, x402 protocol details, and browser API behaviors should be verified against current official documentation before implementation. Specific numbers (e.g., CF Workers memory limits, request size caps) are marked with their confidence level and should be confirmed.

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or fundamental architecture failures.

---

### CP-1: Browser Autoplay Policy Kills the "Just Open and Listen" Experience

**What goes wrong:** The homepage promises "just open the page and music plays." But every modern browser (Chrome, Safari, Firefox, Edge) blocks `AudioContext` creation and `<audio>` element autoplay without a user gesture. The audio silently fails to start, or `AudioContext` is created in a "suspended" state. The visualizer shows nothing. The user thinks the site is broken.

**Why it happens:** Browser autoplay policies require a user interaction (click, tap, keypress) before audio can play. This policy has been tightened over the years, not loosened. Safari is the strictest -- even `AudioContext.resume()` requires a direct user gesture in the call stack, not just a prior gesture.

**How to avoid:**
1. **Design a deliberate "Press Play" interaction into the UX.** Do not try to circumvent autoplay -- embrace it. Show a large, obvious play button as the first thing listeners see. This is both legally safer and more reliable.
2. **Create `AudioContext` lazily** -- only inside the click handler of the play button, not on page load. Creating it on page load and calling `resume()` later fails on Safari.
3. **Check `AudioContext.state`** on every playback attempt. If it's `"suspended"`, show UI prompting user interaction rather than silently failing.
4. **Handle the `NotAllowedError`** from `audio.play()` -- catch the rejected promise and surface UI for the user to click.
5. **Store "user has interacted" state** so that subsequent track transitions (crossfades) don't re-trigger the restriction within the same session.

**Warning signs:**
- Audio works in development (you clicked things before testing) but fails for fresh visitors
- Safari users report blank/silent page while Chrome users don't
- `AudioContext.state === "suspended"` appearing in error logs

**Consequences:** 100% of first-time visitors get silence. The core value proposition ("open the page and music plays") is broken.

**Phase to address:** Phase 1 (audio player foundation). This must be the very first thing solved, before crossfade or visualizer work.

**Confidence:** HIGH -- autoplay policies are well-documented and stable across browsers.

---

### CP-2: Cloudflare Workers Request Body Size Limit Blocks Large Audio Uploads

**What goes wrong:** The project allows up to 50MB audio files. CF Workers on the free plan have a ~100MB request body limit (paid plan). However, the real constraint is that Workers buffer the entire request body into memory before your code runs (unless you use streaming). The Worker's memory limit is 128MB. A 50MB audio file plus request overhead plus any processing you do in-memory can exceed the memory limit and cause the Worker to be killed with no useful error.

**Why it happens:** CF Workers are not traditional servers. They run in V8 isolates with hard memory caps. The default behavior is to buffer the full request body. If you try to validate audio format by reading the whole file into an `ArrayBuffer`, you're doubling memory usage (request buffer + your copy).

**How to avoid:**
1. **Use streaming uploads directly to R2.** Instead of buffering the file in the Worker, pipe `request.body` (a `ReadableStream`) directly to `R2.put()`. This keeps memory usage minimal.
2. **Validate file headers with partial reads.** Read only the first few KB of the stream to check magic bytes (MP3: `0xFF 0xFB` or `ID3`; WAV: `RIFF....WAVE`), then pipe the rest to R2.
3. **Set a hard `Content-Length` check** before any processing. Reject requests over 50MB at the edge with a 413 response -- do not even start reading the body.
4. **Use R2 multipart uploads** for files over ~5MB for resilience. The Workers R2 API supports `createMultipartUpload()`.
5. **Post-upload validation:** After the file is in R2, use a separate Worker or a Durable Object to do heavier validation (duration check, format deep-validation) without blocking the upload response.

**Warning signs:**
- Worker randomly crashes on larger uploads but works for small files
- "Worker exceeded memory limit" errors in CF dashboard
- Uploads over ~30MB fail intermittently

**Consequences:** Agents cannot submit tracks. The entire submission pipeline is broken for anything beyond tiny files.

**Phase to address:** Phase 1 (upload pipeline). Must be designed as streaming from day one -- retrofitting streaming onto a buffer-based upload is a rewrite.

**Confidence:** MEDIUM -- CF Workers memory limit is ~128MB as of training data. The exact current limit, free vs. paid differences, and streaming behavior should be verified against https://developers.cloudflare.com/workers/platform/limits/

---

### CP-3: Shared Queue State Without Durable Objects Causes Race Conditions and Drift

**What goes wrong:** The project needs a shared queue (all listeners hear the same thing). CF Workers are stateless -- each request may hit a different isolate. If you store queue state in D1 or KV and try to manage "current track + position" by reading/writing from each request, you get race conditions: two Workers both try to advance the queue, listeners get out of sync, decay calculations become inconsistent.

**Why it happens:** D1 and KV are eventually consistent (KV) or have no built-in locking (D1). When multiple Worker invocations concurrently read "current track = A, position = 2:30" and both decide to advance to track B, you get duplicate transitions. Without a single source of truth with coordination, the queue drifts.

**How to avoid:**
1. **Use a Durable Object as the single queue coordinator.** A Durable Object (DO) provides a single-threaded, persistent actor that can hold authoritative queue state. All Workers proxy queue operations to this one DO.
2. **The DO maintains:** current track ID, playback start timestamp (wall clock), queue order, decay scores. It does NOT stream audio -- it only manages state.
3. **Listeners derive position from timestamps.** The client gets "track X started at timestamp T" and calculates its own seek position from `Date.now() - T`. This means all listeners are synchronized without the server tracking per-listener state.
4. **Use DO alarms** (Durable Object `alarm()` API) to schedule track transitions rather than relying on client callbacks. When a track ends, the DO alarm fires, advances the queue, and the next poll/WebSocket message tells clients.
5. **Fallback:** If avoiding DOs for cost/complexity, use D1 with optimistic locking (version column + `WHERE version = ?` on updates). But this is fragile at scale.

**Warning signs:**
- Listeners on different Workers hear different tracks
- Queue advances twice (track skipped)
- Decay scores don't match between requests

**Consequences:** The "shared radio" experience is broken. Some listeners hear track A while others hear track B. The station feels like random shuffle, not a radio station.

**Phase to address:** Phase 1 (core architecture decision). This is foundational -- the queue coordination pattern dictates the entire backend architecture.

**Confidence:** HIGH for the problem; MEDIUM for Durable Object specifics (verify current DO pricing, alarm API availability, and memory limits).

---

### CP-4: x402 Payment Verification Done Client-Side Gets Bypassed

**What goes wrong:** The x402 protocol uses HTTP 402 responses to request payment. If payment verification happens client-side (checking if a transaction was submitted before allowing the action), agents can skip payment entirely by calling the API directly without the payment step.

**Why it happens:** x402 is a protocol where the flow is: client requests -> server returns 402 with payment details -> client pays -> client retries with payment proof -> server verifies on-chain and fulfills. If the server doesn't verify the payment proof (transaction hash, receipt) against the actual blockchain state, any fake proof works.

**How to avoid:**
1. **All payment verification MUST happen server-side** in the CF Worker. The Worker receives a payment proof (transaction hash), verifies it on-chain via an RPC call to Base, and only then processes the submission/tip/purchase.
2. **Verify the exact amount, recipient, and token.** Don't just check "transaction exists" -- verify it's USDC, it's the right amount (0.01 for submission, correct tip amount), and the recipient is the platform's address.
3. **Mark transactions as consumed.** Store verified transaction hashes in D1 to prevent replay attacks (same tx hash used for multiple submissions).
4. **Handle RPC failures gracefully.** If the Base RPC node is down, queue the verification rather than either accepting unverified payments or rejecting valid ones. Use a "pending verification" state.
5. **Leverage the existing openfacilitator** from the x402 ecosystem if it handles verification -- don't rebuild this from scratch.

**Warning signs:**
- Tracks appearing in queue without corresponding payment records
- Same transaction hash used multiple times
- Payment verification skipped "temporarily" during development and never re-enabled

**Consequences:** Agents submit unlimited free tracks. The spam gate is gone. The economic model is broken. The queue fills with garbage.

**Phase to address:** Phase 2 (payment integration). Must be correct from the first payment-enabled deploy.

**Confidence:** MEDIUM -- x402 protocol specifics are based on training data. The exact verification flow, openfacilitator integration, and Base RPC options should be verified against the x402 codebase referenced in PROJECT.md.

---

### CP-5: Web Audio API CrossFade Creates Memory Leaks That Crash the Tab

**What goes wrong:** Implementing crossfade means running two audio sources simultaneously during transitions. If you create new `AudioBufferSourceNode` or `MediaElementSourceNode` instances for each track and don't properly disconnect/dispose old nodes, the Web Audio API graph grows indefinitely. After 10-20 track transitions, the browser tab uses 500MB+ of memory and eventually crashes.

**Why it happens:** Web Audio API nodes are garbage collected only when disconnected from the audio graph AND have no references. Common mistakes: (1) keeping references to old source nodes, (2) not calling `disconnect()` on old gain/filter nodes, (3) creating a new `MediaElementSourceNode` per `<audio>` element but never removing old elements from the DOM.

**How to avoid:**
1. **Use exactly two `<audio>` elements** and alternate between them (double-buffer pattern). Element A plays current track, element B preloads next track. On crossfade, B fades in while A fades out. Then A becomes the preload slot for the next track.
2. **Create `MediaElementSourceNode` once per element**, not per track. You can change the `src` of the `<audio>` element without recreating the node.
3. **Disconnect nodes explicitly** when a track finishes. Call `gainNode.disconnect()` and null out references.
4. **Monitor `performance.memory`** (Chrome only) during development -- if `usedJSHeapSize` grows monotonically across track transitions, you have a leak.
5. **Revoke object URLs** if you use `URL.createObjectURL()` for audio blobs. Each un-revoked URL holds the entire audio buffer in memory.

**Warning signs:**
- Tab memory usage increases with each track transition (check Chrome Task Manager)
- Audio glitches/stuttering after the station has been running for 30+ minutes
- "Aw, Snap!" crashes after extended listening sessions

**Consequences:** Listeners who keep the station open (the ideal behavior for a 24/7 radio) experience crashes. The most engaged users have the worst experience.

**Phase to address:** Phase 1 (audio player). Must be designed as double-buffer from the start -- adding it later requires rewriting the entire playback engine.

**Confidence:** HIGH -- Web Audio API memory management is well-documented and these patterns are stable.

---

### CP-6: Durable Object Cold Start Latency Causes "Dead Air" on First Listen

**What goes wrong:** If using a Durable Object for queue coordination, the first request after the DO has been evicted (no traffic for ~10 seconds, or after a deploy) incurs a cold start of 50-200ms+. If the client's first action is "what's playing right now?" and the DO takes 200ms to wake up, plus the client then needs to fetch audio from R2 and seek to the right position, listeners experience 1-3 seconds of dead air on first load.

**Why it happens:** Durable Objects are not always-on processes. They hibernate when idle and need to wake up, rehydrate state from storage, and process the request. This is by design for cost efficiency, but it means the "24/7" station doesn't actually have a 24/7 running process.

**How to avoid:**
1. **Cache "now playing" state in KV or D1** alongside the DO. Update this cache whenever the DO advances the queue. Clients read from cache first (fast, globally distributed) and only hit the DO for mutations.
2. **Pre-buffer audio on the client.** When the client gets "now playing: track X at position T," start loading the audio immediately and don't show the play button until at least a few seconds are buffered.
3. **Use DO WebSocket hibernation** (if available) so the DO stays warm while listeners are connected, rather than waking per-request.
4. **Design the client to gracefully handle the cold-start gap** -- show "Tuning in..." with the visualizer animating (but no audio) rather than a broken-looking silent state.

**Warning signs:**
- First visitor after a quiet period always hears a gap
- "Now playing" endpoint is slower than expected (100ms+)
- Listeners report the station "stutters" when they first open it

**Consequences:** First impression is broken. New visitors think the station is down or broken during the cold start window.

**Phase to address:** Phase 2 (optimization, after core queue works). The core architecture should plan for this, but the caching optimization can come after basic functionality.

**Confidence:** MEDIUM -- DO cold start behavior is based on training data. Current hibernation API and cold start times should be verified.

---

### CP-7: Audio Format Validation That Doesn't Catch "Audio Bombs"

**What goes wrong:** An agent submits a file that claims to be a 3-minute MP3 but is actually: (a) a 50MB file that decodes to 4 hours of silence, (b) a corrupted file that causes the browser's decoder to hang, (c) a WAV header claiming 999 channels, or (d) a valid audio file with malicious metadata (e.g., extremely long ID3 tags). The server accepts it because it passes basic MIME checks. The client tries to play it and either hangs, crashes, or plays for hours blocking the queue.

**Why it happens:** Checking `Content-Type: audio/mpeg` or magic bytes only validates the container format, not the content. Duration, channel count, and sample rate require actually parsing the audio metadata. On CF Workers (which can't run ffprobe), deep validation is hard.

**How to avoid:**
1. **Parse audio headers server-side for duration/metadata.** For MP3, parse the Xing/VBRI header or estimate from bitrate + file size. For WAV, parse the `fmt ` chunk for channels/sample rate/bits per sample and the `data` chunk for actual audio length.
2. **Enforce hard limits:** max 10 minutes duration, max 2 channels (stereo), sample rate between 22050-48000 Hz, file size <= 50MB. Reject anything outside these bounds.
3. **Use a lightweight WASM-based audio parser** in the Worker if JavaScript-only parsing is too fragile. Libraries like `music-metadata` can run in Workers (verify this -- MEDIUM confidence).
4. **Double-validate on the client.** Before playing a track, the client checks `audio.duration` after loading metadata. If duration > 600 seconds (10 min), skip the track and report it.
5. **Store validated metadata in D1** (duration, format, bitrate). Don't re-derive it from the file on playback.

**Warning signs:**
- Queue gets stuck on a track that seems to never end
- Browser memory spikes when loading certain tracks
- Audio duration shown as `Infinity` or `NaN` in the UI

**Consequences:** A single malicious or malformed submission blocks the entire station. All listeners are affected because it's a shared queue.

**Phase to address:** Phase 1 (upload pipeline). Basic validation must be in place before the station goes live. Deeper validation can be iterative.

**Confidence:** HIGH for the problem; MEDIUM for specific parsing approaches in CF Workers.

---

## Technical Debt Patterns

Shortcuts that seem fine initially but compound into serious problems.

| Pattern | Why It's Tempting | What Breaks Later | Prevention |
|---------|-------------------|-------------------|------------|
| Polling for "now playing" instead of WebSocket/SSE | Simpler to implement, works with basic Workers | At 100+ listeners polling every 2 seconds, you're paying for 50+ req/sec to the DO. Latency between track changes feels laggy. | Use Server-Sent Events from a DO WebSocket or long-poll. Even SSE is better than rapid polling. Design the API for push from the start. |
| Storing audio metadata only in R2 object headers | Avoids a D1 write on upload | Every "what's in the queue" query requires listing R2 objects and reading headers. R2 list is slow and costs per-request. | Write metadata to D1 on upload. R2 is for blob storage, D1 is for queryable metadata. |
| Hardcoding payment amounts in the frontend | Faster iteration during development | Agents can bypass the frontend and submit any amount. Platform can't adjust pricing without a deploy. | Payment amounts are defined server-side and returned in the 402 response. Frontend only displays what the server says. |
| Using `setTimeout` for crossfade timing | Works in simple cases | `setTimeout` is unreliable when the tab is backgrounded (throttled to 1s+ intervals). Crossfade sounds terrible or doesn't happen. | Use `AudioContext.currentTime` for scheduling. The Web Audio API has its own high-precision clock that isn't throttled. |
| Skipping CORS configuration "because same domain" | Frontend and API are on the same CF account | CF Pages (frontend) and CF Workers (API) are different origins. Audio fetched from R2 via Workers needs proper CORS for Web Audio API `crossOrigin` attribute. | Configure CORS headers on the Workers API from day one. Set `crossOrigin="anonymous"` on audio elements. |
| Inline decay calculation in the queue endpoint | Quick to prototype | Decay formula changes require API rewrite. Can't A/B test rotation strategies. Hard to debug "why does this track keep playing?" | Decay is a pure function, stored as a module. Decay scores are pre-computed and stored in D1. Queue reads pre-computed order. |

---

## Integration Gotchas

Specific issues at the boundary between two systems.

| Integration | Gotcha | Impact | Mitigation |
|-------------|--------|--------|------------|
| Web Audio API + `<audio>` element | `createMediaElementSource()` permanently takes control of the audio element's output. You CANNOT call it twice on the same element -- throws an error. | Player crashes on second track if you try to recreate the source node. | Create the `MediaElementSourceNode` once at play-button click. Reuse it by changing the element's `src`. |
| R2 + Browser Audio | R2 signed URLs or public bucket URLs don't include `Accept-Ranges` by default. The browser can't seek in the audio file, so `audio.currentTime = X` (needed for sync) may fail or cause full re-download. | Listeners can't sync to the shared position. Each listener starts from 0:00. | Ensure R2 serves `Accept-Ranges: bytes` headers. Use presigned URLs that support range requests. Verify R2 supports this. |
| x402 + CF Workers (Hono) | Hono middleware runs before route handlers. If x402 verification is middleware, it runs on ALL routes including health checks and the "now playing" endpoint. | Listeners get 402 responses when trying to tune in. | x402 middleware should be applied only to specific routes (`/api/submit`, `/api/tip`, `/api/purchase`), not globally. Use Hono's route-specific middleware. |
| Embedded Wallets + Mobile Browsers | Embedded wallet SDKs (e.g., Coinbase Smart Wallet, Privy) may conflict with mobile browser restrictions on popups, iframes, and `window.open()`. Safari especially blocks third-party iframes. | Tipping/buying is impossible on mobile Safari for some wallet providers. | Test wallet flows on real mobile Safari early. Choose an embedded wallet provider that works with in-page flows, not popups. Privy and Coinbase Smart Wallet handle this differently -- test both. |
| D1 + Durable Objects | D1 is accessible from Workers and DOs, but DOs have their own `storage` API. If the DO writes to both its own storage AND D1, and the DO crashes mid-write, you get inconsistent state. | Queue state in DO storage says "track B" but D1 metadata still says "track A is current." | DO is the source of truth for queue state (its own storage). D1 is the source of truth for track metadata. Don't duplicate state across both. Sync from DO -> D1 as a cache update, and handle stale cache gracefully. |
| CF Pages + CF Workers | If the frontend (Pages) and API (Workers) share the same domain via routes, Pages routes take precedence. Workers routes must be explicitly configured. | API endpoints return the frontend HTML instead of JSON. | Use a subdomain for the API (`api.claw.fm`) or explicit route configuration. Test that API routes actually hit the Worker, not Pages. |

---

## Performance Traps

Optimizations that seem unnecessary but become critical at scale.

| Trap | Threshold | Symptom | Solution |
|------|-----------|---------|----------|
| Fetching full audio file before playback starts | Any track > 5MB | 3-10 second delay before music starts. Listener leaves. | Use range requests. Browsers natively do this with `<audio src="...">` if the server supports `Accept-Ranges`. Don't use `fetch()` + `AudioBuffer` for playback -- use the native `<audio>` element with `MediaElementSourceNode`. |
| Visualizer running at 60fps with `requestAnimationFrame` | Always (mobile devices) | Battery drain, UI jank, fan noise on laptops. Listeners close the tab. | Cap visualizer at 30fps. Use `getByteFrequencyData()` not `getByteTimeDomainData()` (frequency is more visually interesting and no more expensive). Pause the visualizer when the tab is not visible (`document.hidden`). |
| Every client independently polling for queue state | 50+ concurrent listeners | 50+ requests/second to the queue endpoint. Workers billing spikes. Potential rate limiting. | Use SSE or WebSocket (via DO) to push state changes. One connection per listener, updates only when something changes. Falls back to polling at 10-second intervals. |
| Loading full track list on page load | 100+ tracks in the system | Slow initial page load. Most data isn't needed (listener only cares about current + next track). | Endpoint returns only current track + next 2-3 tracks. Full history/catalog is a separate lazy-loaded endpoint. |
| No audio preloading of next track | Every track transition | Gap between tracks even without crossfade. The next track takes 1-5 seconds to buffer. | When current track reaches 30 seconds remaining, start loading next track in the hidden `<audio>` element. This is what enables gapless/crossfade. |
| Uncompressed WAV files served directly from R2 | Any WAV submission | A 3-minute WAV is ~30MB. Bandwidth costs spike. Load time is terrible. | Transcode WAV to MP3/AAC on upload (if possible in Workers, otherwise flag for async processing). Or: accept WAV for upload but serve a transcoded version. This may require a transcoding pipeline outside Workers. |

---

## Security Mistakes

Vulnerabilities specific to this architecture.

| Mistake | Attack Vector | Impact | Mitigation |
|---------|---------------|--------|------------|
| No rate limiting on submission endpoint | Agent submits 1000 tracks in 1 minute (pays 0.01 USDC each = $10) | Queue flooded with one agent's tracks. Other agents can't get airtime. $10 is cheap for a spam attack. | Rate limit per wallet address: max 5 submissions per hour. Use CF's built-in rate limiting or track in D1. |
| R2 audio URLs are public and predictable | Anyone enumerates R2 keys and downloads all audio for free | Track purchasing is bypassed. Artists get no revenue. | Use signed URLs with expiration for audio access. Listeners get a short-lived URL (1 hour) for the currently playing track. Purchased tracks get a longer-lived URL. |
| No server-side audio content validation | Agent submits a file named `track.mp3` that's actually an HTML page, executable, or ZIP bomb | If served with wrong Content-Type, browsers might execute it. Storage waste. Potential XSS if R2 serves it with `text/html`. | Validate magic bytes server-side. Set `Content-Type` explicitly on R2 upload (don't trust the client). Set `Content-Disposition: attachment` on download URLs. |
| Transaction hash replay across endpoints | Agent pays 0.01 USDC for submission, then reuses the same tx hash for a "purchase" or second submission | Free tracks, lost revenue, economic model broken. | Store ALL consumed tx hashes in D1 with the endpoint they were used for. Reject any tx hash that's already been consumed for any purpose. |
| Wallet address spoofing in headers | Agent claims to be wallet 0xRICH in the request headers to receive tips meant for another agent | Tips/purchases go to the wrong wallet. Trust in the platform destroyed. | Agent identity is derived from the x402 payment's `from` address, not from a client-supplied header. The wallet that paid for submission IS the artist wallet. Immutable. |
| No input sanitization on track metadata | Agent submits track title with `<script>` tags or 10MB of text in the description field | XSS attacks on listeners. Memory bloat in D1. | Sanitize all text inputs. Max lengths: title 200 chars, description 1000 chars. Strip HTML. Store sanitized versions only. |

---

## UX Pitfalls

Mistakes that make the product feel broken even when it technically works.

| Pitfall | User Impact | Looks Like | Prevention |
|---------|-------------|------------|------------|
| Crossfade volume dip (both tracks at 50% during transition) | Music sounds quiet/thin during transitions instead of smooth | "Volume drops every time a new track starts" | Use equal-power crossfade curve (`Math.cos` / `Math.sin` gain ramp), not linear. Linear fade: both at 0.5 = -6dB perceived. Equal-power: both at ~0.7 = 0dB perceived. |
| No loading state between play button and audio start | User clicks play, nothing happens for 1-3 seconds, clicks again | "The play button is broken, I had to click it twice" | Show a "Buffering..." state immediately on click. Disable the button to prevent double-clicks. Animate the visualizer with a "tuning in" pattern. |
| Embedded wallet creation flow interrupts listening | Listener wants to tip, has to go through wallet creation (3-5 steps), forgets what they were doing | "I tried to tip but gave up" | Let wallet creation happen in a modal/slide-over without pausing audio. Pre-prompt wallet creation subtly ("Create a wallet to tip artists") before the user tries to tip. |
| "Now Playing" shows stale track after tab was backgrounded | Browser throttled timers/network while tab was in background. When user returns, UI shows the track from 20 minutes ago. | "The station is stuck on the same song" | On `visibilitychange` event (tab becomes visible), immediately re-sync with the server. Fetch current state and fast-forward. |
| No indication of queue position for submitted tracks | Agent submits a track, gets a success response, then... nothing. When will it play? Is it in the queue? | Agent has no idea if submission worked. Submits again. | Return queue position in the submission response. Show estimated time until play. Provide a status endpoint: `GET /api/track/{id}/status`. |
| Visualizer doesn't match the audio | Visualizer is connected to the wrong audio node, or shows the wrong frequency range | Bars don't move with the beat. Looks like a random animation, not a music visualizer. | Connect `AnalyserNode` to the same node chain as the output. Use `fftSize: 256` or `512` for bar visualizers (not 2048 -- too detailed). Map frequency bins to visual bars with logarithmic scaling (human hearing is logarithmic). |

---

## "Looks Done But Isn't" Checklist

Things that pass a demo but fail in production.

- [ ] **Audio plays** -- but does it play after the tab has been open for 2 hours? (Memory leak check)
- [ ] **Crossfade works** -- but does it work when the tab is in the background? (`setTimeout` is throttled; use `AudioContext.currentTime`)
- [ ] **Upload works** -- but does it work for a 48MB WAV file? (Memory limit check)
- [ ] **Payment goes through** -- but is the tx hash checked for replay? Is the amount verified? Is the recipient verified?
- [ ] **Queue advances** -- but does it advance correctly when zero listeners are connected? (DO alarm vs. client-triggered advance)
- [ ] **Listeners are synced** -- but are they synced after one listener has been connected for 3 hours and another just joined? (Clock drift, seek accuracy)
- [ ] **Visualizer looks great** -- but does it still look great on a $200 Android phone? (GPU/CPU performance)
- [ ] **Tipping works** -- but does the tip actually reach the correct agent wallet? (Verify end-to-end, not just the transaction broadcast)
- [ ] **Track metadata displays** -- but what if the agent submitted empty title/artist? XSS in the title? UTF-8 emoji in the title? Right-to-left text?
- [ ] **Station works with 5 tracks** -- but what about 0 tracks? 1 track? 500 tracks? (Edge cases: empty queue, single-track loop, pagination)
- [ ] **Audio plays on Chrome** -- but does it play on Safari? Firefox? Mobile Chrome? Samsung Internet? (Cross-browser audio behavior varies significantly)
- [ ] **CORS works for API calls** -- but does CORS work for audio fetched by `<audio>` elements with `crossOrigin="anonymous"`? (Different CORS flow for media elements)

---

## Recovery Strategies

When things go wrong in production, here's how to recover.

| Failure Mode | Detection | Immediate Fix | Permanent Fix |
|-------------|-----------|---------------|---------------|
| Queue stuck on one track (corrupted/infinite audio) | Monitor: track playing for > 12 minutes. Listener reports. | Admin endpoint to skip current track. DO alarm as hard timeout (max track duration + 30s buffer). | Pre-validate duration on upload. Client-side hard skip after maxDuration + crossfadeDuration. |
| Memory leak crashes listener tabs after extended play | Error tracking shows tab crashes. Memory monitoring in dev. | Periodic page soft-reload every N tracks (save position, reload, resume). | Fix the leak (double-buffer pattern, proper node disconnection). |
| R2 is unreachable (audio won't load) | Health check endpoint that fetches a known R2 object. | Fall back to a pre-cached "technical difficulties" audio clip stored as a base64 data URI or in the service worker cache. | Audio URLs go through a caching layer (CF Cache, or the browser's native cache via proper `Cache-Control` headers). |
| Rogue agent flooding submissions | Submission rate monitoring. Queue dominated by one wallet. | Manual blocklist for wallet address (store in KV, check on submission). | Automatic rate limiting per wallet. Maximum queue slots per agent (e.g., max 3 tracks in active rotation per wallet). |
| Payment RPC node down (can't verify Base transactions) | Health check to Base RPC. Verification failures spike. | Queue submissions with "pending verification" status. Process when RPC returns. Don't reject valid payments. | Multiple RPC endpoints with fallback (Alchemy, Infura, Coinbase, public Base RPC). Circuit breaker pattern. |
| Clock drift between DO and clients (listeners out of sync) | Listeners hear the same track start at different times. | Client-side NTP-style sync: measure round-trip time to DO, adjust offset. | Include server timestamp in every "now playing" response. Client calculates `offset = serverTime - clientTime` and uses it for all seek calculations. |

---

## Pitfall-to-Phase Mapping

Recommended order of addressing pitfalls, mapped to likely build phases.

| Phase | Topic | Pitfalls to Address | Priority |
|-------|-------|---------------------|----------|
| Phase 1: Audio Core | Browser audio player, crossfade, visualizer | CP-1 (autoplay), CP-5 (memory leaks), equal-power crossfade, `AudioContext.currentTime` scheduling, double-buffer pattern, cross-browser testing | CRITICAL -- everything depends on audio working |
| Phase 1: Upload Pipeline | File upload to R2 via Workers | CP-2 (memory limits), CP-7 (audio bombs), streaming upload, header validation, Content-Type enforcement | CRITICAL -- no tracks = no station |
| Phase 1: Queue Architecture | Shared state, track rotation | CP-3 (race conditions), Durable Object design, decay function isolation, "now playing" cache in KV | CRITICAL -- architectural decision, hard to change later |
| Phase 2: Payment Integration | x402 submission fees | CP-4 (client-side verification), tx hash replay prevention, amount/recipient verification, RPC fallback | CRITICAL for launch -- station is free-for-all without payments |
| Phase 2: Listener Payments | Tipping, purchasing | Embedded wallet mobile compatibility, wallet UX interrupting audio, signed R2 URLs for purchases, payment split (95/5) | HIGH -- monetization, but can launch with submission fees only |
| Phase 2: Sync and Polish | Multi-listener sync, cold starts | CP-6 (DO cold start), clock drift handling, tab backgrounding, SSE/WebSocket push, stale UI recovery | MEDIUM -- improves experience but basic version works without |
| Phase 3: Hardening | Rate limiting, abuse prevention, monitoring | Agent flooding, queue monopolization, admin controls, health checks, recovery procedures, WAV transcoding | HIGH for sustained operation, not needed for initial launch |
| Phase 3: Scale | Performance optimization | Visualizer throttling, preloading, SSE over polling, R2 caching, D1 query optimization | MEDIUM -- matters at 100+ concurrent listeners |

---

## Sources

**Confidence key:**
- HIGH: Well-established browser APIs and patterns documented in MDN, W3C specs
- MEDIUM: Based on training data (cutoff ~May 2025); Cloudflare-specific limits and x402 protocol details should be verified against current documentation
- LOW: Inferred from related domains; needs validation

| Claim | Confidence | Verification Needed |
|-------|------------|---------------------|
| Browser autoplay requires user gesture | HIGH | Stable across all browsers since ~2018 |
| `AudioContext` starts suspended without gesture | HIGH | MDN Web Audio API documentation |
| CF Workers memory limit ~128MB | MEDIUM | Verify at https://developers.cloudflare.com/workers/platform/limits/ |
| R2 supports streaming upload from Workers | MEDIUM | Verify at https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ |
| Durable Objects provide single-threaded execution | MEDIUM | Verify at https://developers.cloudflare.com/durable-objects/ |
| DO alarm API available | MEDIUM | May have changed since training data |
| x402 uses HTTP 402 + payment proof pattern | MEDIUM | Verify against openfacilitator and x402 repos in project context |
| Web Audio `createMediaElementSource` is one-time-only per element | HIGH | MDN documentation, W3C Web Audio spec |
| Equal-power crossfade uses cos/sin curves | HIGH | Standard audio engineering technique |
| D1 has no built-in row-level locking | MEDIUM | Verify D1's current transaction support |
| `setTimeout` throttled in background tabs | HIGH | All major browsers throttle to 1s+ for background tabs |
| Embedded wallet mobile Safari issues | MEDIUM | Depends on specific wallet SDK; test with chosen provider |

---

*Research conducted 2026-01-31. WebSearch and WebFetch were unavailable during this research session. All findings are based on training data and should be verified against current documentation for Cloudflare Workers limits, x402 protocol specifics, and Durable Objects API before architectural decisions are finalized.*
