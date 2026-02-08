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

/**
 * Multi-payment requirement from server
 */
interface MultiPaymentRequirement {
  label: string
  scheme: string
  network: string
  maxAmountRequired: string
  asset: string
  resource: string
  description: string
  payTo: string
}

/**
 * Creates a fetch function that handles multi-payment 402 responses.
 * Used for tip/download endpoints that require 3 separate payments.
 *
 * When server returns 402 with X-PAYMENTS-REQUIRED header:
 * 1. Parses array of payment requirements
 * 2. Signs each payment authorization with the local account
 * 3. Retries with X-PAYMENTS header containing all signed payloads
 */
export function createMultiPaymentFetch(account: PrivateKeyAccount) {
  const client = new x402Client()
  registerExactEvmScheme(client, { signer: account })

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const clonedRequest = request.clone()
    const response = await fetch(request)

    if (response.status !== 402) {
      return response
    }

    // Check for multi-payment header
    const multiPaymentHeader = response.headers.get('X-PAYMENTS-REQUIRED')

    if (!multiPaymentHeader) {
      // Fall back to single payment handling
      const singlePaymentHeader = response.headers.get('X-PAYMENT-REQUIRED') ||
                                   response.headers.get('PAYMENT-REQUIRED')

      if (!singlePaymentHeader) {
        return response // No payment info, return as-is
      }

      // Handle single payment (existing flow)
      const requirements = JSON.parse(atob(singlePaymentHeader))
      const payload = await client.createPaymentPayload(requirements)
      const encodedPayload = btoa(JSON.stringify(payload))

      clonedRequest.headers.set('X-PAYMENT', encodedPayload)
      clonedRequest.headers.set('PAYMENT-SIGNATURE', encodedPayload)

      return fetch(clonedRequest)
    }

    // Parse multi-payment requirements
    const requirements: MultiPaymentRequirement[] = JSON.parse(atob(multiPaymentHeader))

    // Sign each payment
    const payloads: unknown[] = []
    for (const req of requirements) {
      // Convert to format expected by x402Client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const paymentRequired: any = {
        x402Version: 2,
        accepts: [{
          scheme: req.scheme,
          network: req.network === 'base' ? 'eip155:8453' : req.network,
          asset: req.asset,
          payTo: req.payTo,
          maxAmountRequired: req.maxAmountRequired,
          extra: {
            name: 'USD Coin',
            version: '2',
          },
        }],
        resource: {
          url: req.resource,
          description: req.description,
          mimeType: 'application/json',
        },
      }

      const payload = await client.createPaymentPayload(paymentRequired)
      payloads.push(payload)
    }

    // Encode all payloads as JSON array, then base64
    const encodedPayloads = btoa(JSON.stringify(payloads))

    // Retry with multi-payment header
    clonedRequest.headers.set('X-PAYMENTS', encodedPayloads)

    return fetch(clonedRequest)
  }
}
