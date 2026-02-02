# Phase 5: Payments + Wallet - Research

**Researched:** 2026-02-01
**Domain:** Embedded wallets, USDC payments on Base, digital download delivery
**Confidence:** MEDIUM

## Summary

Phase 5 enables listeners to tip artists and buy tracks using USDC on Base via embedded wallets. The standard approach uses OnchainKit/Wagmi for wallet connection, viem for ERC20 USDC transfers, and R2 presigned URLs for time-limited downloads.

**Key findings:**
- OnchainKit provides Smart Wallet creation with passkey authentication (no seed phrases)
- USDC transfers require `useWriteContract` with ERC20 ABI, not `useSendTransaction` (native currency only)
- Payment splitting happens client-side: send 95% to artist, 5% to platform in separate transactions
- R2 presigned URLs support 1 second to 7 days expiration via AWS SDK v3

**Primary recommendation:** Use OnchainKit + Wagmi for wallet management, client-side payment splitting (two transactions), Sonner for toast notifications, and react-canvas-confetti for celebrations. Set download links to 72-hour expiry.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| onchainkit | latest | Wallet UI components | Official Coinbase/Base toolkit, optimized for Smart Wallets |
| wagmi | v2.x | React hooks for Ethereum | Industry standard for Web3 React, OnchainKit built on top of it |
| viem | latest | Ethereum interactions | Modern alternative to ethers.js, TypeScript-first, wagmi dependency |
| @aws-sdk/client-s3 | v3.x | S3-compatible client | R2 presigned URL generation (S3-compatible API) |
| @aws-sdk/s3-request-presigner | v3.x | Presigned URL creation | AWS SDK v3 official presigner package |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sonner | latest | Toast notifications | Lightweight (2-3KB), shadcn/ui ecosystem standard |
| react-canvas-confetti | latest | Celebration animations | Canvas-based, performant with many particles |
| @tanstack/react-query | v5.x | State management | Required by wagmi for async state |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OnchainKit | CDP Embedded Wallets SDK | More control but more setup; OnchainKit provides UI components |
| Sonner | react-hot-toast | Similar API but Sonner is lighter and more modern |
| react-canvas-confetti | react-confetti-explosion | CSS-based (lighter) but limited particle count (~400 max) |

**Installation:**
```bash
# Web package
pnpm add onchainkit wagmi viem @tanstack/react-query sonner react-canvas-confetti

# API package (for presigned URLs)
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## Architecture Patterns

### Recommended Project Structure
```
web/src/
├── components/
│   ├── Wallet.tsx           # OnchainKit <Wallet /> wrapper
│   ├── TipButtons.tsx        # Preset tip amounts ($0.25, $1, $5)
│   ├── BuyButton.tsx         # Fixed $2 purchase
│   ├── ConfettiCelebration.tsx  # Celebration overlay
│   └── WalletDisplay.tsx     # Address + balance display
├── hooks/
│   ├── useUSDCTransfer.ts    # Wraps useWriteContract for USDC
│   └── useDownloadPurchase.ts # Buy flow: transfer + fetch download link
├── lib/
│   └── constants.ts          # USDC contract address, amounts

api/src/routes/
├── downloads.ts              # POST /api/downloads/:trackKey (verify purchase, return presigned URL)
└── tip.ts                    # POST /api/tip (record tip, update tip_weight)
```

### Pattern 1: Client-Side Payment Splitting
**What:** Execute two separate USDC transfers on client: 95% to artist, 5% to platform
**When to use:** Always for this phase (smart contract splitters add complexity)
**Example:**
```typescript
// Source: Inferred from wagmi useWriteContract documentation
import { useWriteContract } from 'wagmi'
import { parseUnits } from 'viem'

const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' // Base mainnet
const PLATFORM_WALLET = '0x...' // Platform fee address

export function useTipTransfer() {
  const { writeContractAsync } = useWriteContract()

  async function sendTip(artistWallet: string, usdcAmount: number) {
    // USDC has 6 decimals, not 18
    const amount = parseUnits(usdcAmount.toString(), 6)
    const artistAmount = (amount * 95n) / 100n
    const platformAmount = (amount * 5n) / 100n

    // Send 95% to artist
    await writeContractAsync({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [artistWallet, artistAmount]
    })

    // Send 5% to platform
    await writeContractAsync({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [PLATFORM_WALLET, platformAmount]
    })
  }

  return { sendTip }
}
```

### Pattern 2: Presigned URL Generation (API)
**What:** Generate time-limited R2 download URLs with AWS SDK v3
**When to use:** After verifying payment on-chain
**Example:**
```typescript
// Source: https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const S3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

async function generateDownloadUrl(trackKey: string): Promise<string> {
  const url = await getSignedUrl(
    S3,
    new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: trackKey
    }),
    { expiresIn: 259200 } // 72 hours (3 days)
  )
  return url
}
```

### Pattern 3: OnchainKit Wallet Integration
**What:** Wrap app with OnchainKit providers for Smart Wallet support
**When to use:** App entry point
**Example:**
```typescript
// Source: https://docs.base.org/onchainkit/wallet/wallet
import { OnchainKitProvider } from '@coinbase/onchainkit'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { base } from 'wagmi/chains'
import { createConfig, http } from 'wagmi'
import { coinbaseWallet } from 'wagmi/connectors'

const config = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: 'Claw FM',
      preference: 'smartWalletOnly', // Force Smart Wallet
    }),
  ],
  transports: {
    [base.id]: http(),
  },
})

const queryClient = new QueryClient()

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={import.meta.env.VITE_ONCHAINKIT_API_KEY}
          chain={base}
        >
          {/* App content */}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

### Anti-Patterns to Avoid
- **Using `useSendTransaction` for USDC:** This hook is for native currency (ETH) only. Use `useWriteContract` with ERC20 ABI.
- **Assuming 18 decimals:** USDC uses 6 decimals. Always `parseUnits(amount, 6)` not `parseUnits(amount, 18)`.
- **Unlimited presigned URL expiry:** Max is 7 days (604,800 seconds). Recommended: 72 hours for downloads.
- **Smart contract payment splitters in Phase 5:** Adds deployment complexity. Client-side splitting is sufficient.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wallet connection UI | Custom modals | OnchainKit `<Wallet />` | Handles Smart Wallet passkey flow, mobile/web responsive, maintained by Coinbase |
| ERC20 transfer state | Custom async logic | wagmi `useWriteContract` | Manages transaction lifecycle, pending state, errors, TanStack Query integration |
| Toast notifications | CSS animations | Sonner | 2KB, accessible, stacking, promise-based toasts (toast.promise for tx status) |
| Transaction signing | Direct viem calls | wagmi hooks | Abstract wallet connection, account management, chain switching |
| Download URL validation | Custom expiry logic | R2 presigned URLs | Cryptographically secure, cannot be tampered, automatic expiry |

**Key insight:** OnchainKit + wagmi handle the complex Smart Wallet lifecycle (passkey creation, account abstraction, gas sponsorship if configured). Building this from scratch would require understanding ERC-4337, session keys, and MPC key management.

## Common Pitfalls

### Pitfall 1: USDC Decimal Precision
**What goes wrong:** Transaction fails with "transfer amount exceeds balance" even though user has enough USDC
**Why it happens:** USDC uses 6 decimals, not 18. `parseUnits("1", 18)` = 1e18, but should be `parseUnits("1", 6)` = 1e6
**How to avoid:** Always specify decimals in parseUnits: `parseUnits(amount.toString(), 6)`
**Warning signs:** "Cannot estimate gas" or "insufficient funds" errors with correct balance

### Pitfall 2: Wallet Not Connected on Payment Action
**What goes wrong:** `useWriteContract` throws "connector not found" when user taps tip/buy
**Why it happens:** Smart Wallet creation is async. If wallet creation happens "on demand," there's a delay
**How to avoid:** Create wallet on page load (not on first payment action). Check `useAccount().isConnected` before showing payment buttons
**Warning signs:** Buttons clickable but no transaction prompt appears

### Pitfall 3: Transaction Sequencing with Split Payments
**What goes wrong:** First transfer succeeds, second fails, leaving incomplete payment
**Why it happens:** Gas estimation failure, wallet rejection, or insufficient balance after first transfer
**How to avoid:** Wrap both transfers in try/catch, show "Approving 2 transactions..." toast, handle partial success
**Warning signs:** Artist receives 95% but platform doesn't receive 5%

### Pitfall 4: Presigned URL Reusability
**What goes wrong:** Customer shares download link, multiple people download the file
**Why it happens:** R2 presigned URLs are not one-time use; they're valid until expiry for unlimited downloads
**How to avoid:** Accept this limitation or track downloads server-side (query R2 access logs). 72-hour expiry limits damage
**Warning signs:** Higher-than-expected R2 egress, customer support reports about shared links

### Pitfall 5: Insufficient USDC Balance
**What goes wrong:** User taps tip, wallet shows error, but UI doesn't explain why
**Why it happens:** No balance check before attempting transfer
**How to avoid:** Use `useBalance({ address, token: USDC_ADDRESS })` to check balance before showing buttons. Disable buttons with "Insufficient USDC" tooltip if balance too low
**Warning signs:** Users report "transaction failed" with no explanation

### Pitfall 6: Network Mismatch
**What goes wrong:** User's wallet is on Ethereum mainnet, app expects Base
**Why it happens:** wagmi doesn't automatically switch chains
**How to avoid:** Use `useSwitchChain()` hook, prompt user to switch to Base before transaction. OnchainKit handles this if configured correctly
**Warning signs:** "Chain mismatch" or "unsupported chain" errors

## Code Examples

Verified patterns from official sources:

### Checking USDC Balance Before Payment
```typescript
// Source: wagmi useBalance documentation
import { useBalance } from 'wagmi'
import { parseUnits } from 'viem'

const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'

function TipButton({ amount, artistWallet }: { amount: number; artistWallet: string }) {
  const { address } = useAccount()
  const { data: balance } = useBalance({
    address,
    token: USDC_ADDRESS,
  })

  const requiredAmount = parseUnits(amount.toString(), 6)
  const hasEnough = balance && balance.value >= requiredAmount

  return (
    <button disabled={!hasEnough}>
      {hasEnough ? `Tip $${amount}` : 'Insufficient USDC'}
    </button>
  )
}
```

### Toast for Transaction Status
```typescript
// Source: https://github.com/emilkowalski/sonner
import { toast } from 'sonner'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'

function useTipWithToast() {
  const { writeContractAsync } = useWriteContract()

  async function sendTip(artistWallet: string, amount: bigint) {
    const txPromise = writeContractAsync({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [artistWallet, amount]
    })

    toast.promise(txPromise, {
      loading: 'Sending tip...',
      success: 'Tip sent!',
      error: (err) => err.message || 'Transaction failed',
    })

    return txPromise
  }

  return { sendTip }
}
```

### Confetti Celebration on Success
```typescript
// Source: https://www.npmjs.com/package/react-canvas-confetti
import { useCallback } from 'react'
import ReactCanvasConfetti from 'react-canvas-confetti'

export function ConfettiCelebration({ trigger }: { trigger: boolean }) {
  const onInit = useCallback(({ confetti }) => {
    if (trigger) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      })
    }
  }, [trigger])

  return (
    <ReactCanvasConfetti
      style={{
        position: 'fixed',
        pointerEvents: 'none',
        width: '100%',
        height: '100%',
        top: 0,
        left: 0,
        zIndex: 9999,
      }}
      onInit={onInit}
    />
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Browser extension wallets (MetaMask) | Embedded Smart Wallets (OnchainKit) | 2024-2025 | Users create wallets with passkey, no seed phrases |
| Seed phrase backup | Passkey authentication | 2024-2025 | Eliminates user friction, uses device biometrics |
| Manual gas fee management | Gas sponsorship (ERC-4337 paymasters) | 2024-2025 | Platform can cover gas, invisible to users |
| ethers.js | viem | 2023-2024 | TypeScript-first, tree-shakeable, modern async/await |
| Approval + transferFrom pattern | Direct transfer for tips | Always | Approval needed for contracts, but tips are simple transfers |

**Deprecated/outdated:**
- **CDP Embedded Wallets SDK direct usage:** OnchainKit abstracts this with React components (still uses CDP under the hood)
- **PAYMENT-SIGNATURE header for x402:** Removed in Phase 2, x402 standard uses X-PAYMENT only
- **Wagmi v1:** v2 released in 2024, different API (no more `usePrepareContractWrite`)

## Open Questions

Things that couldn't be fully resolved:

1. **OnchainKit Smart Wallet creation timing**
   - What we know: OnchainKit creates Smart Wallets with passkey on connect
   - What's unclear: Performance on first connect (does passkey prompt block UI?)
   - Recommendation: Test on real devices. If slow, create wallet on page load. If fast, create on first payment action.

2. **Gas sponsorship for USDC transfers**
   - What we know: ERC-4337 Smart Wallets support paymasters for gas sponsorship
   - What's unclear: Whether OnchainKit/Coinbase provides free gas sponsorship for Base or requires custom paymaster
   - Recommendation: Start without sponsorship (users pay gas). Add sponsorship in polish phase if needed.

3. **Payment verification before download**
   - What we know: Download URL generation should verify payment on-chain
   - What's unclear: Best verification approach (listen for Transfer events vs query balance changes)
   - Recommendation: Query USDC contract for Transfer events with platform wallet as recipient. Cache verification for 5 minutes.

4. **Tip weight update timing**
   - What we know: Tips should increase track rotation weight (QUEU-04)
   - What's unclear: Update immediately (before transaction confirms) or after confirmation
   - Recommendation: Update after transaction confirmation to prevent front-running. Poll transaction status, then call API to update tip_weight.

5. **Handling failed second transaction in split payment**
   - What we know: If artist receives 95% but platform transfer fails, it's incomplete
   - What's unclear: Retry logic, UI state, whether to record partial tip
   - Recommendation: Show retry button for failed platform transfer. Record tip as "pending" until both succeed. Display "Completing tip..." state.

## Sources

### Primary (HIGH confidence)
- [OnchainKit Wallet Documentation](https://docs.base.org/onchainkit/latest/components/wallet/wallet) - Wallet component API
- [Cloudflare R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) - Presigned URL generation
- [Circle USDC Contract Addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses) - Base mainnet USDC address: 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913
- [Cloudflare R2 AWS SDK v3 Example](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/) - S3Client configuration for R2
- [Wagmi useWriteContract API](https://wagmi.sh/react/api/hooks/useWriteContract) - ERC20 transfer pattern
- [Sonner GitHub](https://github.com/emilkowalski/sonner) - Toast notification library

### Secondary (MEDIUM confidence)
- [Coinbase Smart Wallet Blog](https://www.coinbase.com/blog/a-new-era-in-crypto-wallets-smart-wallet-is-here) - Smart Wallet features (passkey, gas sponsorship)
- [Top 10 Embedded Wallets 2026](https://www.openfort.io/blog/top-10-embedded-wallets) - Embedded wallet comparison (CDP, OnchainKit)
- [React Confetti Libraries Comparison](https://codilime.com/blog/react-confetti/) - react-canvas-confetti vs alternatives
- [Top 9 React Notification Libraries 2026](https://knock.app/blog/the-top-notification-libraries-for-react) - Sonner recommendation
- [USDC Decimal Precision](https://github.com/ethers-io/ethers.js/discussions/2129) - 6 decimals, not 18

### Tertiary (LOW confidence - marked for validation)
- WebSearch: Presigned URL best practices - 72-hour expiry recommendation from multiple e-commerce platforms (not official AWS guidance)
- WebSearch: Payment splitter patterns - General smart contract patterns, not Base-specific
- WebSearch: Download link reusability - Community forum discussions, not official R2 documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - OnchainKit, wagmi, viem, AWS SDK are all officially documented and current
- Architecture: MEDIUM - Patterns inferred from documentation but not Phase 5-specific examples
- Pitfalls: MEDIUM - Based on community discussions and general ERC20/wallet integration experience, not Phase 5 field testing

**Research date:** 2026-02-01
**Valid until:** 2026-03-01 (30 days - stable ecosystem, but OnchainKit updates frequently)
