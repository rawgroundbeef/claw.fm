import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import deleteRoute from './delete'

// Mock the x402 middleware
vi.mock('../middleware/x402', () => ({
  verifyPayment: vi.fn((c, requirements) => {
    // Return unpaid by default (simulating missing header)
    const errorResponse = c.json(
      { error: 'PAYMENT_REQUIRED', message: 'Payment required' },
      402,
      { 'X-PAYMENT-REQUIRED': btoa(JSON.stringify(requirements)) }
    )
    return Promise.resolve({ valid: false, error: errorResponse })
  }),
  extractWalletFromPaymentHeader: vi.fn((c) => {
    // Try to extract from header for can-delete endpoint
    const walletHeader = c.req.header('X-Wallet-Address')
    if (walletHeader && walletHeader.startsWith('0x') && walletHeader.length === 42) {
      return Promise.resolve({ valid: true, walletAddress: walletHeader })
    }
    return Promise.resolve({ valid: false })
  })
}))

// Helper to create a mock environment
function createMockEnv(isLive: boolean = false) {
  const dbQueries: Array<{ sql: string; params: any[] }> = []
  
  const mockDb = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...params: any[]) => ({
        first: vi.fn(() => {
          dbQueries.push({ sql, params })
          
          // Track lookup by ID
          if (sql.includes('FROM tracks WHERE id =') && params[0] === 123) {
            return Promise.resolve({
              id: 123,
              wallet: '0x8CF716615a81Ffd0654148729b362720A4E4fb59',
              file_url: 'tracks/test.mp3',
              cover_url: 'covers/test.png'
            })
          }
          if (sql.includes('FROM tracks WHERE id =') && params[0] === 456) {
            return Promise.resolve({
              id: 456,
              wallet: '0xDIFFERENT_WALLET',
              file_url: 'tracks/other.mp3',
              cover_url: null
            })
          }
          if (sql.includes('FROM tracks WHERE id =') && params[0] === 99999) {
            return Promise.resolve(null)
          }
          return Promise.resolve(null)
        }),
        run: vi.fn(() => Promise.resolve({ success: true }))
      })),
      first: vi.fn(() => Promise.resolve(null)),
      run: vi.fn(() => Promise.resolve({ success: true }))
    }))
  }
  
  const mockKv = {
    get: vi.fn((key: string) => {
      if (key === 'now-playing' && isLive) {
        return Promise.resolve(JSON.stringify({ track: { id: 123 } }))
      }
      return Promise.resolve(null)
    }),
    delete: vi.fn(() => Promise.resolve())
  }
  
  const mockBucket = {
    delete: vi.fn(() => Promise.resolve())
  }
  
  return {
    DB: mockDb as any,
    KV: mockKv as any,
    AUDIO_BUCKET: mockBucket as any,
    PLATFORM_WALLET: '0xPlatformWallet',
    getQueries: () => dbQueries
  }
}

// Helper to create a Hono app with the delete routes mounted properly
function createTestApp(env: any) {
  const app = new Hono<{ Bindings: typeof env }>()
  
  // Mount routes the same way as index.ts
  app.route('/api/tracks', deleteRoute)
  
  return app
}

describe('DELETE /api/tracks/:id', () => {
  it('should return 402 when x402 payment header is missing', async () => {
    const env = createMockEnv()
    const app = createTestApp(env)
    
    const res = await app.fetch(
      new Request('http://localhost/api/tracks/123', { method: 'DELETE' }),
      env
    )
    
    expect(res.status).toBe(402)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('PAYMENT_REQUIRED')
  })
})

describe('GET /api/tracks/:id/can-delete', () => {
  it('should return canDelete=false for missing wallet header', async () => {
    const env = createMockEnv()
    const app = createTestApp(env)
    
    const res = await app.fetch(
      new Request('http://localhost/api/tracks/123/can-delete'),
      env
    )
    
    expect(res.status).toBe(401)
    const body = await res.json() as { canDelete: boolean; reason: string }
    expect(body.canDelete).toBe(false)
    expect(body.reason).toBe('NO_WALLET')
  })
  
  it('should return canDelete=false for invalid wallet format', async () => {
    const env = createMockEnv()
    const app = createTestApp(env)
    
    const res = await app.fetch(
      new Request('http://localhost/api/tracks/123/can-delete', {
        headers: { 'X-Wallet-Address': 'invalid-wallet' }
      }),
      env
    )
    
    expect(res.status).toBe(401)
    const body = await res.json() as { canDelete: boolean; reason: string }
    expect(body.canDelete).toBe(false)
    expect(body.reason).toBe('NO_WALLET')
  })
  
  it('should return canDelete=true for track owner when not live', async () => {
    const env = createMockEnv(false) // not live
    const app = createTestApp(env)
    
    const ownerWallet = '0x8CF716615a81Ffd0654148729b362720A4E4fb59'
    const res = await app.fetch(
      new Request('http://localhost/api/tracks/123/can-delete', {
        headers: { 'X-Wallet-Address': ownerWallet }
      }),
      env
    )
    
    expect(res.status).toBe(200)
    const body = await res.json() as { canDelete: boolean; isOwner: boolean; isLive: boolean }
    expect(body.canDelete).toBe(true)
    expect(body.isOwner).toBe(true)
    expect(body.isLive).toBe(false)
  })
  
  it('should return canDelete=false for live tracks even if owner', async () => {
    const env = createMockEnv(true) // is live
    const app = createTestApp(env)
    
    const ownerWallet = '0x8CF716615a81Ffd0654148729b362720A4E4fb59'
    const res = await app.fetch(
      new Request('http://localhost/api/tracks/123/can-delete', {
        headers: { 'X-Wallet-Address': ownerWallet }
      }),
      env
    )
    
    expect(res.status).toBe(200)
    const body = await res.json() as { canDelete: boolean; isOwner: boolean; isLive: boolean; reason: string }
    expect(body.canDelete).toBe(false)
    expect(body.isOwner).toBe(true)
    expect(body.isLive).toBe(true)
    expect(body.reason).toBe('TRACK_IS_LIVE')
  })
  
  it('should return canDelete=false for non-owner', async () => {
    const env = createMockEnv(false)
    const app = createTestApp(env)
    
    // Use a valid Ethereum address format (42 chars starting with 0x)
    const otherWallet = '0x1234567890123456789012345678901234567890'
    const res = await app.fetch(
      new Request('http://localhost/api/tracks/123/can-delete', {
        headers: { 'X-Wallet-Address': otherWallet }
      }),
      env
    )
    
    expect(res.status).toBe(200)
    const body = await res.json() as { canDelete: boolean; isOwner: boolean; reason: string }
    expect(body.canDelete).toBe(false)
    expect(body.isOwner).toBe(false)
    expect(body.reason).toBe('NOT_OWNER')
  })
  
  it('should return 404 for non-existent tracks', async () => {
    const env = createMockEnv(false)
    const app = createTestApp(env)
    
    const wallet = '0x8CF716615a81Ffd0654148729b362720A4E4fb59'
    const res = await app.fetch(
      new Request('http://localhost/api/tracks/99999/can-delete', {
        headers: { 'X-Wallet-Address': wallet }
      }),
      env
    )
    
    expect(res.status).toBe(404)
    const body = await res.json() as { canDelete: boolean; reason: string }
    expect(body.canDelete).toBe(false)
    expect(body.reason).toBe('TRACK_NOT_FOUND')
  })
  
  it('should return 400 for invalid track IDs', async () => {
    const env = createMockEnv(false)
    const app = createTestApp(env)
    
    const wallet = '0x8CF716615a81Ffd0654148729b362720A4E4fb59'
    
    // Test 'invalid' track ID
    const res1 = await app.fetch(
      new Request('http://localhost/api/tracks/invalid/can-delete', {
        headers: { 'X-Wallet-Address': wallet }
      }),
      env
    )
    
    expect(res1.status).toBe(400)
    const body1 = await res1.json() as { canDelete: boolean; reason: string }
    expect(body1.canDelete).toBe(false)
    expect(body1.reason).toBe('INVALID_TRACK_ID')
    
    // Test negative track ID
    const res2 = await app.fetch(
      new Request('http://localhost/api/tracks/-1/can-delete', {
        headers: { 'X-Wallet-Address': wallet }
      }),
      env
    )
    
    expect(res2.status).toBe(400)
    const body2 = await res2.json() as { canDelete: boolean; reason: string }
    expect(body2.canDelete).toBe(false)
    expect(body2.reason).toBe('INVALID_TRACK_ID')
  })
})
