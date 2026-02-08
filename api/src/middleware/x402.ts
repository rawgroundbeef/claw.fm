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

export interface WalletExtractionResult {
  valid: boolean
  walletAddress?: string
  error?: Response
}

export interface PaymentGateOptions {
  getRequirements: (c: Context, body?: unknown) => Promise<PaymentRequirementsV1>
}

/**
 * Extract wallet address from x402 payment header WITHOUT settling.
 * This allows us to identify the wallet before deciding whether to charge.
 * Returns 401 Unauthorized if no payment header (not 402 — payment may not be required).
 */
export async function extractWalletFromPaymentHeader(c: Context): Promise<WalletExtractionResult> {
  const paymentHeader =
    c.req.header('X-PAYMENT') || c.req.header('PAYMENT-SIGNATURE')

  if (!paymentHeader) {
    const errorResponse = c.json(
      {
        error: 'UNAUTHORIZED',
        message: 'X-PAYMENT or PAYMENT-SIGNATURE header required for wallet identification',
      },
      401,
    )
    return { valid: false, error: errorResponse }
  }

  try {
    const paymentPayload: PaymentPayload = JSON.parse(atob(paymentHeader))

    // Extract wallet from the authorization.from field
    // Handle both v1 and v2 payload structures
    let walletAddress: string | undefined

    if (paymentPayload.x402Version === 2) {
      // v2: payload.authorization.from
      walletAddress = (paymentPayload as any).payload?.authorization?.from
    } else {
      // v1: authorization.from directly
      walletAddress = (paymentPayload as any).authorization?.from
    }

    if (!walletAddress) {
      const errorResponse = c.json(
        {
          error: 'INVALID_PAYMENT_HEADER',
          message: 'Could not extract wallet address from payment header',
        },
        400,
      )
      return { valid: false, error: errorResponse }
    }

    return { valid: true, walletAddress }
  } catch (error) {
    console.error('[x402] Failed to extract wallet from header:', error)
    const errorResponse = c.json(
      {
        error: 'INVALID_PAYMENT_HEADER',
        message: 'Malformed payment header',
      },
      400,
    )
    return { valid: false, error: errorResponse }
  }
}

/**
 * Conditionally verify and settle x402 payment based on business logic.
 * Extracts wallet first, then calls shouldCharge() to determine if payment is needed.
 * Only settles if shouldCharge returns true.
 */
export async function verifyPaymentConditional(
  c: Context,
  requirements: PaymentRequirementsV1,
  shouldCharge: (wallet: string) => Promise<boolean>,
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
    const paymentPayload: PaymentPayload = JSON.parse(atob(paymentHeader))
    console.log('[x402] Payment payload version:', paymentPayload.x402Version)

    // Extract wallet address first
    let walletAddress: string | undefined
    if (paymentPayload.x402Version === 2) {
      walletAddress = (paymentPayload as any).payload?.authorization?.from
    } else {
      walletAddress = (paymentPayload as any).authorization?.from
    }

    if (!walletAddress) {
      const errorResponse = c.json(
        {
          error: 'INVALID_PAYMENT_HEADER',
          message: 'Could not extract wallet address from payment header',
        },
        400,
      )
      return { valid: false, error: errorResponse }
    }

    // Check if we should charge this wallet
    const needsPayment = await shouldCharge(walletAddress)

    if (!needsPayment) {
      // FREE! Skip settlement, return valid with wallet
      console.log('[x402] Conditional: FREE for wallet', walletAddress)
      return { valid: true, walletAddress }
    }

    // Need to charge — verify and settle
    console.log('[x402] Conditional: Charging wallet', walletAddress)
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

export interface MultiPaymentRequirement {
  label: string  // 'platform', 'pool', 'artist'
  requirements: PaymentRequirementsV1
}

export interface MultiPaymentVerificationResult {
  valid: boolean
  walletAddress?: string
  settlements?: Array<{ label: string; transaction?: string }>
  error?: Response
}

/**
 * Verify and settle multiple x402 payments in a single request.
 * Used for tip splits: platform (5%), pool (20%), artist (75%).
 *
 * Client sends X-PAYMENTS header with JSON array of base64-encoded payment payloads.
 * Server returns 402 with X-PAYMENTS-REQUIRED header containing array of requirements.
 */
export async function verifyMultiPayment(
  c: Context,
  requirements: MultiPaymentRequirement[],
): Promise<MultiPaymentVerificationResult> {
  const paymentsHeader = c.req.header('X-PAYMENTS')

  if (!paymentsHeader) {
    // Build multi-payment 402 response
    const v1Requirements = requirements.map(r => ({
      label: r.label,
      ...r.requirements,
    }))

    const v2Accepts = requirements.map(r => ({
      label: r.label,
      scheme: r.requirements.scheme,
      network: 'eip155:8453',
      asset: r.requirements.asset,
      payTo: r.requirements.payTo,
      amount: r.requirements.maxAmountRequired,
      maxTimeoutSeconds: 300,
      extra: {
        name: 'USD Coin',
        version: '2',
      },
    }))

    const v2Payload = {
      x402Version: 2,
      accepts: v2Accepts,
      resource: {
        url: requirements[0]?.requirements.resource || c.req.path,
      },
    }

    const errorResponse = c.json(
      {
        error: 'PAYMENTS_REQUIRED',
        message: `${requirements.length} payments required for tip split`,
        payments: v1Requirements,
        x402Version: 1,
      },
      402,
      {
        'X-PAYMENTS-REQUIRED': btoa(JSON.stringify(v1Requirements)),
        'PAYMENTS-REQUIRED': btoa(JSON.stringify(v2Payload)),
      },
    )

    return { valid: false, error: errorResponse }
  }

  try {
    // Parse array of payment payloads
    const paymentPayloads: PaymentPayload[] = JSON.parse(atob(paymentsHeader))

    if (!Array.isArray(paymentPayloads) || paymentPayloads.length !== requirements.length) {
      const errorResponse = c.json(
        {
          error: 'INVALID_PAYMENTS',
          message: `Expected ${requirements.length} payments, got ${Array.isArray(paymentPayloads) ? paymentPayloads.length : 0}`,
        },
        400,
      )
      return { valid: false, error: errorResponse }
    }

    const facilitator = new OpenFacilitator()
    const settlements: Array<{ label: string; transaction?: string }> = []
    let payerWallet: string | undefined

    // Verify and settle each payment
    for (let i = 0; i < requirements.length; i++) {
      const payload = paymentPayloads[i]
      const req = requirements[i]

      console.log(`[x402-multi] Verifying payment ${i + 1}/${requirements.length}: ${req.label}`)
      console.log(`[x402-multi] Payload version: ${payload.x402Version}`)

      // Build requirements matching the payload version
      // v2 payloads need v2 requirements with 'amount' instead of 'maxAmountRequired'
      const requirementsForFacilitator = payload.x402Version === 2
        ? {
            scheme: req.requirements.scheme,
            network: req.requirements.network,
            amount: req.requirements.maxAmountRequired,
            asset: req.requirements.asset,
            payTo: req.requirements.payTo!,
            maxTimeoutSeconds: 300,
          }
        : req.requirements

      console.log(`[x402-multi] Requirements:`, JSON.stringify(requirementsForFacilitator))

      const verifyResult = await facilitator.verify(payload, requirementsForFacilitator)
      console.log(`[x402-multi] Verify result:`, verifyResult.isValid, verifyResult.invalidReason || '')

      if (!verifyResult.isValid) {
        const errorResponse = c.json(
          {
            error: 'PAYMENT_INVALID',
            message: `Payment ${req.label} invalid: ${verifyResult.invalidReason}`,
            failedPayment: req.label,
          },
          402,
        )
        return { valid: false, error: errorResponse }
      }

      const settleResult = await facilitator.settle(payload, requirementsForFacilitator)
      console.log(`[x402-multi] Settle ${req.label}:`, settleResult.success, settleResult.transaction || settleResult.errorReason || '')

      if (!settleResult.success) {
        const errorResponse = c.json(
          {
            error: 'PAYMENT_SETTLEMENT_FAILED',
            message: `Payment ${req.label} settlement failed: ${settleResult.errorReason}`,
            failedPayment: req.label,
          },
          402,
        )
        return { valid: false, error: errorResponse }
      }

      settlements.push({ label: req.label, transaction: settleResult.transaction })
      if (!payerWallet) payerWallet = settleResult.payer
    }

    console.log(`[x402-multi] All ${requirements.length} payments settled successfully`)
    return { valid: true, walletAddress: payerWallet, settlements }

  } catch (error) {
    console.error('[x402-multi] Exception:', error)
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
