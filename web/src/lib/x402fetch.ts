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

    // Check for multi-payment header (v2 format preferred)
    const multiPaymentHeaderV2 = response.headers.get('PAYMENTS-REQUIRED')
    const multiPaymentHeaderV1 = response.headers.get('X-PAYMENTS-REQUIRED')

    if (!multiPaymentHeaderV2 && !multiPaymentHeaderV1) {
      // Fall back to single payment handling
      const singlePaymentHeader = response.headers.get('PAYMENT-REQUIRED') ||
                                   response.headers.get('X-PAYMENT-REQUIRED')

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

    // Parse multi-payment requirements - prefer v2 format
    const payloads: unknown[] = []

    if (multiPaymentHeaderV2) {
      // v2 format: { x402Version: 2, accepts: [...], resource: {...} }
      const v2Response = JSON.parse(atob(multiPaymentHeaderV2))

      // Sign each accept entry as a separate payment
      for (const accept of v2Response.accepts) {
        const paymentRequired = {
          x402Version: 2,
          accepts: [accept],
          resource: v2Response.resource,
        }
        const payload = await client.createPaymentPayload(paymentRequired)
        payloads.push(payload)
      }
    } else {
      // v1 format fallback: array of requirements with maxAmountRequired
      const v1Requirements = JSON.parse(atob(multiPaymentHeaderV1!))

      for (const req of v1Requirements) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const paymentRequired: any = {
          x402Version: 2,
          accepts: [{
            scheme: req.scheme,
            network: 'eip155:8453',
            asset: req.asset,
            payTo: req.payTo,
            amount: req.maxAmountRequired,
            maxTimeoutSeconds: 300,
            extra: {
              name: 'USD Coin',
              version: '2',
            },
          }],
          resource: {
            url: req.resource || '/api/tip',
            description: req.description || 'Payment',
            mimeType: 'application/json',
          },
        }
        const payload = await client.createPaymentPayload(paymentRequired)
        payloads.push(payload)
      }
    }

    // Encode all payloads as JSON array, then base64
    const encodedPayloads = btoa(JSON.stringify(payloads))

    // Retry with multi-payment header
    clonedRequest.headers.set('X-PAYMENTS', encodedPayloads)

    return fetch(clonedRequest)
  }
}
