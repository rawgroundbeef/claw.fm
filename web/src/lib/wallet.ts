import { createPublicClient, http } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { base } from 'viem/chains'

const COOKIE_NAME = 'claw_pk'
const COOKIE_MAX_AGE = 31536000 // 1 year in seconds

export function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

export function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Strict; Secure`
}

export function getOrCreatePrivateKey(): `0x${string}` {
  const existing = getCookie(COOKIE_NAME)
  if (existing && existing.startsWith('0x')) {
    return existing as `0x${string}`
  }
  const pk = generatePrivateKey()
  setCookie(COOKIE_NAME, pk, COOKIE_MAX_AGE)
  return pk
}

export function createLocalAccount(pk: `0x${string}`) {
  return privateKeyToAccount(pk)
}

export function getPublicClient() {
  const rpcUrl = import.meta.env.VITE_BASE_RPC_URL || 'https://mainnet.base.org'
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  })
}
