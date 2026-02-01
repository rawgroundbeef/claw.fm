import type { Context } from 'hono'
import { OpenFacilitator, type PaymentRequirementsV1, FacilitatorError } from '@openfacilitator/sdk'

export interface PaymentVerificationResult {
  valid: boolean
  walletAddress?: string
  error?: Response
}

/**
 * Verify x402 payment header and extract wallet address
 * This is called manually in the submit route after validation passes
 */
export async function verifyPayment(c: Context): Promise<PaymentVerificationResult> {
  // Check for payment header (X-PAYMENT only, per x402 standard)
  const paymentHeader = c.req.header('X-PAYMENT')

  // Payment requirements for track submission
  const requirements: PaymentRequirementsV1 = {
    scheme: 'exact',
    network: 'base', // v1 format (SDK handles v1/v2 translation)
    maxAmountRequired: '10000', // 0.01 USDC (6 decimals)
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
    resource: '/api/submit',
    description: 'Track submission fee',
    payTo: c.env.PLATFORM_WALLET as string,
  }

  // If no payment header present, return 402 Payment Required
  if (!paymentHeader) {
    // Encode payment requirements as base64 for X-PAYMENT-REQUIRED header
    const requirementsBase64 = btoa(JSON.stringify(requirements))

    const errorResponse = c.json(
      {
        error: 'PAYMENT_REQUIRED',
        message: 'Payment of 0.01 USDC required to submit track',
        paymentRequirements: requirements,
      },
      402,
      {
        'X-PAYMENT-REQUIRED': requirementsBase64,
      }
    )

    return {
      valid: false,
      error: errorResponse,
    }
  }

  // Verify and settle payment with OpenFacilitator SDK
  try {
    // Parse payment header (base64-encoded JSON)
    const paymentPayload = JSON.parse(atob(paymentHeader))

    // Create facilitator instance (defaults to https://pay.openfacilitator.io)
    const facilitator = new OpenFacilitator()

    // Step 1: Verify payment is valid
    const verifyResult = await facilitator.verify(paymentPayload, requirements)

    if (!verifyResult.isValid) {
      const errorResponse = c.json(
        {
          error: 'PAYMENT_INVALID',
          message: verifyResult.invalidReason || 'Payment verification failed',
        },
        402
      )

      return {
        valid: false,
        error: errorResponse,
      }
    }

    // Step 2: Settle payment (broadcast transaction)
    const settleResult = await facilitator.settle(paymentPayload, requirements)

    if (!settleResult.success) {
      const errorResponse = c.json(
        {
          error: 'PAYMENT_SETTLEMENT_FAILED',
          message: settleResult.errorReason || 'Payment settlement failed',
        },
        402
      )

      return {
        valid: false,
        error: errorResponse,
      }
    }

    // Payment verified and settled successfully
    return {
      valid: true,
      walletAddress: settleResult.payer,
    }
  } catch (error) {
    // Handle SDK-specific errors
    if (error instanceof FacilitatorError) {
      const errorResponse = c.json(
        {
          error: 'FACILITATOR_ERROR',
          message: `Facilitator error: ${error.message}`,
        },
        502
      )

      return {
        valid: false,
        error: errorResponse,
      }
    }

    // Generic error handling
    const errorResponse = c.json(
      {
        error: 'PAYMENT_VERIFICATION_ERROR',
        message: `Payment verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      500
    )

    return {
      valid: false,
      error: errorResponse,
    }
  }
}
