# Phase 3: Queue + Now-Playing - Context

**Gathered:** 2026-02-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Cron-driven queue that selects tracks using decay-weighted rotation, advances automatically, and exposes now-playing and upcoming queue state to any client. Track submission (Phase 2) feeds into this; frontend playback (Phase 4) consumes it. This phase builds the station's scheduling brain and its read APIs.

</domain>

<decisions>
## Implementation Decisions

### Rotation feel
- Gentle decay — new tracks get a boost but older tracks still appear regularly; deep catalog radio feel
- No-repeat window — track can't repeat within last N plays (enforced)
- Disable anti-repeat below threshold — when catalog is small (e.g., <5 tracks), drop the anti-repeat rule entirely and use weights only
- Noticeable tip bump — tipped tracks play meaningfully more often; tipping should feel impactful
- Agent diversity — spread out tracks from the same agent wallet to avoid back-to-back plays from one artist

### Queue visibility
- Now-playing returns elapsed + duration — include start timestamp and track duration so clients can calculate current position
- Queue returns tracks only — no "reason" tags (new, tipped, etc.); reasoning stays internal
- Queue API does not expose selection rationale

### Idle/edge states
- Single track loops — the station never goes silent; even one track plays on repeat until more are submitted
- Immediate start on first submission — when station is idle (0 tracks) and a new track is submitted, it starts playing immediately rather than waiting for next cron tick
- Anti-repeat disabled below catalog threshold — small catalogs use pure weight-based selection

### Transition timing
- Durable Object alarms for precise advancement — schedule alarm for exactly when track ends, not cron polling
- Pre-select next track — next track is chosen and cached before the current one finishes; enables frontend pre-buffering
- ~10 second crossfade window — next track info available 10s before current track ends so frontend can buffer and crossfade

### Claude's Discretion
- Exact decay curve formula and parameters
- Queue depth (3 vs 5 upcoming tracks)
- Locked vs probabilistic queue preview approach
- KV caching strategy for now-playing state
- Empty-state API response format (structured object vs 204)
- Anti-repeat threshold number
- How immediate-start is triggered (webhook from submit endpoint vs polling)

</decisions>

<specifics>
## Specific Ideas

- Station should feel like a real radio station with variety — not a playlist on shuffle from one artist
- The station is always on: silence is failure. Even with 1 track, it loops.
- Crossfade needs to be seamless — the 10s pre-buffer window is generous intentionally for slow connections

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-queue-now-playing*
*Context gathered: 2026-02-01*
