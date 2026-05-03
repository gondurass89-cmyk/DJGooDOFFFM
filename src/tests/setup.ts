import '@testing-library/jest-dom'

// Mock MediaError
class MockMediaError {
  static MEDIA_ERR_ABORTED = 1
  static MEDIA_ERR_NETWORK = 2
  static MEDIA_ERR_DECODE = 3
  static MEDIA_ERR_SRC_NOT_SUPPORTED = 4

  code: number
  message: string

  constructor(code: number, message = '') {
    this.code = code
    this.message = message
  }
}

Object.defineProperty(window, 'MediaError', {
  value: MockMediaError,
  writable: true,
})

// Mock Telegram WebApp
Object.defineProperty(window, 'Telegram', {
  value: {
    WebApp: {
      ready: vi.fn(),
      expand: vi.fn(),
      platform: 'desktop',
      initData: '',
      initDataUnsafe: {},
      onEvent: vi.fn(),
      close: vi.fn(),
    },
  },
  writable: true,
})

// Mock AudioContext
Object.defineProperty(window, 'AudioContext', {
  value: vi.fn().mockImplementation(() => ({
    createAnalyser: vi.fn(() => ({
      fftSize: 512,
      smoothingTimeConstant: 0.8,
      frequencyBinCount: 256,
      getByteFrequencyData: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => ({
      type: 'lowshelf',
      frequency: { value: 250 },
      gain: { value: 0 },
      Q: { value: 0.5 },
    })),
    createMediaElementSource: vi.fn(),
    destination: {},
    state: 'running',
    resume: vi.fn(),
  })),
  writable: true,
})

// Mock navigator.sendBeacon
Object.defineProperty(navigator, 'sendBeacon', {
  value: vi.fn(),
  writable: true,
})

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})
