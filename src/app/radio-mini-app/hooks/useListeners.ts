'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { LISTENERS_API, HEARTBEAT_INTERVAL } from '../types'
import { TelegramUser } from '../types'
import { logger } from '@/lib/logger'

// =====================================================
// LISTENERS HOOK
// Отслеживание слушателей через Cloudflare D1 Worker
// =====================================================

export interface UseListenersReturn {
  listeners: number
  registerListener: (action: 'open' | 'close' | 'heartbeat', user: TelegramUser | null) => Promise<void>
}

// Generate guest ID from localStorage
function getGuestId(): { userId: number; firstName: string } {
  if (typeof window === 'undefined') {
    return { userId: 0, firstName: 'Гость' }
  }

  let sessionId = localStorage.getItem('radio_guest_id')
  if (!sessionId) {
    sessionId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    localStorage.setItem('radio_guest_id', sessionId)
  }

  // Hash session ID to get numeric user ID
  let hash = 0
  for (let i = 0; i < sessionId.length; i++) {
    hash = ((hash << 5) - hash) + sessionId.charCodeAt(i)
    hash = hash & hash
  }

  return { userId: Math.abs(hash), firstName: 'Гость' }
}

export function useListeners(
  isPlaying: boolean,
  user: TelegramUser | null
): UseListenersReturn {
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [listeners, setListeners] = useState(0)

  // Register listener action
  const registerListener = useCallback(async (
    action: 'open' | 'close' | 'heartbeat',
    tgUser: TelegramUser | null
  ) => {
    let userId: number
    let firstName: string
    let lastName: string | null = null
    let username: string | null = null

    if (tgUser) {
      userId = tgUser.id
      firstName = tgUser.first_name
      lastName = tgUser.last_name || null
      username = tgUser.username || null
    } else {
      const guest = getGuestId()
      userId = guest.userId
      firstName = guest.firstName
    }

    try {
      await fetch(LISTENERS_API, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          first_name: firstName,
          last_name: lastName,
          username,
          action,
        }),
      })
    } catch (e) {
      logger.error('[LISTENER] Error:', e)
    }
  }, [])

  // Send close on page unload
  useEffect(() => {
    const sendClose = () => {
      const tgUser = user
      let userId: number
      let firstName: string

      if (tgUser) {
        userId = tgUser.id
        firstName = tgUser.first_name
      } else {
        const guest = getGuestId()
        userId = guest.userId
        firstName = guest.firstName
      }

      navigator.sendBeacon(LISTENERS_API, new Blob([JSON.stringify({
        user_id: userId,
        first_name: firstName,
        last_name: tgUser?.last_name || null,
        username: tgUser?.username || null,
        action: 'close',
      })], { type: 'application/json' }))
    }

    window.addEventListener('beforeunload', sendClose)
    window.addEventListener('pagehide', sendClose)

    return () => {
      window.removeEventListener('beforeunload', sendClose)
      window.removeEventListener('pagehide', sendClose)
    }
  }, [user])

  // Heartbeat when playing
  useEffect(() => {
    if (isPlaying) {
      registerListener('open', user)
      heartbeatIntervalRef.current = setInterval(() => {
        registerListener('heartbeat', user)
      }, HEARTBEAT_INTERVAL)
    } else {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
    }

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
    }
  }, [isPlaying, user, registerListener])

  return {
    listeners,
    registerListener,
  }
}

// Hook for fetching listeners count - ИСПРАВЛЕНО: useState вместо useRef
export function useListenersCount(): number {
  const [listeners, setListeners] = useState(0)

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch(LISTENERS_API, { mode: 'cors' })
      if (res.ok) {
        const data = await res.json()
        setListeners(data.total || 0)
      }
    } catch (e) {
      logger.error('[LISTENERS] Fetch error:', e)
    }
  }, [])

  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 10000)
    return () => clearInterval(interval)
  }, [fetchCount])

  return listeners
}
