'use client'

// =====================================================
// ИМПОРТЫ
// =====================================================
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Volume2, VolumeX, Loader2, Radio, AlertCircle, Wifi } from 'lucide-react'

// =====================================================
// КОНСТАНТЫ
// =====================================================
const STREAM_URL = 'https://radio-stream.gondurass89.workers.dev'
const STATION_NAME = 'DJ GooD OFF FM'
const STATION_LOGO = '/logo.png'
const LISTENERS_API = 'https://listeners.gondurass89.workers.dev'
const NOW_PLAYING_API = '/api/now-playing'

const COLORS = {
  primary: '#2e0071',
  secondary: '#00c730',
  accent: '#00ff40',
  text: '#c4c4c4',
  dark: '#0d0026',
  bass: '#ff0066',
  mid: '#00c730',
  high: '#00ffcc',
}

const ADMIN_USER_ID = 55068554

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand: () => void
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
  const [listeners, setListeners] = useState(0)
  const [isTgReady, setIsTgReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [buffering, setBuffering] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const isSourceConnectedRef = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const smoothedValuesRef = useRef({ bass: 0, mid: 0, high: 0 })
  const SMOOTHING_FACTOR = 0.3

  const getAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) { console.error('[AUDIO] AudioContext не поддерживается'); return null }
    const ctx = new AudioContextClass()
    audioContextRef.current = ctx
    console.log('[AUDIO] AudioContext создан, состояние:', ctx.state)
    return ctx
  }, [])

  const getFrequencyEnergy = useCallback((dataArray: Uint8Array, sampleRate: number, fftSize: number, lowFreq: number, highFreq: number): number => {
    const binCount = fftSize / 2
    const frequencyPerBin = sampleRate / fftSize
    const lowBin = Math.floor(lowFreq / frequencyPerBin)
    const highBin = Math.min(Math.floor(highFreq / frequencyPerBin), binCount - 1)
    let sum = 0, count = 0
    for (let i = lowBin; i <= highBin; i++) { sum += dataArray[i]; count++ }
    return count > 0 ? (sum / count) / 255 : 0
  }, [])

  const smoothValue = useCallback((current: number, previous: number): number => {
    return previous + (current - previous) * SMOOTHING_FACTOR
  }, [])

  const visualize = useCallback(() => {
    const analyser = analyserRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!analyser || !canvas || !ctx) { animationFrameRef.current = requestAnimationFrame(visualize); return }
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyser.getByteFrequencyData(dataArray)
    const sampleRate = analyser.context.sampleRate
    const fftSize = analyser.fftSize
    const bassEnergy = getFrequencyEnergy(dataArray, sampleRate, fftSize, 20, 250)
    const midEnergy = getFrequencyEnergy(dataArray, sampleRate, fftSize, 250, 4000)
    const highEnergy = getFrequencyEnergy(dataArray, sampleRate, fftSize, 4000, 16000)
    smoothedValuesRef.current.bass = smoothValue(bassEnergy, smoothedValuesRef.current.bass)
    smoothedValuesRef.current.mid = smoothValue(midEnergy, smoothedValuesRef.current.mid)
    smoothedValuesRef.current.high = smoothValue(highEnergy, smoothedValuesRef.current.high)
    const width = canvas.width, height = canvas.height
    ctx.clearRect(0, 0, width, height)
    const barWidth = width / 3 - 8, gap = 12
    const bassHeight = smoothedValuesRef.current.bass * (height - 10) + 4
    const bassGradient = ctx.createLinearGradient(0, height, 0, height - bassHeight)
    bassGradient.addColorStop(0, COLORS.bass); bassGradient.addColorStop(1, '#ff3399')
    ctx.fillStyle = bassGradient
    ctx.beginPath(); ctx.roundRect(gap, height - bassHeight, barWidth, bassHeight, 4); ctx.fill()
    const midHeight = smoothedValuesRef.current.mid * (height - 10) + 4
    const midGradient = ctx.createLinearGradient(0, height, 0, height - midHeight)
    midGradient.addColorStop(0, COLORS.mid); midGradient.addColorStop(1, COLORS.accent)
    ctx.fillStyle = midGradient
    ctx.beginPath(); ctx.roundRect(barWidth + gap * 2, height - midHeight, barWidth, midHeight, 4); ctx.fill()
    const highHeight = smoothedValuesRef.current.high * (height - 10) + 4
    const highGradient = ctx.createLinearGradient(0, height, 0, height - highHeight)
    highGradient.addColorStop(0, COLORS.high); highGradient.addColorStop(1, '#66ffee')
    ctx.fillStyle = highGradient
    ctx.beginPath(); ctx.roundRect(barWidth * 2 + gap * 3, height - highHeight, barWidth, highHeight, 4); ctx.fill()
    animationFrameRef.current = requestAnimationFrame(visualize)
  }, [getFrequencyEnergy, smoothValue])

  const startVisualization = useCallback(() => {
    if (animationFrameRef.current) return
    console.log('[VIS] Запуск визуализатора')
    visualize()
  }, [visualize])

  const stopVisualization = useCallback(() => {
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; console.log('[VIS] Визуализатор остановлен') }
    smoothedValuesRef.current = { bass: 0, mid: 0, high: 0 }
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const connectAudioToAnalyser = useCallback(() => {
    if (isSourceConnectedRef.current) { console.log('[AUDIO] Source уже подключен'); return true }
    const audio = audioRef.current; if (!audio) return false
    const ctx = getAudioContext(); if (!ctx) return false
    try {
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser
      const source = ctx.createMediaElementSource(audio)
      sourceNodeRef.current = source
      source.connect(analyser)
      analyser.connect(ctx.destination)
      isSourceConnectedRef.current = true
      console.log('[AUDIO] Аудио подключено к анализатору')
      return true
    } catch (e) { console.error('[AUDIO] Ошибка подключения анализатора:', e); return false }
  }, [getAudioContext])

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'none'
    audio.crossOrigin = 'anonymous'
    audioRef.current = audio
    console.log('[AUDIO] Аудио элемент создан')
    const onPlaying = () => { console.log('[AUDIO] playing'); setIsPlaying(true); setIsLoading(false); setBuffering(false); setError(null); if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null } }
    const onPause = () => { console.log('[AUDIO] pause'); setIsPlaying(false); stopVisualization() }
    const onWaiting = () => { console.log('[AUDIO] waiting'); setBuffering(true); setIsLoading(true) }
    const onCanPlay = () => { console.log('[AUDIO] canplay'); setBuffering(false); setIsLoading(false) }
    const onStalled = () => { console.log('[AUDIO] stalled'); setBuffering(true) }
    const onError = () => {
      console.log('[AUDIO] error, код:', audio.error?.code)
      setIsLoading(false); setIsPlaying(false); setBuffering(false)
      const error = audio.error; let errorMsg = 'Ошибка воспроизведения'
      if (error) { switch (error.code) { case 1: errorMsg = 'Воспроизведение отменено'; break; case 2: errorMsg = 'Ошибка сети'; break; case 3: errorMsg = 'Ошибка декодирования'; break; case 4: errorMsg = 'Не поддерживается'; break } }
      setError(errorMsg); stopVisualization()
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    }
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('stalled', onStalled)
    audio.addEventListener('error', onError)
    const onVisibilityChange = async () => {
      const ctx = audioContextRef.current
      if (document.visibilityState === 'visible' && ctx && ctx.state === 'suspended') {
        try { await ctx.resume(); console.log('[AUDIO] AudioContext возобновлен') } catch (e) { console.error('[AUDIO] Ошибка resume:', e) }
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      audio.removeEventListener('playing', onPlaying); audio.removeEventListener('pause', onPause)
      audio.removeEventListener('waiting', onWaiting); audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('stalled', onStalled); audio.removeEventListener('error', onError)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      audio.pause(); audio.src = ''; stopVisualization()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      console.log('[AUDIO] Компонент размонтирован')
    }
  }, [stopVisualization])

  useEffect(() => { if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume / 100 }, [volume, isMuted])

  useEffect(() => {
    const initTelegram = () => {
      const tg = window.Telegram?.WebApp
      if (tg) { tg.ready(); tg.expand(); setIsTgReady(true); console.log('[TG] Telegram WebApp инициализирован'); return true }
      return false
    }
    if (initTelegram()) return
    let attempts = 0
    const interval = setInterval(() => { attempts++; if (initTelegram() || attempts >= 20) clearInterval(interval) }, 100)
    return () => clearInterval(interval)
  }, [])

  const registerListener = useCallback(async (action: 'open' | 'close') => {
    const tg = window.Telegram?.WebApp; const user = tg?.initDataUnsafe?.user
    if (!user) return
    try {
      await fetch(LISTENERS_API, { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, first_name: user.first_name, last_name: user.last_name, username: user.username, action, isAdmin: user.id === ADMIN_USER_ID }) })
      console.log('[LISTENER] Зарегистрирован:', action)
    } catch (e) { console.error('[LISTENER] Ошибка:', e) }
  }, [])

  useEffect(() => { if (isTgReady) registerListener('open') }, [isTgReady, registerListener])

  const fetchListenersCount = useCallback(async () => {
    try { const res = await fetch(LISTENERS_API, { mode: 'cors' }); if (res.ok) { const data = await res.json(); setListeners(data.total || 0) } } catch (e) {}
  }, [])
  useEffect(() => { fetchListenersCount(); const interval = setInterval(fetchListenersCount, 10000); return () => clearInterval(interval) }, [fetchListenersCount])

  const fetchCurrentTrack = useCallback(async () => {
    try { const res = await fetch(NOW_PLAYING_API, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }); if (res.ok) { const data = await res.json(); if (data.title && data.title !== currentTrack) setCurrentTrack(data.title) } } catch (e) {}
  }, [currentTrack])
  useEffect(() => { fetchCurrentTrack(); const interval = setInterval(fetchCurrentTrack, 5000); return () => clearInterval(interval) }, [fetchCurrentTrack])

  useEffect(() => {
    const sendClose = () => {
      const tg = window.Telegram?.WebApp; const user = tg?.initDataUnsafe?.user; if (!user) return
      const data = JSON.stringify({ user_id: user.id, first_name: user.first_name, last_name: user.last_name, username: user.username, action: 'close', isAdmin: user.id === ADMIN_USER_ID })
      navigator.sendBeacon(LISTENERS_API, new Blob([data], { type: 'application/json' }))
    }
    window.addEventListener('beforeunload', sendClose); window.addEventListener('pagehide', sendClose)
    return () => { window.removeEventListener('beforeunload', sendClose); window.removeEventListener('pagehide', sendClose) }
  }, [])

  const handlePlay = async () => {
    const audio = audioRef.current; if (!audio) return
    setError(null)
    if (isPlaying) { audio.pause(); return }
    setIsLoading(true); console.log('[PLAY] Начало воспроизведения')
    timeoutRef.current = setTimeout(() => { if (isLoading && !isPlaying) { console.log('[PLAY] Таймаут'); setError('Таймаут подключения'); setIsLoading(false); setBuffering(false); audio.pause() } }, 25000)
    try {
      audio.volume = isMuted ? 0 : volume / 100
      if (!audio.src || audio.src !== STREAM_URL) { audio.src = STREAM_URL; audio.load(); console.log('[PLAY] Источник:', STREAM_URL) }
      const ctx = getAudioContext()
      if (ctx) { if (ctx.state === 'suspended') { await ctx.resume(); console.log('[PLAY] AudioContext resume:', ctx.state) }; connectAudioToAnalyser() }
      await audio.play(); console.log('[PLAY] Воспроизведение запущено'); startVisualization()
    } catch (err: any) {
      console.error('[PLAY] Ошибка:', err.name, err.message)
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      setIsLoading(false)
      setError(err.name === 'NotAllowedError' ? 'Нажмите ещё раз' : 'Ошибка воспроизведения')
    }
  }

  return (
    <>
      <style jsx global>{`
        .volume-slider { -webkit-appearance: none; height: 8px; border-radius: 10px; background: linear-gradient(90deg, rgba(255,0,102,0.3) 0%, rgba(0,199,48,0.3) 50%, rgba(0,255,204,0.3) 100%); }
        .volume-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(145deg, #ffffff, #e6e6e6); border: 3px solid #00c730; cursor: pointer; }
        .volume-slider::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(145deg, #ffffff, #e6e6e6); border: 3px solid #00c730; }
        .skeuo-card { background: linear-gradient(145deg, rgba(46,0,113,0.6), rgba(13,0,38,0.8)); border: 1px solid rgba(0,199,48,0.2); box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05); }
      `}</style>
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: `linear-gradient(180deg, ${COLORS.primary} 0%, ${COLORS.dark} 100%)` }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 80% 50% at 50% 30%, rgba(0,199,48,0.15) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 30% 60%, rgba(255,0,102,0.1) 0%, transparent 50%)` }} />
        <div className="relative z-10 w-full max-w-xs">
          <motion.img src={STATION_LOGO} alt={STATION_NAME} className="mx-auto mb-3" style={{ width: '150px', height: '150px', filter: isPlaying ? 'drop-shadow(0 0 30px rgba(0,199,48,0.6))' : 'drop-shadow(0 0 15px rgba(0,199,48,0.3))' }} animate={isPlaying ? { scale: [1, 1.03, 1] } : {}} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} />
          <div className="skeuo-card rounded-xl p-2 mb-3">
            <AnimatePresence>{isPlaying && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -top-2 right-2 px-2 py-0.5 rounded-full text-xs font-bold z-20" style={{ background: `linear-gradient(145deg, ${COLORS.secondary}, ${COLORS.accent})`, color: '#0d0026', boxShadow: '0 0 15px rgba(0,199,48,0.8)' }}>LIVE</motion.div>}</AnimatePresence>
            <canvas ref={canvasRef} width={280} height={48} className="w-full rounded" style={{ background: 'transparent' }} />
            <div className="flex justify-between mt-1.5 px-2"><span className="text-xs font-medium" style={{ color: COLORS.bass }}>BASS</span><span className="text-xs font-medium" style={{ color: COLORS.mid }}>MID</span><span className="text-xs font-medium" style={{ color: COLORS.high }}>HIGH</span></div>
          </div>
          <div className="skeuo-card rounded-xl p-2 text-center mb-3">
            <div className="flex items-center justify-center gap-1 mb-0.5"><Radio className="w-3 h-3" style={{ color: COLORS.secondary }} /><span className="text-xs uppercase tracking-wider" style={{ color: COLORS.secondary }}>Онлайн-радио</span></div>
            <h1 className="text-base font-bold text-white">{STATION_NAME}</h1>
            <p className="text-xs text-center" style={{ color: COLORS.secondary, marginTop: '4px' }}>Сейчас в эфире:</p>
            <p className="text-xs text-center" style={{ color: '#fff' }}>{currentTrack}</p>
            <p className="text-xs mt-0.5" style={{ color: COLORS.accent }}>👥 {listeners} {listeners === 1 ? 'слушатель' : 'слушателя'}</p>
          </div>
          {buffering && <div className="flex items-center justify-center gap-2 mb-2 p-1.5 rounded-xl skeuo-card"><Wifi className="w-3 h-3 animate-pulse" style={{ color: COLORS.secondary }} /><span className="text-xs" style={{ color: COLORS.secondary }}>Буферизация...</span></div>}
          {error && <div className="flex items-center justify-center gap-2 mb-2 p-1.5 rounded-xl" style={{ background: 'rgba(255,0,102,0.1)' }}><AlertCircle className="w-3 h-3" style={{ color: COLORS.bass }} /><span className="text-xs" style={{ color: '#ff6699' }}>{error}</span></div>}
          <div className="flex justify-center mb-3">
            <motion.button onClick={handlePlay} disabled={isLoading && !buffering} whileTap={{ scale: 0.95 }} className="rounded-full flex items-center justify-center" style={{ width: '56px', height: '56px', background: `linear-gradient(145deg, ${COLORS.accent}, ${COLORS.secondary})`, boxShadow: '0 4px 15px rgba(0,199,48,0.5)' }}>
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: COLORS.dark }} /> : isPlaying ? <Pause className="w-5 h-5" style={{ color: COLORS.dark }} /> : <Play className="w-5 h-5 ml-0.5" style={{ color: COLORS.dark }} />}
            </motion.button>
          </div>
          <div className="flex items-center gap-2 mb-3 px-2 py-1.5 rounded-xl skeuo-card">
            <button onClick={() => setIsMuted(!isMuted)} className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>{isMuted ? <VolumeX className="w-4 h-4" style={{ color: '#666' }} /> : <Volume2 className="w-4 h-4" style={{ color: COLORS.secondary }} />}</button>
            <input type="range" min="0" max="100" value={isMuted ? 0 : volume} onChange={(e) => { const v = parseInt(e.target.value, 10); setVolume(v); if (v > 0) setIsMuted(false) }} className="volume-slider flex-1 cursor-pointer" />
            <span className="text-xs w-8 text-right" style={{ color: COLORS.secondary }}>{isMuted ? 0 : volume}%</span>
          </div>
          <p className="text-center text-xs mt-2" style={{ color: '#555' }}>Powered by <span style={{ color: COLORS.secondary }}>DJ GooD OFF</span></p>
        </div>
      </div>
    </>
  )
}
