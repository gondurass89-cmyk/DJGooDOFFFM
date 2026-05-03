'use client'

import { useState, useEffect, useCallback } from 'react'
import { TelegramWebApp, TelegramUser } from '../types'

// =====================================================
// TELEGRAM WEBAPP HOOK
// Интеграция с Telegram Mini App API
// =====================================================

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp
    }
  }
}

export interface UseTelegramReturn {
  user: TelegramUser | null
  platform: string
  isReady: boolean
  isIOS: boolean
  tg: TelegramWebApp | null
}

export function useTelegram(): UseTelegramReturn {
  const [user, setUser] = useState<TelegramUser | null>(null)
  const [platform, setPlatform] = useState<string>('')
  const [isReady, setIsReady] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  // Detect iOS
  const detectIOS = useCallback((): boolean => {
    if (typeof window === 'undefined') return false

    const ua = navigator.userAgent
    const isIPad = /iPad/i.test(ua)
    const isIPhone = /iPhone/i.test(ua)
    const isIPod = /iPod/i.test(ua)
    const isIPadModern = /Macintosh/i.test(ua) &&
      !!(navigator.maxTouchPoints && navigator.maxTouchPoints > 1)

    return isIPad || isIPhone || isIPod || isIPadModern
  }, [])

  // Initialize Telegram WebApp
  useEffect(() => {
    const initTelegram = () => {
      const tg = window.Telegram?.WebApp
      if (tg) {
        tg.ready()
        tg.expand()

        const tgUser = tg.initDataUnsafe?.user
        const tgPlatform = tg.platform || ''

        if (tgUser) {
          setUser(tgUser)
        }
        setPlatform(tgPlatform)
        setIsIOS(tgPlatform === 'ios' || detectIOS())
        setIsReady(true)

        return true
      }
      return false
    }

    // Try init immediately
    if (initTelegram()) return

    // Retry if Telegram script not loaded yet
    let attempts = 0
    const interval = setInterval(() => {
      attempts++
      if (initTelegram() || attempts >= 20) {
        clearInterval(interval)
      }
    }, 100)

    return () => clearInterval(interval)
  }, [detectIOS])

  return {
    user,
    platform,
    isReady,
    isIOS,
    tg: typeof window !== 'undefined' ? window.Telegram?.WebApp || null : null
  }
}
