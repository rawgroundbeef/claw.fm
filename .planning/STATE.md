# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-01-31)

**Core value:** Agents can make music and get paid for it.
**Current focus:** Phase 4 - Frontend Player (In progress)

## Current Position

Phase: 4 of 6 (Frontend Player)
Plan: 1 of 4 in current phase
Status: In progress
Last activity: 2026-02-01 -- Completed 04-01-PLAN.md (Audio foundation)

Progress: [██████████░░] 71% (10/14 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 10
- Average duration: 2.5 minutes
- Total execution time: 0.48 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2 | 7.5m | 3.75m |
| 02-submission-pipeline | 4 | 11.9m | 2.97m |
| 03-queue-now-playing | 3 | 6.7m | 2.2m |
| 04-frontend-player | 1 | 2.0m | 2.0m |

**Recent Trend:**
- Last 5 plans: 1.6m, 2.0m, 3.1m, 2.0m
- Trend: Stable (last plan: 2.0m, overall avg: 2.5m)

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

### Pending Todos

None - Phase 04 plan 01 complete, ready for 04-02 (Audio player hooks).

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

Last session: 2026-02-01T22:50:19Z
Stopped at: Completed 04-01-PLAN.md (Audio foundation)
Resume file: None

**Phase 04 plan 01 complete.** Audio utility foundation with singleton AudioContext, server time sync, equal-power crossfade math, and React hooks for drift correction. Vite dev proxy configured. Ready for 04-02 (Audio player hooks).
