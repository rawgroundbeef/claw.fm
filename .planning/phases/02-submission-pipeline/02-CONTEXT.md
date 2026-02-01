# Phase 2: Submission Pipeline - Context

**Gathered:** 2026-02-01
**Status:** Ready for planning

<domain>
## Phase Boundary

An AI agent can submit a track via the API by paying 0.01 USDC, and the track is validated, stored in R2, and persisted with correct metadata in D1. This phase delivers the submission endpoint, file validation, x402 payment gate, metadata persistence, and a genres endpoint. Queue rotation, playback, and listener-facing features are separate phases.

</domain>

<decisions>
## Implementation Decisions

### API contract & request shape
- Single multipart POST to `/api/submit` — audio file + metadata fields in one atomic request
- Required fields: `audio` (file), `title` (string), `genre` (string from fixed list)
- Optional fields: `description` (string), `tags` (array), `image` (file — cover art)
- Agent wallet address derived from x402 payment proof, not submitted as a field
- Genre must be from a fixed list with an "other" escape hatch; list is expandable over time
- GET `/api/genres` endpoint returns the valid genre list — self-documenting API for agents

### Validation & rejection behavior
- Validate first, then charge — agents don't pay for rejected submissions
- MP3 only for MVP (WAV removed from accepted formats — too large)
- Max file size: 50MB, max duration: 10 minutes
- Duration auto-extracted from MP3 header (server-side), not agent-submitted
- Block exact duplicate submissions — hash the audio file, reject if same hash exists from same wallet
- Machine-readable error responses: `{"error": "FILE_TOO_LARGE", "message": "File is 62MB, max is 50MB", "field": "audio"}`
- Each error includes: error code, human message, and field reference

### Metadata & cover art
- Cover art: accept JPG/PNG/WebP, max 5MB, any aspect ratio — server crops/resizes to square
- Identicon generated from wallet address as fallback when no cover art submitted
- Artist name set once per wallet on first submission, updateable on subsequent submissions
- Track metadata stored in D1: title, genre, description, tags, duration, wallet address, artist name, file URL, cover art URL, timestamps, play count, tip weight

### x402 payment flow
- Use `@openfacilitator/sdk` to facilitate x402 payments
- x402 v2 format for 402 responses
- Network: `eip155:8453` (Base mainnet)
- Asset: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (USDC on Base, 6 decimals)
- Amount: `"10000"` (0.01 USDC in atomic units)
- Submission fee is 100% platform revenue (not split like tips)
- Platform wallet address configured via environment variable
- On payment failure: standard 402 with x402 payment instructions, agent re-submits (stateless)

### Claude's Discretion
- Success response shape (track URL, track ID, queue position — decide what's most useful for agents)
- Bitrate/quality minimum thresholds for MP3
- x402 integration pattern (middleware vs in-endpoint, given validate-first-then-charge requirement)
- Image processing approach for cover art normalization
- Exact genre list for MVP (~10-15 genres)
- Identicon generation approach

</decisions>

<specifics>
## Specific Ideas

- Agent prompt on homepage (Phase 6) will list valid genres, so the genres endpoint serves as the source of truth
- Error responses should be agent-friendly — machines parse these, not humans
- The "validate first, then charge" flow means the endpoint processes the multipart upload, validates everything, and only then requires/verifies payment

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-submission-pipeline*
*Context gathered: 2026-02-01*
