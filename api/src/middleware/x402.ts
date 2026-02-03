import type { Context } from 'hono'
import {
  OpenFacilitator,
  type PaymentPayload,
  type PaymentRequirementsV1,
  FacilitatorError,
} from '@openfacilitator/sdk'

export interface PaymentVerificationResult {
  valid: boolean
  walletAddress?: string
  error?: Response
}

export interface PaymentGateOptions {
  getRequirements: (c: Context, body?: unknown) => Promise<PaymentRequirementsV1>
}

/**
 * Verify x402 payment header and extract wallet address.
 * Accepts both v1 (X-PAYMENT) and v2 (PAYMENT-SIGNATURE) headers.
 * Returns 402 with both v1 (X-PAYMENT-REQUIRED) and v2 (PAYMENT-REQUIRED) headers.
 */
export async function verifyPayment(
  c: Context,
  requirements: PaymentRequirementsV1,
): Promise<PaymentVerificationResult> {
  const paymentHeader =
    c.req.header('X-PAYMENT') || c.req.header('PAYMENT-SIGNATURE')

  if (!paymentHeader) {
    // v1 header: raw requirements for agent clients
    const v1Base64 = btoa(JSON.stringify(requirements))

    // v2 header: wrapped in PaymentRequired envelope for @x402/fetch clients
    const v2Payload = {
      x402Version: 2,
      accepts: [{
        scheme: requirements.scheme,
        network: 'eip155:8453',
        asset: requirements.asset,
        payTo: requirements.payTo,
        amount: requirements.maxAmountRequired,
        maxTimeoutSeconds: 300,
        extra: {
          name: 'USD Coin',
          version: '2',
        },
      }],
      resource: {
        url: requirements.resource || c.req.path,
      },
    }
    const v2Base64 = btoa(JSON.stringify(v2Payload))

    const errorResponse = c.json(
      {
        error: 'PAYMENT_REQUIRED',
        message: `Payment of ${requirements.description || 'USDC'} required`,
        paymentRequirements: requirements,
        x402Version: 1,
      },
      402,
      {
        'X-PAYMENT-REQUIRED': v1Base64,
        'PAYMENT-REQUIRED': v2Base64,
      },
    )

    return { valid: false, error: errorResponse }
  }

  try {
    // Decode the full payment payload — SDK 1.0 handles v1/v2 natively
    const paymentPayload: PaymentPayload = JSON.parse(atob(paymentHeader))

    console.log('[x402] Payment payload version:', paymentPayload.x402Version)

    const facilitator = new OpenFacilitator()

    const verifyResult = await facilitator.verify(paymentPayload, requirements)
    console.log('[x402] Verify:', verifyResult.isValid, verifyResult.invalidReason || '')

    if (!verifyResult.isValid) {
      const errorResponse = c.json(
        {
          error: 'PAYMENT_INVALID',
          message: verifyResult.invalidReason || 'Payment verification failed',
        },
        402,
      )
      return { valid: false, error: errorResponse }
    }

    const settleResult = await facilitator.settle(paymentPayload, requirements)
    console.log('[x402] Settle:', settleResult.success, settleResult.transaction || settleResult.errorReason || '')

    if (!settleResult.success) {
      const errorResponse = c.json(
        {
          error: 'PAYMENT_SETTLEMENT_FAILED',
          message: settleResult.errorReason || 'Payment settlement failed',
        },
        402,
      )
      return { valid: false, error: errorResponse }
    }

    return { valid: true, walletAddress: settleResult.payer }
  } catch (error) {
    console.error('[x402] Exception:', error)
    if (error instanceof FacilitatorError) {
      const errorResponse = c.json(
        {
          error: 'FACILITATOR_ERROR',
          message: `Facilitator error: ${error.message}`,
        },
        502,
      )
      return { valid: false, error: errorResponse }
    }

    const errorResponse = c.json(
      {
        error: 'PAYMENT_VERIFICATION_ERROR',
        message: `Payment verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      500,
    )
    return { valid: false, error: errorResponse }
  }
}

/**
 * Create a payment gate for a route with dynamic requirements.
 * Returns a function that can be called in route handlers.
 */
export function createPaymentGate(options: PaymentGateOptions) {
  return async (c: Context, body?: unknown): Promise<PaymentVerificationResult> => {
    const requirements = await options.getRequirements(c, body)
    return verifyPayment(c, requirements)
  }
}
