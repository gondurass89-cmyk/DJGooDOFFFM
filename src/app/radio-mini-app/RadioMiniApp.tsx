'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Volume2, VolumeX, Loader2, Radio, AlertCircle, Wifi, Sliders, ChevronDown, ChevronUp } from 'lucide-react'

const STREAM_URL = '/api/stream'
const STATION_NAME = 'DJ GooD OFF FM'
const STATION_LOGO = '/logo.png'
const LISTENERS_API = '/api/listener'
const NOW_PLAYING_API = '/api/now-playing'
const ALBUM_ART_API = '/api/album-art'
const ALBUM_ART_DEBOUNCE = 15000 // 15 seconds

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

// Equalizer default values (in dB, -12 to +12)
const EQ_DEFAULTS = { bass: 0, mid: 0, high: 0 }
const EQ_RANGE = { min: -12, max: 12 }

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
  const [currentTrack, setCurrentTrack] = useState('Загрузка...')
  const [telegramListeners, setTelegramListeners] = useState(0)
  const [icecastListeners, setIcecastListeners] = useState(0)
  const [audioData, setAudioData] = useState<number[]>(new Array(BAR_COUNT).fill(0))
  const [isTgReady, setIsTgReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [buffering, setBuffering] = useState(false)
  const [useCSSAnimation, setUseCSSAnimation] = useState(false)
  const [showEqualizer, setShowEqualizer] = useState(false)
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null)
  const [lastAlbumArtFetch, setLastAlbumArtFetch] = useState(0)
  
  // Equalizer state (in dB)
  const [eqValues, setEqValues] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('djgoodoff-eq')
      if (saved) {
        try { return JSON.parse(saved) }
        catch { return EQ_DEFAULTS }
      }
    }
    return EQ_DEFAULTS
  })
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const animationRef = useRef<number | null>(null)
  
  // Equalizer filters
  const bassFilterRef = useRef<BiquadFilterNode | null>(null)
  const midFilterRef = useRef<BiquadFilterNode | null>(null)
  const highFilterRef = useRef<BiquadFilterNode | null>(null)

  // Detect if we need CSS animation (iOS in Telegram)
  useEffect(() => {
    const checkPlatform = () => {
      // Check Telegram platform
      const tgPlatform = window.Telegram?.WebApp?.platform
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      
      // Use CSS animation on iOS or if Telegram reports iOS
      const needsCSS = isIOS || tgPlatform === 'ios'
      setUseCSSAnimation(needsCSS)
      console.log('Platform:', tgPlatform, 'iOS detected:', isIOS, 'Use CSS:', needsCSS)
    }
    
    // Check immediately and after Telegram loads
    checkPlatform()
    setTimeout(checkPlatform, 500)
  }, [])

  // Fetch listeners
  const fetchListenersCount = useCallback(async () => {
    try {
      const res = await fetch(LISTENERS_API)
      if (res.ok) {
        const data = await res.json()
        setTelegramListeners(data.telegram || 0)
        setIcecastListeners(data.icecast || 0)
      }
    } catch (e) {}
  }, [])

  // Fetch current track
  const fetchCurrentTrack = useCallback(async () => {
    try {
      const res = await fetch(NOW_PLAYING_API, { 
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })
      if (res.ok) {
        const data = await res.json()
        console.log('Now playing:', data.title)
        if (data.title && data.title !== currentTrack) {
          setCurrentTrack(data.title)
          // Reset album art when track changes
          setAlbumArtUrl(null)
        }
      }
    } catch (e) {
      console.error('Error fetching track:', e)
    }
  }, [currentTrack])

  // Fetch album art with 15 second debounce
  const fetchAlbumArt = useCallback(async (trackTitle: string) => {
    if (!trackTitle || trackTitle === 'Загрузка...') return
    
    const now = Date.now()
    if (now - lastAlbumArtFetch < ALBUM_ART_DEBOUNCE) {
      console.log('Album art fetch debounced, skipping')
      return
    }
    
    setLastAlbumArtFetch(now)
    
    try {
      const res = await fetch(`${ALBUM_ART_API}?title=${encodeURIComponent(trackTitle)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.albumArtLarge) {
          console.log('Album art found:', data.albumArtLarge)
          setAlbumArtUrl(data.albumArtLarge)
        } else {
          console.log('No album art found, using default')
          setAlbumArtUrl(null)
        }
      }
    } catch (e) {
      console.error('Error fetching album art:', e)
    }
  }, [lastAlbumArtFetch])

  // Register listener
  const registerListener = useCallback(async (action: 'open' | 'close') => {
    const tg = window.Telegram?.WebApp
    const user = tg?.initDataUnsafe?.user
    console.log('registerListener called:', action, 'user:', user)
    if (!user) {
      console.log('No user data, skipping registration')
      return
    }

    try {
      const response = await fetch(LISTENERS_API, {
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
      const result = await response.json()
      console.log('Listener registered:', action, result)
      fetchListenersCount()
    } catch (e) {
      console.error('registerListener error:', e)
    }
  }, [fetchListenersCount])

  // Handle close
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
      
      navigator.sendBeacon(LISTENERS_API, new Blob([data], { type: 'application/json' }))
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

  // Init Telegram
  useEffect(() => {
    const init = () => {
      const tg = window.Telegram?.WebApp
      if (tg) {
        tg.ready()
        tg.expand()
        setIsTgReady(true)
        return true
      }
      return false
    }

    if (init()) {
      fetchListenersCount()
      return
    }

    let attempts = 0
    const interval = setInterval(() => {
      attempts++
      if (init() || attempts >= 20) {
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

  // Fetch track periodically
  useEffect(() => {
    fetchCurrentTrack() // Initial fetch
    const interval = setInterval(fetchCurrentTrack, 5000) // Every 5 seconds
    return () => clearInterval(interval)
  }, [fetchCurrentTrack])

  // Fetch album art when track changes
  useEffect(() => {
    if (currentTrack && currentTrack !== 'Загрузка...') {
      fetchAlbumArt(currentTrack)
    }
  }, [currentTrack, fetchAlbumArt])

  // Real audio visualization with equalizer (for desktop/Android)
  const startRealVisualization = useCallback(() => {
    if (!audioRef.current) return false
    
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx()
      }
      
      const ctx = audioContextRef.current
      
      if (ctx.state === 'suspended') {
        ctx.resume()
      }
      
      // Create analyser
      if (!analyserRef.current) {
        analyserRef.current = ctx.createAnalyser()
        analyserRef.current.fftSize = 256
        analyserRef.current.smoothingTimeConstant = 0.75
      }
      
      // Create equalizer filters
      if (!bassFilterRef.current) {
        bassFilterRef.current = ctx.createBiquadFilter()
        bassFilterRef.current.type = 'lowshelf'
        bassFilterRef.current.frequency.value = 200
        bassFilterRef.current.gain.value = eqValues.bass
      }
      
      if (!midFilterRef.current) {
        midFilterRef.current = ctx.createBiquadFilter()
        midFilterRef.current.type = 'peaking'
        midFilterRef.current.frequency.value = 1000
        midFilterRef.current.Q.value = 1
        midFilterRef.current.gain.value = eqValues.mid
      }
      
      if (!highFilterRef.current) {
        highFilterRef.current = ctx.createBiquadFilter()
        highFilterRef.current.type = 'highshelf'
        highFilterRef.current.frequency.value = 4000
        highFilterRef.current.gain.value = eqValues.high
      }
      
      // Connect: source -> bass -> mid -> high -> analyser -> destination
      if (!sourceRef.current && audioRef.current) {
        sourceRef.current = ctx.createMediaElementSource(audioRef.current)
        sourceRef.current.connect(bassFilterRef.current)
        bassFilterRef.current.connect(midFilterRef.current)
        midFilterRef.current.connect(highFilterRef.current)
        highFilterRef.current.connect(analyserRef.current)
        analyserRef.current.connect(ctx.destination)
      }
      
      const analyser = analyserRef.current
      const bufferLength = analyser.frequencyBinCount // 128 bins with fftSize=256
      const dataArray = new Uint8Array(bufferLength)
      
      const update = () => {
        analyser.getByteFrequencyData(dataArray)
        const mapped = []
        
        for (let i = 0; i < BAR_COUNT; i++) {
          // Better frequency distribution:
          // BASS (bars 0-7): use bins 0-15 (concentrated low frequencies)
          // MID (bars 8-15): use bins 16-63 (spread mid frequencies)  
          // HIGH (bars 16-23): use bins 64-100 (concentrated high frequencies)
          let idx
          if (i < 8) {
            // BASS - bins 0-15 (16 bins for 8 bars)
            idx = Math.floor(i * 2)
          } else if (i < 16) {
            // MID - bins 16-63 (48 bins for 8 bars)
            idx = 16 + Math.floor((i - 8) * 6)
          } else {
            // HIGH - bins 64-100 (36 bins for 8 bars)
            idx = 64 + Math.floor((i - 16) * 4.5)
          }
          
          // Clamp index
          idx = Math.min(idx, bufferLength - 1)
          mapped.push(dataArray[idx] / 255)
        }
        
        setAudioData(mapped)
        animationRef.current = requestAnimationFrame(update)
      }
      
      update()
      return true
    } catch (e) {
      console.error('Real visualization error:', e)
      return false
    }
  }, [])

  const stopVisualization = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    setAudioData(new Array(BAR_COUNT).fill(0))
  }, [])

  // Audio setup
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'none'
    audio.crossOrigin = 'anonymous'
    audioRef.current = audio

    audio.addEventListener('playing', () => {
      setIsPlaying(true)
      setIsLoading(false)
      setBuffering(false)
      setError(null)
      
      // Only try real visualization if NOT using CSS animation
      if (!useCSSAnimation) {
        const success = startRealVisualization()
        if (!success) {
          console.log('Falling back to CSS animation')
          setUseCSSAnimation(true)
        }
      }
    })
    
    audio.addEventListener('pause', () => {
      setIsPlaying(false)
      stopVisualization()
    })
    
    audio.addEventListener('waiting', () => {
      setBuffering(true)
      setIsLoading(true)
    })
    
    audio.addEventListener('canplay', () => {
      setBuffering(false)
      setIsLoading(false)
    })
    
    audio.addEventListener('error', () => {
      setIsLoading(false)
      setIsPlaying(false)
      setBuffering(false)
      setError('Ошибка воспроизведения')
      stopVisualization()
    })

    return () => {
      audio.pause()
      audio.src = ''
      stopVisualization()
    }
  }, [useCSSAnimation, startRealVisualization, stopVisualization])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100
    }
  }, [volume, isMuted])

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
      audio.volume = isMuted ? 0 : volume / 100
      audio.src = STREAM_URL
      audio.load()
      await audio.play()
    } catch (err: any) {
      setIsLoading(false)
      setError(err.name === 'NotAllowedError' ? 'Нажмите ещё раз' : 'Ошибка воспроизведения')
    }
  }

  const displayVolume = isMuted ? 0 : volume

  // Update equalizer filter values
  const updateEqualizer = useCallback((band: 'bass' | 'mid' | 'high', value: number) => {
    const newValues = { ...eqValues, [band]: value }
    setEqValues(newValues)
    localStorage.setItem('djgoodoff-eq', JSON.stringify(newValues))
    
    // Apply to filters if they exist
    if (bassFilterRef.current && band === 'bass') {
      bassFilterRef.current.gain.value = value
    }
    if (midFilterRef.current && band === 'mid') {
      midFilterRef.current.gain.value = value
    }
    if (highFilterRef.current && band === 'high') {
      highFilterRef.current.gain.value = value
    }
  }, [eqValues])

  const resetEqualizer = useCallback(() => {
    setEqValues(EQ_DEFAULTS)
    localStorage.setItem('djgoodoff-eq', JSON.stringify(EQ_DEFAULTS))
    if (bassFilterRef.current) bassFilterRef.current.gain.value = 0
    if (midFilterRef.current) midFilterRef.current.gain.value = 0
    if (highFilterRef.current) highFilterRef.current.gain.value = 0
  }, [])

  const getBarColor = (index: number) => {
    const third = BAR_COUNT / 3
    if (index < third) return { gradient: `linear-gradient(to top, ${COLORS.bass}, #ff3399)`, color: COLORS.bass }
    if (index < third * 2) return { gradient: `linear-gradient(to top, ${COLORS.mid}, ${COLORS.accent})`, color: COLORS.mid }
    return { gradient: `linear-gradient(to top, ${COLORS.high}, #66ffee)`, color: COLORS.high }
  }

  return (
    <>
      <style jsx global>{`
        .volume-slider {
          -webkit-appearance: none;
          height: 8px;
          border-radius: 10px;
          background: linear-gradient(90deg, rgba(255,0,102,0.3) 0%, rgba(0,199,48,0.3) 50%, rgba(0,255,204,0.3) 100%);
        }
        
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 3px solid #00c730;
          cursor: pointer;
        }
        
        .volume-slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 3px solid #00c730;
        }

        /* Equalizer horizontal sliders - compact */
        .eq-slider-h {
          -webkit-appearance: none;
          height: 6px;
          border-radius: 5px;
          background: rgba(255,255,255,0.15);
        }

        .eq-slider-h::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          cursor: pointer;
        }

        .eq-slider-h::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          cursor: pointer;
        }

        .eq-slider-h.bass::-webkit-slider-thumb { border: 2px solid #ff0066; }
        .eq-slider-h.mid::-webkit-slider-thumb { border: 2px solid #00c730; }
        .eq-slider-h.high::-webkit-slider-thumb { border: 2px solid #00ffcc; }
        .eq-slider-h.bass::-moz-range-thumb { border: 2px solid #ff0066; }
        .eq-slider-h.mid::-moz-range-thumb { border: 2px solid #00c730; }
        .eq-slider-h.high::-moz-range-thumb { border: 2px solid #00ffcc; }

        .skeuo-card {
          background: linear-gradient(145deg, rgba(46,0,113,0.6), rgba(13,0,38,0.8));
          border: 1px solid rgba(0,199,48,0.2);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
        }

        /* CSS Animation for iOS fallback - max 48px to fit container */
        @keyframes barAnim1 { 0%, 100% { height: 6px; } 50% { height: 44px; } }
        @keyframes barAnim2 { 0%, 100% { height: 10px; } 50% { height: 36px; } }
        @keyframes barAnim3 { 0%, 100% { height: 4px; } 50% { height: 32px; } }
        @keyframes barAnim4 { 0%, 100% { height: 8px; } 50% { height: 48px; } }
        @keyframes barAnim5 { 0%, 100% { height: 12px; } 50% { height: 40px; } }

        .bar-anim-1 { animation: barAnim1 0.5s ease-in-out infinite; }
        .bar-anim-2 { animation: barAnim2 0.7s ease-in-out infinite; }
        .bar-anim-3 { animation: barAnim3 0.4s ease-in-out infinite; }
        .bar-anim-4 { animation: barAnim4 0.6s ease-in-out infinite; }
        .bar-anim-5 { animation: barAnim5 0.55s ease-in-out infinite; }
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
          {/* Album Art / Logo - with fade animation and pulse when playing */}
          <div 
            className="relative z-0 overflow-hidden transition-all duration-300 ease-out"
            style={{
              height: showEqualizer ? 0 : 150,
              opacity: showEqualizer ? 0 : 1,
              marginBottom: showEqualizer ? 0 : 12,
            }}
          >
            {/* Pulse animation wrapper when playing */}
            <motion.div
              animate={isPlaying ? { scale: [1, 1.03, 1] } : { scale: 1 }}
              transition={isPlaying ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
              className="flex justify-center"
            >
              <AnimatePresence mode="wait">
                <motion.img
                  key={albumArtUrl || 'default'}
                  src={albumArtUrl || STATION_LOGO}
                  alt={STATION_NAME}
                  className="rounded-lg object-cover"
                  style={{
                    width: '150px',
                    height: '150px',
                    filter: isPlaying ? 'drop-shadow(0 0 30px rgba(0,199,48,0.6))' : 'drop-shadow(0 0 15px rgba(0,199,48,0.3))',
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                />
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Visualizer */}
          <div className="relative z-10 mb-3">
            {/* LIVE badge */}
            <AnimatePresence>
              {isPlaying && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -top-2 right-2 px-2 py-0.5 rounded-full text-xs font-bold z-20"
                  style={{
                    background: `linear-gradient(145deg, ${COLORS.secondary}, ${COLORS.accent})`,
                    color: '#0d0026',
                    boxShadow: `0 0 15px rgba(0,199,48,0.8)`,
                  }}
                >
                  LIVE
                </motion.div>
              )}
            </AnimatePresence>

            {/* Equalizer container with overflow hidden */}
            <div className="skeuo-card rounded-xl p-2 overflow-hidden">
              <div className="flex justify-center items-end gap-1 h-12 relative">
                {useCSSAnimation && isPlaying ? (
                  // CSS animated bars (iOS) - with overflow-hidden on container
                  Array.from({ length: BAR_COUNT }).map((_, i) => {
                    const colors = getBarColor(i)
                    const animClass = `bar-anim-${(i % 5) + 1}`
                    const delay = `${i * 0.05}s`

                    return (
                      <div
                        key={i}
                        className={`rounded-full ${animClass}`}
                        style={{
                          width: '6px',
                          background: colors.gradient,
                          animationDelay: delay,
                          boxShadow: `0 0 8px ${colors.color}`,
                          maxHeight: '48px',
                        }}
                      />
                    )
                  })
                ) : (
                  // Real audio data (desktop/Android)
                  audioData.map((value, i) => {
                    const colors = getBarColor(i)
                    const height = Math.min(48, Math.max(4, value * 48))

                    return (
                      <div
                        key={i}
                        className="rounded-full"
                        style={{
                          width: '6px',
                          background: colors.gradient,
                          height: `${height}px`,
                          boxShadow: value > 0.05 ? `0 0 8px ${colors.color}` : 'none',
                        }}
                      />
                    )
                  })
                )}
              </div>
            </div>

            {/* Labels under the container */}
            <div className="flex justify-between mt-1.5 px-2">
              <span className="text-xs font-medium" style={{ color: COLORS.bass }}>BASS</span>
              <span className="text-xs font-medium" style={{ color: COLORS.mid }}>MID</span>
              <span className="text-xs font-medium" style={{ color: COLORS.high }}>HIGH</span>
            </div>
          </div>

          {/* Info */}
          <div className="skeuo-card rounded-xl p-2 text-center mb-3">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Radio className="w-3 h-3" style={{ color: COLORS.secondary }} />
              <span className="text-xs uppercase tracking-wider" style={{ color: COLORS.secondary }}>
                Онлайн-радио
              </span>
            </div>
            <h1 className="text-base font-bold text-white">{STATION_NAME}</h1>
            <p className="text-xs" style={{ color: COLORS.text }}>
              <span style={{ color: COLORS.secondary }}>Сейчас в эфире:</span>{' '}
              <span style={{ color: '#fff' }}>{currentTrack}</span>
            </p>
            <p className="text-xs mt-0.5" style={{ color: COLORS.accent }}>
              💬 Telegram: {telegramListeners} {telegramListeners === 1 ? 'слушатель' : telegramListeners < 5 ? 'слушателя' : 'слушателей'}
              {icecastListeners > 0 && (
                <>
                  <span className="mx-1.5" style={{ color: COLORS.text }}>|</span>
                  📻 Стрим: {icecastListeners} {icecastListeners === 1 ? 'подключение' : icecastListeners < 5 ? 'подключения' : 'подключений'}
                </>
              )}
            </p>
          </div>

          {/* Buffering */}
          {buffering && (
              <div className="flex items-center justify-center gap-2 mb-2 p-1.5 rounded-xl skeuo-card">
                <Wifi className="w-3 h-3 animate-pulse" style={{ color: COLORS.secondary }} />
                <span className="text-xs" style={{ color: COLORS.secondary }}>Буферизация...</span>
              </div>
            )}

          {/* Error */}
          {error && (
              <div className="flex items-center justify-center gap-2 mb-2 p-1.5 rounded-xl" style={{ background: 'rgba(255,0,102,0.1)' }}>
                <AlertCircle className="w-3 h-3" style={{ color: COLORS.bass }} />
                <span className="text-xs" style={{ color: '#ff6699' }}>{error}</span>
              </div>
            )}

          {/* Play Button */}
          <div className="flex justify-center mb-3">
            <motion.button
              onClick={handlePlay}
              disabled={isLoading}
              whileTap={{ scale: 0.95 }}
              className="rounded-full flex items-center justify-center"
              style={{
                width: '56px',
                height: '56px',
                background: `linear-gradient(145deg, ${COLORS.accent}, ${COLORS.secondary})`,
                boxShadow: `0 4px 15px rgba(0,199,48,0.5)`,
              }}
            >
              {isLoading || buffering ? (
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: COLORS.dark }} />
              ) : isPlaying ? (
                <Pause className="w-5 h-5" style={{ color: COLORS.dark }} />
              ) : (
                <Play className="w-5 h-5 ml-0.5" style={{ color: COLORS.dark }} />
              )}
            </motion.button>
          </div>

          {/* Volume - hide on iOS */}
          {!useCSSAnimation && (
            <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded-xl skeuo-card">
              <button 
                onClick={() => setIsMuted(!isMuted)} 
                className="p-1.5 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4" style={{ color: '#666' }} />
                ) : (
                  <Volume2 className="w-4 h-4" style={{ color: COLORS.secondary }} />
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
              
              <span className="text-xs w-8 text-right" style={{ color: COLORS.secondary }}>
                {displayVolume}%
              </span>
            </div>
          )}

          {/* iOS volume hint */}
          {useCSSAnimation && (
            <div className="text-center mb-3 px-3 py-2 rounded-xl skeuo-card">
              <p className="text-xs" style={{ color: COLORS.text }}>
                💡 Громкость — кнопки устройства
              </p>
            </div>
          )}

          {/* Equalizer toggle button - hide on iOS */}
          {!useCSSAnimation && (
            <div className="mb-2">
              <button
                onClick={() => setShowEqualizer(!showEqualizer)}
                className="w-full skeuo-card rounded-xl p-2 flex items-center justify-center gap-2"
              >
                <Sliders className="w-4 h-4" style={{ color: COLORS.secondary }} />
                <span className="text-xs font-medium" style={{ color: COLORS.secondary }}>
                  Управляй звуком
                </span>
                {showEqualizer ? (
                  <ChevronUp className="w-4 h-4" style={{ color: COLORS.secondary }} />
                ) : (
                  <ChevronDown className="w-4 h-4" style={{ color: COLORS.secondary }} />
                )}
              </button>
              
              {/* Collapsible equalizer panel */}
              <AnimatePresence>
                {showEqualizer && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="skeuo-card rounded-xl p-2 mt-2">
                      <div className="flex gap-2">
                        {/* BASS */}
                        <div className="flex-1 flex items-center gap-1">
                          <span className="text-xs font-bold w-8" style={{ color: COLORS.bass }}>BASS</span>
                          <input
                            type="range"
                            min={EQ_RANGE.min}
                            max={EQ_RANGE.max}
                            value={eqValues.bass}
                            onChange={(e) => updateEqualizer('bass', parseInt(e.target.value))}
                            className="eq-slider-h flex-1 cursor-pointer bass"
                          />
                          <span className="text-xs w-6 text-right" style={{ color: COLORS.bass }}>
                            {eqValues.bass > 0 ? '+' : ''}{eqValues.bass}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 mt-1">
                        {/* MID */}
                        <div className="flex-1 flex items-center gap-1">
                          <span className="text-xs font-bold w-8" style={{ color: COLORS.mid }}>MID</span>
                          <input
                            type="range"
                            min={EQ_RANGE.min}
                            max={EQ_RANGE.max}
                            value={eqValues.mid}
                            onChange={(e) => updateEqualizer('mid', parseInt(e.target.value))}
                            className="eq-slider-h flex-1 cursor-pointer mid"
                          />
                          <span className="text-xs w-6 text-right" style={{ color: COLORS.mid }}>
                            {eqValues.mid > 0 ? '+' : ''}{eqValues.mid}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 mt-1">
                        {/* HIGH */}
                        <div className="flex-1 flex items-center gap-1">
                          <span className="text-xs font-bold w-8" style={{ color: COLORS.high }}>HIGH</span>
                          <input
                            type="range"
                            min={EQ_RANGE.min}
                            max={EQ_RANGE.max}
                            value={eqValues.high}
                            onChange={(e) => updateEqualizer('high', parseInt(e.target.value))}
                            className="eq-slider-h flex-1 cursor-pointer high"
                          />
                          <span className="text-xs w-6 text-right" style={{ color: COLORS.high }}>
                            {eqValues.high > 0 ? '+' : ''}{eqValues.high}
                          </span>
                        </div>
                      </div>
                      
                      {/* Reset button */}
                      <div className="flex justify-center mt-2">
                        <button
                          onClick={resetEqualizer}
                          className="px-2 py-0.5 rounded text-xs"
                          style={{ 
                            background: 'rgba(255,255,255,0.05)',
                            color: COLORS.text,
                          }}
                        >
                          Сбросить
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Footer */}
          <p 
            className="text-center text-xs mt-2" 
            style={{ color: '#555' }}
          >
            Powered by <span style={{ color: COLORS.secondary }}>DJ GooD OFF</span>
          </p>
        </div>
      </div>
    </>
  )
}
