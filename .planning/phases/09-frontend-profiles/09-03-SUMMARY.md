---
phase: 09-frontend-profiles
plan: 03
subsystem: ui
tags: [react-router, navigation, profile-pages, wallet-profiles]

# Dependency graph
requires:
  - phase: 09-frontend-profiles
    plan: 01
    provides: react-router foundation, AudioContext lift
  - phase: 08-data-flow-enrichment
    plan: 01
    provides: artist profile enrichment in NowPlayingTrack
provides:
  - Clickable artist links in PlayerBar and RadioPage using react-router Link
  - WalletProfilePage for unregistered artists (wallet-only profiles)
  - Extended /api/artist/by-wallet/:wallet endpoint returning profile + tracks
  - Complete navigation loop: listeners can click any artist name to visit profile
affects: [future-features, analytics, player-interactions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Artist link determination: artistUsername → /artist/:username, else → /artist/by-wallet/:wallet
    - Display name priority: artistDisplayName > artistName > truncated wallet
    - Wallet profile page redirects to canonical profile if username registered
    - API returns profile=null (not 404) for unregistered wallets with tracks

key-files:
  created:
    - web/src/pages/WalletProfilePage.tsx
  modified:
    - web/src/components/Player/NowPlaying.tsx
    - web/src/pages/RadioPage.tsx
    - api/src/routes/artist.ts
    - web/src/App.tsx

key-decisions:
  - "Use Link from react-router (not anchor tags) to prevent audio interruption on navigation"
  - "Display name priority: artistDisplayName > artistName > truncated wallet for consistent hierarchy"
  - "Wallet profile pages redirect to canonical /artist/:username if profile registered (SEO + consistency)"
  - "API /by-wallet endpoint returns profile=null (200) for unregistered wallets with tracks (not 404)"
  - "Identicon placeholder: 128x192px gradient div (taller than avatar to match track cover proportions)"

patterns-established:
  - "Artist link pattern: check artistUsername first, fall back to by-wallet URL"
  - "Wallet profile redirect: always prefer canonical username URL if available"
  - "Track catalog rendering: same row format across ArtistProfilePage and WalletProfilePage"

# Metrics
duration: 3min
completed: 2026-02-04
---

# Phase 9 Plan 3: Artist Link Navigation Summary

**Clickable artist links in PlayerBar and RadioPage navigating to profile pages via react-router Link, with wallet-based profiles for unregistered artists**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-04T17:45:06Z
- **Completed:** 2026-02-04T17:48:03Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Artist names in PlayerBar and RadioPage are now clickable links using react-router Link (no audio interruption)
- WalletProfilePage renders for unregistered artists at /artist/by-wallet/:wallet with identicon + track catalog
- Extended /api/artist/by-wallet/:wallet to return both profile (or null) and tracks
- Complete navigation loop: clicking any artist name (display name or truncated wallet) navigates to profile

## Task Commits

Each task was committed atomically:

1. **Task 1: Make artist names clickable links in PlayerBar and RadioPage** - `127d08a` (feat)
2. **Task 2: Extend by-wallet API and create WalletProfilePage** - `d50d2c5` (feat)

## Files Created/Modified

- `web/src/components/Player/NowPlaying.tsx` - Artist name wrapped in Link component with hover styling
- `web/src/pages/RadioPage.tsx` - Artist name in main content area wrapped in Link component
- `api/src/routes/artist.ts` - Extended by-wallet endpoint to query and return tracks alongside optional profile
- `web/src/pages/WalletProfilePage.tsx` - New wallet-based profile page with identicon, wallet address, and track catalog
- `web/src/App.tsx` - Added route for /artist/by-wallet/:wallet

## Decisions Made

1. **Link component (not anchor tags):** Using react-router Link prevents full page reload that would destroy AudioContext and stop playback. This ensures seamless navigation without audio interruption.

2. **Display name priority:** Consistent hierarchy across both components: artistDisplayName > artistName > truncated wallet. This matches the profile page display logic from Phase 8.

3. **Wallet profile redirect:** When a wallet has a registered username, WalletProfilePage redirects to the canonical /artist/:username page using useNavigate(). This ensures SEO consistency and single canonical URL per artist.

4. **API returns profile=null (not 404):** The by-wallet endpoint now returns 200 with profile=null and tracks array for unregistered wallets. Only returns 404 if the wallet has no profile AND no tracks (truly unknown). This simplifies frontend logic.

5. **Identicon proportions:** Wallet profile identicon is 128x192px (taller than 128x128 avatar) to match the vertical proportion of track cover art, providing visual consistency for anonymous artists.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Profile navigation loop is complete: listeners can click artist names anywhere in the UI
- Wallet-only artists have functional profile pages with track catalogs
- Plan 09-04 can proceed with profile management (submit modal integration)
- Mobile Safari testing needed to confirm audio state persists across Link navigation

---
*Phase: 09-frontend-profiles*
*Completed: 2026-02-04*
