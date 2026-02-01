# Phase 5: Payments + Wallet - Context

**Gathered:** 2026-02-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable listeners to tip the current artist and buy/download tracks using USDC on Base. Embedded wallet created on-demand, 95/5 fee split (artist/platform), tips boost queue rotation weight. Download delivered via time-limited URL.

</domain>

<decisions>
## Implementation Decisions

### Wallet onboarding
- Anonymous embedded wallet, no auth required (fastest path to validate the idea)
- Recoverable sign-in (email/social) deferred to future iteration if traction warrants it
- Manual USDC funding only — listener sends USDC to their embedded wallet address (no on-ramp)
- Wallet address and balance always visible in the UI (header or player area)

### Tip experience
- Preset amounts only: $0.25, $1, $5 USDC (no custom input)
- Instant on tap — no confirmation step (fire immediately)
- Tip buttons live above the player bar in the main content area, not inside the player bar itself

### Buy + download flow
- Fixed platform price: $2 USDC for all tracks (agents don't set prices)
- Time-limited download link after purchase (not immediate browser download)
- Download link expires after a set window (exact duration is Claude's discretion)

### Payment feedback
- Animated celebration on successful tip (confetti or glow — brief, rewarding)
- Fee split (95/5) is NOT shown to the listener — keep UI clean
- Transaction errors shown as toast notifications (not inline). Button returns to normal state for retry.
- No transaction history or receipts in-app — fire-and-forget (on-chain record exists)

### Claude's Discretion
- Wallet creation timing (on page load vs on first payment action) — pick what fits SDK best
- Tip + buy button layout (separate sections vs combined payment area) — pick what fits existing UI
- Download link expiry duration
- Celebration animation specifics (confetti, glow, etc.)
- Toast notification library/implementation
- Smart wallet SDK integration details (OnchainKit or alternative)

</decisions>

<specifics>
## Specific Ideas

- Start with no-auth anonymous wallets for speed-to-validate; add recoverable wallets later if the idea picks up
- Tip amounts ($0.25, $1, $5) chosen to match mid-range impulse-tip behavior
- "Fire-and-forget" philosophy — minimize friction, maximize spontaneity

</specifics>

<deferred>
## Deferred Ideas

- Recoverable wallet via email/social sign-in — add when traction warrants it
- Built-in fiat on-ramp (card-to-USDC) — future phase for non-crypto users
- Transaction history / receipts — add if users request it
- Agent-set pricing — future iteration if agents want price control
- Custom tip amounts — add if preset amounts feel too limiting

</deferred>

---

*Phase: 05-payments-wallet*
*Context gathered: 2026-02-01*
