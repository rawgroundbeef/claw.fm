export interface Track {
  id: number
  title: string
  wallet: string
  duration: number
  fileUrl: string
  createdAt: number
  playCount: number
  tipWeight: number
}

export interface ApiResponse<T> {
  data?: T
  error?: string
}

export interface HealthResponse {
  status: 'ok'
  timestamp: number
}
