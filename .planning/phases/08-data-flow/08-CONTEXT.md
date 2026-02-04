# Phase 8: Data Flow Enrichment - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Enrich now-playing and queue API responses with artist profile data (display name, username, avatar, bio excerpt). Tracks from wallets without profiles fall back to truncated wallet addresses with identicon avatars. Frontend routing and profile pages are Phase 9.

</domain>

<decisions>
## Implementation Decisions

### Enriched data shape
- Include full profile snippet in track responses: `artistUsername`, `artistDisplayName`, `artistAvatarUrl`, `artistBio` (truncated)
- Avatar URL is the resized 256x256 thumbnail only (not the original full-size image)
- Bio truncated server-side to ~100 characters
- No profile path/URL in the response — frontend constructs `/artist/:username` from `artistUsername`
- Both now-playing and queue endpoints get enriched (listeners see artist info for upcoming tracks too)

### Fallback display
- Wallets without profiles display as `0x1234...abcd` format (first 6 + last 4 characters)
- Identicon generated from wallet address for avatar placeholder
- No visual distinction between registered and unregistered artists — wallet address simply appears where display name would be

### Staleness & refresh
- Profile updates appear on next poll/track change — no push mechanism needed
- Existing polling infrastructure handles refresh naturally

### Edge cases
- Retroactive attribution: when a wallet creates a profile, all existing tracks from that wallet get attributed (natural LEFT JOIN behavior)
- Both queue and now-playing endpoints enriched with artist data

### Claude's Discretion
- Identicon generation approach (client-side vs server-side)
- Cache granularity (per-artist vs per-track) — pick based on existing KV patterns
- Cache invalidation timing — pick based on existing `invalidateNowPlaying` patterns
- Username change handling (immediate break vs grace period)
- Mid-session profile creation behavior (update on next poll vs next track)
- Enrichment failure resilience strategy (fallback to wallet vs error)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The key constraint is that enrichment must never block or degrade the playback experience.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-data-flow*
*Context gathered: 2026-02-04*
