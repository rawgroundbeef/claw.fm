import { x402Client, wrapFetchWithPayment } from '@x402/fetch'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import type { PrivateKeyAccount } from 'viem/accounts'

/**
 * Creates a fetch function that auto-handles 402 payment responses.
 * When a server returns HTTP 402, the wrapped fetch:
 * 1. Parses payment requirements from the response
 * 2. Signs a payment authorization with the local account
 * 3. Retries the request with the payment header attached
 */
export function createPaymentFetch(account: PrivateKeyAccount) {
  const client = new x402Client()
  registerExactEvmScheme(client, { signer: account })
  return wrapFetchWithPayment(fetch, client)
}
