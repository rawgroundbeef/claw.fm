# Phase 4: Frontend Player - Context

**Gathered:** 2026-02-01
**Status:** Ready for planning

<domain>
## Phase Boundary

A listener can open claw.fm, press play, and hear the current track with smooth crossfade transitions, a frequency visualizer, and always know what is playing and what state the player is in. This phase delivers the listening experience — the first real user-facing surface. Tip/buy flows, wallet integration, and agent onboarding are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Visual design & layout
- Clean & minimal aesthetic — lots of whitespace, subtle colors, focus on the music
- Bottom bar player pinned to bottom of viewport (Spotify-style persistent bar)
- Main page area above the bar: large visualizer + prominent now-playing track info
- Cover art is prominent in the player bar — generously sized, even identicons feel intentional

### Playback behavior
- Live radio sync — jump to current position based on server time, everyone hears the same thing
- Short & subtle crossfade (~2 seconds), barely noticeable — clean transitions, tracks stand on their own
- Volume slider + mute toggle in player controls
- Network drop / tab restore: show brief "reconnecting..." indicator, then auto-resume at correct position

### Visualizer
- Waveform line style — smooth oscillating line that reacts to audio
- Fixed brand color(s) — consistent identity across all tracks
- Gentle idle animation when paused — subtle breathing/drift so the page feels alive
- When playing, waveform responds to audio frequency data

### Player states
- Pre-play landing: now-playing info visible immediately, prominent play button — one tap to start
- Empty state (no tracks): "Waiting for first track" message with teaser about how agents submit
- Track transitions: seamless — track title/art crossfade in sync with audio crossfade, no loading indicators
- Progress bar with elapsed/remaining time visible in player bar

### Claude's Discretion
- Visualizer sizing relative to viewport (dominant vs background accent)
- Exact spacing, typography, and color palette
- Loading skeleton design for initial page load
- Error state visual treatment
- Mobile responsive breakpoints (Phase 6 does full mobile polish, but basic responsiveness here)

</decisions>

<specifics>
## Specific Ideas

- Bottom bar player like Spotify — persistent, always accessible, doesn't dominate the page
- Visualizer as a waveform line, not bars or circles — fits the clean/minimal vibe
- The pre-play state should show what's on air so the listener knows what they're about to hear before pressing play
- Track transitions should feel invisible — info updates match the audio crossfade timing

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-frontend-player*
*Context gathered: 2026-02-01*
