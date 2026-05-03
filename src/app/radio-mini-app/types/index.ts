// =====================================================
// DJ GooD OFF FM - TypeScript Types
// =====================================================

// Telegram WebApp API Types
export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface TelegramWebApp {
  ready: () => void
  expand: () => void
  platform: string
  initData: string
  initDataUnsafe?: {
    user?: TelegramUser
  }
  onEvent: (event: string, callback: () => void) => void
  close: () => void
}

export interface TelegramWindow {
  Telegram?: {
    WebApp?: TelegramWebApp
  }
  webkitAudioContext?: typeof AudioContext
}

// Audio State
export interface AudioState {
  isPlaying: boolean
  isLoading: boolean
  isMuted: boolean
  volume: number
  error: string | null
  buffering: boolean
  reconnecting: boolean
  reconnectAttempts: number
}

// Equalizer State
export interface EqualizerState {
  bass: number
  mid: number
  treble: number
}

// Visualizer Colors
export interface VisualizerColors {
  primary: string
  secondary: string
  accent: string
  text: string
  dark: string
  bass: string
  mid: string
  high: string
}

// Constants
export const COLORS: VisualizerColors = {
  primary: '#2e0071',
  secondary: '#00c730',
  accent: '#00ff40',
  text: '#c4c4c4',
  dark: '#0d0026',
  bass: '#ff0066',
  mid: '#00c730',
  high: '#00ffcc',
}

export const STATION_NAME = 'DJ GooD OFF FM'
export const STATION_LOGO = '/logo.png'

// API URLs
export const STREAM_URL = '/api/stream'
export const LISTENERS_API = 'https://listeners.gondurass89.workers.dev'
export const NOW_PLAYING_API = '/api/now-playing'
export const ALBUM_ART_API = '/api/album-art'

// Timeouts & Intervals
export const HEARTBEAT_INTERVAL = 30000
export const LOAD_TIMEOUT = 30000
export const BUFFERING_TIMEOUT = 15000
export const RECONNECT_MAX_ATTEMPTS = 5
export const RECONNECT_DELAY = 3000
export const REAL_MODE_CHECK_FRAMES = 10
export const REAL_MODE_CHECK_DELAY = 500

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

/**
 * Detect iOS device (iPhone, iPad, iPod)
 * Used for fallback audio mode
 */
export function detectIOS(): boolean {
  if (typeof window === 'undefined') return false

  const ua = navigator.userAgent
  const isIPad = /iPad/i.test(ua)
  const isIPhone = /iPhone/i.test(ua)
  const isIPod = /iPod/i.test(ua)
  const isIPadModern = /Macintosh/i.test(ua) &&
    !!(navigator.maxTouchPoints && navigator.maxTouchPoints > 1)
  const tgPlatform = (window as any).Telegram?.WebApp?.platform || ''

  return isIPad || isIPhone || isIPod || isIPadModern || tgPlatform === 'ios'
}

/**
 * Get human-readable audio error message
 */
export function getAudioErrorMessage(error: MediaError | null): string {
  if (!error) return 'Нет ошибки'
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED: return 'Воспроизведение отменено'
    case MediaError.MEDIA_ERR_NETWORK: return 'Ошибка сети'
    case MediaError.MEDIA_ERR_DECODE: return 'Ошибка декодирования'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: return 'Формат не поддерживается'
    default: return `Неизвестная ошибка (${error.code})`
  }
}
