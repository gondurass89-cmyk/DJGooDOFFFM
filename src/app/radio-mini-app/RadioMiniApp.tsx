'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Volume2, VolumeX, Loader2, Share2, Heart, Radio, AlertCircle } from 'lucide-react'

const STREAM_URL = 'https://radio-stream.gondurass89.workers.dev'
const STATION_NAME = 'DJ GooD OFF FM'
const STATION_LOGO = '/logo.png'
const LISTENERS_API = '/api/listener'

const COLORS = {
  primary: '#2e0071',
  secondary: '#00c730',
  accent: '#00ff40',
  text: '#c4c4c4',
  dark: '#0d0026',
  glow: 'rgba(0, 199, 48, 0.5)',
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand: () => void
        openTelegramLink: (url: string) => void
        platform: string
        initData: string
        initDataUnsafe?: {
          user?: {
            id: number
            first_name: string
            last_name?: string
            username?: string
            language_code?: string
          }
        }
        onEvent: (event: string, callback: () => void) => void
        close: () => void
      }
    }
    webkitAudioContext?: typeof AudioContext
  }
}

export default function RadioMiniApp() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [volume, setVolume] = useState(100)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTrack] = useState('Нажмите ▶')
  const [listeners, setListeners] = useState(0)
  const [audioData, setAudioData] = useState<number[]>(new Array(32).fill(0))
  const [isTgReady, setIsTgReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isIOS, setIsIOS] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const animationRef = useRef<number | null>(null)

  // Detect iOS
  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(iOS)
  }, [])

  // Fetch listeners count
  const fetchListenersCount = useCallback(async () => {
    try {
      const res = await fetch(LISTENERS_API)
      if (res.ok) {
        const data = await res.json()
        setListeners(data.total || 0)
      }
    } catch (e) {
      console.error('Failed to fetch listeners:', e)
    }
  }, [])

  // Register listener action
  const registerListener = useCallback(async (action: 'open' | 'close') => {
    const tg = window.Telegram?.WebApp
    const user = tg?.initDataUnsafe?.user
    
    if (!user) return

    try {
      await fetch(LISTENERS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          language_code: user.language_code,
          action,
        })
      })
      fetchListenersCount()
    } catch (e) {
      console.error('Failed to register listener:', e)
    }
  }, [fetchListenersCount])

  // Handle app close
  useEffect(() => {
    const handleClose = () => {
      const tg = window.Telegram?.WebApp
      const user = tg?.initDataUnsafe?.user
      
      if (user) {
        const data = JSON.stringify({
          user_id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          action: 'close',
        })
        const blob = new Blob([data], { type: 'application/json' })
        navigator.sendBeacon(LISTENERS_API, blob)
      }
    }

    window.addEventListener('beforeunload', handleClose)
    return () => window.removeEventListener('beforeunload', handleClose)
  }, [])

  // Initialize Telegram WebApp
  useEffect(() => {
    const initTelegram = () => {
      const tg = window.Telegram?.WebApp
      if (tg) {
        tg.ready()
        tg.expand()
        setIsTgReady(true)
        return true
      }
      return false
    }

    if (initTelegram()) {
      fetchListenersCount()
      return
    }

    let attempts = 0
    const interval = setInterval(() => {
      attempts++
      if (initTelegram() || attempts >= 20) {
        clearInterval(interval)
        fetchListenersCount()
      }
    }, 100)

    return () => clearInterval(interval)
  }, [fetchListenersCount])

  // Register 'open' when ready
  useEffect(() => {
    if (isTgReady) {
      registerListener('open')
    }
  }, [isTgReady, registerListener])

  // Periodic update
  useEffect(() => {
    const interval = setInterval(fetchListenersCount, 10000)
    return () => clearInterval(interval)
  }, [fetchListenersCount])

  // Audio setup
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'none'
    audio.crossOrigin = 'anonymous'
    audioRef.current = audio

    audio.addEventListener('playing', () => {
      setIsPlaying(true)
      setIsLoading(false)
      setError(null)
      initAudioAnalyser()
    })
    
    audio.addEventListener('pause', () => {
      setIsPlaying(false)
      stopAudioAnalyser()
    })
    
    audio.addEventListener('waiting', () => setIsLoading(true))
    audio.addEventListener('canplay', () => setIsLoading(false))
    
    audio.addEventListener('error', (e) => {
      console.error('Audio error:', e)
      setIsLoading(false)
      setIsPlaying(false)
      setError('Ошибка воспроизведения. Проверьте соединение.')
    })

    return () => {
      audio.pause()
      audio.src = ''
      stopAudioAnalyser()
    }
  }, [])

  const initAudioAnalyser = () => {
    if (!audioRef.current) return
    
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx()
      }
      
      const ctx = audioContextRef.current
      
      if (ctx.state === 'suspended') {
        ctx.resume()
      }
      
      if (!analyserRef.current) {
        analyserRef.current = ctx.createAnalyser()
        analyserRef.current.fftSize = 64
      }
      
      if (!sourceRef.current && audioRef.current) {
        sourceRef.current = ctx.createMediaElementSource(audioRef.current)
        sourceRef.current.connect(analyserRef.current)
        analyserRef.current.connect(ctx.destination)
      }
      
      startVisualization()
    } catch (e) {
      console.error('Audio analyser error:', e)
    }
  }

  const startVisualization = () => {
    if (!analyserRef.current) return
    
    const analyser = analyserRef.current
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    
    const update = () => {
      analyser.getByteFrequencyData(dataArray)
      setAudioData(Array.from(dataArray).map(v => v / 255))
      animationRef.current = requestAnimationFrame(update)
    }
    
    update()
  }

  const stopAudioAnalyser = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    setAudioData(new Array(32).fill(0))
  }

  // Volume control
  useEffect(() => {
    if (audioRef.current && !isIOS) {
      audioRef.current.volume = isMuted ? 0 : volume / 100
    }
  }, [volume, isMuted, isIOS])

  const handlePlay = async () => {
    const audio = audioRef.current
    if (!audio) return

    setError(null)

    if (isPlaying) {
      audio.pause()
      return
    }

    setIsLoading(true)
    
    try {
      // Set volume before playing
      if (!isIOS) {
        audio.volume = isMuted ? 0 : volume / 100
      }
      
      audio.src = STREAM_URL
      audio.load()
      
      // Try to play
      const playPromise = audio.play()
      
      if (playPromise !== undefined) {
        await playPromise
      }
    } catch (err: any) {
      console.error('Play error:', err)
      setIsLoading(false)
      
      if (err.name === 'NotAllowedError') {
        setError('Нажмите ещё раз для воспроизведения')
      } else if (err.name === 'NotSupportedError') {
        setError('Формат не поддерживается браузером')
      } else {
        setError('Ошибка воспроизведения: ' + (err.message || 'неизвестная'))
      }
    }
  }

  const share = () => {
    const text = `🎵 ${STATION_NAME}`
    const url = window.location.href
    
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
      )
    }
  }

  const displayVolume = isMuted ? 0 : volume

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: `linear-gradient(180deg, ${COLORS.primary} 0%, ${COLORS.dark} 100%)` }}
    >
      <div 
        className="fixed inset-0 pointer-events-none"
        style={{ background: `radial-gradient(circle at 50% 30%, ${COLORS.glow.replace('0.5', '0.15')} 0%, transparent 50%)` }}
      />

      <div className="relative z-10 w-full max-w-xs">
        {/* Logo */}
        <div className="relative mb-3">
          <motion.div 
            className="w-28 h-28 mx-auto rounded-full overflow-hidden"
            animate={isPlaying ? { scale: [1, 1.03, 1] } : {}}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{
              boxShadow: isPlaying 
                ? `0 0 40px ${COLORS.glow}`
                : `0 4px 16px rgba(0,0,0,0.5)`,
              border: `2px solid ${COLORS.secondary}`
            }}
          >
            <img src={STATION_LOGO} alt={STATION_NAME} className="w-full h-full object-cover" />
          </motion.div>
          
          <AnimatePresence>
            {isPlaying && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute top-0 right-6 px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ background: COLORS.secondary, color: COLORS.dark }}
              >
                LIVE
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Visualizer */}
        <div className="flex justify-center items-end gap-0.5 h-8 mb-3">
          {audioData.slice(0, 16).map((value, i) => (
            <div
              key={i}
              className="w-1.5 rounded-full"
              style={{
                background: `linear-gradient(to top, ${COLORS.secondary}, ${COLORS.accent})`,
                height: `${Math.max(2, value * 32)}px`,
                boxShadow: value > 0.1 ? `0 0 4px ${COLORS.glow}` : 'none',
                transition: 'height 0.05s ease-out'
              }}
            />
          ))}
        </div>

        {/* Info */}
        <div className="text-center mb-3">
          <div className="flex items-center justify-center gap-1.5 mb-0.5">
            <Radio className="w-3 h-3" style={{ color: COLORS.secondary }} />
            <span className="text-xs uppercase tracking-wider" style={{ color: COLORS.secondary }}>
              Онлайн-радио
            </span>
          </div>
          <h1 className="text-base font-bold text-white">{STATION_NAME}</h1>
          <p style={{ color: COLORS.text }} className="text-xs">{currentTrack}</p>
          <p className="text-xs mt-0.5" style={{ color: COLORS.accent }}>
            👥 {listeners} {listeners === 1 ? 'слушатель' : 'слушателя'}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center justify-center gap-2 mb-2 p-2 rounded-lg" 
               style={{ background: 'rgba(255,0,0,0.1)' }}>
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-300">{error}</span>
          </div>
        )}

        {/* Play Button */}
        <div className="flex justify-center mb-3">
          <motion.button
            onClick={handlePlay}
            disabled={isLoading}
            whileTap={{ scale: 0.95 }}
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${COLORS.secondary} 0%, ${COLORS.accent} 100%)`,
              boxShadow: `0 3px 15px ${COLORS.glow}`
            }}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: COLORS.dark }} />
            ) : isPlaying ? (
              <Pause className="w-5 h-5" style={{ color: COLORS.dark }} />
            ) : (
              <Play className="w-5 h-5 ml-0.5" style={{ color: COLORS.dark }} />
            )}
          </motion.button>
        </div>

        {/* Volume */}
        {!isIOS ? (
          <div className="flex items-center gap-2 mb-3 px-1">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="flex-shrink-0 p-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" style={{ color: '#666' }} />
              ) : (
                <Volume2 className="w-4 h-4" style={{ color: COLORS.secondary }} />
              )}
            </button>
            
            <div className="flex-1 relative h-6 flex items-center">
              <div 
                className="absolute w-full h-2 rounded-full"
                style={{ background: 'rgba(255,255,255,0.1)' }}
              />
              <div 
                className="absolute h-2 rounded-full"
                style={{ 
                  width: `${displayVolume}%`,
                  background: COLORS.secondary
                }}
              />
              <input
                type="range"
                min="0"
                max="100"
                value={displayVolume}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  setVolume(v)
                  if (v > 0) setIsMuted(false)
                }}
                className="absolute w-full opacity-0 cursor-pointer"
                style={{ height: '24px' }}
              />
              <div 
                className="absolute w-5 h-5 rounded-full border-2"
                style={{ 
                  left: `calc(${displayVolume}% - 10px)`,
                  background: '#fff',
                  borderColor: COLORS.secondary,
                }}
              />
            </div>
            
            <span 
              className="text-xs w-8 text-right"
              style={{ color: COLORS.secondary }}
            >
              {displayVolume}%
            </span>
          </div>
        ) : (
          <div className="text-center mb-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <p className="text-xs" style={{ color: COLORS.text }}>
              💡 Громкость — кнопки устройства
            </p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-center gap-2">
          <motion.button
            onClick={share}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${COLORS.secondary}40` }}
          >
            <Share2 className="w-4 h-4" style={{ color: COLORS.secondary }} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${COLORS.secondary}40` }}
          >
            <Heart className="w-4 h-4" style={{ color: COLORS.secondary }} />
          </motion.button>
        </div>

        <p className="text-center text-xs mt-3" style={{ color: '#555' }}>
          Powered by <span style={{ color: COLORS.secondary }}>DJ GooD OFF</span>
        </p>
      </div>
    </div>
  )
}
