/**
 * QueueBrain Durable Object
 *
 * Single source of truth for queue state, track selection, and automatic advancement.
 * Uses SQLite for persistent state, D1 for track catalog, alarms for precise scheduling.
 */

import { DurableObject } from 'cloudflare:workers'
import type { QueueState, TrackRow } from './types'
import { selectTrackWeighted, type TrackCandidate } from '../lib/rotation'

interface Env {
  DB: D1Database
  KV: KVNamespace
  QUEUE_BRAIN: DurableObjectNamespace
  AUDIO_BUCKET: R2Bucket
  PLATFORM_WALLET: string
}

export class QueueBrain extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)

    // Initialize SQLite tables on first run
    this.ctx.blockConcurrencyWhile(async () => {
      await this.initializeTables()
    })
  }

  /**
   * Initialize SQLite tables for queue state and play history
   */
  private async initializeTables(): Promise<void> {
    // Queue state: key-value store for current/next track IDs and timing
    await this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS queue_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    // Play history: tracks what's been played for anti-repeat logic
    // Includes wallet for artist diversity filtering
    await this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS play_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_id INTEGER NOT NULL,
        wallet TEXT NOT NULL,
        played_at INTEGER NOT NULL
      )
    `)

    // Index for efficient recent history queries
    await this.ctx.storage.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_ph_played_at
      ON play_history(played_at DESC)
    `)
  }

  /**
   * Get current queue state
   * @returns Current track info, timing, and pre-selected next track
   */
  async getCurrentState(): Promise<QueueState> {
    const currentTrackId = await this.getState('current_track_id')
    const currentStartedAt = await this.getState('current_started_at')
    const currentEndsAt = await this.getState('current_ends_at')
    const nextTrackId = await this.getState('next_track_id')

    return {
      currentTrackId: currentTrackId ? parseInt(currentTrackId, 10) : null,
      currentStartedAt: currentStartedAt ? parseInt(currentStartedAt, 10) : null,
      currentEndsAt: currentEndsAt ? parseInt(currentEndsAt, 10) : null,
      nextTrackId: nextTrackId ? parseInt(nextTrackId, 10) : null,
    }
  }

  /**
   * Get pre-selected next track ID
   * @returns Next track ID or null if not set
   */
  async getNextTrackId(): Promise<number | null> {
    const nextTrackId = await this.getState('next_track_id')
    return nextTrackId ? parseInt(nextTrackId, 10) : null
  }

  /**
   * Start playback immediately (idempotent)
   * @param trackId Track ID to start playing
   * @returns True if started, false if already playing
   */
  async startImmediately(trackId: number): Promise<boolean> {
    // Check if already playing
    const currentTrackId = await this.getState('current_track_id')
    const alarmTime = await this.ctx.storage.getAlarm()

    if (currentTrackId !== null && alarmTime !== null) {
      // Already playing, no-op
      return false
    }

    // Fetch track from D1 to get duration
    const track = await this.fetchTrackById(trackId)
    if (!track) {
      throw new Error(`Track ${trackId} not found`)
    }

    // Set current track state
    const now = Date.now()
    const endsAt = now + (track.duration * 1000)

    await this.setState('current_track_id', trackId.toString())
    await this.setState('current_started_at', now.toString())
    await this.setState('current_ends_at', endsAt.toString())

    // Pre-select next track
    const nextTrackId = await this.selectNext()
    if (nextTrackId !== null) {
      await this.setState('next_track_id', nextTrackId.toString())
    }

    // Schedule alarm for track end (millisecond precision)
    await this.ctx.storage.setAlarm(endsAt)

    // Invalidate KV cache
    await this.env.KV.delete('now-playing')

    return true
  }

  /**
   * Get queue preview (probabilistic simulation)
   * @param depth Number of tracks to preview
   * @returns Array of track IDs
   */
  async getQueuePreview(depth: number = 5): Promise<number[]> {
    const preview: number[] = []
    const excludedIds = new Set<number>()

    // Get recent history for initial context
    const recentTrackIds = await this.getRecentTrackIds(10)
    const recentWallets = await this.getRecentWallets(3)

    for (const id of recentTrackIds) {
      excludedIds.add(id)
    }

    // Fetch all tracks
    const tracks = await this.fetchAllTracks()
    if (tracks.length === 0) {
      return preview
    }

    // Simulate selection for each slot
    for (let i = 0; i < depth; i++) {
      const selected = selectTrackWeighted(
        tracks.filter(t => !excludedIds.has(t.id)),
        new Set(),  // Don't apply recent track filtering again (already excluded)
        recentWallets
      )

      if (selected === null) {
        // No more eligible tracks
        break
      }

      preview.push(selected.id)
      excludedIds.add(selected.id)
    }

    return preview
  }

  /**
   * Alarm handler: auto-advance to next track
   * Fires when current track's duration elapses
   */
  async alarm(): Promise<void> {
    try {
      // Get current track info
      const currentTrackIdStr = await this.getState('current_track_id')
      if (!currentTrackIdStr) {
        // No current track, nothing to advance
        return
      }

      const currentTrackId = parseInt(currentTrackIdStr, 10)

      // Fetch current track to get wallet for history
      const currentTrack = await this.fetchTrackById(currentTrackId)
      if (currentTrack) {
        // Record play in history
        await this.recordPlay(currentTrackId, currentTrack.wallet)
      }

      // Read pre-selected next track
      const nextTrackIdStr = await this.getState('next_track_id')

      if (nextTrackIdStr) {
        // Next track exists, promote it to current
        const nextTrackId = parseInt(nextTrackIdStr, 10)
        const nextTrack = await this.fetchTrackById(nextTrackId)

        if (nextTrack) {
          // Set as current
          const now = Date.now()
          const endsAt = now + (nextTrack.duration * 1000)

          await this.setState('current_track_id', nextTrackId.toString())
          await this.setState('current_started_at', now.toString())
          await this.setState('current_ends_at', endsAt.toString())

          // Select new next track
          const newNextTrackId = await this.selectNext()
          if (newNextTrackId !== null) {
            await this.setState('next_track_id', newNextTrackId.toString())
          } else {
            await this.setState('next_track_id', '')
          }

          // Schedule alarm for new track end
          await this.ctx.storage.setAlarm(endsAt)

          // Invalidate KV cache
          await this.env.KV.delete('now-playing')

          return
        }
      }

      // Fallback: next track not found or not set
      // Fetch all tracks and pick one
      const tracks = await this.fetchAllTracks()

      if (tracks.length === 0) {
        // No tracks at all, clear state and go to waiting
        await this.setState('current_track_id', '')
        await this.setState('current_started_at', '')
        await this.setState('current_ends_at', '')
        await this.setState('next_track_id', '')
        await this.env.KV.delete('now-playing')
        return
      }

      // Select a track using weighted selection
      const recentTrackIds = await this.getRecentTrackIds(10)
      const recentWallets = await this.getRecentWallets(3)
      const selected = selectTrackWeighted(tracks, recentTrackIds, recentWallets)

      if (selected) {
        const selectedTrack = await this.fetchTrackById(selected.id)
        if (selectedTrack) {
          const now = Date.now()
          const endsAt = now + (selectedTrack.duration * 1000)

          await this.setState('current_track_id', selected.id.toString())
          await this.setState('current_started_at', now.toString())
          await this.setState('current_ends_at', endsAt.toString())

          // Select next track
          const newNextTrackId = await this.selectNext()
          if (newNextTrackId !== null) {
            await this.setState('next_track_id', newNextTrackId.toString())
          }

          await this.ctx.storage.setAlarm(endsAt)
          await this.env.KV.delete('now-playing')
        }
      }
    } catch (error) {
      // Log error but don't throw (alarm will retry up to 6 times)
      console.error('QueueBrain alarm error:', error)
      throw error  // Re-throw to trigger retry
    }
  }

  /**
   * Select next track using weighted random selection
   * @returns Track ID or null if no tracks available
   */
  private async selectNext(): Promise<number | null> {
    // Fetch all tracks from D1
    const tracks = await this.fetchAllTracks()

    if (tracks.length === 0) {
      return null
    }

    // Single-track catalog: loop the same track
    if (tracks.length === 1) {
      return tracks[0].id
    }

    // Get recent play history
    const recentTrackIds = await this.getRecentTrackIds(10)
    const recentWallets = await this.getRecentWallets(3)

    // Use weighted selection from rotation.ts
    const selected = selectTrackWeighted(tracks, recentTrackIds, recentWallets)

    return selected ? selected.id : null
  }

  /**
   * Fetch all tracks from D1
   * Converts created_at from UNIX seconds to milliseconds for rotation algorithm
   */
  private async fetchAllTracks(): Promise<TrackCandidate[]> {
    const result = await this.env.DB.prepare(`
      SELECT id, created_at, tip_weight, wallet
      FROM tracks
    `).all<{ id: number; created_at: number; tip_weight: number; wallet: string }>()

    if (!result.results) {
      return []
    }

    // Convert created_at from UNIX seconds to milliseconds
    return result.results.map(row => ({
      id: row.id,
      created_at: row.created_at * 1000,  // D1 stores as seconds, rotation expects ms
      tip_weight: row.tip_weight,
      wallet: row.wallet,
    }))
  }

  /**
   * Fetch track by ID from D1
   */
  private async fetchTrackById(trackId: number): Promise<TrackRow | null> {
    const result = await this.env.DB.prepare(`
      SELECT id, title, wallet, artist_name, duration, file_url, cover_url, genre, created_at, tip_weight
      FROM tracks
      WHERE id = ?
    `).bind(trackId).first<TrackRow>()

    return result || null
  }

  /**
   * Get state value from SQLite
   */
  private async getState(key: string): Promise<string | null> {
    const cursor = await this.ctx.storage.sql.exec(`
      SELECT value FROM queue_state WHERE key = ?
    `, key)

    const rows = [...cursor]
    if (rows.length === 0) {
      return null
    }

    return rows[0].value as string
  }

  /**
   * Set state value in SQLite
   */
  private async setState(key: string, value: string): Promise<void> {
    await this.ctx.storage.sql.exec(`
      INSERT OR REPLACE INTO queue_state (key, value) VALUES (?, ?)
    `, key, value)
  }

  /**
   * Record track play in history
   * @param trackId Track ID that was played
   * @param wallet Artist wallet for diversity filtering
   */
  private async recordPlay(trackId: number, wallet: string): Promise<void> {
    const now = Date.now()

    // Insert play record
    await this.ctx.storage.sql.exec(`
      INSERT INTO play_history (track_id, wallet, played_at) VALUES (?, ?, ?)
    `, trackId, wallet, now)

    // Prune old history (keep last 24 hours)
    const cutoff = now - (24 * 60 * 60 * 1000)
    await this.ctx.storage.sql.exec(`
      DELETE FROM play_history WHERE played_at < ?
    `, cutoff)
  }

  /**
   * Get recently played track IDs
   * @param limit Maximum number of track IDs to return
   * @returns Set of track IDs
   */
  private async getRecentTrackIds(limit: number = 10): Promise<Set<number>> {
    const cursor = await this.ctx.storage.sql.exec(`
      SELECT DISTINCT track_id FROM play_history ORDER BY played_at DESC LIMIT ?
    `, limit)

    const rows = [...cursor]
    return new Set(rows.map(row => row.track_id as number))
  }

  /**
   * Get recently played artist wallets
   * @param limit Maximum number of wallets to return
   * @returns Set of wallet addresses
   */
  private async getRecentWallets(limit: number = 3): Promise<Set<string>> {
    const cursor = await this.ctx.storage.sql.exec(`
      SELECT DISTINCT wallet FROM play_history ORDER BY played_at DESC LIMIT ?
    `, limit)

    const rows = [...cursor]
    return new Set(rows.map(row => row.wallet as string))
  }
}
