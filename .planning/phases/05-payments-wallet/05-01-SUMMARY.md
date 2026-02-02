---
phase: 05-payments-wallet
plan: 01
subsystem: web-payments
tags: [wagmi, onchainkit, web3, wallet, usdc, base, smart-wallet]
requires:
  - 04-06-SUMMARY.md  # Frontend player with error recovery
provides:
  - Web3 provider infrastructure (Wagmi + TanStack Query + OnchainKit)
  - Wallet connection UI with Smart Wallet support
  - USDC balance display
  - Toast notification system (Sonner)
  - Payment constants and wagmi config
affects:
  - 05-02  # Tip/buy endpoints depend on wallet infrastructure
  - 05-03  # Tip/buy UI components depend on wagmi hooks and constants
tech-stack:
  added:
    - @coinbase/onchainkit@1.1.2
    - wagmi@2.19.5 (downgraded from v3 for OnchainKit compatibility)
    - viem@2.45.1
    - @tanstack/react-query@5.90.20
    - sonner@2.0.7
    - react-canvas-confetti@2.0.7
  patterns:
    - Provider hierarchy: WagmiProvider > QueryClientProvider > OnchainKitProvider
    - Smart Wallet on-demand creation via coinbaseWallet connector with smartWalletOnly preference
    - Wagmi hooks for wallet state (useAccount, useConnect, useDisconnect, useBalance)
key-files:
  created:
    - web/src/lib/wagmi.ts
    - web/src/lib/constants.ts
    - web/src/components/WalletDisplay.tsx
  modified:
    - web/src/main.tsx
    - web/src/App.tsx
    - web/package.json
key-decisions:
  - decision: Use wagmi v2.16 instead of v3.x
    rationale: OnchainKit 1.1.2 requires wagmi v2.16+ (peer dependency constraint)
    impact: All subsequent wagmi usage must follow v2 API
  - decision: smartWalletOnly preference in coinbaseWallet connector
    rationale: Enables on-demand Smart Wallet creation during first payment (PAY-03) without explicit wallet creation step
    impact: User doesn't need separate "create wallet" flow - wallet created automatically on first payment interaction
  - decision: Minimal ERC20 ABI fragment for transfer function only
    rationale: Avoid importing full erc20Abi from viem (reduces bundle size)
    impact: Future payment plans use ERC20_TRANSFER_ABI constant
  - decision: OnchainKitProvider without apiKey
    rationale: Basic wallet connection and transaction signing work without API key; advanced features not needed yet
    impact: Can add apiKey later if identity resolution or gas estimation needed
  - decision: PLATFORM_WALLET from env var with fallback
    rationale: Deployment flexibility - different wallets for dev/staging/prod
    impact: Must set VITE_PLATFORM_WALLET in production environment
duration: 4.5 minutes
completed: 2026-02-02
---

# Phase 05 Plan 01: Web3 Provider Setup and Wallet UI

**One-liner:** Wagmi v2 + OnchainKit provider infrastructure with Smart Wallet connection (smartWalletOnly) and USDC balance display.

## Performance

- **Duration:** 4.5 minutes
- **Start:** 2026-02-02T00:28:10Z
- **End:** 2026-02-02T00:32:41Z
- **Tasks:** 3/3 completed
- **Files created:** 3
- **Files modified:** 3

## Accomplishments

### Provider Infrastructure
- Installed all Web3 dependencies: @coinbase/onchainkit, wagmi, viem, @tanstack/react-query, sonner, react-canvas-confetti
- Created wagmi config with Base chain and coinbaseWallet connector
- Configured `smartWalletOnly` preference for on-demand Smart Wallet creation (PAY-03: wallet created automatically during first payment interaction)
- Wrapped App with provider hierarchy: WagmiProvider > QueryClientProvider > OnchainKitProvider
- Added Sonner Toaster for toast notifications (bottom-right, richColors)

### Payment Constants
- Created constants.ts with:
  - USDC_ADDRESS: Base mainnet USDC contract (0x833589fcd6edb6e08f4c7c32d4f71b54bda02913)
  - PLATFORM_WALLET: Environment-based wallet address with fallback
  - TIP_AMOUNTS: [0.25, 1, 5] USDC
  - BUY_PRICE_USDC: $2 per track
  - USDC_DECIMALS: 6
  - ERC20_TRANSFER_ABI: Minimal ABI fragment for transfer function

### Wallet UI
- Created WalletDisplay component with:
  - Connect button (triggers Coinbase Smart Wallet flow)
  - Truncated address display (0x1234...5678 format)
  - USDC balance formatted to 2 decimals
  - Disconnect dropdown on click
- Wired WalletDisplay into App.tsx header (flex row with claw.fm title on left, wallet on right)
- All existing player functionality preserved (no regressions)

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 72edd8a | Install Web3 dependencies and create wagmi config with smartWalletOnly preference |
| 2 | a27ae32 | Wrap app with WagmiProvider, QueryClientProvider, OnchainKitProvider, and Toaster |
| 3 | b80f800 | Create WalletDisplay component and wire into App header (includes wagmi v2 downgrade) |

## Files Created

1. **web/src/lib/wagmi.ts** - Wagmi config with Base chain and coinbaseWallet connector (smartWalletOnly)
2. **web/src/lib/constants.ts** - Payment constants (USDC address, platform wallet, tip amounts, buy price, minimal ERC20 ABI)
3. **web/src/components/WalletDisplay.tsx** - Wallet connection button and address/balance display

## Files Modified

1. **web/src/main.tsx** - Added provider hierarchy and Toaster
2. **web/src/App.tsx** - Added WalletDisplay to header (flex row layout)
3. **web/package.json** - Added Web3 dependencies (wagmi v2.19.5, onchainkit, viem, react-query, sonner, confetti)

## Decisions Made

### Wagmi v2 vs v3
**Decision:** Use wagmi v2.16 instead of v3.x
**Context:** OnchainKit 1.1.2 has peer dependency `wagmi@^2.16`. Installing wagmi v3 initially caused build failure (`Missing "./experimental" specifier in "wagmi" package`).
**Impact:** Downgraded to wagmi v2.19.5 for compatibility. All subsequent payment plans must use wagmi v2 API (useBalance with `token` parameter works in v2, not v3).

### Smart Wallet On-Demand Creation
**Decision:** Use `smartWalletOnly` preference in coinbaseWallet connector
**Context:** PAY-03 plan requires Smart Wallet for payment transactions. Explicit "create wallet" flow adds friction.
**Impact:** Smart Wallet created automatically during first payment interaction (writeContract call). Users skip separate wallet creation step. This is a better UX pattern for payment-first flows.

### Minimal ERC20 ABI
**Decision:** Define minimal ABI fragment for `transfer(address,uint256)` function only
**Context:** viem's `erc20Abi` imports the entire ERC20 ABI, increasing bundle size unnecessarily.
**Impact:** Created `ERC20_TRANSFER_ABI` constant with only the transfer function. Future payment plans import this constant instead of full ABI.

### Platform Wallet Configuration
**Decision:** Read PLATFORM_WALLET from `import.meta.env.VITE_PLATFORM_WALLET` with fallback to zero address
**Context:** Different environments (dev/staging/prod) need different platform wallet addresses for receiving payments.
**Impact:** Deployment process must set `VITE_PLATFORM_WALLET` environment variable. Zero address fallback prevents hard-coded production wallet in codebase.

### OnchainKitProvider API Key
**Decision:** Omit `apiKey` prop from OnchainKitProvider
**Context:** Basic wallet connection and transaction signing work without OnchainKit API key. Advanced features (identity resolution, gas estimation) require it.
**Impact:** Can add apiKey later if needed. For MVP payment flow, no API key required.

## Deviations from Plan

None - plan executed exactly as written. One technical adaptation required:

**Wagmi version downgrade (Rule 3 - Blocking):**
- **Found during:** Task 3 build verification
- **Issue:** OnchainKit 1.1.2 peer dependency requires wagmi v2.16, but plan specified wagmi without version constraint. pnpm installed wagmi v3.4.2 by default. Build failed with `Missing "./experimental" specifier in "wagmi" package`.
- **Fix:** Downgraded wagmi to v2.19.5 using `pnpm remove wagmi && pnpm add wagmi@^2.16`. Updated WalletDisplay to use wagmi v2 API (`useBalance` with `token` parameter instead of v3's approach).
- **Files modified:** web/package.json, pnpm-lock.yaml, web/src/components/WalletDisplay.tsx
- **Commit:** Included in Task 3 commit (b80f800)
- **Justification:** Build blocker. Could not complete Task 3 verification without wagmi v2 compatibility.

## Issues

None.

## Next Phase Readiness

**Ready for 05-02 (Tip/Buy Endpoints):**
- ✅ wagmi config exports `config` and `queryClient`
- ✅ constants.ts exports USDC_ADDRESS, PLATFORM_WALLET, TIP_AMOUNTS, BUY_PRICE_USDC, ERC20_TRANSFER_ABI
- ✅ Smart Wallet configured for on-demand creation (PAY-03)
- ✅ Provider hierarchy in place for wagmi hooks
- ✅ Toaster available for payment success/error notifications

**Ready for 05-03 (Tip/Buy UI Components):**
- ✅ WalletDisplay component shows wallet state (connected/disconnected)
- ✅ useAccount hook available for checking wallet connection
- ✅ Payment constants available for tip amounts and buy price
- ✅ Build passes with no TypeScript errors

**Blockers:** None.

**Concerns:**
- Wagmi v2 is older (wagmi v3 is latest). OnchainKit compatibility with wagmi v3 unknown. Consider upgrading OnchainKit in future if wagmi v3 needed.
- PLATFORM_WALLET environment variable must be set in production deployment (currently has fallback to zero address).
- Large bundle size warning (1+ MB chunk). Consider code-splitting wagmi/onchainkit if performance issues arise.
