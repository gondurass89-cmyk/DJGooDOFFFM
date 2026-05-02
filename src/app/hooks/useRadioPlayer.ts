'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

export type PlayerState = 'idle' | 'connecting' | 'playing' | 'reconnecting' | 'error'

export interface UseRadioPlayerOptions {
  streamUrl: string
  volume?: number
  isMuted?: boolean
  maxReconnectAttempts?: number
  reconnectDelay?: number
}

export interface UseRadioPlayerReturn {
  isPlaying: boolean
  isLoading: boolean
  playerState: PlayerState
  error: string | null
  buffering: boolean
  attemptsLeft: number
  maxAttempts: number
  play: () => Promise<void>
  pause: () => void
  retry: () => Promise<void>
  audioRef: React.RefObject<HTMLAudioElement | null>
}

export function useRadioPlayer({
  streamUrl,
  volume = 100,
  isMuted = false,
  maxReconnectAttempts = 5,
  reconnectDelay = 3000,
}: UseRadioPlayerOptions): UseRadioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [playerState, setPlayerState] = useState<PlayerState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [buffering, setBuffering] = useState(false)
  const [attemptsLeft, setAttemptsLeft] = useState(maxReconnectAttempts)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isManualStopRef = useRef(false)

  // Clear reconnect timeout
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  // Get stream URL with anti-cache parameter
  const getStreamUrl = useCallback(() => {
    const separator = streamUrl.includes('?') ? '&' : '?'
    return `${streamUrl}${separator}t=${Date.now()}`
  }, [streamUrl])

  // Reset attempts counter on success
  const resetAttempts = useCallback(() => {
    setAttemptsLeft(maxReconnectAttempts)
  }, [maxReconnectAttempts])

  // Attempt to play
  const attemptPlay = useCallback(async (): Promise<boolean> => {
    const audio = audioRef.current
    if (!audio) return false

    try {
      audio.volume = isMuted ? 0 : volume / 100
      audio.src = getStreamUrl()
      audio.load()
      await audio.play()
      return true
    } catch (err: any) {
      console.error('Play attempt failed:', err.message)
      return false
    }
  }, [getStreamUrl, isMuted, volume])

  // Handle reconnection
  const handleReconnect = useCallback(async () => {
    if (isManualStopRef.current) {
      console.log('Manual stop, skipping reconnect')
      return
    }

    const attempts = attemptsLeft
    console.log(`Reconnecting... Attempts left: ${attempts}`)

    if (attempts <= 0) {
      // No more attempts
      setPlayerState('error')
      setError('Радио временно недоступно')
      setIsLoading(false)
      setBuffering(false)
      return
    }

    setPlayerState('reconnecting')
    setAttemptsLeft(attempts - 1)

    // Wait before reconnecting
    await new Promise(resolve => {
      reconnectTimeoutRef.current = setTimeout(resolve, reconnectDelay)
    })

    if (isManualStopRef.current) return

    const success = await attemptPlay()
    if (!success && !isManualStopRef.current) {
      // Will trigger error event which calls handleReconnect again
      audioRef.current?.dispatchEvent(new Event('error'))
    }
  }, [attemptsLeft, reconnectDelay, attemptPlay])

  // Play function
  const play = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return

    isManualStopRef.current = false
    setError(null)
    setIsLoading(true)
    setPlayerState('connecting')

    const success = await attemptPlay()
    if (!success) {
      setPlayerState('error')
      setError('Ошибка воспроизведения')
      setIsLoading(false)
    }
  }, [attemptPlay])

  // Pause function
  const pause = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    isManualStopRef.current = true
    clearReconnectTimeout()
    audio.pause()
    audio.src = ''
    setIsPlaying(false)
    setIsLoading(false)
    setBuffering(false)
    setPlayerState('idle')
    resetAttempts()
  }, [clearReconnectTimeout, resetAttempts])

  // Retry after error
  const retry = useCallback(async () => {
    resetAttempts()
    setError(null)
    await play()
  }, [resetAttempts, play])

  // Setup audio element and event listeners
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'none'
    audio.crossOrigin = 'anonymous'
    audioRef.current = audio

    audio.addEventListener('playing', () => {
      console.log('Audio playing')
      setIsPlaying(true)
      setIsLoading(false)
      setBuffering(false)
      setError(null)
      setPlayerState('playing')
      resetAttempts()
    })

    audio.addEventListener('pause', () => {
      console.log('Audio paused')
      if (!isManualStopRef.current) {
        // Unexpected pause (not from user)
        setIsPlaying(false)
      }
    })

    audio.addEventListener('waiting', () => {
      console.log('Audio waiting/buffering')
      setBuffering(true)
      setIsLoading(true)
    })

    audio.addEventListener('canplay', () => {
      console.log('Audio can play')
      setBuffering(false)
      setIsLoading(false)
    })

    audio.addEventListener('error', (e) => {
      console.log('Audio error:', e)
      if (isManualStopRef.current) return

      setIsPlaying(false)
      setIsLoading(false)

      // Check if we have attempts left
      if (attemptsLeft > 0) {
        handleReconnect()
      } else {
        setPlayerState('error')
        setError('Радио временно недоступно')
      }
    })

    audio.addEventListener('stalled', () => {
      console.log('Audio stalled')
      setBuffering(true)
    })

    return () => {
      isManualStopRef.current = true
      clearReconnectTimeout()
      audio.pause()
      audio.src = ''
    }
  }, []) // Only run once on mount

  // Update attemptsLeft ref when it changes for error handler
  useEffect(() => {
    // Re-attach error handler with updated attemptsLeft
    const audio = audioRef.current
    if (!audio) return

    const handleError = () => {
      if (isManualStopRef.current) return
      setIsPlaying(false)
      setIsLoading(false)
    }

    audio.addEventListener('error', handleError)
    return () => audio.removeEventListener('error', handleError)
  }, [attemptsLeft])

  // Update volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100
    }
  }, [volume, isMuted])

  return {
    isPlaying,
    isLoading,
    playerState,
    error,
    buffering,
    attemptsLeft,
    maxAttempts: maxReconnectAttempts,
    play,
    pause,
    retry,
    audioRef,
  }
}
