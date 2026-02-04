---
phase: 09-frontend-profiles
plan: 02
subsystem: ui
tags: [react, react-router, typescript, fetch-api, responsive-design]

# Dependency graph
requires:
  - phase: 09-01
    provides: "React Router v7 foundation with RadioLayout shell and audio context"
  - phase: 07-03
    provides: "GET /api/artist/:username endpoint returning ArtistProfileWithTracks"
  - phase: 08-02
    provides: "LEFT JOIN enrichment adds artistUsername, artistDisplayName, artistName to NowPlayingTrack"
provides:
  - "ArtistProfilePage component at /artist/:username with hero header and track catalog"
  - "NotFoundPage component for 404 handling"
  - "Profile page loading/error/empty states with skeleton placeholders"
  - "Clickable artist links in RadioPage and PlayerBar NowPlaying"
  - "Layout split: RadioPage centered, profile pages top-aligned"
affects: [09-03-profile-submissions, 09-04-wallet-profiles]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useParams hook for URL parameters (:username)"
    - "Inline 404 rendering (render NotFoundPage component, don't navigate)"
    - "Image URL preparation: data: URIs pass through, R2 keys get /audio/ prefix"
    - "Duration formatting utility (ms to M:SS)"
    - "Skeleton loading states with pulse animation"
    - "Per-page layout control (RadioPage adds justify-center wrapper, profile pages self-start)"

key-files:
  created:
    - web/src/pages/ArtistProfilePage.tsx
    - web/src/pages/NotFoundPage.tsx
  modified:
    - web/src/App.tsx
    - web/src/layouts/RadioLayout.tsx
    - web/src/pages/RadioPage.tsx
    - web/src/components/Player/NowPlaying.tsx

key-decisions:
  - "Remove justify-center from RadioLayout main, let each page control own vertical alignment"
  - "Profile page wraps content in self-start w-full max-w-2xl for top-aligned scrollable layout"
  - "NotFoundPage accepts optional message prop for reusability"
  - "Avatar display uses rounded-xl (rounded-square, not full circle) per design spec"
  - "Track catalog display-only for v1.1 (no click-to-play behavior yet)"

patterns-established:
  - "Layout pattern: RadioLayout provides flex-1 flex flex-col items-center px-4, child pages add justify-center or self-start as needed"
  - "404 handling: Inline render NotFoundPage component instead of navigate() to preserve URL"
  - "Artist links: Priority order is artistDisplayName > artistName > truncated wallet"
  - "Cover art fallback: var(--cover-gradient) background for missing images"

# Metrics
duration: 3min
completed: 2026-02-04
---

# Phase 09 Plan 02: Profile Pages and Routing Summary

**Artist profile pages with hero header (avatar, display name, bio), scrollable track catalog, skeleton loading states, and clickable artist navigation from radio player**

## Performance

- **Duration:** 3 min 11 sec
- **Started:** 2026-02-04T19:10:28Z
- **Completed:** 2026-02-04T19:13:39Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Full artist profile viewing experience at /artist/:username with hero header, bio, and track catalog
- Complete state handling: loading (skeleton), error (retry button), 404 (inline NotFoundPage), empty tracks (helpful message)
- Clickable artist names throughout the app navigate to profile pages
- Layout system that supports both centered (radio) and top-aligned scrollable (profile) pages

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ArtistProfilePage with hero header, track catalog, and all states** - `c9741a0` (feat)
   - ArtistProfilePage.tsx with data fetching, hero layout, track list
   - NotFoundPage.tsx with Link back to radio
   - Skeleton loading, error with retry, 404 handling, empty state
   - Duration formatting, image URL preparation utilities

2. **Task 2: Wire profile and 404 routes, add artist profile navigation** - `be70d94` (feat)
   - App.tsx routes: /artist/:username → ArtistProfilePage, * → NotFoundPage
   - RadioLayout main removes justify-center for flexible page layouts
   - RadioPage adds justify-center wrapper for centered UI
   - Artist names in RadioPage and NowPlaying become clickable Links

## Files Created/Modified
- `web/src/pages/ArtistProfilePage.tsx` - Fetches /api/artist/:username, displays hero header (128px avatar, display name, @username, bio), track catalog with cover/title/genre/duration, handles loading/error/404/empty states
- `web/src/pages/NotFoundPage.tsx` - Simple centered message with Link back to radio, accepts optional message prop
- `web/src/App.tsx` - Added /artist/:username and * (404 catch-all) routes
- `web/src/layouts/RadioLayout.tsx` - Removed justify-center from main to allow per-page alignment control
- `web/src/pages/RadioPage.tsx` - Added justify-center wrapper for centered radio UI, artist name becomes clickable Link
- `web/src/components/Player/NowPlaying.tsx` - Artist name becomes clickable Link with hover accent color

## Decisions Made

1. **Layout flexibility over one-size-fits-all**: Removed justify-center from RadioLayout main element and moved it to RadioPage's wrapper. This allows profile pages to be top-aligned (for scrollable track lists) while radio page remains vertically centered. Each page controls its own alignment needs.

2. **Inline 404 rendering instead of navigation**: When API returns 404, ArtistProfilePage renders the NotFoundPage component inline rather than calling navigate(). This preserves the URL (/artist/:username) showing "Artist not found", which is better UX for sharing broken links.

3. **Display-only track catalog for v1.1**: Track catalog shows all track metadata (cover, title, genre, duration) but has no click-to-play behavior. This keeps the scope focused on profile viewing; playback integration is deferred to future work.

4. **Artist name priority hierarchy**: Display artistDisplayName (if set) > artistName (submitted with track) > truncated wallet (fallback). This provides the best UX as profiles evolve from wallet-only to claimed usernames to custom display names.

5. **Rounded-square avatars (not circles)**: Used rounded-xl (16px border radius) for avatar styling rather than full circles. Follows design guidance from CONTEXT.md for a modern, Spotify-like aesthetic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added artist profile links to RadioPage and NowPlaying**
- **Found during:** Task 2 (wiring routes)
- **Issue:** Plan focused on profile pages themselves but didn't specify making artist names clickable throughout the app. Without clickable links, profile pages would be inaccessible (no way for users to discover them).
- **Fix:** Made artist names in RadioPage and NowPlaying.tsx clickable Links that navigate to /artist/:username or /artist/by-wallet/:wallet (for unclaimed profiles). Artist names now use Link component with hover accent color.
- **Files modified:** web/src/pages/RadioPage.tsx, web/src/components/Player/NowPlaying.tsx
- **Verification:** TypeScript compilation passes, artist names render as interactive links
- **Committed in:** be70d94 (Task 2 commit, combined with route wiring)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical functionality)
**Impact on plan:** Essential addition - profile pages would be orphaned without navigation. No scope creep; this is the minimum for profile viewing UX.

## Issues Encountered
None - plan executed smoothly with one necessary addition for navigation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

**Ready for next phases:**
- Profile viewing foundation complete
- 09-03 can build profile submission UI on top of existing pages
- 09-04 can add /artist/by-wallet/:wallet route for unclaimed profiles

**No blockers.**

**Future considerations:**
- Mobile Safari testing needed to confirm smooth navigation between pages while preserving audio state
- Track catalog could evolve to support click-to-queue in future versions
- Avatar resize via CF Images Binding is optional but would improve mobile performance (avatars currently served at original size)

---
*Phase: 09-frontend-profiles*
*Completed: 2026-02-04*
