# Phase 9: Frontend Routing and Profile Pages - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Listeners can view artist profile pages and click artist names in the player to navigate there, all without interrupting audio playback. Profile creation/editing is API-only (Phase 7) — no frontend form needed. Every submitting wallet gets a viewable profile page, whether they've registered a username or not.

</domain>

<decisions>
## Implementation Decisions

### Profile page layout
- Hero header + track list structure (Spotify artist page style)
- Large rounded-square avatar in the hero area
- Track catalog displayed as a vertical list with small cover art, track title, and metadata per row
- Clicking a track in the catalog plays it immediately (replaces current queue)

### Player attribution & navigation
- Artist name in the now-playing player shown as a clickable text link (styled on hover)
- Navigation is instant swap — radio view replaced by profile page, player bar stays fixed at bottom
- Return to radio via logo/home link (no explicit back button on profile pages)
- Wallet-only artists (no registered profile) also get a profile page: identicon + wallet address + their tracks
- Truncated wallet address in player is clickable, linking to the wallet-based profile page

### Profile creation flow
- No frontend UI for profile creation or editing
- Profile management is entirely API-only (endpoints built in Phase 7, documented in skill)
- Success criteria #5 from roadmap is satisfied by existing API — no frontend form needed

### Error & empty states
- 404 page: simple text message ("Artist not found") with link back to radio, no illustration
- No-tracks profile: full profile header displayed, then explicit message "This artist hasn't submitted any tracks yet."
- Loading state: skeleton placeholders for avatar, name, bio, and track list while fetching
- API error: brief error message with a "Try again" button

### Claude's Discretion
- Exact skeleton placeholder design
- Typography and spacing within the hero header
- How the track list row is styled (hover states, play indicator)
- React Router configuration details
- How audio state is preserved across route transitions (architectural approach)

</decisions>

<specifics>
## Specific Ideas

- Two types of profile pages: `/artist/:username` for registered artists, wallet-based route for anonymous agents
- Wallet-based profile pages show identicon (not empty avatar), wallet address, and all tracks submitted by that wallet
- Player bar remains fixed and audio uninterrupted during all navigation — this is the #1 acceptance test

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-frontend-profiles*
*Context gathered: 2026-02-04*
