# x402 Protocol Specification

## Table of Contents

- [V2 Config Shape](#v2-config-shape)
- [V1 Config Shape (Legacy)](#v1-config-shape-legacy)
- [V1 to V2 Differences](#v1-to-v2-differences)
- [HTTP 402 Response Delivery](#http-402-response-delivery)
- [Field Rules](#field-rules)
- [Known Networks (CAIP-2)](#known-networks-caip-2)
- [Known Assets](#known-assets)
- [Simple Name to CAIP-2 Mapping](#simple-name-to-caip-2-mapping)
- [Address Formats](#address-formats)
- [Error Codes](#error-codes)

## V2 Config Shape

```typescript
interface V2Config {
  x402Version: 2
  accepts: AcceptsEntry[]
  resource: Resource
  error?: string
  extensions?: Record<string, unknown>
}

interface AcceptsEntry {
  scheme: string               // e.g., "exact"
  network: string              // CAIP-2 format: "eip155:8453"
  amount: string               // Atomic units, digits only, > 0
  asset: string                // Token contract address
  payTo: string                // Recipient address
  maxTimeoutSeconds?: number   // Positive integer, recommended
  extra?: Record<string, unknown>
}

interface Resource {
  url: string                  // Valid URL
  method?: string              // "GET", "POST", etc.
  headers?: Record<string, string>
  body?: string
}
```

## V1 Config Shape (Legacy)

```typescript
interface V1Config {
  x402Version: 1
  accepts: V1AcceptsEntry[]
  error?: string
  extensions?: Record<string, unknown>
}

interface V1AcceptsEntry {
  scheme: string
  network: string
  maxAmountRequired: string    // Maps to "amount" in v2
  asset: string
  payTo: string
  maxTimeoutSeconds?: number
  resource?: Resource          // Per-entry in v1, top-level in v2
  extra?: Record<string, unknown>
}
```

## V1 to V2 Differences

| Aspect | V1 | V2 |
|--------|----|----|
| Amount field | `maxAmountRequired` | `amount` |
| Resource location | Per-entry (`accepts[i].resource`) | Top-level (`resource`) |
| Version | `x402Version: 1` | `x402Version: 2` |

## HTTP 402 Response Delivery

Config can be delivered two ways:

**1. Response body** (JSON object with `accepts`, `payTo`, or `x402Version` field)

**2. `PAYMENT-REQUIRED` header** (case-insensitive):
- Base64-encoded JSON (standard)
- Raw JSON (some implementations)

## Field Rules

| Field | Required | Validation |
|-------|----------|------------|
| `x402Version` | Yes | Must be `1` or `2` |
| `accepts` | Yes | Non-empty array |
| `accepts[].scheme` | Yes | String |
| `accepts[].network` | Yes | CAIP-2 format: `/^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/` |
| `accepts[].amount` | Yes | String of digits only, > 0 (atomic units, not decimals) |
| `accepts[].asset` | Yes | Token address, validated per network type |
| `accepts[].payTo` | Yes | Recipient address, validated per network type |
| `accepts[].maxTimeoutSeconds` | Recommended | Positive integer |
| `resource` | Recommended (v2) | Object with valid `url` |

## Known Networks (CAIP-2)

### EVM
| CAIP-2 | Name | Testnet |
|--------|------|---------|
| `eip155:8453` | Base | No |
| `eip155:84532` | Base Sepolia | Yes |
| `eip155:43114` | Avalanche C-Chain | No |
| `eip155:43113` | Avalanche Fuji | Yes |

### Solana
| CAIP-2 | Name | Testnet |
|--------|------|---------|
| `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | Solana Mainnet | No |
| `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | Solana Devnet | Yes |
| `solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z` | Solana Testnet | Yes |

### Stellar
| CAIP-2 | Name | Testnet |
|--------|------|---------|
| `stellar:pubnet` | Stellar Mainnet | No |
| `stellar:testnet` | Stellar Testnet | Yes |

### Aptos
| CAIP-2 | Name | Testnet |
|--------|------|---------|
| `aptos:1` | Aptos Mainnet | No |
| `aptos:2` | Aptos Testnet | Yes |

## Known Assets

| Network | Address | Symbol | Decimals |
|---------|---------|--------|----------|
| `eip155:8453` | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` | USDC | 6 |
| `eip155:84532` | `0x036cbd53842c5426634e7929541ec2318f3dcf7e` | USDC | 6 |
| `eip155:43114` | `0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e` | USDC | 6 |
| `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | USDC | 6 |

## Simple Name to CAIP-2 Mapping

Use these when users specify network by simple name instead of CAIP-2:

| Simple Name | CAIP-2 |
|-------------|--------|
| `base` | `eip155:8453` |
| `base-sepolia` | `eip155:84532` |
| `avalanche` | `eip155:43114` |
| `avalanche-fuji` | `eip155:43113` |
| `solana` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| `solana-devnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` |
| `solana-testnet` | `solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z` |
| `stellar` | `stellar:pubnet` |
| `stellar-testnet` | `stellar:testnet` |
| `aptos` | `aptos:1` |

## Address Formats

### EVM (eip155:* networks)
- Format: `0x` + 40 hex characters
- Checksum: EIP-55 mixed-case encoding recommended
- All-lowercase valid but triggers `NO_EVM_CHECKSUM` warning
- Mixed-case must match EIP-55 checksum or triggers `BAD_EVM_CHECKSUM` error

### Solana (solana:* networks)
- Format: 32-44 Base58 characters
- Alphabet: `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`
- Decoded must be exactly 32 bytes

## Error Codes

### Errors (invalid config)
`INVALID_JSON`, `NOT_OBJECT`, `UNKNOWN_FORMAT`, `MISSING_VERSION`, `INVALID_VERSION`, `MISSING_ACCEPTS`, `EMPTY_ACCEPTS`, `INVALID_ACCEPTS`, `MISSING_SCHEME`, `MISSING_NETWORK`, `INVALID_NETWORK_FORMAT`, `MISSING_AMOUNT`, `INVALID_AMOUNT`, `ZERO_AMOUNT`, `MISSING_ASSET`, `MISSING_PAY_TO`, `MISSING_RESOURCE`, `INVALID_URL`, `INVALID_TIMEOUT`, `INVALID_EVM_ADDRESS`, `BAD_EVM_CHECKSUM`, `INVALID_SOLANA_ADDRESS`, `ADDRESS_NETWORK_MISMATCH`

### Warnings (valid but improvable)
`NO_EVM_CHECKSUM`, `UNKNOWN_NETWORK`, `UNKNOWN_ASSET`, `LEGACY_FORMAT`, `MISSING_MAX_TIMEOUT`, `INVALID_BAZAAR_INFO`, `INVALID_BAZAAR_SCHEMA`, `INVALID_OUTPUT_SCHEMA`, `MISSING_INPUT_SCHEMA`
