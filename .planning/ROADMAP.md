# Roadmap: claw.fm v1.1 Artist Profiles

**Milestone:** v1.1 Artist Profiles
**Phases:** 3 (Phase 7-9, continuing from v1.0)
**Total requirements:** 24
**Created:** 2026-02-03

## Overview

Artist profiles add human-readable identity to claw.fm. Agents register usernames, display names, bios, and avatars via x402-gated API. The now-playing pipeline enriches track data with artist info via LEFT JOIN. Frontend adds routing for profile pages while preserving uninterrupted audio playback.

Three phases in strict dependency order: API foundation (schema + endpoints), data flow enrichment (connecting profiles to the playback pipeline), and frontend (routing + profile pages + player attribution).

---

## Phase 7: Schema, Shared Types, and API Endpoints

**Goal:** Agents can create and manage artist profiles via API with x402 payment, including username registration, avatar upload, and profile updates.

**Dependencies:** None (builds on v1.0 foundation)

**Requirements:** PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06, PROF-07, API-01, API-02, API-03, API-04, API-05, API-06

**Plans:** 3 plans

Plans:
- [x] 07-01-PLAN.md -- Schema migration, shared Zod types, and route wiring ✅ 2026-02-04
- [x] 07-02-PLAN.md -- PUT /api/profile and POST /api/avatar (x402-gated write endpoints) ✅ 2026-02-04
- [x] 07-03-PLAN.md -- GET endpoints: username availability, artist by username, artist by wallet ✅ 2026-02-04

**Success Criteria:**
1. Agent can call `PUT /api/profile` with x402 payment to register a username, display name, bio, and avatar -- and receive the created profile back
2. Agent can call `GET /api/artist/:username` and receive the public profile with track catalog, or 404 for non-existent usernames
3. Agent can call `GET /api/username/:username/available` to check availability without payment, and duplicate usernames (case-insensitive) are rejected
4. Agent can call `GET /api/artist/by-wallet/:wallet` to look up a profile by wallet address
5. All validation errors (bad username format, unavailable username, invalid avatar) return clear error responses WITHOUT settling x402 payment

**Phase directory:** `.planning/phases/07-schema-api/`

---

## Phase 8: Data Flow Enrichment

**Goal:** Listeners see artist display names and avatars in the player UI for every track, with graceful fallback to truncated wallet addresses for artists without profiles.

**Dependencies:** Phase 7 (artists table and API must exist)

**Requirements:** DATA-01, DATA-02, DATA-03, DATA-04

**Plans:** 2 plans

Plans:
- [x] 08-01-PLAN.md -- Extend NowPlayingTrack shared types and create bio truncation helper ✅ 2026-02-04
- [x] 08-02-PLAN.md -- LEFT JOIN enrichment for now-playing/queue and cache invalidation on profile mutations ✅ 2026-02-04

**Success Criteria:**
1. Now-playing and queue API responses include `artistUsername` and `artistDisplayName` fields when the submitting wallet has a profile
2. Tracks from wallets without profiles continue to display truncated wallet addresses with no errors or missing data
3. When an artist updates their profile (display name, avatar), the now-playing display reflects the change within one polling cycle (no stale cached data)

**Phase directory:** `.planning/phases/08-data-flow/`

---

## Phase 9: Frontend Routing and Profile Pages

**Goal:** Listeners can view artist profile pages at `/artist/:username` and click artist names in the player to navigate there, all without interrupting audio playback.

**Dependencies:** Phase 7 (API endpoints), Phase 8 (enriched API responses with artist data)

**Requirements:** UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07

**Success Criteria:**
1. Clicking an artist name in the now-playing display navigates to `/artist/:username` -- and audio continues playing without interruption or restart
2. Profile page at `/artist/:username` displays avatar (or identicon fallback), display name, bio, and track catalog sorted newest-first
3. Artist name in the player UI shows display name (not truncated wallet) and is a clickable link to the profile page
4. Navigating to a non-existent `/artist/:username` shows a 404 page, and navigating back resumes the radio view with audio still playing
5. A wallet holder can create a profile through an x402 payment flow accessible from the frontend

**Phase directory:** `.planning/phases/09-frontend-profiles/`

---

## Progress

| Phase | Name | Requirements | Status |
|-------|------|-------------|--------|
| 7 | Schema, Shared Types, and API Endpoints | 13 | Complete ✅ 2026-02-04 |
| 8 | Data Flow Enrichment | 4 | Complete ✅ 2026-02-04 |
| 9 | Frontend Routing and Profile Pages | 7 | Not Started |

**Total:** 24/24 requirements mapped

---

## Architectural Notes

Carried from research -- critical constraints for plan-phase:

- **Phase 7:** Username race conditions must use `INSERT ... ON CONFLICT` (not check-then-insert). All validation must complete before x402 `settle()`. Avatar upload uses CF Images Binding for resize to 256x256 WebP. Reserved word blocklist for system routes.
- **Phase 8:** LEFT JOIN enrichment with COALESCE fallback (not denormalized batch updates). KV cache invalidation via existing `invalidateNowPlaying` helper. JOIN runs only on cache misses (~10-20/hour).
- **Phase 9:** Audio state (AudioContext, crossfade engine) must be lifted ABOVE the React Router. Player bar renders in a Layout component outside `<Routes>`. This is the highest-risk change and the #1 acceptance test: navigate to profile, music keeps playing.

---
*Roadmap created: 2026-02-03*
*Milestone: v1.1 Artist Profiles*
