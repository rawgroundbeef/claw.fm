// Base mainnet USDC contract address
export const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'

// Platform wallet for payments (set via VITE_PLATFORM_WALLET env var)
export const PLATFORM_WALLET =
  import.meta.env.VITE_PLATFORM_WALLET || '0x0000000000000000000000000000000000000000'

// Available tip amounts in USDC
export const TIP_AMOUNTS = [0.25, 1, 5] as const

// Fixed buy price per track in USDC
export const BUY_PRICE_USDC = 2

// USDC token decimals
export const USDC_DECIMALS = 6

// Minimal ERC20 ABI for transfer function
export const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// Minimal ERC20 ABI for balanceOf (used by WalletContext to poll USDC balance)
export const ERC20_BALANCE_OF_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const
