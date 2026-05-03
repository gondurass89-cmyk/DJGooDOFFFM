/**
 * Centralized Configuration
 * Все URL и настройки в одном месте
 */

// =====================================================
// CLOUDFLARE WORKERS URLs
// =====================================================
// Эти URLs используются как на клиенте, так и на сервере

export const WORKERS_CONFIG = {
  // Listeners tracking (D1 Database)
  listeners: process.env.NEXT_PUBLIC_LISTENERS_WORKER_URL || 'https://listeners.gondurass89.workers.dev',

  // Now playing track (D1 Database)
  nowPlaying: process.env.NEXT_PUBLIC_NOWPLAYING_WORKER_URL || 'https://nowplaying.gondurass89.workers.dev',
} as const

// =====================================================
// API ENDPOINTS (относительные пути)
// =====================================================
export const API_ENDPOINTS = {
  stream: '/api/stream',
  nowPlaying: '/api/now-playing',
  albumArt: '/api/album-art',
  listener: '/api/listener',
} as const

// =====================================================
// ICECAST STREAM (server-side only)
// =====================================================
export const STREAM_CONFIG = {
  // Internal Icecast URL (used by /api/stream proxy)
  internalUrl: process.env.STREAM_INTERNAL_URL || 'http://178.49.69.37:8000/Radio',

  // Fetch timeout in milliseconds
  timeout: 30000,
} as const

// =====================================================
// ICECAST STATUS (server-side only, for fallback)
// =====================================================
export const ICECAST_CONFIG = {
  // Status page URL for fallback track info
  statusUrl: process.env.ICECAST_STATUS_URL || 'http://s0.radioheart.ru:8000/status.xsl',

  // Mount point for this station
  mountPoint: process.env.ICECAST_MOUNT_POINT || 'RH84200',
} as const

// =====================================================
// TIMEOUTS & INTERVALS
// =====================================================
export const TIMEOUTS = {
  // Listener heartbeat interval
  heartbeat: 30000,

  // Audio load timeout
  load: 30000,

  // Buffering detection timeout
  buffering: 15000,

  // Reconnect settings
  reconnectMaxAttempts: 5,
  reconnectDelay: 3000,

  // Real mode check
  realModeCheckFrames: 10,
  realModeCheckDelay: 500,
} as const
