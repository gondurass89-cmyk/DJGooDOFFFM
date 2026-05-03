'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  STREAM_URL,
  LOAD_TIMEOUT,
  BUFFERING_TIMEOUT,
  RECONNECT_MAX_ATTEMPTS,
  RECONNECT_DELAY,
  detectIOS,
  getAudioErrorMessage,
} from '../types'
import { logger } from '@/lib/logger'

// =====================================================
// AUDIO PLAYER HOOK
// Управление воспроизведением аудио потока
// =====================================================

export interface UseAudioPlayerReturn {
  // State
  isPlaying: boolean
  isLoading: boolean
  isMuted: boolean
  volume: number
  error: string | null
  buffering: boolean
  reconnecting: boolean
  reconnectAttempts: number

  // Refs (для визуализатора и эквалайзера)
  audioRef: React.MutableRefObject<HTMLAudioElement | null>
  audioContextRef: React.MutableRefObject<AudioContext | null>
  analyserRef: React.MutableRefObject<AnalyserNode | null>
  sourceNodeRef: React.MutableRefObject<MediaElementAudioSourceNode | null>
  isSourceConnectedRef: React.MutableRefObject<boolean>
  bassFilterRef: React.MutableRefObject<BiquadFilterNode | null>
  midFilterRef: React.MutableRefObject<BiquadFilterNode | null>
  trebleFilterRef: React.MutableRefObject<BiquadFilterNode | null>

  // iOS detection
  isIOSRef: React.MutableRefObject<boolean>
  fallbackModeRef: React.MutableRefObject<boolean>

  // Actions
  togglePlay: () => Promise<void>
  setVolume: (volume: number) => void
  toggleMute: () => void
  connectAudioChain: (eqBass: number, eqMid: number, eqTreble: number) => boolean
  getAudioContext: () => AudioContext | null
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  // State
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolumeState] = useState(100)
  const [error, setError] = useState<string | null>(null)
  const [buffering, setBuffering] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const isSourceConnectedRef = useRef(false)
  const bassFilterRef = useRef<BiquadFilterNode | null>(null)
  const midFilterRef = useRef<BiquadFilterNode | null>(null)
  const trebleFilterRef = useRef<BiquadFilterNode | null>(null)
  const isIOSRef = useRef(false)
  const fallbackModeRef = useRef(false)
  const isManualStopRef = useRef(false)
  const isPlayingRef = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const bufferingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get or create AudioContext
  const getAudioContext = useCallback((): AudioContext | null => {
    if (audioContextRef.current) return audioContextRef.current
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return null
    const ctx = new AudioContextClass()
    audioContextRef.current = ctx
    return ctx
  }, [])

  // Connect audio chain (source -> filters -> analyser -> destination)
  const connectAudioChain = useCallback((
    eqBass: number,
    eqMid: number,
    eqTreble: number
  ): boolean => {
    if (isSourceConnectedRef.current) return true

    const audio = audioRef.current
    if (!audio) return false

    const ctx = getAudioContext()
    if (!ctx) return false

    try {
      // Bass filter (low shelf)
      const bassFilter = ctx.createBiquadFilter()
      bassFilter.type = 'lowshelf'
      bassFilter.frequency.value = 250
      bassFilter.gain.value = eqBass
      bassFilterRef.current = bassFilter

      // Mid filter (peaking)
      const midFilter = ctx.createBiquadFilter()
      midFilter.type = 'peaking'
      midFilter.frequency.value = 1000
      midFilter.Q.value = 0.5
      midFilter.gain.value = eqMid
      midFilterRef.current = midFilter

      // Treble filter (high shelf)
      const trebleFilter = ctx.createBiquadFilter()
      trebleFilter.type = 'highshelf'
      trebleFilter.frequency.value = 4000
      trebleFilter.gain.value = eqTreble
      trebleFilterRef.current = trebleFilter

      // Analyser
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser

      // Source
      const source = ctx.createMediaElementSource(audio)
      sourceNodeRef.current = source

      // Connect chain
      source.connect(bassFilter)
      bassFilter.connect(midFilter)
      midFilter.connect(trebleFilter)
      trebleFilter.connect(analyser)
      analyser.connect(ctx.destination)

      isSourceConnectedRef.current = true
      return true
    } catch (e) {
      logger.error('[AUDIO] Error connecting audio chain:', e)
      return false
    }
  }, [getAudioContext])

  // Handle reconnect
  const handleReconnect = useCallback(() => {
    if (isManualStopRef.current) return

    const attempt = reconnectAttempts + 1
    logger.log(`[RECONNECT] Attempt ${attempt}/${RECONNECT_MAX_ATTEMPTS}`)

    if (attempt > RECONNECT_MAX_ATTEMPTS) {
      setReconnecting(false)
      setReconnectAttempts(0)
      setError('Радио временно недоступно')
      setIsPlaying(false)
      setIsLoading(false)
      return
    }

    setReconnecting(true)
    setReconnectAttempts(attempt)
    setIsPlaying(false)

    reconnectTimeoutRef.current = setTimeout(async () => {
      if (isManualStopRef.current) return

      const audio = audioRef.current
      if (!audio) return

      try {
        audio.src = STREAM_URL + '?t=' + Date.now()
        audio.load()
        await audio.play()
        setReconnecting(false)
        setReconnectAttempts(0)
      } catch (e) {
        logger.error('[RECONNECT] Failed:', e)
        handleReconnect()
      }
    }, RECONNECT_DELAY)
  }, [reconnectAttempts])

  // Initialize audio element
  useEffect(() => {
    isIOSRef.current = detectIOS()
    logger.log('[AUDIO] Init. iOS:', isIOSRef.current)

    const audio = new Audio()
    audio.preload = 'none'
    audio.crossOrigin = 'anonymous'
    audio.setAttribute('playsinline', 'true')
    audio.setAttribute('webkit-playsinline', 'true')
    audio.setAttribute('x5-video-player-type', 'h5')
    audio.setAttribute('x5-video-player-fullscreen', 'true')
    audioRef.current = audio

    // Event handlers
    const onPlaying = () => {
      setIsPlaying(true)
      isPlayingRef.current = true
      setIsLoading(false)
      setBuffering(false)
      setError(null)
      setReconnecting(false)
      setReconnectAttempts(0)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (bufferingTimeoutRef.current) clearTimeout(bufferingTimeoutRef.current)
    }

    const onPause = () => {
      setIsPlaying(false)
      isPlayingRef.current = false
    }

    const onWaiting = () => {
      setBuffering(true)
      setIsLoading(true)
      if (bufferingTimeoutRef.current) clearTimeout(bufferingTimeoutRef.current)
      bufferingTimeoutRef.current = setTimeout(() => {
        if (!isManualStopRef.current && isPlayingRef.current) {
          handleReconnect()
        }
      }, BUFFERING_TIMEOUT)
    }

    const onCanPlay = () => {
      setBuffering(false)
      setIsLoading(false)
      if (bufferingTimeoutRef.current) clearTimeout(bufferingTimeoutRef.current)
    }

    const onStalled = () => {
      setBuffering(true)
      if (bufferingTimeoutRef.current) clearTimeout(bufferingTimeoutRef.current)
      bufferingTimeoutRef.current = setTimeout(() => {
        if (!isManualStopRef.current && isPlayingRef.current) {
          handleReconnect()
        }
      }, BUFFERING_TIMEOUT)
    }

    const onEnded = () => {
      if (!isManualStopRef.current) handleReconnect()
    }

    const onError = () => {
      const mediaError = audio.error
      logger.error('[AUDIO] Error:', mediaError ? getAudioErrorMessage(mediaError) : 'Unknown')

      if (mediaError?.code === MediaError.MEDIA_ERR_DECODE && isIOSRef.current) {
        fallbackModeRef.current = true
      }

      if (!isManualStopRef.current) {
        handleReconnect()
        return
      }

      const errorMsg = mediaError ? getAudioErrorMessage(mediaError) : 'Ошибка воспроизведения'

      setIsLoading(false)
      setIsPlaying(false)
      setError(errorMsg)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }

    // Visibility change handler
    const onVisibilityChange = async () => {
      const ctx = audioContextRef.current
      if (document.visibilityState === 'visible' && ctx && ctx.state === 'suspended') {
        try { await ctx.resume() } catch (e) {}
      }
    }

    // Add listeners
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('stalled', onStalled)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Cleanup
    return () => {
      isManualStopRef.current = true
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('stalled', onStalled)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      audio.pause()
      audio.src = ''
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (bufferingTimeoutRef.current) clearTimeout(bufferingTimeoutRef.current)
    }
  }, [handleReconnect])

  // Volume effect
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100
    }
  }, [volume, isMuted])

  // Toggle play/pause
  const togglePlay = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      isManualStopRef.current = true
      audio.pause()
      isPlayingRef.current = false
      return
    }

    isManualStopRef.current = false
    setError(null)
    setIsLoading(true)
    setReconnectAttempts(0)
    setReconnecting(false)

    const isIOS = isIOSRef.current
    if (isIOS) {
      fallbackModeRef.current = true
    }

    // Load timeout
    timeoutRef.current = setTimeout(() => {
      if (isLoading && !isPlaying) {
        setError('Таймаут загрузки')
        setIsLoading(false)
        audio.pause()
      }
    }, LOAD_TIMEOUT)

    try {
      audio.volume = isMuted ? 0 : volume / 100

      if (!audio.src || audio.src !== STREAM_URL) {
        audio.src = STREAM_URL
        audio.load()
      }

      await audio.play()
      isPlayingRef.current = true
    } catch (err: any) {
      logger.error('[PLAY] Error:', err.name, err.message)

      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      setIsLoading(false)

      let errorMsg = 'Ошибка воспроизведения'
      if (err.name === 'NotAllowedError') errorMsg = 'Нажмите кнопку ещё раз'
      else if (err.name === 'NotSupportedError') errorMsg = 'Формат не поддерживается'
      else if (err.name === 'AbortError') errorMsg = 'Воспроизведение прервано'

      setError(errorMsg)

      if (isIOS) {
        fallbackModeRef.current = true
      }
    }
  }, [isPlaying, isLoading, isMuted, volume])

  // Set volume
  const setVolume = useCallback((newVolume: number) => {
    setVolumeState(newVolume)
  }, [])

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev)
  }, [])

  return {
    isPlaying,
    isLoading,
    isMuted,
    volume,
    error,
    buffering,
    reconnecting,
    reconnectAttempts,
    audioRef,
    audioContextRef,
    analyserRef,
    sourceNodeRef,
    isSourceConnectedRef,
    bassFilterRef,
    midFilterRef,
    trebleFilterRef,
    isIOSRef,
    fallbackModeRef,
    togglePlay,
    setVolume,
    toggleMute,
    connectAudioChain,
    getAudioContext,
  }
}
