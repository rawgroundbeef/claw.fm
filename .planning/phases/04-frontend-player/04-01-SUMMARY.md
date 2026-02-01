---
phase: 04-frontend-player
plan: 01
subsystem: ui
tags: [web-audio-api, react-hooks, vite, typescript, time-sync, crossfade]

# Dependency graph
requires:
  - phase: 03-queue-now-playing
    provides: NowPlayingResponse with startedAt/endsAt timestamps for playback sync
provides:
  - Singleton AudioContext accessible from any component
  - Server time offset calculation for synchronized playback
  - Equal-power crossfade gain calculation
  - React hooks for time sync and audio drift correction
  - Vite dev proxy for /api and /health endpoints
affects: [04-02-audio-hooks, 04-03-visualizer, 04-04-player-ui, all frontend player features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Singleton AudioContext pattern for Web Audio API"
    - "Round-trip time compensation for server time sync"
    - "Equal-power crossfade using cosine curves"
    - "Periodic drift correction for audio synchronization"

key-files:
  created:
    - web/src/utils/audioContext.ts
    - web/src/utils/equalPowerCurve.ts
    - web/src/utils/timeSync.ts
    - web/src/hooks/useServerTime.ts
    - web/src/hooks/useAudioSync.ts
  modified:
    - web/vite.config.ts
    - api/wrangler.toml

key-decisions:
  - "Use /health endpoint for time sync (simple, dedicated, no state coupling)"
  - "Drift threshold 1 second for audio re-seek (balance precision vs stability)"
  - "Periodic sync every 30s for server time, 10s for drift check"
  - "Equal-power crossfade prevents volume dip in linear crossfade"

patterns-established:
  - "AudioContext singleton: getAudioContext() creates once, resumeAudioContext() for autoplay policy"
  - "Server time offset: round-trip compensation using send/receive timestamps"
  - "Audio sync: check drift on track change and periodically, re-seek if >1s off"

# Metrics
duration: 2min
completed: 2026-02-01
---

# Phase 04 Plan 01: Audio Foundation Summary

**Singleton AudioContext, server time sync via /health endpoint, equal-power crossfade math, and React hooks for audio drift correction**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-01T22:48:20Z
- **Completed:** 2026-02-01T22:50:19Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Audio utility foundation enables synchronized playback across all clients
- Time sync hooks maintain server clock offset for correct playback positions
- Equal-power crossfade prevents volume dip during track transitions
- Vite dev proxy configured for seamless local development workflow

## Task Commits

Each task was committed atomically:

1. **Task 1: Audio utility modules** - `66be984` (feat)
2. **Task 2: Time sync hooks and infrastructure config** - `2feb857` (feat)

## Files Created/Modified

**Utils:**
- `web/src/utils/audioContext.ts` - Singleton AudioContext with getAudioContext() and resumeAudioContext()
- `web/src/utils/equalPowerCurve.ts` - calculateEqualPowerGains() for equal-power crossfade
- `web/src/utils/timeSync.ts` - calculateServerOffset() and getCorrectPlaybackPosition()

**Hooks:**
- `web/src/hooks/useServerTime.ts` - Server time sync via /health endpoint polling
- `web/src/hooks/useAudioSync.ts` - Audio drift correction with periodic checks

**Config:**
- `web/vite.config.ts` - Added proxy for /api and /health to localhost:8787
- `api/wrangler.toml` - Added R2 CORS production deployment note

## Decisions Made

1. **Use /health endpoint for time sync** - Simple, dedicated endpoint with timestamp. No coupling to now-playing state. Already exists from Phase 1.

2. **Drift threshold 1 second** - Balance between precision and stability. Sub-second re-seeks would cause choppy playback.

3. **Polling intervals** - 30s for server time sync (slow clock drift), 10s for audio drift check (active monitoring while playing).

4. **Equal-power crossfade with cosine curves** - Standard Web Audio pattern. Prevents -3dB volume dip that linear crossfade causes at 50% position.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Audio utility foundation complete. All downstream plans can now:
- Import singleton AudioContext from any component
- Use useServerTime() for synchronized playback positions
- Use useAudioSync() for drift correction
- Calculate equal-power crossfade gains
- Develop locally with Vite proxy to wrangler

**Blockers:** R2 CORS must be configured for production deployment (Web Audio API requires crossOrigin access). Comment added to wrangler.toml. Configuration required via S3 API or Cloudflare dashboard before production audio playback.

**Ready for:** 04-02 (Audio player hooks with dual-element crossfade)

---
*Phase: 04-frontend-player*
*Completed: 2026-02-01*
