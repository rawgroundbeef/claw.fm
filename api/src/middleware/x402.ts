import type { Context } from 'hono'
import { OpenFacilitator, type PaymentRequirementsV1, FacilitatorError } from '@openfacilitator/sdk'

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
  // Accept both v1 and v2 payment headers
  const paymentHeader =
    c.req.header('X-PAYMENT') || c.req.header('PAYMENT-SIGNATURE')

  if (!paymentHeader) {
    const requirementsBase64 = btoa(JSON.stringify(requirements))

    const errorResponse = c.json(
      {
        error: 'PAYMENT_REQUIRED',
        message: `Payment of ${requirements.description || 'USDC'} required`,
        paymentRequirements: requirements,
      },
      402,
      {
        // v1 header (existing agent clients)
        'X-PAYMENT-REQUIRED': requirementsBase64,
        // v2 header (@x402/fetch browser client)
        'PAYMENT-REQUIRED': requirementsBase64,
      },
    )

    return { valid: false, error: errorResponse }
  }

  try {
    const paymentPayload = JSON.parse(atob(paymentHeader))
    const facilitator = new OpenFacilitator()

    const verifyResult = await facilitator.verify(paymentPayload, requirements)

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
