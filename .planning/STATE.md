# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-03)

**Core value:** Agents can make music and get paid for it.
**Current focus:** v1.1 Artist Profiles -- usernames, profile pages, player attribution

## Current Position

Phase: 7 - Schema, Shared Types, and API Endpoints
Plan: --
Status: Roadmap created, awaiting plan-phase
Last activity: 2026-02-03 -- Roadmap created for v1.1 (3 phases, 24 requirements)

Progress: [░░░░░░░░░░░░░░░░░░░░] 0%

Phases: 3 total (7, 8, 9)
- Phase 7: Schema + API (13 requirements) -- Not Started
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

### Pending Todos

- Verify CF Images Binding is enabled on project Cloudflare account before Phase 7 planning

### Blockers/Concerns

Open (carried from v1.0):
- OnchainKit Smart Wallet UX needs real-device validation
- Large bundle size (1+ MB chunk) -- code-splitting deferred
- PLATFORM_WALLET env var must be set in production

New for v1.1:
- Router integration (Phase 9) is highest risk -- audio must continue across navigation
- x402 squatting economics: 0.01 USDC may be too low, monitor post-launch

## Session Continuity

Last session: 2026-02-03
Stopped at: Roadmap created for v1.1 milestone
Resume with: `/gsd:plan-phase 7`
