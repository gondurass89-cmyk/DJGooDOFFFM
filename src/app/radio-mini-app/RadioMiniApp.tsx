'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Volume2, VolumeX, Loader2, Share2, Heart, Radio, AlertCircle, Wifi } from 'lucide-react'

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
  bass: '#ff0066',
  mid: '#00c730',
  high: '#00ffcc',
}

const ADMIN_USER_ID = 55068554
const BAR_COUNT = 24

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
  const [audioData, setAudioData] = useState<number[]>(new Array(BAR_COUNT).fill(0))
  const [isTgReady, setIsTgReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [buffering, setBuffering] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const animationRef = useRef<number | null>(null)
  const fakeAnimationRef = useRef<number | null>(null)
  const isAnalyserReady = useRef(false)

  // Detect iOS
  useEffect(() => {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    setIsIOS(iOS)
    console.log('Is iOS:', iOS)
  }, [])

  // Fake animation for iOS - simple and reliable
  const startFakeAnimation = useCallback(() => {
    console.log('Starting fake animation')
    
    const animate = () => {
      const time = Date.now() / 1000
      const newData = []
      
      for (let i = 0; i < BAR_COUNT; i++) {
        // Create a wave pattern
        const wave1 = Math.sin(time * 2 + i * 0.3) * 0.3
        const wave2 = Math.sin(time * 3 + i * 0.5) * 0.2
        const wave3 = Math.sin(time * 5 + i * 0.2) * 0.15
        const random = Math.random() * 0.15
        
        // Bass frequencies (first 8 bars) - more intense
        let value = 0.3 + wave1 + wave2 + wave3 + random
        if (i < 8) value += 0.2
        // Mid frequencies (middle 8 bars)
        else if (i < 16) value += 0.1
        
        newData.push(Math.max(0.05, Math.min(1, value)))
      }
      
      setAudioData(newData)
      fakeAnimationRef.current = requestAnimationFrame(animate)
    }
    
    animate()
  }, [])

  const stopFakeAnimation = useCallback(() => {
    console.log('Stopping fake animation')
    if (fakeAnimationRef.current) {
      cancelAnimationFrame(fakeAnimationRef.current)
      fakeAnimationRef.current = null
    }
    setAudioData(new Array(BAR_COUNT).fill(0))
  }, [])

  // Real audio visualization
  const startRealVisualization = useCallback(() => {
    if (!analyserRef.current) return
    
    const analyser = analyserRef.current
    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    
    const update = () => {
      if (analyser && audioContextRef.current?.state === 'running') {
        analyser.getByteFrequencyData(dataArray)
        const mapped = []
        for (let i = 0; i < BAR_COUNT; i++) {
          const idx = Math.floor(i * (dataArray.length / BAR_COUNT))
          mapped.push(dataArray[idx] / 255)
        }
        setAudioData(mapped)
      }
      animationRef.current = requestAnimationFrame(update)
    }
    
    update()
  }, [])

  const stopRealVisualization = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    setAudioData(new Array(BAR_COUNT).fill(0))
  }, [])

  // Initialize audio analyzer (for non-iOS)
  const initAudioAnalyser = useCallback((): boolean => {
    if (isAnalyserReady.current || isIOS) return false
    
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
        analyserRef.current.smoothingTimeConstant = 0.8
      }
      
      if (!sourceRef.current && audioRef.current) {
        sourceRef.current = ctx.createMediaElementSource(audioRef.current)
        sourceRef.current.connect(analyserRef.current)
        analyserRef.current.connect(ctx.destination)
        isAnalyserReady.current = true
      }
      
      return true
    } catch (e) {
      console.error('Audio analyser error:', e)
      return false
    }
  }, [isIOS])

  // Fetch listeners count
  const fetchListenersCount = useCallback(async () => {
    try {
      const res = await fetch(LISTENERS_API)
      if (res.ok) {
        const data = await res.json()
        setListeners(data.total || 0)
      }
    } catch (e) {}
  }, [])

  // Register listener
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
          isAdmin: user.id === ADMIN_USER_ID,
        })
      })
      
      fetchListenersCount()
    } catch (e) {}
  }, [fetchListenersCount])

  // Handle app close
  useEffect(() => {
    const sendClose = () => {
      const tg = window.Telegram?.WebApp
      const user = tg?.initDataUnsafe?.user
      
      if (!user) return
      
      const data = JSON.stringify({
        user_id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        action: 'close',
        isAdmin: user.id === ADMIN_USER_ID,
      })
      
      const blob = new Blob([data], { type: 'application/json' })
      navigator.sendBeacon(LISTENERS_API, blob)
    }

    window.addEventListener('beforeunload', sendClose)
    window.addEventListener('pagehide', sendClose)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') sendClose()
    })
    
    return () => {
      window.removeEventListener('beforeunload', sendClose)
      window.removeEventListener('pagehide', sendClose)
    }
  }, [])

  // Initialize Telegram
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

  useEffect(() => {
    if (isTgReady) registerListener('open')
  }, [isTgReady, registerListener])

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
      console.log('Audio playing')
      setIsPlaying(true)
      setIsLoading(false)
      setBuffering(false)
      setError(null)
      
      // Start visualization
      if (isIOS) {
        // On iOS always use fake animation
        startFakeAnimation()
      } else {
        // On desktop try real analyzer
        const success = initAudioAnalyser()
        if (success) {
          startRealVisualization()
        } else {
          // Fallback to fake
          startFakeAnimation()
        }
      }
    })
    
    audio.addEventListener('pause', () => {
      console.log('Audio paused')
      setIsPlaying(false)
      stopRealVisualization()
      stopFakeAnimation()
    })
    
    audio.addEventListener('waiting', () => {
      setBuffering(true)
      setIsLoading(true)
    })
    
    audio.addEventListener('canplay', () => {
      setBuffering(false)
      setIsLoading(false)
    })
    
    audio.addEventListener('error', (e) => {
      console.error('Audio error:', e)
      setIsLoading(false)
      setIsPlaying(false)
      setBuffering(false)
      setError('Ошибка воспроизведения')
      stopRealVisualization()
      stopFakeAnimation()
    })

    return () => {
      audio.pause()
      audio.src = ''
      stopRealVisualization()
      stopFakeAnimation()
    }
  }, [isIOS, startFakeAnimation, stopFakeAnimation, initAudioAnalyser, startRealVisualization, stopRealVisualization])

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
      if (!isIOS) {
        audio.volume = isMuted ? 0 : volume / 100
      }
      
      audio.src = STREAM_URL
      audio.load()
      await audio.play()
    } catch (err: any) {
      console.error('Play error:', err)
      setIsLoading(false)
      
      if (err.name === 'NotAllowedError') {
        setError('Нажмите ещё раз')
      } else if (err.name === 'NotSupportedError') {
        setError('Формат не поддерживается')
      } else {
        setError('Ошибка воспроизведения')
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

  const getBarColor = (index: number, value: number) => {
    const third = BAR_COUNT / 3
    if (index < third) {
      return {
        gradient: `linear-gradient(to top, ${COLORS.bass}, #ff3399)`,
        glow: `0 0 ${8 + value * 12}px rgba(255, 0, 102, ${0.5 + value * 0.5})`,
      }
    } else if (index < third * 2) {
      return {
        gradient: `linear-gradient(to top, ${COLORS.mid}, ${COLORS.accent})`,
        glow: `0 0 ${8 + value * 12}px rgba(0, 199, 48, ${0.5 + value * 0.5})`,
      }
    } else {
      return {
        gradient: `linear-gradient(to top, ${COLORS.high}, #66ffee)`,
        glow: `0 0 ${8 + value * 12}px rgba(0, 255, 204, ${0.5 + value * 0.5})`,
      }
    }
  }

  return (
    <>
      <style jsx global>{`
        .volume-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 8px;
          border-radius: 10px;
          background: linear-gradient(90deg, rgba(255,0,102,0.3) 0%, rgba(0,199,48,0.3) 50%, rgba(0,255,204,0.3) 100%);
          outline: none;
        }
        
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 3px solid #00c730;
          cursor: pointer;
          margin-top: -7px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3), 0 0 10px rgba(0,199,48,0.5);
        }
        
        .volume-slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 3px solid #00c730;
          cursor: pointer;
        }

        .skeuo-card {
          background: linear-gradient(145deg, rgba(46,0,113,0.6), rgba(13,0,38,0.8));
          border: 1px solid rgba(0,199,48,0.2);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
        }
      `}</style>

      <div 
        className="min-h-screen flex flex-col items-center justify-center p-4"
        style={{ background: `linear-gradient(180deg, ${COLORS.primary} 0%, ${COLORS.dark} 100%)` }}
      >
        <div 
          className="fixed inset-0 pointer-events-none"
          style={{ 
            background: `radial-gradient(ellipse 80% 50% at 50% 30%, rgba(0,199,48,0.15) 0%, transparent 50%),
                         radial-gradient(ellipse 60% 40% at 30% 60%, rgba(255,0,102,0.1) 0%, transparent 50%)`
          }}
        />

        <div className="relative z-10 w-full max-w-xs">
          {/* Logo */}
          <div className="relative mb-4">
            <motion.div 
              className="w-28 h-28 mx-auto rounded-full overflow-hidden skeuo-card p-1"
              animate={isPlaying ? { scale: [1, 1.02, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              style={{
                boxShadow: isPlaying 
                  ? `0 0 60px rgba(0,199,48,0.6)`
                  : `0 8px 32px rgba(0,0,0,0.5)`,
              }}
            >
              <div 
                className="w-full h-full rounded-full overflow-hidden"
                style={{ border: `2px solid ${COLORS.secondary}` }}
              >
                <img src={STATION_LOGO} alt={STATION_NAME} className="w-full h-full object-cover" />
              </div>
            </motion.div>
            
            <AnimatePresence>
              {isPlaying && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute top-0 right-6 px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ 
                    background: `linear-gradient(145deg, ${COLORS.secondary}, ${COLORS.accent})`,
                    color: COLORS.dark,
                    boxShadow: `0 0 20px rgba(0,199,48,0.8)`,
                  }}
                >
                  LIVE
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Visualizer */}
          <div className="skeuo-card rounded-2xl p-3 mb-4">
            <div className="flex justify-center items-end gap-1 h-16">
              {audioData.map((value, i) => {
                const colors = getBarColor(i, value)
                const height = Math.max(4, value * 60)
                
                return (
                  <div
                    key={i}
                    className="rounded-full transition-none"
                    style={{
                      width: '6px',
                      background: colors.gradient,
                      height: `${height}px`,
                      boxShadow: value > 0.05 ? colors.glow : 'none',
                    }}
                  />
                )
              })}
            </div>
            
            <div className="flex justify-between mt-2 px-1">
              <span className="text-xs" style={{ color: COLORS.bass }}>BASS</span>
              <span className="text-xs" style={{ color: COLORS.mid }}>MID</span>
              <span className="text-xs" style={{ color: COLORS.high }}>HIGH</span>
            </div>
          </div>

          {/* Info */}
          <div className="skeuo-card rounded-xl p-3 text-center mb-4">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Radio className="w-3 h-3" style={{ color: COLORS.secondary }} />
              <span className="text-xs uppercase tracking-wider" style={{ color: COLORS.secondary }}>
                Онлайн-радио
              </span>
            </div>
            <h1 className="text-lg font-bold text-white">{STATION_NAME}</h1>
            <p style={{ color: COLORS.text }} className="text-sm">{currentTrack}</p>
            <p className="text-sm mt-1" style={{ color: COLORS.accent }}>
              👥 {listeners} {listeners === 1 ? 'слушатель' : 'слушателя'}
            </p>
          </div>

          {/* Buffering */}
          {buffering && (
            <div className="flex items-center justify-center gap-2 mb-3 p-2 rounded-xl skeuo-card">
              <Wifi className="w-4 h-4 animate-pulse" style={{ color: COLORS.secondary }} />
              <span className="text-sm" style={{ color: COLORS.secondary }}>Буферизация...</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center justify-center gap-2 mb-3 p-2 rounded-xl" style={{ background: 'rgba(255,0,102,0.1)' }}>
              <AlertCircle className="w-4 h-4" style={{ color: COLORS.bass }} />
              <span className="text-sm" style={{ color: '#ff6699' }}>{error}</span>
            </div>
          )}

          {/* Play Button */}
          <div className="flex justify-center mb-4">
            <motion.button
              onClick={handlePlay}
              disabled={isLoading}
              whileTap={{ scale: 0.95 }}
              className="rounded-full flex items-center justify-center"
              style={{
                width: '64px',
                height: '64px',
                background: `linear-gradient(145deg, ${COLORS.accent}, ${COLORS.secondary})`,
                boxShadow: `0 4px 20px rgba(0,199,48,0.5)`,
              }}
            >
              {isLoading || buffering ? (
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: COLORS.dark }} />
              ) : isPlaying ? (
                <Pause className="w-6 h-6" style={{ color: COLORS.dark }} />
              ) : (
                <Play className="w-6 h-6 ml-1" style={{ color: COLORS.dark }} />
              )}
            </motion.button>
          </div>

          {/* Volume */}
          {!isIOS ? (
            <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-xl skeuo-card">
              <button onClick={() => setIsMuted(!isMuted)} className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                {isMuted ? (
                  <VolumeX className="w-5 h-5" style={{ color: '#666' }} />
                ) : (
                  <Volume2 className="w-5 h-5" style={{ color: COLORS.secondary }} />
                )}
              </button>
              
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
                className="volume-slider flex-1 cursor-pointer"
              />
              
              <span className="text-sm w-10 text-right" style={{ color: COLORS.secondary }}>
                {displayVolume}%
              </span>
            </div>
          ) : (
            <div className="text-center mb-4 px-4 py-3 rounded-xl skeuo-card">
              <p className="text-sm" style={{ color: COLORS.text }}>
                💡 Громкость — кнопки устройства
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-center gap-3">
            <motion.button
              onClick={share}
              whileTap={{ scale: 0.95 }}
              className="p-3 rounded-xl"
              style={{ background: 'linear-gradient(145deg, rgba(46,0,113,0.6), rgba(13,0,38,0.8))', border: `1px solid ${COLORS.secondary}40` }}
            >
              <Share2 className="w-5 h-5" style={{ color: COLORS.secondary }} />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              className="p-3 rounded-xl"
              style={{ background: 'linear-gradient(145deg, rgba(46,0,113,0.6), rgba(13,0,38,0.8))', border: `1px solid ${COLORS.secondary}40` }}
            >
              <Heart className="w-5 h-5" style={{ color: COLORS.secondary }} />
            </motion.button>
          </div>

          <p className="text-center text-xs mt-4" style={{ color: '#555' }}>
            Powered by <span style={{ color: COLORS.secondary }}>DJ GooD OFF</span>
          </p>
        </div>
      </div>
    </>
  )
}
