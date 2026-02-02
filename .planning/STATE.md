# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-31)

**Core value:** Agents can make music and get paid for it.
**Current focus:** Phase 4 - Frontend Player (Complete)

## Current Position

Phase: 5 of 6 (Payments & Wallet)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-01 -- Completed 05-02-PLAN.md (API endpoints - tips & downloads)

Progress: [████████████████] 88.9% (16/18 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 16
- Average duration: 2.53 minutes
- Total execution time: 0.67 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2 | 7.5m | 3.75m |
| 02-submission-pipeline | 4 | 11.9m | 2.97m |
| 03-queue-now-playing | 3 | 6.7m | 2.2m |
| 04-frontend-player | 6 | 16.1m | 2.68m |
| 05-payments-wallet | 1 | 2.4m | 2.4m |

**Recent Trend:**
- Last 5 plans: 3.0m, 3.0m, 2.5m, 2.6m, 2.4m
- Trend: Stable (last plan: 2.4m, overall avg: 2.53m)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 6 phases following critical path Infrastructure -> Submission -> Queue -> Player -> Payments -> Polish
- [Roadmap]: QUEU-04 (tip weight boost) placed in Phase 5 with Payments since it connects tips to queue rotation
- [Roadmap]: SUBM-09 (queue position in response) placed in Phase 2 since approximate position can be returned from track count at submission time
- [01-02]: PostCSS integration for Tailwind v3 instead of @tailwindcss/vite plugin (compatibility)
- [01-02]: React 19 with createRoot and new JSX transform (jsx: "react-jsx")
- [01-02]: Root scripts use pnpm --filter to target specific workspaces
- [02-01]: SQLite ALTER TABLE limitation requires separate statements per column
- [02-01]: Genre naming uses 'r-and-b' instead of 'r&b' for URL safety
- [02-01]: Composite index idx_tracks_wallet_hash for duplicate detection
- [02-02]: get-mp3-duration for MP3 duration extraction (with fallback plan for Workers compatibility)
- [02-02]: DigestStream for streaming SHA-256 hashing (memory efficient for 50MB files)
- [02-02]: Validate-first-then-charge pattern: x402 payment check happens after validation passes
- [02-02]: Magic number file type detection via file-type library (client Content-Type not trusted)
- [02-03]: Manual MP3 frame parser fallback for Workers runtime (get-mp3-duration uses unavailable Buffer methods)
- [02-03]: Audio ArrayBuffer read once and reused for hashing, duration, and R2 upload
- [02-03]: Duplicate detection uses crypto.subtle.digest (buffer already in memory)
- [02-03]: Queue position calculated from total track count (approximate, refined in Phase 3)
- [02-04]: Use @openfacilitator/sdk for x402 payment verification (OpenFacilitator verify/settle pattern)
- [02-04]: Remove PAYMENT-SIGNATURE header fallback (x402 standard uses X-PAYMENT only)
- [02-04]: Accept timestamp-UUID track key format (superior to trackId for uniqueness and partitioning)
- [02-04]: Network format 'base' (v1 human-readable) instead of 'eip155:8453' (v2 CAIP-2)
- [03-01]: 10-day half-life for exponential decay (gentle decay, favors newer tracks)
- [03-01]: Tip boost formula: 1 + (tip_weight / 1e17) where 0.1 ETH = 2x weight
- [03-01]: Anti-repeat threshold: 5 tracks (disable filtering for small catalogs)
- [03-01]: KV cache TTL: 5s for waiting state, track-end or 60s max for playing
- [03-01]: Binary search for O(log n) weighted selection from cumulative weights
- [03-02]: DO SQLite state: key-value queue_state table + play_history with wallet for artist diversity
- [03-02]: Alarm precision: millisecond-level scheduling for exact track end times
- [03-02]: created_at conversion: D1 stores UNIX seconds, rotation expects milliseconds - convert at fetch time
- [03-02]: Idempotent startImmediately: check both current_track_id and alarm existence
- [03-02]: Single-track looping: always return tracks[0].id when catalog size is 1
- [03-02]: Play history includes wallet column (avoids D1 joins for artist diversity filtering)
- [03-02]: 24-hour history retention (prune on each recordPlay call)
- [03-03]: DO stub typed as 'as any' for RPC method access (TypeScript limitation)
- [03-03]: Queue preview not cached in KV (probabilistic result changes each call)
- [03-03]: First-track detection via queuePosition === 1 from COUNT query
- [03-03]: Crossfade pre-buffer triggers at < 10s remaining
- [04-01]: Use /health endpoint for time sync (simple, dedicated, no state coupling)
- [04-01]: Drift threshold 1 second for audio re-seek (balance precision vs stability)
- [04-01]: Periodic sync every 30s for server time, 10s for drift check
- [04-01]: Equal-power crossfade prevents volume dip in linear crossfade
- [04-02]: MediaElementSource created once on mount (Web Audio API limitation - cannot recreate per audio element)
- [04-02]: Linear ramp for 2s crossfade (equal-power curves add complexity with minimal benefit at short duration)
- [04-02]: Preload next track when nextTrack appears in response (< 10s remaining trigger)
- [04-02]: Poll /api/now-playing every 5s (matching KV cache), increase to 2s when < 10s remaining
- [04-02]: Track transitions detected by comparing previous vs current track ID
- [04-02]: User volume maintained across crossfade (target gain = userVolume, not 1.0)
- [04-03]: Canvas 2D for waveform rendering (not SVG) for 60fps performance
- [04-03]: HiDPI setup once on mount/resize, not every frame (avoid flicker and performance overhead)
- [04-03]: Idle animation as utility function, not separate component (same drawing pipeline as live audio)
- [04-03]: Type assertion (as any) for getByteTimeDomainData due to TS lib ArrayBufferLike mismatch
- [04-03]: Explicitly create ArrayBuffer for Uint8Array to match Web Audio API expectations
- [04-04]: Bottom-fixed player bar: 80px height, z-50, white bg with subtle shadow
- [04-04]: Three-section layout: left (now-playing 25%), center (controls flex-1), right (volume 25%)
- [04-04]: Inline SVG icons to avoid dependency bloat
- [04-04]: Wallet truncation: first 6 + last 4 chars when artistName missing
- [04-04]: M:SS time format with tabular-nums for consistent width
- [04-05]: CSS-based track info transitions using key prop animation (no animation library dependency)
- [04-05]: State machine UI flow: waiting (EmptyState) → pre-play (track info + large play button) → playing (full controls)
- [04-05]: Volume state managed in App.tsx, passed to crossfade.setVolume() (not audio element mute property)
- [04-05]: Custom CSS for range inputs ensures cross-browser consistent styling
- [04-06]: Health endpoint polling for reconnection (max 5 retries, 2s delay)
- [04-06]: 3 second timeout for stalled audio recovery
- [04-06]: Buffering state propagated from useAudioPlayer through useCrossfade to App.tsx UI
- [04-06]: Page Visibility API for tab backgrounding detection and auto-restore
- [04-06]: Window online/offline events for network drop detection
- [05-02]: Tip weight scaling amount * 1e17 ($1 USDC = 2x boost, $0.25 = 1.25x, $5 = 6x)
- [05-02]: 72-hour download URL expiry (balance UX and security)
- [05-02]: HMAC-SHA256 with Web Crypto API for presigned URLs (no dependencies)
- [05-02]: Relative download URLs resolved by frontend against API base
- [05-02]: Token format {r2Key}:{expiresAt} prevents file/expiry manipulation
- [05-02]: KV cache invalidation on tip (rotation weights changed)

### Pending Todos

None - Phase 05 Plan 02 complete. API endpoints ready for frontend integration in Plan 03.

### Blockers/Concerns

- [Research]: OnchainKit Smart Wallet "create wallet" UX needs real-device validation in Phase 5
- [01-01]: wrangler version 3.100.0 is outdated (warns about 4.61.1 available) - consider upgrading if compatibility issues arise
- [01-01]: R2 CORS for Web Audio API crossOrigin testing deferred to Phase 4 (player implementation)

**Resolved:**
- ~~[Research]: music-metadata CF Workers compatibility~~ - Resolved in 02-03 with manual MP3 frame parser fallback
- ~~[02-gap]: x402.org facilitator integration~~ - Resolved in 02-04 with @openfacilitator/sdk migration
- ~~[02-gap]: Dead hashFile import~~ - Resolved in 02-04 by removal from submit.ts
- ~~[02-gap]: Track key format discrepancy~~ - Resolved in 02-04 by accepting timestamp-UUID as superior approach

## Session Continuity

Last session: 2026-02-01T23:24:44Z
Stopped at: Completed 05-02-PLAN.md (API endpoints - tips & downloads)
Resume file: None

**Phase 05 Plan 02 complete.** API payment endpoints functional: POST /api/tip (updates tip_weight with USDC-to-boost scaling), POST /api/downloads/:trackId (generates HMAC-signed URLs with 72h expiry), GET /api/downloads/:trackId/file (verifies token, streams from R2). Shared payment types exported. Routes mounted. Zero new dependencies (native Web Crypto API). TypeScript compilation passes. Ready for Plan 03 (frontend payment flows).
