# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-03)

**Core value:** Agents can make music and get paid for it.
**Current focus:** v1.1 Artist Profiles -- usernames, profile pages, player attribution

## Current Position

Phase: 9 - Frontend Routing + Profile Pages
Plan: 3 of 4 complete
Status: In progress
Last activity: 2026-02-04 -- Completed 09-03-PLAN.md (artist link navigation)

Progress: [████████████████░░░░] 80%

Phases: 3 total (7, 8, 9)
- Phase 7: Schema + API (13 requirements) -- COMPLETE ✅ (verified 2026-02-04)
- Phase 8: Data Flow Enrichment (4 requirements) -- COMPLETE ✅ (verified 2026-02-04)
- Phase 9: Frontend Routing + Profile Pages (7 requirements) -- IN PROGRESS (3/4 plans)

## Accumulated Context

### Decisions

All decisions logged in PROJECT.md Key Decisions table.

Key v1.1 decisions from research:
- React Router v7 declarative mode (not wouter, not framework mode)
- CF Images Binding for avatar resize (not CSS-only)
- LEFT JOIN enrichment (not denormalized batch updates)
- INSERT ON CONFLICT for username claims (not check-then-insert)
- Username max length: 20 chars
- COLLATE NOCASE on username UNIQUE index
- x402 for profile auth (same pattern as track submission)
- Mutable usernames (paid change via x402)

Phase 7 Plan 01 decisions:
- COLLATE NOCASE on both column definition and index for case-insensitive username uniqueness
- Zod schemas in shared package for validation reuse across API and frontend
- Reserved username blocklist includes all system route names (admin, api, artist, audio, etc.)
- Username regex pattern: ^[a-z0-9][a-z0-9_]*[a-z0-9]$ (alphanumeric start/end, underscores allowed in middle)

Phase 7 Plan 02 decisions:
- Validation happens before x402 payment settlement to prevent charging for invalid requests
- UPDATE path catches UNIQUE constraint errors for username conflicts
- Avatar uploads use wallet-based keys (avatars/{wallet}.{ext}) for automatic overwrites
- CF Images Binding is optional with graceful fallback to original image
- 2MB max avatar size (vs 5MB for track cover art)

Phase 7 Plan 03 decisions:
- Route ordering: /by-wallet/:wallet registered before /:username to prevent path conflicts
- Username availability returns 200 (not 400) for invalid format with available:false and reason field
- Cover URLs: data: URIs passed through as-is, R2 keys prefixed with /audio/
- Track catalog sorted newest-first via ORDER BY created_at DESC

Phase 8 Plan 01 decisions:
- Bio truncation threshold: 80% of maxLength (20% margin for word boundary search)
- All 4 new NowPlayingTrack fields are optional for backward compatibility
- Server-side bio truncation (not client-side) keeps KV cache payloads small

Phase 8 Plan 02 decisions:
- LEFT JOIN without COALESCE in ON clause (preserves index efficiency)
- || undefined (not ?? undefined) for nullable SQL fields to also convert empty strings
- Cache invalidation after DB write but before response fetch (ensures cleanup even on error)
- All 4 D1 queries enriched: currentTrack, nextTrack, queue tracks, currentlyPlaying

Phase 9 Plan 01 decisions:
- AudioContext calls both useNowPlaying and useCrossfade (not refactoring useCrossfade to accept nowPlaying param)
- ReturnType utility type for hook return types (interfaces not exported from hook files)
- Temporary catch-all route renders RadioPage until Plan 02 adds 404 page

Phase 9 Plan 02 decisions:
- Layout flexibility: RadioLayout main provides items-center px-4, child pages add justify-center or self-start as needed
- Inline 404 rendering: render NotFoundPage component instead of navigate() to preserve URL in browser
- Display-only track catalog for v1.1 (no click-to-play behavior on profile pages yet)
- Artist name priority: artistDisplayName > artistName > truncated wallet
- Rounded-square avatars (rounded-xl, not full circles) for modern Spotify-like aesthetic

Phase 9 Plan 03 decisions:
- Link component (not anchor tags): prevents full page reload that would destroy AudioContext and stop playback
- Display name priority: artistDisplayName > artistName > truncated wallet (consistent hierarchy)
- Wallet profile redirect: WalletProfilePage redirects to canonical /artist/:username if profile registered (SEO consistency)
- API returns profile=null (not 404): by-wallet endpoint returns 200 with profile=null and tracks array for unregistered wallets
- Identicon proportions: 128x192px (taller than avatar) to match track cover vertical proportions for visual consistency

### Pending Todos

- Apply D1 migration 0003_artist-profiles.sql to production before deploying Phase 7 code
- Verify CF Images Binding is enabled on project Cloudflare account (avatar fallback works but resize preferred)
- Test x402 payment flow end-to-end with real wallet before Phase 9 integration

### Blockers/Concerns

Open (carried from v1.0):
- OnchainKit Smart Wallet UX needs real-device validation
- Large bundle size (1+ MB chunk) -- code-splitting deferred
- PLATFORM_WALLET env var must be set in production

New for v1.1:
- Router foundation complete (Plan 09-01) -- mobile Safari testing needed to confirm audio persistence
- Profile pages complete (Plan 09-02) -- mobile Safari navigation testing needed
- Artist link navigation complete (Plan 09-03) -- mobile Safari Link navigation testing needed
- x402 squatting economics: 0.01 USDC may be too low, monitor post-launch
- Avatar resize via CF Images Binding optional but would improve mobile performance

## Session Continuity

Last session: 2026-02-04
Stopped at: Phase 9 plans 01-03 complete. Plan 09-04 (visual verification checkpoint) deferred to post-deploy.
Resume with: Deploy to CF Pages, test audio persistence + profile pages, then `/gsd:execute-phase 9` to complete verification
