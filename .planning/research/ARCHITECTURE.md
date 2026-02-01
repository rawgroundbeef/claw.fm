# Architecture Patterns

**Domain:** 24/7 AI-generated music web radio station on Cloudflare Workers
**Researched:** 2026-01-31
**Overall confidence:** HIGH (CF Workers patterns well-understood from x402-storage-api reference; Web Audio API based on training knowledge verified against MDN API surface)

## System Overview

```
                          LISTENERS (Browser)
                               |
                    +----------+-----------+
                    |  React + Vite (Pages) |
                    |                       |
                    |  +--[Audio Engine]--+ |
                    |  | HTMLAudioElement | |    +------------------+
                    |  | Web Audio API    | |    |  R2 (Audio Files)|
                    |  | AnalyserNode    | |<---| /tracks/{id}.mp3 |
                    |  | Crossfade Ctrl  | |    | /art/{id}.png    |
                    |  +-----------------+ |    +------------------+
                    |                       |            ^
                    |  +--[Wallet]-------+ |            |
                    |  | viem (embedded) | |            |
                    |  | localStorage PK | |            |
                    |  +-----------------+ |            |
                    +----------+-----------+            |
                               |                        |
                    REST (poll /api/now-playing)         |
                    POST /api/tip, /api/purchase         |
                               |                        |
                    +----------+-----------+            |
                    | CF Worker (Hono API)  |           |
                    |                       |           |
                    |  +--[Routes]-------+ |           |
                    |  | /api/submit     |--+--------->+
                    |  | /api/now-playing | |
                    |  | /api/queue      | |
                    |  | /api/tracks/:id | |
                    |  | /api/tip        | |
                    |  | /api/purchase   | |
                    |  +-----------------+ |
                    |                       |
                    |  +--[Middleware]----+ |    +------------------+
                    |  | x402 verify     | |    | OpenFacilitator  |
                    |  | x402 settle     |---->| (payment infra)  |
                    |  | rate limit      | |    +------------------+
                    |  +-----------------+ |
                    |                       |
                    |  +--[Services]-----+ |    +------------------+
                    |  | Queue Manager   |----->| D1 (Metadata DB) |
                    |  | Track Manager   | |    | tracks, queue,   |
                    |  | Payment Manager | |    | payments, tips   |
                    |  +-----------------+ |    +------------------+
                    |                       |
                    |  +--[Cron Trigger]-+ |    +------------------+
                    |  | Advance queue   | |    | KV (Fast Cache)  |
                    |  | every 30s       |----->| now_playing JSON |
                    |  +-----------------+ |    | queue_position   |
                    +-----------------------+    +------------------+

  AI AGENTS
      |
      +-- POST /api/submit (multipart: audio + title + optional image)
          Header: PAYMENT-SIGNATURE (0.01 USDC via x402)
          Wallet that pays = artist identity
```

## Component Responsibilities

| Component | Responsibility | Technology | Communicates With |
|-----------|---------------|------------|-------------------|
| **React Frontend** | Audio playback, visualizer, now-playing UI, wallet management, tip/buy flows | React + Vite on CF Pages | API (REST), R2 (audio fetch), viem (payments) |
| **Audio Engine** | Crossfade between tracks, frequency analysis, playback timing | Web Audio API (AudioContext, AnalyserNode, GainNode) | HTMLAudioElement, Frontend UI |
| **Hono API** | Track submission, queue management, now-playing state, payment processing | CF Workers + Hono | D1, R2, KV, OpenFacilitator |
| **x402 Middleware** | Payment verification and settlement for submissions, tips, purchases | @openfacilitator/sdk, @x402/core | OpenFacilitator service |
| **Queue Manager** | Decay-weighted rotation, track ordering, position advancement | Service layer in Worker | D1 (source of truth), KV (cache) |
| **D1 Database** | Tracks metadata, queue state, payment records, artist wallets | Cloudflare D1 (SQLite) | Worker services |
| **R2 Storage** | Audio file storage, cover art storage | Cloudflare R2 | Worker routes (write), Frontend (read via public URL) |
| **KV Cache** | Fast now-playing lookups, queue position cache | Cloudflare KV | Worker cron + routes (write), Worker routes (read) |
| **Cron Trigger** | Advance queue position on schedule, refresh KV cache | CF Workers Cron | D1, KV |
| **OpenFacilitator** | Payment verification and settlement on Base (USDC) | External service | Worker middleware |

## Recommended Project Structure

### API (Cloudflare Worker)

```
api/
├── src/
│   ├── index.ts                 # Hono app entry, route mounting, error handler
│   ├── middleware/
│   │   ├── x402.ts              # x402 payment verification (adapted from x402-storage-api)
│   │   └── rate-limit.ts        # IP + wallet rate limiting
│   ├── routes/
│   │   ├── submit.ts            # POST /api/submit - track submission (x402-gated)
│   │   ├── tracks.ts            # GET /api/tracks/:id - track metadata
│   │   ├── queue.ts             # GET /api/queue - upcoming tracks
│   │   ├── now-playing.ts       # GET /api/now-playing - current track + timing
│   │   ├── tip.ts               # POST /api/tip - listener tips artist
│   │   └── purchase.ts          # POST /api/purchase - listener buys track
│   ├── services/
│   │   ├── queue.ts             # Queue logic: decay rotation, position management
│   │   ├── tracks.ts            # Track CRUD, R2 upload, metadata management
│   │   ├── payments.ts          # Payment splitting (95/5), tip/purchase flows
│   │   └── facilitator.ts       # OpenFacilitator SDK wrapper (from x402-storage-api)
│   ├── cron/
│   │   └── advance-queue.ts     # Cron handler: advance now-playing, update KV
│   ├── types/
│   │   ├── env.ts               # CF Worker bindings (D1, R2, KV, vars)
│   │   └── x402.ts              # x402 protocol types
│   └── utils/
│       ├── errors.ts            # Custom error classes
│       ├── audio.ts             # Audio validation (duration, format, size)
│       └── identicon.ts         # Wallet-based fallback cover art generation
├── migrations/
│   └── 0001_initial.sql         # D1 schema
├── wrangler.toml                # CF Worker config with D1, R2, KV, Cron bindings
├── package.json
└── tsconfig.json
```

### Frontend (Cloudflare Pages)

```
web/
├── src/
│   ├── main.tsx                 # React entry point
│   ├── App.tsx                  # Root component, layout
│   ├── components/
│   │   ├── Player.tsx           # Main player: now-playing display + controls
│   │   ├── Visualizer.tsx       # Frequency bars from AnalyserNode
│   │   ├── NowPlaying.tsx       # Track info: title, artist wallet, cover art
│   │   ├── Queue.tsx            # Upcoming tracks list
│   │   ├── TipButton.tsx        # Tip preset buttons
│   │   ├── BuyButton.tsx        # Purchase/download button
│   │   ├── AgentOnboarding.tsx  # "Get your agent on air" section with prompt
│   │   └── WalletBadge.tsx      # Listener wallet status + balance
│   ├── hooks/
│   │   ├── useAudioEngine.ts    # Audio playback, crossfade, analyser
│   │   ├── useNowPlaying.ts     # Poll /api/now-playing
│   │   ├── useWallet.ts         # Embedded wallet (localStorage PK via viem)
│   │   ├── useTip.ts            # Tip payment flow
│   │   └── usePurchase.ts       # Purchase payment flow
│   ├── lib/
│   │   ├── audio-engine.ts      # AudioContext setup, crossfade logic, analyser
│   │   ├── api.ts               # API client (typed fetch wrappers)
│   │   ├── wallet.ts            # viem wallet creation, localStorage
│   │   └── x402-client.ts       # x402 payment header construction
│   ├── types/
│   │   └── index.ts             # Shared types (Track, NowPlaying, etc.)
│   └── index.css                # Global styles
├── index.html
├── vite.config.ts
├── package.json
└── tsconfig.json
```

### Monorepo Root

```
claw.fm/
├── api/                         # CF Worker (Hono API)
├── web/                         # CF Pages (React + Vite)
├── packages/
│   └── shared/                  # Shared types between api and web
│       ├── src/
│       │   └── types.ts         # Track, NowPlaying, QueueEntry, etc.
│       ├── package.json
│       └── tsconfig.json
├── package.json                 # Workspace root
├── pnpm-workspace.yaml          # pnpm workspace config
├── .planning/                   # GSD planning files
└── wrangler.toml                # Symlink or reference to api/wrangler.toml
```

## Architectural Patterns

### Pattern 1: KV-Cached Queue State (The Core Pattern)

**What:** The fundamental challenge is that CF Workers are stateless -- there is no persistent process to track "what is playing right now." The solution uses D1 as source of truth for queue state, KV as fast read cache, and a Cron Trigger to advance the queue.

**Why this approach:** Durable Objects are the "correct" Cloudflare primitive for stateful coordination, but they add significant complexity (billing per-request + per-wall-clock-time, separate deployment, hibernation semantics). For a radio station where "now playing" changes every 2-5 minutes, a cron-based approach with KV caching is far simpler and sufficient. Durable Objects become relevant only if you need sub-second WebSocket push to many connected clients simultaneously.

**When:** Use this for any "shared global state" in a CF Workers app where state changes infrequently (every 30+ seconds) and eventual consistency of ~1 second is acceptable.

**How it works:**

```
                  CRON (every 30s)                LISTENER REQUEST
                       |                                |
          +------------+------------+      +------------+------------+
          |                         |      |                         |
          v                         |      v                         |
    Read D1: current track          |   Read KV: "now_playing"      |
    Check: has duration elapsed?    |   (< 1ms, globally cached)    |
          |                         |      |                         |
    YES: advance queue position     |   Return JSON:                |
    Write D1: new queue_position    |   { track, startedAt,         |
    Write KV: updated now_playing   |     endsAt, next }            |
          |                         |                                |
    NO: just refresh KV TTL         +--------------------------------+
          |
          v
       (done)
```

**D1 Schema (source of truth):**

```sql
-- The queue state table: only ONE row, ever
CREATE TABLE queue_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- Singleton row
  current_track_id TEXT REFERENCES tracks(id),
  started_at TEXT NOT NULL,                -- ISO timestamp: when track started
  queue_position INTEGER NOT NULL DEFAULT 0
);

-- Tracks table
CREATE TABLE tracks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title TEXT NOT NULL,
  artist_wallet TEXT NOT NULL,             -- Wallet that paid = artist identity
  artist_network TEXT NOT NULL DEFAULT 'evm',
  duration_seconds REAL NOT NULL,          -- Parsed from audio file
  audio_key TEXT NOT NULL,                 -- R2 object key
  art_key TEXT,                            -- R2 object key (nullable, use identicon)
  file_size_bytes INTEGER NOT NULL,
  content_type TEXT NOT NULL,              -- audio/mpeg or audio/wav
  submission_tx TEXT,                      -- x402 payment transaction hash
  play_count INTEGER NOT NULL DEFAULT 0,
  tip_total_usdc TEXT NOT NULL DEFAULT '0',
  purchase_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  weight REAL NOT NULL DEFAULT 1.0         -- Decay weight, decreases over time
);

CREATE INDEX idx_tracks_artist ON tracks(artist_wallet);
CREATE INDEX idx_tracks_weight ON tracks(weight DESC);
CREATE INDEX idx_tracks_created ON tracks(created_at DESC);
```

**KV cache structure:**

```typescript
// KV key: "now_playing"
// Updated by cron every 30 seconds
interface NowPlayingCache {
  track: {
    id: string;
    title: string;
    artistWallet: string;
    duration: number;       // seconds
    audioUrl: string;       // R2 public URL
    artUrl: string | null;  // R2 public URL or null (frontend generates identicon)
  };
  startedAt: string;        // ISO timestamp
  endsAt: string;           // ISO timestamp (startedAt + duration)
  position: number;         // Queue position index
  next: {                   // Preview of next track
    id: string;
    title: string;
    artistWallet: string;
  } | null;
  updatedAt: string;        // When KV was last written
}
```

**Confidence:** HIGH - This is a standard CF Workers pattern. KV global reads are ~1ms from any Cloudflare edge. Cron triggers are reliable. D1 handles queue mutations.

### Pattern 2: Client-Side Synchronized Playback

**What:** Since this is radio (not on-demand streaming), all listeners should be hearing approximately the same part of the same track. But listeners join at different times. The server tells the client "Track X started at time T", and the client seeks to the correct position.

**Why:** True server-side streaming (Icecast/SHOUTcast) requires persistent TCP connections and continuous data push -- impossible on CF Workers. Instead, each browser fetches the full audio file from R2 and syncs playback position based on server-provided timestamps.

**How it works:**

```typescript
// Frontend: useNowPlaying hook
async function syncPlayback(nowPlaying: NowPlayingCache) {
  const now = Date.now();
  const startedAt = new Date(nowPlaying.startedAt).getTime();
  const elapsed = (now - startedAt) / 1000; // seconds into track

  if (elapsed >= nowPlaying.track.duration) {
    // Track should have ended -- re-poll for next track
    return pollNowPlaying();
  }

  // Load audio and seek to correct position
  audio.src = nowPlaying.track.audioUrl;
  await audio.play();
  audio.currentTime = elapsed;
}
```

**Key detail:** Playback will be approximately synchronized across listeners (within a few seconds), not perfectly in sync. This is acceptable for radio. Perfect sync would require a real streaming server.

**Confidence:** HIGH - This is how web-based "simulated radio" works. Spotify's radio modes, YouTube live premieres, and internet radio web players all use variations of this pattern.

### Pattern 3: Dual-GainNode Crossfade

**What:** Smooth audio transitions between tracks using Web Audio API. Two audio sources crossfade using opposing GainNode ramps.

**Why:** Abrupt silence between tracks breaks the radio feel. Crossfade is the expected behavior for continuous playback.

**How it works:**

```
AudioContext
├── Source A (HTMLAudioElement → MediaElementAudioSourceNode)
│   └── GainNode A ─────┐
│                        ├──→ AnalyserNode ──→ destination (speakers)
│   GainNode B ──────────┘
│   └── MediaElementAudioSourceNode
└── Source B (HTMLAudioElement)
```

```typescript
// lib/audio-engine.ts
class AudioEngine {
  private ctx: AudioContext;
  private analyser: AnalyserNode;
  private sources: [AudioSource, AudioSource]; // A and B
  private activeIndex: 0 | 1 = 0;

  constructor() {
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256; // 128 frequency bins for visualizer
    this.analyser.connect(this.ctx.destination);

    // Two audio elements + gain nodes for crossfade
    this.sources = [
      this.createSource(),
      this.createSource(),
    ];
  }

  private createSource(): AudioSource {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous'; // Required for R2 CORS
    const source = this.ctx.createMediaElementSource(audio);
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(this.analyser);
    return { audio, source, gain };
  }

  async crossfadeTo(url: string, seekTo: number, fadeDuration = 3) {
    const next = this.sources[1 - this.activeIndex];
    const current = this.sources[this.activeIndex];

    // Load next track
    next.audio.src = url;
    next.audio.currentTime = seekTo;
    await next.audio.play();

    // Crossfade: current out, next in
    const now = this.ctx.currentTime;
    current.gain.gain.setValueAtTime(1, now);
    current.gain.gain.linearRampToValueAtTime(0, now + fadeDuration);
    next.gain.gain.setValueAtTime(0, now);
    next.gain.gain.linearRampToValueAtTime(1, now + fadeDuration);

    // After fade completes, pause old source
    setTimeout(() => {
      current.audio.pause();
      current.audio.src = '';
    }, fadeDuration * 1000);

    this.activeIndex = (1 - this.activeIndex) as 0 | 1;
  }

  getFrequencyData(): Uint8Array {
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }
}
```

**Critical detail:** `audio.crossOrigin = 'anonymous'` is REQUIRED when connecting HTMLAudioElement to Web Audio API for CORS-enabled R2 URLs. Without it, the AudioContext is tainted and AnalyserNode returns silence. R2 public buckets need CORS headers configured.

**Confidence:** HIGH - Web Audio API crossfade with GainNode.linearRampToValueAtTime is the standard approach. AnalyserNode.getByteFrequencyData is the standard for frequency visualizers.

### Pattern 4: Decay-Weighted Queue Rotation

**What:** Newer tracks are played more frequently. Track weight decays over time, creating natural rotation that keeps the station fresh while still playing older tracks occasionally.

**Why:** Without decay, early submissions dominate forever. With pure FIFO, the queue is just a list that plays through once. Decay rotation is how real radio stations work (new songs get heavy rotation, then taper off).

**How it works:**

```sql
-- Select next track using weighted random selection
-- Weight decays based on age: weight = 1 / (1 + days_since_submission * decay_factor)
-- Higher weight = more likely to be selected
SELECT id, title, duration_seconds, audio_key, art_key, artist_wallet,
       (1.0 / (1.0 + (julianday('now') - julianday(created_at)) * 0.5)) as current_weight
FROM tracks
WHERE id != ?  -- Not the track that just played
ORDER BY current_weight * abs(random() % 1000) / 1000.0 DESC
LIMIT 1;
```

**Decay formula:** `weight = 1 / (1 + age_in_days * decay_factor)`
- A track submitted today has weight ~1.0
- A track submitted yesterday has weight ~0.67
- A track submitted a week ago has weight ~0.22
- Decay factor of 0.5 means weight halves roughly every 2 days

This is computed at selection time (not stored), so no cron needed to update weights. The `weight` column in the schema is reserved for manual boosts or overrides if needed later.

**Confidence:** HIGH - Decay-weighted random selection is a well-known scheduling algorithm.

### Pattern 5: x402 Payment Split Pattern

**What:** Tips and purchases require splitting payment: 95% to artist, 5% to platform. This is handled by making TWO separate x402 payment operations: one to the artist wallet, one to the platform wallet.

**Why:** x402 protocol payments are atomic transfers to a single recipient. There is no built-in split mechanism. The simplest approach is two sequential payments from the listener's wallet.

**How it works (tip flow):**

```
Listener clicks "Tip $0.50"
        |
        v
Frontend constructs TWO x402 payment payloads:
  1. $0.475 to artist_wallet (95%)
  2. $0.025 to platform_wallet (5%)
        |
        v
POST /api/tip
Headers:
  PAYMENT-SIGNATURE: base64(artist_payment_payload)
  X-PLATFORM-PAYMENT: base64(platform_payment_payload)
Body: { trackId, amount }
        |
        v
API middleware:
  1. Verify artist payment (x402 verify)
  2. Verify platform payment (x402 verify)
  3. If both valid: settle both
  4. If either fails: reject, don't settle
        |
        v
Record tip in D1, return success
```

**Alternative approach (simpler for MVP):** Pay 100% to platform wallet, and the platform distributes to artists periodically. This is simpler (one payment per transaction) but requires trust. The split approach is more trustless.

**Recommendation for MVP:** Start with the single-payment-to-platform approach. It is much simpler to implement (one x402 flow per transaction, not two). Add trustless splitting in a later phase. Agents already trust the platform enough to submit tracks.

**Confidence:** MEDIUM - The two-payment split is architecturally sound but untested in the x402 ecosystem specifically. The single-payment approach is proven by x402-storage-api.

## Data Flow: Major Operations

### Flow 1: Track Submission

```
Agent                          API Worker                    R2          D1
  |                                |                         |           |
  |  POST /api/submit              |                         |           |
  |  Content-Type: multipart       |                         |           |
  |  PAYMENT-SIGNATURE: base64     |                         |           |
  |------------------------------->|                         |           |
  |                                |                         |           |
  |                    [x402 middleware]                      |           |
  |                    Verify payment (0.01 USDC)             |           |
  |                                |                         |           |
  |                    [validate audio]                      |           |
  |                    Check: MP3/WAV, <50MB, <10min         |           |
  |                    Parse: duration from audio headers     |           |
  |                                |                         |           |
  |                                |  PUT /tracks/{id}.mp3   |           |
  |                                |------------------------>|           |
  |                                |                         |           |
  |                                |  PUT /art/{id}.png      |           |
  |                                |  (if image provided)    |           |
  |                                |------------------------>|           |
  |                                |                         |           |
  |                    [settle x402 payment]                  |           |
  |                                |                         |           |
  |                                |  INSERT INTO tracks     |           |
  |                                |  INSERT INTO payments   |           |
  |                                |------------------------->           |
  |                                |                         |           |
  |  200 { trackId, title, ... }   |                         |           |
  |<-------------------------------|                         |           |
```

**Audio validation detail:** Duration must be parsed server-side. For MP3, read the first few frames to get bitrate and calculate duration from file size. For WAV, read the RIFF header. Libraries like `music-metadata` work in Node.js but may need adaptation for Workers runtime. Alternatively, store the file first and let the frontend report actual duration on first play (simpler, but means D1 might have inaccurate duration briefly).

**Recommended approach:** Parse duration from audio headers in the Worker. MP3 duration can be estimated from Content-Length and bitrate (first frame header). WAV duration is trivially computed from header (data chunk size / sample rate / channels / bits-per-sample * 8). This avoids needing a heavy parsing library.

### Flow 2: Now-Playing Poll + Playback

```
Listener Browser                 API Worker            KV           R2
  |                                |                   |            |
  |  GET /api/now-playing          |                   |            |
  |------------------------------->|                   |            |
  |                                |  GET "now_playing"|            |
  |                                |------------------>|            |
  |                                |  { track, times } |            |
  |                                |<------------------|            |
  |  200 { track, startedAt,       |                   |            |
  |        endsAt, audioUrl }      |                   |            |
  |<-------------------------------|                   |            |
  |                                                    |            |
  |  [Calculate: elapsed = now - startedAt]            |            |
  |                                                    |            |
  |  GET /tracks/{id}.mp3 (audio URL from response)    |            |
  |------------------------------------------------------->         |
  |  <audio stream>                                    |            |
  |<-------------------------------------------------------         |
  |                                                    |            |
  |  [audio.currentTime = elapsed]                     |            |
  |  [audio.play()]                                    |            |
  |  [Start visualizer from AnalyserNode]              |            |
  |                                                    |            |
  |  ... track plays ...                               |            |
  |                                                    |            |
  |  [Track approaching end: elapsed > duration - 5s]  |            |
  |                                                    |            |
  |  GET /api/now-playing  (re-poll for next track)    |            |
  |------------------------------->|                   |            |
```

**Polling strategy:** Poll `/api/now-playing` on two triggers:
1. **On load:** Initial sync when page opens
2. **Near track end:** When `currentTime > duration - 10s`, poll for what's next
3. **Fallback interval:** Every 30 seconds as a safety net (handles edge cases like browser tab sleeping)

Do NOT poll continuously every second. That wastes bandwidth and KV reads for no benefit.

### Flow 3: Queue Advancement (Cron)

```
Cron Trigger (every 30s)         D1                    KV
  |                               |                     |
  |  SELECT current track +       |                     |
  |  started_at from queue_state  |                     |
  |------------------------------>|                     |
  |  { track, started_at }        |                     |
  |<------------------------------|                     |
  |                               |                     |
  |  [Calculate: has track ended?]|                     |
  |  now > started_at + duration  |                     |
  |                               |                     |
  |  IF YES:                      |                     |
  |    Select next track          |                     |
  |    (decay-weighted random)    |                     |
  |------------------------------>|                     |
  |    { next_track }             |                     |
  |<------------------------------|                     |
  |                               |                     |
  |    UPDATE queue_state SET     |                     |
  |    current_track_id = next,   |                     |
  |    started_at = now,          |                     |
  |    queue_position = pos + 1   |                     |
  |------------------------------>|                     |
  |                               |                     |
  |    UPDATE tracks SET          |                     |
  |    play_count = play_count+1  |                     |
  |    WHERE id = next_track_id   |                     |
  |------------------------------>|                     |
  |                               |                     |
  |  ALWAYS:                      |                     |
  |    PUT "now_playing" = {      |                     |
  |      track, startedAt,        |                     |
  |      endsAt, next }           |                     |
  |---------------------------------------------->      |
  |                               |                     |
```

**Why 30s interval:** Track durations range from 30s to 10min. A 30-second cron ensures the queue advances within 30 seconds of a track ending. This means a brief silence gap of up to 30 seconds between tracks in the worst case. Mitigation: the frontend can pre-fetch the next track and start crossfading before the cron fires, using its own timer.

**Better approach for seamless transitions:** Store `next_track` in the KV cache. The frontend knows when the current track ends (it has `endsAt`). When `endsAt` is within 5 seconds, the frontend fetches the next track's audio from R2 and begins crossfade. The cron then catches up and officially advances the queue. This makes the transition feel instant from the listener's perspective, even though the server-side state lags by up to 30 seconds.

### Flow 4: Tip Payment

```
Listener Browser                 API Worker           OpenFacilitator     D1
  |                                |                        |              |
  |  [Click "Tip $0.50"]          |                        |              |
  |  [Wallet constructs x402      |                        |              |
  |   payment: $0.50 to platform] |                        |              |
  |                                |                        |              |
  |  POST /api/tip                 |                        |              |
  |  PAYMENT-SIGNATURE: base64     |                        |              |
  |  Body: { trackId: "abc" }      |                        |              |
  |------------------------------->|                        |              |
  |                                |                        |              |
  |                    [x402 middleware: verify]             |              |
  |                                |  verify(payload, req)  |              |
  |                                |----------------------->|              |
  |                                |  { isValid: true }     |              |
  |                                |<-----------------------|              |
  |                                |                        |              |
  |                    [Route handler]                      |              |
  |                    Look up track artist_wallet          |              |
  |                                |  SELECT artist_wallet  |              |
  |                                |  FROM tracks           |              |
  |                                |---------------------------------------->
  |                                |  { artist_wallet }     |              |
  |                                |<----------------------------------------
  |                                |                        |              |
  |                    [Settle payment to platform]         |              |
  |                                |  settle(payload, req)  |              |
  |                                |----------------------->|              |
  |                                |  { success, tx }       |              |
  |                                |<-----------------------|              |
  |                                |                        |              |
  |                    [Record tip: track, amount, payer]   |              |
  |                                |  INSERT INTO tips      |              |
  |                                |---------------------------------------->
  |                                |                        |              |
  |                    [Calculate artist payout: 95%]       |              |
  |                    [Queue payout to artist wallet]      |              |
  |                                |  INSERT INTO payouts   |              |
  |                                |---------------------------------------->
  |                                |                        |              |
  |  200 { success, tx, ... }      |                        |              |
  |<-------------------------------|                        |              |
```

**MVP simplification:** For MVP, all payments go to the platform wallet. Artist payouts are tracked in D1 and distributed via a separate payout mechanism (manual or cron-triggered batch). This avoids the complexity of dual x402 payments.

### Flow 5: Track Purchase/Download

Same flow as tipping, but:
- Fixed price (e.g., $1.00) instead of preset tip amounts
- On success, return a signed R2 URL for the full-quality audio download
- Record purchase in D1 with buyer wallet

```typescript
// Generate time-limited download URL after purchase
const downloadUrl = await env.AUDIO_BUCKET.createSignedUrl(track.audio_key, {
  expiresIn: 3600, // 1 hour
});
```

**Note:** R2 signed URLs require using the S3-compatible API or the newer R2 binding method. For public audio playback, use R2 custom domain (public bucket). For purchased downloads, use signed URLs with expiry.

## Queue State: How It Works Without a Persistent Process

This is the most critical architectural decision. Here is the full picture.

### The Problem

CF Workers are request-driven. No persistent process runs between requests. You cannot have a "while(true) { play next track }" loop. Yet the radio station needs a globally shared concept of "what is playing right now."

### The Solution: Server-Authoritative Time-Based State

The queue state is purely a function of timestamps and database state. At any point in time, the "now playing" can be derived from:

1. `queue_state.current_track_id` -- which track
2. `queue_state.started_at` -- when it started
3. `tracks.duration_seconds` -- how long it lasts

**Is the track still playing?** `now < started_at + duration_seconds`
**How far in?** `elapsed = now - started_at`
**When does it end?** `endsAt = started_at + duration_seconds`

The cron trigger's only job is to check if the current track has ended and, if so, select the next one. This is idempotent -- running the cron multiple times for the same track-end produces the same result.

### What If the Cron Misses?

If the cron doesn't fire (extremely rare on Cloudflare), the frontend detects that `now > endsAt` and re-polls. The next API request or cron trigger will advance the queue. The station has a brief gap, but recovers automatically.

### What About Empty Queue?

When no tracks exist yet:

```typescript
// GET /api/now-playing when queue is empty
if (!queueState || !queueState.current_track_id) {
  return c.json({
    status: 'waiting',
    message: 'Waiting for the first track. Get your agent on air!',
    track: null,
    startedAt: null,
    endsAt: null,
  });
}
```

The frontend shows the "waiting for first track" state with the agent onboarding prompt.

### What About First Track Submitted?

When the first track is submitted and the queue is empty, the submit handler also initializes the queue:

```typescript
// In submit route, after storing track
const queueState = await db.prepare('SELECT * FROM queue_state WHERE id = 1').first();
if (!queueState) {
  // First track ever -- start playing immediately
  await db.prepare(
    `INSERT INTO queue_state (id, current_track_id, started_at, queue_position)
     VALUES (1, ?, datetime('now'), 0)`
  ).bind(trackId).run();

  // Update KV immediately (don't wait for cron)
  await env.KV.put('now_playing', JSON.stringify(buildNowPlaying(track)));
}
```

## Durable Objects vs Polling: Analysis

| Criterion | Polling + KV + Cron | Durable Objects + WebSocket |
|-----------|--------------------|-----------------------------|
| Complexity | LOW - standard CF primitives | HIGH - new primitive, hibernation, billing |
| Latency (state change) | ~30s worst case | ~instant (WebSocket push) |
| Latency (read) | ~1ms (KV global cache) | ~50ms (DO in single region) |
| Cost | KV reads: $0.50/M, Cron: free | DO: $0.15/M requests + $0.005/wall-clock-hour |
| Global distribution | YES (KV replicated globally) | NO (DO runs in one region, requires stub routing) |
| Failure mode | Graceful (stale KV, frontend retries) | Connection drops, reconnect logic needed |
| Build time | Hours | Days |

**Recommendation:** Use Polling + KV + Cron for MVP. The 30-second worst-case latency for queue advancement is invisible to users because the frontend handles transitions client-side using timestamps. Add Durable Objects later only if you need real-time features (chat, live listener count, instant notifications).

**The key insight:** The frontend already knows when the track ends (it has the duration). It does not need the server to tell it in real time. The server just needs to have the next track ready when the frontend asks.

## R2 Configuration

### Audio Delivery

Use an **R2 custom domain** (public bucket) for audio delivery. This provides:
- Global CDN caching via Cloudflare
- No signed URLs needed for playback (simpler)
- Standard HTTP range requests (audio seeking works)
- CORS headers configured at the bucket level

```toml
# wrangler.toml
[[r2_buckets]]
binding = "AUDIO_BUCKET"
bucket_name = "claw-fm-audio"
# Public access via custom domain: audio.claw.fm
```

**CORS configuration** (required for Web Audio API AnalyserNode):

```json
{
  "AllowedOrigins": ["https://claw.fm", "http://localhost:5173"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["Content-Length", "Content-Range"],
  "MaxAgeSeconds": 86400
}
```

**URL pattern:**
- Playback: `https://audio.claw.fm/tracks/{id}.mp3`
- Cover art: `https://audio.claw.fm/art/{id}.png`

### Signed URLs for Purchases

For purchased downloads, use the R2 binding's `createPresignedUrl` (S3-compatible) or serve through the Worker with auth:

```typescript
// Worker route: GET /api/download/:trackId
// Verify purchase in D1 first, then proxy from R2
const object = await env.AUDIO_BUCKET.get(`tracks/${trackId}.mp3`);
return new Response(object.body, {
  headers: {
    'Content-Type': 'audio/mpeg',
    'Content-Disposition': `attachment; filename="${track.title}.mp3"`,
  },
});
```

## Scaling Considerations

| Concern | At 10 Listeners | At 1K Listeners | At 100K Listeners |
|---------|-----------------|-----------------|-------------------|
| Audio delivery | R2 public URL, CF CDN handles | Same -- CDN cached globally | Same -- CF CDN scales automatically |
| Now-playing reads | KV: negligible | KV: ~30 reads/min (poll) | KV: ~3K reads/min -- still cheap ($0.50/M) |
| Queue advancement | Cron every 30s, 1 D1 write | Same -- single cron, single write | Same -- queue state is singleton |
| Submissions | Rare (agents submit infrequently) | ~10/hour, D1 handles easily | ~100/hour, still trivial for D1 |
| Tips/purchases | Rare at first | ~50/hour, D1 + facilitator handle fine | Facilitator becomes bottleneck (~5K/hour) |
| Frontend bundle | ~200KB gzipped | Same | Same -- CF Pages CDN |
| R2 storage | ~1GB (100 tracks) | ~10GB (1000 tracks) | ~100GB -- R2 pricing: $0.015/GB/month |

**Bottleneck analysis:**
- At scale, the OpenFacilitator is the first bottleneck (external service, blockchain settlement latency)
- D1 handles millions of reads/day easily; writes are limited to submissions + tips (low volume)
- KV is designed for millions of reads/second globally
- R2 + CF CDN handles audio delivery with zero concern

**When to consider Durable Objects:** Only if you add features that need real-time push: live listener count displayed to all users, real-time chat, instant tip notifications to all listeners. The core radio playback never needs it.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Server-Side Audio Streaming

**What:** Trying to implement an Icecast/SHOUTcast-style server that streams audio data continuously to clients.

**Why bad:** CF Workers cannot maintain persistent TCP connections. Each request has a ~30s execution time limit (up to 6 minutes with paid plan). Streaming audio requires a persistent connection pushing data for minutes.

**Instead:** Client-side playback with R2 public URLs. The browser downloads the full audio file and plays it locally. Server just provides metadata and timing.

### Anti-Pattern 2: WebSocket for Now-Playing

**What:** Using Durable Objects + WebSocket to push "now playing" updates to all connected clients.

**Why bad for MVP:** Massively overengineered. Queue changes every 2-10 minutes. A simple polling endpoint with KV caching is simpler, cheaper, more reliable, and globally distributed. WebSockets through Durable Objects pin to a single region.

**Instead:** Poll `/api/now-playing` when the frontend needs it (on load, near track end, every 30s fallback). KV reads are <1ms globally.

### Anti-Pattern 3: Storing Queue Order in a List

**What:** Maintaining an ordered array/list of track IDs as "the queue" and shuffling/reordering it.

**Why bad:** Creates complex state management, race conditions on concurrent writes, and makes decay-based rotation difficult. A list implies a fixed order that must be maintained.

**Instead:** Stateless selection at advancement time. When the cron needs the next track, it runs a single SQL query with decay-weighted random selection. No queue list to maintain. The "queue" is virtual -- it is the set of all tracks ordered by their current weight.

### Anti-Pattern 4: Parsing Full Audio in Worker

**What:** Using a full audio parsing library (like `music-metadata`) to extract duration, bitrate, ID3 tags from uploaded audio in the Worker.

**Why bad:** These libraries often depend on Node.js APIs not available in Workers runtime. Large dependency size. Complex error handling for malformed files.

**Instead:** Parse minimal headers only. For MP3: read first frame header (4 bytes at known offset) to get bitrate, calculate duration from file size. For WAV: read RIFF header (44 bytes) to get sample rate, channels, bits per sample, data chunk size. These are trivial to implement without dependencies. Alternatively, require the submitting agent to declare duration, and verify on first play.

### Anti-Pattern 5: Two x402 Payments Per Tip

**What:** Requiring the listener to sign two separate x402 payments (one to artist, one to platform) for every tip.

**Why bad for MVP:** Doubles the payment complexity, doubles facilitator calls, doubles the chance of partial failure (one settles, one doesn't). Client must construct two payment payloads.

**Instead:** For MVP, single payment to platform. Track artist payouts in D1. Distribute via batch payout mechanism later. Upgrade to direct split when the payment flow is proven.

## Integration Points

### x402 Payment Integration

Adapt directly from x402-storage-api patterns. Key files to port:

| x402-storage-api | claw.fm equivalent | Changes needed |
|------------------|--------------------|----------------|
| `middleware/x402.ts` | `middleware/x402.ts` | Change `calculateAmount` to return fixed 0.01 USDC for submissions |
| `services/facilitator.ts` | `services/facilitator.ts` | Direct copy, already generic |
| `types/x402.ts` | `types/x402.ts` | Direct copy |
| `middleware/rate-limit.ts` | `middleware/rate-limit.ts` | Adjust limits for radio station use |

**Submission pricing:** Fixed 0.01 USDC = `10000n` in atomic units (USDC has 6 decimals).

**Tip pricing:** Preset amounts: $0.25, $0.50, $1.00, $5.00. Use `requirePayment` middleware with dynamic amount from request body.

**Purchase pricing:** Fixed price per track (e.g., $1.00). Stored in track metadata or global config.

### R2 Integration

```typescript
// In env.ts
interface Env {
  DB: D1Database;
  AUDIO_BUCKET: R2Bucket;
  KV: KVNamespace;
  RATE_LIMIT_KV: KVNamespace;
  FACILITATOR_URL: string;
  EVM_PAY_TO_ADDRESS: string;
}

// In submit route
const audioKey = `tracks/${trackId}.mp3`;
await env.AUDIO_BUCKET.put(audioKey, audioBuffer, {
  httpMetadata: { contentType: 'audio/mpeg' },
});

// Public URL via custom domain
const audioUrl = `https://audio.claw.fm/${audioKey}`;
```

### Embedded Wallet Integration

Port from x402.storage web patterns:

```typescript
// lib/wallet.ts
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

interface WalletData {
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

function getOrCreateWallet(): WalletData {
  const stored = localStorage.getItem('claw_wallet');
  if (stored) return JSON.parse(stored);

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const wallet = { privateKey, address: account.address };
  localStorage.setItem('claw_wallet', JSON.stringify(wallet));
  return wallet;
}
```

**Lazy creation:** Same pattern as x402.storage -- don't create wallet until listener wants to tip/buy. Music plays without a wallet.

## Suggested Build Order

Based on component dependencies:

```
Phase 1: Foundation
  ├── API scaffolding (Hono + wrangler.toml + D1 schema)
  ├── R2 bucket setup with public domain
  └── Basic types (shared package)
       │
Phase 2: Submission Pipeline
  ├── POST /api/submit (multipart handler)
  ├── x402 middleware (port from x402-storage-api)
  ├── Audio validation (format, size, duration parsing)
  ├── R2 upload (audio + optional art)
  └── D1 track record creation
       │ (depends on: Phase 1)
       │
Phase 3: Queue + Now-Playing
  ├── Queue state initialization (singleton row)
  ├── Decay-weighted track selection query
  ├── Cron trigger: advance queue
  ├── KV cache: write now_playing
  ├── GET /api/now-playing (read KV)
  └── GET /api/queue (upcoming tracks preview)
       │ (depends on: Phase 2 -- needs tracks in DB)
       │
Phase 4: Frontend Player
  ├── React app scaffolding (Vite + CF Pages)
  ├── Audio engine (AudioContext, crossfade, analyser)
  ├── Visualizer component (frequency bars from AnalyserNode)
  ├── Now-playing display (poll API, show track info)
  ├── Playback sync (seek to correct position on load)
  └── Empty queue state UI
       │ (depends on: Phase 3 -- needs now-playing API)
       │
Phase 5: Payments
  ├── Embedded wallet (viem, localStorage)
  ├── Tip flow (preset amounts, x402 to platform)
  ├── Purchase flow (fixed price, x402 to platform)
  ├── Payment recording in D1
  └── Artist payout tracking
       │ (depends on: Phase 4 -- needs frontend + API)
       │
Phase 6: Polish
  ├── Agent onboarding section (copy-paste prompt)
  ├── Fallback identicon cover art
  ├── Error states and loading states
  ├── Rate limiting tuning
  └── Mobile responsiveness
```

**Critical path:** Phase 1 -> Phase 2 -> Phase 3 -> Phase 4. These must be sequential. Phase 5 can partially overlap with Phase 4 (API payment routes while frontend is being built). Phase 6 is independent polish.

## Sources

**HIGH confidence (direct code reference):**
- x402-storage-api codebase: `/Users/rawgroundbeef/Projects/x402-storage-api/` -- x402 middleware patterns, Hono structure, D1 schema patterns, wrangler.toml configuration, facilitator service wrapper
- x402.storage web codebase: `/Users/rawgroundbeef/Projects/x402.storage/packages/web/` -- embedded wallet pattern, upload hooks, funding flow
- x402 protocol types: `/Users/rawgroundbeef/Projects/x402-storage-api/src/types/x402.ts` -- payment payload structures, network constants

**HIGH confidence (well-established APIs):**
- Web Audio API: AudioContext, AnalyserNode, GainNode, MediaElementAudioSourceNode -- standard browser APIs, stable for years
- Cloudflare Workers: KV, D1, R2, Cron Triggers -- core CF primitives, well-documented
- HTMLAudioElement: crossOrigin, currentTime, seeking -- standard HTML5

**MEDIUM confidence (architectural patterns from training knowledge):**
- Decay-weighted random selection algorithm -- standard scheduling technique, formula may need tuning
- Dual-GainNode crossfade pattern -- well-known Web Audio pattern, implementation details may vary
- Client-side playback sync via timestamps -- common pattern for "simulated radio" web apps

**LOW confidence (needs validation during implementation):**
- MP3 duration parsing from frame headers in Workers runtime -- may need testing with edge cases (VBR files)
- R2 custom domain CORS configuration for Web Audio API -- specific CORS headers need testing
- Two-payment x402 split for tips -- untested in this ecosystem, MVP should use single payment
