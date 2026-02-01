# Phase 3: Queue + Now-Playing - Research

**Researched:** 2026-02-01
**Domain:** Cloudflare Durable Objects for queue state management, decay-weighted track rotation algorithms, KV caching for read-heavy now-playing endpoints, and alarm-based precise track advancement
**Confidence:** HIGH

## Summary

This research investigated building a cron-driven queue system using Cloudflare Durable Objects with decay-weighted rotation for track selection, automatic advancement via alarms, and cached now-playing state. The system must select tracks using a weighted algorithm that favors newer and tipped tracks while maintaining diversity, advance automatically when tracks end, support single-track looping, and expose current/upcoming tracks via fast read APIs.

The standard approach uses **Durable Objects as the single source of truth** for queue state (current track, start time, selection history), **Durable Object alarms for precise advancement** (millisecond-accurate scheduling), **SQLite storage within Durable Objects** for persistent state and anti-repeat tracking, **exponential decay weighting** for track selection (gentle curve with configurable half-life), **KV for caching now-playing responses** (60-second TTL for global fast reads), and **cumulative weights method for weighted random selection** (O(n) build, O(log n) selection with binary search).

The architecture coordinates three concerns: (1) **Queue Brain Durable Object** handles state, selection, advancement logic, (2) **KV Cache Layer** serves high-volume reads without hitting Durable Object, (3) **API Routes** proxy requests to Durable Object or cache. This separation enables the queue to make decisions independently while serving thousands of concurrent listeners efficiently.

**Primary recommendation:** Use one global Durable Object for queue coordination (not per-user instances), schedule alarms for exact track end times (not cron polling every minute), cache now-playing state in KV with 60-second TTL (invalidate on track change), implement exponential decay with half-life of 7-14 days for gentle rotation curve, use anti-repeat tracking stored in Durable Object SQLite storage, pre-select next track 10 seconds before current ends (enables crossfade buffering).

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Durable Objects | Built-in | Queue state coordination, single source of truth | Cloudflare native, single-threaded consistency, SQLite storage, alarms API |
| Workers KV | Built-in | Now-playing cache layer for fast reads | Global edge cache, optimized for read-heavy workloads, eventual consistency acceptable here |
| Durable Objects Alarms | Built-in | Schedule track advancement at exact times | Millisecond precision, at-least-once execution guarantee, survives failures |
| SQLite (DO Storage) | Built-in | Anti-repeat history, play counts, queue state | Relational queries, indexes, ACID transactions, automatic serialization |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Durable Objects RPC | Built-in | Type-safe communication between Worker and DO | Hono routes calling DO methods with full TypeScript types |
| WebSockets (Hibernatable) | Built-in | Real-time now-playing updates to clients | Optional enhancement for live listeners (Phase 4+) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Durable Object alarms | Cron Triggers (1-minute minimum) | Cron can't schedule seconds-precise advancement, would cause gaps or overlap |
| Single global DO | Per-user DO instances | Station is shared for ALL listeners - one global queue, not per-user |
| KV cache | Direct DO reads | DO would become bottleneck under high read volume (1000s of listeners polling) |
| Exponential decay | Linear decay or pure random | Exponential provides gentle curve; linear feels too aggressive, random ignores recency |
| SQLite in DO | D1 database | D1 is eventual consistency, need ACID for anti-repeat logic; DO SQLite is local and immediate |

**Installation:**
```bash
# No npm packages needed - all Cloudflare native features
# Configure in wrangler.toml
```

## Architecture Patterns

### Recommended Project Structure
```
api/src/
├── durable-objects/
│   ├── QueueBrain.ts          # Durable Object: queue state + selection logic
│   └── types.ts                # DO-specific types (selection weights, history)
├── routes/
│   ├── now-playing.ts          # GET /api/now-playing (KV cache → DO fallback)
│   ├── queue.ts                # GET /api/queue (calls DO, optionally cached)
│   └── submit.ts               # POST /api/submit (existing, trigger immediate start)
├── lib/
│   ├── rotation.ts             # Weighted selection + decay calculation
│   ├── kv-cache.ts             # KV read/write/invalidate helpers
│   └── queue-client.ts         # Type-safe DO stub calls from routes
└── index.ts                    # Hono app + DO exports
```

### Pattern 1: Durable Object as Queue Coordinator
**What:** Single global Durable Object instance manages all queue state (current track, next track, history, alarms)
**When to use:** When you need single-threaded consistency for queue operations (one source of truth)
**Example:**
```typescript
// Source: Cloudflare Durable Objects best practices
// https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/

export class QueueBrain {
  state: DurableObjectState;
  storage: DurableObjectStorage; // SQLite-backed

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.storage = state.storage;

    // Initialize schema on first run
    state.blockConcurrencyWhile(async () => {
      await this.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS queue_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS play_history (
          track_id INTEGER NOT NULL,
          played_at INTEGER NOT NULL,
          PRIMARY KEY (track_id, played_at)
        );
        CREATE INDEX IF NOT EXISTS idx_history_time
          ON play_history(played_at DESC);
      `);
    });
  }

  async getCurrentTrack() {
    // Return current track + start timestamp
    const result = await this.storage.sql.exec(
      "SELECT value FROM queue_state WHERE key = 'current_track'"
    );
    return result.rows[0] ? JSON.parse(result.rows[0].value) : null;
  }

  async selectNextTrack() {
    // Fetch all tracks from D1, apply decay weights, random select
    // (implementation in Pattern 2)
  }

  async advance() {
    // Move next → current, select new next, schedule alarm, invalidate cache
    // (implementation in Pattern 3)
  }

  async alarm() {
    // Called when track ends - advance queue
    await this.advance();
  }
}
```

### Pattern 2: Exponential Decay Weighted Selection
**What:** Calculate track weights using exponential decay based on age and tip weight, then select randomly
**When to use:** Queue rotation that favors new/tipped tracks but keeps older tracks in rotation
**Example:**
```typescript
// Source: Exponential decay formula (academic/industry standard)
// https://en.wikipedia.org/wiki/Exponential_decay
// Forward Decay paper: https://dimacs.rutgers.edu/~graham/pubs/papers/fwddecay.pdf

interface Track {
  id: number;
  created_at: number; // UNIX timestamp
  tip_weight: number; // Total tips in wei/ETH
  wallet: string;
  play_count: number;
}

interface WeightedTrack extends Track {
  weight: number;
}

const HALF_LIFE_DAYS = 10; // Gentle decay: 10-day half-life
const HALF_LIFE_MS = HALF_LIFE_DAYS * 24 * 60 * 60 * 1000;
const DECAY_CONSTANT = Math.log(2) / HALF_LIFE_MS;

function calculateDecayWeight(track: Track, now: number): number {
  // Exponential decay: weight = e^(-λt)
  // Where λ = ln(2) / half_life
  const ageMs = now - track.created_at;
  const ageDecay = Math.exp(-DECAY_CONSTANT * ageMs);

  // Tip boost: normalized tip weight (e.g., 0.1 ETH = 10% boost)
  // Adjust scale based on expected tip amounts
  const tipBoost = 1 + (track.tip_weight / 1e17); // 0.1 ETH = 2x weight

  // Combined weight
  return ageDecay * tipBoost;
}

async function selectTrackWeighted(
  tracks: Track[],
  recentTrackIds: Set<number>,
  recentWallets: Set<string>
): Promise<Track> {
  const now = Date.now();

  // Filter out recently played tracks (anti-repeat)
  const eligible = tracks.filter(t =>
    !recentTrackIds.has(t.id) && !recentWallets.has(t.wallet)
  );

  // If catalog too small, ignore anti-repeat
  const candidates = eligible.length < 5 ? tracks : eligible;

  // Calculate weights
  const weighted: WeightedTrack[] = candidates.map(track => ({
    ...track,
    weight: calculateDecayWeight(track, now)
  }));

  // Cumulative weights method (efficient for repeated selection)
  // Source: https://www.geeksforgeeks.org/random-weighted-selection/
  const cumulative = weighted.reduce((acc, track, i) => {
    acc.push((acc[i - 1] || 0) + track.weight);
    return acc;
  }, [] as number[]);

  const totalWeight = cumulative[cumulative.length - 1];
  const random = Math.random() * totalWeight;

  // Binary search for selected track (O(log n))
  let left = 0, right = cumulative.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (cumulative[mid] < random) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return weighted[left];
}
```

### Pattern 3: Alarm-Based Precise Advancement
**What:** Schedule Durable Object alarm for exact moment current track ends, not polling-based
**When to use:** When you need precise timing (e.g., 3:42 track = alarm in 222 seconds)
**Example:**
```typescript
// Source: Durable Objects Alarms API
// https://developers.cloudflare.com/durable-objects/api/alarms/

async function startTrack(track: Track, env: Env) {
  const startTime = Date.now();
  const endTime = startTime + (track.duration * 1000); // duration in seconds

  // Store current track state
  await this.storage.sql.exec(
    `INSERT OR REPLACE INTO queue_state (key, value) VALUES (?, ?)`,
    'current_track',
    JSON.stringify({ trackId: track.id, startTime, endTime })
  );

  // Pre-select next track (enables client pre-buffering)
  const nextTrack = await this.selectNextTrack();
  await this.storage.sql.exec(
    `INSERT OR REPLACE INTO queue_state (key, value) VALUES (?, ?)`,
    'next_track',
    JSON.stringify(nextTrack)
  );

  // Schedule alarm for exactly when track ends
  await this.state.storage.setAlarm(endTime);

  // Invalidate KV cache (now-playing changed)
  await env.KV.delete('now-playing');

  // Optional: Schedule pre-buffer alarm 10s before end
  // (Would need separate alarm management - see Don't Hand-Roll section)
}

async function alarm() {
  // Called at scheduled time (track end)
  // Guaranteed at-least-once execution with automatic retry

  const current = await this.getCurrentTrack();
  if (!current) return; // Edge case: empty queue

  // Record play in history (for anti-repeat)
  await this.storage.sql.exec(
    `INSERT INTO play_history (track_id, played_at) VALUES (?, ?)`,
    current.trackId,
    Date.now()
  );

  // Advance: next → current
  const nextTrack = await this.getNextTrack();
  if (nextTrack) {
    await this.startTrack(nextTrack, this.env);
  } else {
    // Edge case: last track finished, loop first track
    const tracks = await this.fetchAllTracks();
    if (tracks.length > 0) {
      await this.startTrack(tracks[0], this.env);
    }
  }
}
```

### Pattern 4: KV Cache with Write-Through Invalidation
**What:** Cache now-playing state in KV for fast global reads, invalidate on track change
**When to use:** Read-heavy endpoints (thousands of listeners polling /now-playing)
**Example:**
```typescript
// Source: KV caching patterns
// https://developers.cloudflare.com/kv/examples/cache-data-with-workers-kv/

// In API route handler
app.get('/api/now-playing', async (c) => {
  // Try KV cache first (fast global read)
  const cached = await c.env.KV.get('now-playing', 'json');
  if (cached) {
    return c.json(cached);
  }

  // Cache miss: fetch from Durable Object (authoritative)
  const queueId = c.env.QUEUE_BRAIN.idFromName('global-queue');
  const queueStub = c.env.QUEUE_BRAIN.get(queueId);
  const current = await queueStub.getCurrentTrack();

  if (!current) {
    // Empty queue state
    const emptyState = {
      state: 'waiting',
      message: 'Waiting for first track'
    };
    // Short cache (1 second) - might get track soon
    await c.env.KV.put('now-playing', JSON.stringify(emptyState), {
      expirationTtl: 1
    });
    return c.json(emptyState);
  }

  // Fetch full track metadata from D1
  const track = await c.env.DB
    .prepare('SELECT * FROM tracks WHERE id = ?')
    .bind(current.trackId)
    .first();

  const response = {
    state: 'playing',
    track: {
      id: track.id,
      title: track.title,
      artist: track.artist_name || track.wallet.slice(0, 8),
      duration: track.duration,
      coverUrl: track.cover_url,
      fileUrl: track.file_url
    },
    startedAt: current.startTime,
    endsAt: current.endTime
  };

  // Cache until track ends (or max 60s)
  const ttl = Math.min(
    Math.floor((current.endTime - Date.now()) / 1000),
    60
  );

  await c.env.KV.put('now-playing', JSON.stringify(response), {
    expirationTtl: ttl
  });

  return c.json(response);
});

// In Durable Object (when track changes)
async function invalidateCache(env: Env) {
  await env.KV.delete('now-playing');
}
```

### Pattern 5: Immediate Start on First Submission
**What:** When queue is empty and first track submitted, start playing immediately (don't wait for cron)
**When to use:** Bootstrap case - station goes from 0 → 1 tracks
**Example:**
```typescript
// In POST /api/submit handler (existing route)
// After track is successfully saved to D1...

const trackCount = await c.env.DB
  .prepare('SELECT COUNT(*) as count FROM tracks')
  .first();

if (trackCount.count === 1) {
  // This is the first track - start immediately
  const queueId = c.env.QUEUE_BRAIN.idFromName('global-queue');
  const queueStub = c.env.QUEUE_BRAIN.get(queueId);
  await queueStub.startImmediately(newTrackId);
}

// In Durable Object
async startImmediately(trackId: number) {
  const track = await this.fetchTrack(trackId);
  await this.startTrack(track, this.env);
}
```

### Anti-Patterns to Avoid

- **Polling with Cron Triggers:** Cron minimum interval is 1 minute. For 3:42 track, you'd check "is track done?" every minute, causing 18-second average delay. Use alarms for exact timing.
- **Per-User Durable Objects:** Station has ONE global queue for all listeners. Creating DO per user/session wastes resources and fragments state.
- **No KV Cache:** Hitting Durable Object for every /now-playing request (1000s/min) creates bottleneck. DO is single-threaded - cache reads.
- **Awaiting During Selection:** Don't fetch track metadata during weighted selection. Select by ID first (fast), then fetch details after.
- **Forgetting Empty State:** When no tracks exist, /now-playing must return valid JSON (not 404). Client needs to distinguish "waiting" from "error".

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multiple concurrent alarms per DO | Custom alarm queue manager | Store events in SQLite, reschedule single alarm for nearest event | DOs support exactly one alarm; managing multiple requires storage-backed event queue pattern (Cloudflare's official approach) |
| WebSocket broadcast to all listeners | Manual connection tracking + loops | Hibernatable WebSockets API with `getWebSockets()` | Hibernation saves memory/cost, official API handles reconnection, 2KB state attachment per socket |
| Binary search for weighted selection | Hand-rolled binary search | Use standard algorithm or library (if available) | Off-by-one errors common, edge cases tricky (equal weights, single item) |
| Track metadata caching | Custom in-memory Map | DO SQLite storage for persistent data | In-memory state lost on eviction/crash; SQLite provides durability + queries |
| Queue locking for concurrent requests | Manual mutex/semaphore | Durable Objects input/output gates | DO automatically serializes requests; manual locking causes deadlocks |

**Key insight:** Durable Objects provide single-threaded execution guarantees and SQLite storage. Don't fight the platform - use one alarm + storage-backed scheduling, leverage automatic request serialization, and cache read-heavy data in KV (not in-memory).

## Common Pitfalls

### Pitfall 1: Alarm Timing Drift
**What goes wrong:** Track durations from MP3 headers (Phase 2) might be slightly inaccurate (off by 100-500ms), causing alarms to fire early/late
**Why it happens:** MP3 duration calculation from headers is estimate; actual decode time may vary
**How to avoid:** Accept minor drift (< 1 second acceptable for radio). If precise sync needed, send `startedAt` timestamp with response and let client calculate position.
**Warning signs:** Users report tracks cutting off early or gaps between tracks

### Pitfall 2: Empty Queue Infinite Loop
**What goes wrong:** When last track finishes and selectNextTrack() returns null, alarm handler doesn't reschedule, queue stops
**Why it happens:** Edge case not handled - "what if we run out of tracks?"
**How to avoid:** Always loop back to first track if queue exhausts. Station never goes silent (per requirements).
**Warning signs:** Queue stops advancing after X plays in low-traffic testing

### Pitfall 3: KV Cache Stale Reads
**What goes wrong:** Track changes in DO, but KV cache not invalidated, clients see old track for up to 60s
**Why it happens:** Forgot to call `KV.delete('now-playing')` in startTrack() or advance()
**How to avoid:** Treat KV invalidation as critical step in every state-changing DO method. Add verification in tests.
**Warning signs:** Now-playing UI shows wrong track, fixes itself after delay

### Pitfall 4: Anti-Repeat Too Aggressive
**What goes wrong:** With 5 tracks and anti-repeat=10, no eligible tracks ever selected, queue fails
**Why it happens:** Anti-repeat window larger than catalog size
**How to avoid:** Disable anti-repeat entirely when `catalog_size < anti_repeat_threshold` (e.g., < 5 tracks). Use pure weighted selection for small catalogs.
**Warning signs:** Selection fails with "no eligible tracks" error in logs

### Pitfall 5: DO State Not Persisted
**What goes wrong:** Current track stored only in class property (`this.currentTrack`), DO evicted from memory, state lost
**Why it happens:** Misunderstanding DO memory model - in-memory state is NOT durable
**How to avoid:** ALWAYS persist critical state to `this.storage.sql`. Use in-memory caching as performance optimization only.
**Warning signs:** Queue resets to empty after inactivity period (DO eviction)

### Pitfall 6: Race Condition on First Track
**What goes wrong:** Two tracks submitted simultaneously, both trigger startImmediately(), race condition
**Why it happens:** Submit handler checks `count === 1` outside of DO transaction
**How to avoid:** Make startImmediately() idempotent - check if already playing before starting. OR move count check inside DO.
**Warning signs:** Two tracks start simultaneously, alarms conflict

### Pitfall 7: Forgetting Alarm Retry Logic
**What goes wrong:** alarm() handler throws error (e.g., D1 timeout), alarm not rescheduled, queue stuck
**Why it happens:** Not understanding alarm retry behavior - retries happen, but eventually give up
**How to avoid:** Make alarm() handler robust with try/catch, fallback logic. Test failure scenarios. Alarms retry up to 6 times with exponential backoff.
**Warning signs:** Queue stops advancing after intermittent errors

## Code Examples

Verified patterns from official sources:

### Durable Object Setup with Bindings
```typescript
// Source: Cloudflare Durable Objects configuration
// wrangler.toml
[[durable_objects.bindings]]
name = "QUEUE_BRAIN"
class_name = "QueueBrain"
script_name = "claw-fm-api"

[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"

// index.ts - export DO class
export { QueueBrain } from './durable-objects/QueueBrain';
```

### Anti-Repeat Window Implementation
```typescript
// Get recently played track IDs (last N plays)
async function getRecentlyPlayed(limit: number = 10): Promise<Set<number>> {
  const result = await this.storage.sql.exec(
    `SELECT DISTINCT track_id FROM play_history
     ORDER BY played_at DESC LIMIT ?`,
    limit
  );
  return new Set(result.rows.map(row => row.track_id));
}

// Get recently played wallets (artist diversity)
async function getRecentWallets(limit: number = 3): Promise<Set<string>> {
  const result = await this.storage.sql.exec(
    `SELECT DISTINCT t.wallet FROM play_history ph
     JOIN tracks t ON t.id = ph.track_id
     ORDER BY ph.played_at DESC LIMIT ?`,
    limit
  );
  return new Set(result.rows.map(row => row.wallet));
}
```

### Queue Preview (Next 3-5 Tracks)
```typescript
// Probabilistic preview: sample from weighted distribution multiple times
// Note: This doesn't "lock" the queue, tracks may change based on tips/submissions

async getQueuePreview(depth: number = 5): Promise<Track[]> {
  const preview: Track[] = [];
  const excludeIds = new Set<number>();

  // Simulate selecting next N tracks
  for (let i = 0; i < depth; i++) {
    const track = await this.selectNextTrack(excludeIds);
    if (!track) break; // Not enough tracks
    preview.push(track);
    excludeIds.add(track.id);
  }

  return preview;
}

// Modified selectNextTrack to accept temporary exclusions
async selectNextTrack(tempExclude: Set<number> = new Set()): Promise<Track> {
  const recentIds = await this.getRecentlyPlayed();
  const recentWallets = await this.getRecentWallets();
  const allExcluded = new Set([...recentIds, ...tempExclude]);

  return selectTrackWeighted(tracks, allExcluded, recentWallets);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cron-based polling | Durable Object alarms | 2022 (DO Alarms released) | Precise timing (ms vs 1min resolution), no polling overhead |
| KV-only storage | SQLite-backed DO storage | 2023 (SQLite for DO released) | Relational queries, indexes, ACID transactions for queue logic |
| Global state in Workers memory | Durable Objects coordination | 2020 (DO GA) | Single source of truth, survives evictions/crashes |
| Manual WebSocket management | Hibernatable WebSockets | 2023 | Free hibernation when idle, automatic state restoration |
| D1 for real-time state | DO SQLite for hot data, D1 for cold data | 2024-2025 | Latency: DO SQLite is local (sub-ms), D1 is distributed (10-50ms) |

**Deprecated/outdated:**
- **Workers KV for transactional data:** KV is eventually consistent, not suitable for queue state requiring ACID. Use DO SQLite.
- **Cron for sub-minute scheduling:** Minimum 1-minute interval. Use DO alarms for precise timing.
- **Non-hibernatable WebSockets:** Old API charged for idle connections. Use hibernatable API for cost efficiency.

## Open Questions

Things that couldn't be fully resolved:

1. **Decay curve parameter tuning**
   - What we know: Exponential decay with half-life parameter is standard approach
   - What's unclear: Optimal half-life value for "gentle" rotation (10 days? 14 days? 7 days?)
   - Recommendation: Start with 10-day half-life, tune based on user feedback. Track metrics (play frequency by age) to validate.

2. **Queue depth (3 vs 5 tracks)**
   - What we know: Preview enables UI to show upcoming tracks
   - What's unclear: How many tracks ahead should be exposed? Does it reduce surprise/discovery?
   - Recommendation: Start with 5 tracks (generous buffering), easy to reduce to 3 later based on UX testing.

3. **Locked vs probabilistic queue**
   - What we know: Can either lock next 5 tracks in advance OR sample from distribution each time
   - What's unclear: Should queue preview be immutable (locked) or dynamic (probabilistic)?
   - Recommendation: Use probabilistic (simpler, no state management) unless users report confusion about queue changes.

4. **Tip weight scaling factor**
   - What we know: `tipBoost = 1 + (tip_weight / scale_factor)`
   - What's unclear: What scale factor makes tips feel "noticeable but not overwhelming"?
   - Recommendation: Start with 0.1 ETH = 2x weight (scale_factor = 1e17). Tune based on tip distribution data.

5. **Anti-repeat threshold**
   - What we know: Should disable anti-repeat when catalog is small
   - What's unclear: Exact threshold - 5 tracks? 3 tracks? 10 tracks?
   - Recommendation: Start with 5 tracks (matches preview depth), seems reasonable for "small catalog".

6. **Pre-buffer timing window**
   - What we know: 10 seconds mentioned for crossfade buffer
   - What's unclear: How to implement? Separate alarm? Client polling? State field?
   - Recommendation: Simplest: include `nextTrack` in /now-playing response when current track has < 10s remaining. Client polls more frequently near end.

## Sources

### Primary (HIGH confidence)
- [Cloudflare Durable Objects Alarms API](https://developers.cloudflare.com/durable-objects/api/alarms/) - Alarm scheduling, retry behavior, timing guarantees
- [Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/) - State management patterns, anti-patterns, best practices
- [Cloudflare KV Caching Patterns](https://developers.cloudflare.com/kv/examples/cache-data-with-workers-kv/) - Cache-aside implementation, TTL strategies
- [Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) - Hibernatable WebSocket API, broadcast patterns
- [Building a Scheduling System with Workers and Durable Objects](https://blog.cloudflare.com/building-scheduling-system-with-workers-and-durable-objects/) - Storage-backed event scheduling pattern
- [Cloudflare Durable Objects Alarms Announcement](https://blog.cloudflare.com/durable-objects-alarms/) - At-least-once execution, exponential backoff

### Secondary (MEDIUM confidence)
- [Weighted Random Selection Algorithms](https://trekhleb.medium.com/weighted-random-in-javascript-4748ab3a1500) - Cumulative weights method, O(log n) binary search
- [Exponential Decay Formula](https://en.wikipedia.org/wiki/Exponential_decay) - Mathematical foundation for decay curves
- [Forward Decay Paper](https://dimacs.rutgers.edu/~graham/pubs/papers/fwddecay.pdf) - Time decay for streaming systems
- [Radio Music Scheduling Practices](https://radioiloveit.com/radio-music-research-music-scheduling-software/music-scheduling-using-song-rotations-for-better-music-logs/) - Anti-repeat rules, artist separation, rotation strategies
- [Web Audio API Crossfading](https://webaudioapi.com/book/Web_Audio_API_Boris_Smus_html/ch02.html) - Equal-power curves, gain node scheduling (context for client-side Phase 4)

### Tertiary (LOW confidence)
- [Collaborative Filtering with Time Decay](https://peerj.com/articles/cs-2533/) - Academic paper on decay functions in music recommendations (not directly applicable but validates approach)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All Cloudflare native features, official documentation current as of 2026
- Architecture patterns: HIGH - Based on official Cloudflare examples and best practices guides
- Weighted selection algorithm: HIGH - Standard computer science algorithm, well-documented
- Decay curve parameters: MEDIUM - Formula is standard, but tuning values require experimentation
- Pitfalls: HIGH - Based on official warnings and documented footguns
- Radio rotation practices: MEDIUM - Industry practices verified across multiple sources but not Cloudflare-specific

**Research date:** 2026-02-01
**Valid until:** ~30 days (Cloudflare platform stable, but Workers/DO features evolve quickly)

**Key decision drivers from CONTEXT.md:**
- ✅ Durable Object alarms confirmed for precise advancement (millisecond accuracy)
- ✅ Exponential decay provides "gentle" curve with configurable parameters
- ✅ Anti-repeat and artist diversity implementable via SQLite queries
- ✅ Single-track looping trivial (just select same track if only one exists)
- ✅ Immediate start on first submission via submit handler → DO call
- ✅ Pre-selection + KV cache enables 10s pre-buffer window for crossfade
- ✅ Empty state handled with structured JSON response (not 204/404)

**Risks/unknowns:**
- Parameter tuning (half-life, tip scaling, anti-repeat threshold) requires iteration
- DO cold start latency on first request after idle period (typically <100ms, acceptable)
- KV eventual consistency means brief stale reads possible (60s max, acceptable for radio)
- Multiple concurrent alarm management not officially documented (stick to single alarm pattern)
