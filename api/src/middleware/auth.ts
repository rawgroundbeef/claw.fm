import type { Context, Next } from 'hono'
import { extractWalletFromPaymentHeader } from './x402'

/**
 * Middleware to extract and verify wallet authentication from x402 payment header.
 * 
 * This middleware extracts the wallet address from the X-PAYMENT or PAYMENT-SIGNATURE
 * header WITHOUT settling any payment. It's used for authentication only.
 * 
 * The wallet address is stored in c.get('walletAddress') for downstream handlers.
 * 
 * Usage:
 *   app.use('/api/protected/*', requireWalletAuth)
 *   app.get('/api/protected/resource', (c) => {
 *     const wallet = c.get('walletAddress')
 *     // wallet is guaranteed to exist here
 *   })
 * 
 * Or for optional auth (endpoint works with or without wallet):
 *   app.use('/api/optional/*', extractWalletOptional)
 */

// Extend Hono context types
declare module 'hono' {
  interface ContextVariableMap {
    walletAddress: string
  }
}

/**
 * Require wallet authentication.
 * Returns 401 if no valid x402 payment header provided.
 */
export async function requireWalletAuth(c: Context, next: Next) {
  const result = await extractWalletFromPaymentHeader(c)
  
  if (!result.valid || !result.walletAddress) {
    return result.error || c.json({
      error: 'UNAUTHORIZED',
      message: 'Valid x402 payment header required'
    }, 401)
  }
  
  c.set('walletAddress', result.walletAddress)
  await next()
}

/**
 * Extract wallet optionally.
 * Sets walletAddress if provided, continues either way.
 * Use for endpoints that work differently for authenticated vs anonymous users.
 */
export async function extractWalletOptional(c: Context, next: Next) {
  const result = await extractWalletFromPaymentHeader(c)
  
  if (result.valid && result.walletAddress) {
    c.set('walletAddress', result.walletAddress)
  }
  
  await next()
}

/**
 * Require wallet ownership of a specific resource.
 * 
 * This middleware checks that the authenticated wallet owns a resource
 * identified by a database query. Use after requireWalletAuth.
 * 
 * Example:
 *   app.delete('/api/tracks/:id', 
 *     requireWalletAuth,
 *     requireOwnership({
 *       table: 'tracks',
 *       idParam: 'id',
 *       ownerColumn: 'wallet'
 *     }),
 *     handler
 *   )
 */
interface OwnershipConfig {
  table: string
  idParam: string
  ownerColumn: string
}

export function requireOwnership(config: OwnershipConfig) {
  return async (c: Context<{ Bindings: { DB: D1Database } }>, next: Next) => {
    const walletAddress = c.get('walletAddress')
    
    if (!walletAddress) {
      return c.json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      }, 401)
    }
    
    const resourceId = c.req.param(config.idParam)
    const db = c.env.DB
    
    const resource = await db.prepare(`
      SELECT ${config.ownerColumn} as owner FROM ${config.table} WHERE id = ?
    `).bind(resourceId).first<{ owner: string }>()
    
    if (!resource) {
      return c.json({
        error: 'NOT_FOUND',
        message: 'Resource not found'
      }, 404)
    }
    
    if (resource.owner.toLowerCase() !== walletAddress.toLowerCase()) {
      return c.json({
        error: 'FORBIDDEN',
        message: 'You do not own this resource'
      }, 403)
    }
    
    await next()
  }
}
