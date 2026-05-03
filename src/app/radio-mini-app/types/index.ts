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
