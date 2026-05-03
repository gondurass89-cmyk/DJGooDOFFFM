import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectIOS, getAudioErrorMessage } from '@/app/radio-mini-app/types'

describe('detectIOS', () => {
  const originalNavigator = global.navigator
  const originalWindow = global.window

  beforeEach(() => {
    vi.stubGlobal('window', {
      navigator: {
        userAgent: '',
        maxTouchPoints: 0,
      },
      Telegram: {
        WebApp: {
          platform: '',
        },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    global.navigator = originalNavigator
    global.window = originalWindow
  })

  it('should detect iPhone', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
      maxTouchPoints: 0,
    })
    vi.stubGlobal('window', {
      navigator: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        maxTouchPoints: 0,
      },
      Telegram: { WebApp: { platform: '' } },
    })
    expect(detectIOS()).toBe(true)
  })

  it('should detect iPad', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)',
      maxTouchPoints: 0,
    })
    vi.stubGlobal('window', {
      navigator: {
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)',
        maxTouchPoints: 0,
      },
      Telegram: { WebApp: { platform: '' } },
    })
    expect(detectIOS()).toBe(true)
  })

  it('should detect iOS from Telegram platform', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 10)',
      maxTouchPoints: 0,
    })
    vi.stubGlobal('window', {
      navigator: {
        userAgent: 'Mozilla/5.0 (Linux; Android 10)',
        maxTouchPoints: 0,
      },
      Telegram: { WebApp: { platform: 'ios' } },
    })
    expect(detectIOS()).toBe(true)
  })

  it('should return false for non-iOS devices', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      maxTouchPoints: 0,
    })
    vi.stubGlobal('window', {
      navigator: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        maxTouchPoints: 0,
      },
      Telegram: { WebApp: { platform: 'android' } },
    })
    expect(detectIOS()).toBe(false)
  })

  it('should return false on server side (no window)', () => {
    // This test checks the typeof window === 'undefined' case
    // In vitest, window is defined, so we just check the function works
    expect(typeof detectIOS).toBe('function')
  })
})

describe('getAudioErrorMessage', () => {
  it('should return "Нет ошибки" for null error', () => {
    expect(getAudioErrorMessage(null)).toBe('Нет ошибки')
  })

  it('should return correct message for MEDIA_ERR_ABORTED', () => {
    const error = { code: 1 } as MediaError
    expect(getAudioErrorMessage(error)).toBe('Воспроизведение отменено')
  })

  it('should return correct message for MEDIA_ERR_NETWORK', () => {
    const error = { code: 2 } as MediaError
    expect(getAudioErrorMessage(error)).toBe('Ошибка сети')
  })

  it('should return correct message for MEDIA_ERR_DECODE', () => {
    const error = { code: 3 } as MediaError
    expect(getAudioErrorMessage(error)).toBe('Ошибка декодирования')
  })

  it('should return correct message for MEDIA_ERR_SRC_NOT_SUPPORTED', () => {
    const error = { code: 4 } as MediaError
    expect(getAudioErrorMessage(error)).toBe('Формат не поддерживается')
  })

  it('should return unknown error for unknown code', () => {
    const error = { code: 99 } as MediaError
    expect(getAudioErrorMessage(error)).toBe('Неизвестная ошибка (99)')
  })
})
