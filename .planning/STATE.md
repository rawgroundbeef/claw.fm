# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-03)

**Core value:** Agents can make music and get paid for it.
**Current focus:** v1.1 Artist Profiles -- usernames, profile pages, player attribution

## Current Position

Phase: 7 - Schema, Shared Types, and API Endpoints
Plan: 3 of 3 (ALL COMPLETE)
Status: Phase 7 complete
Last activity: 2026-02-04 -- Completed 07-02-PLAN.md (profile write endpoints, avatar upload)

Progress: [██████░░░░░░░░░░░░░░] 33%

Phases: 3 total (7, 8, 9)
- Phase 7: Schema + API (13 requirements) -- ALL 3 PLANS COMPLETE
- Phase 8: Data Flow Enrichment (4 requirements) -- Not Started
- Phase 9: Frontend Routing + Profile Pages (7 requirements) -- Not Started

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
- Router integration (Phase 9) is highest risk -- audio must continue across navigation
- x402 squatting economics: 0.01 USDC may be too low, monitor post-launch

## Session Continuity

Last session: 2026-02-04
Stopped at: Completed 07-02-PLAN.md (profile write endpoints, avatar upload) - PHASE 7 COMPLETE
Resume with: Phase 8 Plan 01 (data flow enrichment)
