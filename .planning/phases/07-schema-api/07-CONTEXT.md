# Phase 7: Schema, Shared Types, and API Endpoints - Context

**Gathered:** 2026-02-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Agents can create and manage artist profiles via API with x402 payment. Includes username registration, display name, bio, avatar upload, and profile updates. Also includes public lookup endpoints (by username and by wallet) and username availability check. Data flow enrichment (Phase 8) and frontend (Phase 9) are separate.

</domain>

<decisions>
## Implementation Decisions

### Profile data rules
- **Required on creation:** username + display name
- **Optional on creation:** bio (can be added/updated later)
- **Avatar:** NOT part of profile creation — separate endpoint (see Avatar handling below)
- **Username format:** alphanumeric + underscores only, 3-20 characters, case-insensitive uniqueness (COLLATE NOCASE)
- **Bio max length:** Claude's discretion
- **One profile per wallet** — a wallet maps to exactly one artist identity

### Avatar handling
- **Separate from profile creation** — profile is created first via `PUT /api/profile`, avatar uploaded via a separate endpoint afterward
- **Avatar endpoint requires x402 payment** (same as profile creation — discourages spam uploads)
- **Accepted formats:** PNG, JPG, WebP (CF Images handles conversion to WebP for serving)
- **Fallback display:** Identicon generated from wallet address when no avatar is uploaded
- **Max upload size / resize:** Claude's discretion (CF Images Binding resizes to 256x256 WebP per roadmap)

### API response shape
- **Wallet address is always public** in profile responses
- **Error format:** Match existing v1.0 API error patterns for consistency
- **Track catalog:** Separate paginated endpoint vs inline in profile response — Claude's discretion (user leaned toward separate)
- **Wallet-based lookup** (`GET /api/artist/by-wallet/:wallet`): Response shape — Claude's discretion

### Username lifecycle
- **One profile per wallet** — no multiple usernames per wallet
- **Username changes:** Supported via paid `PUT /api/profile` (same x402 cost as initial registration)
- **Old username on change:** Released immediately — available for anyone to claim
- **Reserved word blocklist:** System routes + common confusing terms (admin, api, artist, settings, help, support, official, verified, etc.)

### Claude's Discretion
- Bio max length (sensible limit)
- Avatar max upload size
- Track catalog endpoint design (separate paginated vs inline)
- Wallet-based lookup response shape (full profile vs pointer)
- Exact reserved username blocklist contents
- Error message wording (matching v1.0 patterns)

</decisions>

<specifics>
## Specific Ideas

- Avatar upload separated from profile creation was a deliberate product decision — keeps x402 payment flow clean and atomic for profile creation, avatar is independent
- Identicon fallback from wallet address gives every profile a unique visual identity even without an uploaded avatar
- Username release on change is immediate — no cooldown or permanent reservation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-schema-api*
*Context gathered: 2026-02-04*
