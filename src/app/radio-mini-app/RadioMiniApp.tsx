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
const HEARTBEAT_INTERVAL = 30000
const LOAD_TIMEOUT = 30000

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

// =====================================================
// ТИПЫ
// =====================================================
interface DiagnosticInfo {
  audioState: string
  audioContextState: string
  currentStreamUrl: string
  lastError: string
  errorCode: number | null
  platform: string
  isIOS: boolean
  networkState: string
  readyState: string
  lastEvent: string
  eventHistory: string[]
  eqActive: boolean
  webAudioMode: string
}

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

// =====================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =====================================================
function detectIOS(): boolean {
  const ua = navigator.userAgent
  const isIPad = /iPad/i.test(ua)
  const isIPhone = /iPhone/i.test(ua)
  const isIPod = /iPod/i.test(ua)
  const isIPadModern = /Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1
  const tgPlatform = window.Telegram?.WebApp?.platform || ''
  return isIPad || isIPhone || isIPod || isIPadModern || tgPlatform === 'ios'
}

function getPlatformName(): string {
  const ua = navigator.userAgent
  const tgPlatform = window.Telegram?.WebApp?.platform || ''
  if (tgPlatform) return `Telegram/${tgPlatform}`
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Mac/i.test(ua)) return 'Mac'
  if (/Win/i.test(ua)) return 'Windows'
  return 'Unknown'
}

function getAudioErrorMessage(error: MediaError | null): string {
  if (!error) return 'Нет ошибки'
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED: return 'MEDIA_ERR_ABORTED (1): Отменено'
    case MediaError.MEDIA_ERR_NETWORK: return 'MEDIA_ERR_NETWORK (2): Ошибка сети'
    case MediaError.MEDIA_ERR_DECODE: return 'MEDIA_ERR_DECODE (3): Ошибка декодирования'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: return 'MEDIA_ERR_SRC_NOT_SUPPORTED (4): Не поддерживается'
    default: return `Ошибка (${error.code})`
  }
}

function getNetworkStateName(state: number): string {
  switch (state) {
    case HTMLMediaElement.NETWORK_EMPTY: return 'NETWORK_EMPTY (0)'
    case HTMLMediaElement.NETWORK_IDLE: return 'NETWORK_IDLE (1)'
    case HTMLMediaElement.NETWORK_LOADING: return 'NETWORK_LOADING (2)'
    case HTMLMediaElement.NETWORK_NO_SOURCE: return 'NETWORK_NO_SOURCE (3)'
    default: return `Unknown (${state})`
  }
}

function getReadyStateName(state: number): string {
  switch (state) {
    case HTMLMediaElement.HAVE_NOTHING: return 'HAVE_NOTHING (0)'
    case HTMLMediaElement.HAVE_METADATA: return 'HAVE_METADATA (1)'
    case HTMLMediaElement.HAVE_CURRENT_DATA: return 'HAVE_CURRENT_DATA (2)'
    case HTMLMediaElement.HAVE_FUTURE_DATA: return 'HAVE_FUTURE_DATA (3)'
    case HTMLMediaElement.HAVE_ENOUGH_DATA: return 'HAVE_ENOUGH_DATA (4)'
    default: return `Unknown (${state})`
  }
}

// =====================================================
// ОСНОВНОЙ КОМПОНЕНТ
// =====================================================
export default function RadioMiniApp() {
  // =====================================================
  // СОСТОЯНИЯ
  // =====================================================
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [volume, setVolume] = useState(100)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTrack, setCurrentTrack] = useState('Загрузка...')
  const [listeners, setListeners] = useState(0)
  const [isTgReady, setIsTgReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [buffering, setBuffering] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [eqBass, setEqBass] = useState(0)
  const [eqMid, setEqMid] = useState(0)
  const [eqTreble, setEqTreble] = useState(0)
  
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo>({
    audioState: 'idle',
    audioContextState: 'none',
    currentStreamUrl: '',
    lastError: '',
    errorCode: null,
    platform: '',
    isIOS: false,
    networkState: '',
    readyState: '',
    lastEvent: '',
    eventHistory: [],
    eqActive: false,
    webAudioMode: 'none',
  })

  // =====================================================
  // REFS
  // =====================================================
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const isSourceConnectedRef = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const smoothedBarsRef = useRef<number[]>(new Array(24).fill(0))
  const isIOSRef = useRef(false)
  const eventHistoryRef = useRef<string[]>([])
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const bassFilterRef = useRef<BiquadFilterNode | null>(null)
  const midFilterRef = useRef<BiquadFilterNode | null>(null)
  const trebleFilterRef = useRef<BiquadFilterNode | null>(null)
  
  const SMOOTHING_FACTOR = 0.25

  // =====================================================
  // ДИАГНОСТИКА
  // =====================================================
  const updateDiagnostics = useCallback((update: Partial<DiagnosticInfo>) => {
    setDiagnostics(prev => ({ ...prev, ...update }))
  }, [])

  const addEventToHistory = useCallback((event: string) => {
    const timestamp = new Date().toLocaleTimeString()
    const entry = `[${timestamp}] ${event}`
    eventHistoryRef.current = [...eventHistoryRef.current.slice(-9), entry]
    updateDiagnostics({ lastEvent: entry, eventHistory: eventHistoryRef.current })
    console.log(`[AUDIO EVENT] ${entry}`)
  }, [updateDiagnostics])

  // =====================================================
  // AUDIO CONTEXT
  // =====================================================
  const getAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    const ctx = new AudioContextClass()
    audioContextRef.current = ctx
    console.log('[AUDIO] AudioContext создан, состояние:', ctx.state)
    updateDiagnostics({ audioContextState: ctx.state })
    return ctx
  }, [updateDiagnostics])

  // =====================================================
  // ВИЗУАЛИЗАТОР
  // =====================================================
  const getAverageForBinRange = useCallback((dataArray: Uint8Array, startBin: number, endBin: number): number => {
    const start = Math.max(0, Math.floor(startBin))
    const end = Math.min(dataArray.length - 1, Math.floor(endBin))
    if (start > end) return 0
    let sum = 0
    for (let i = start; i <= end; i++) sum += dataArray[i]
    return (sum / (end - start + 1)) / 255
  }, [])

  const frequencyToBin = useCallback((frequency: number, sampleRate: number, fftSize: number): number => {
    return frequency * (fftSize / 2) / (sampleRate / 2)
  }, [])

  const visualize = useCallback(() => {
    const analyser = analyserRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    
    if (!analyser || !canvas || !ctx) {
      animationFrameRef.current = requestAnimationFrame(visualize)
      return
    }
    
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyser.getByteFrequencyData(dataArray)
    
    const sampleRate = analyser.context.sampleRate
    const fftSize = analyser.fftSize
    const barValues: number[] = []
    
    // BASS (20-250 Hz)
    const bassFreqs = [20, 30, 45, 65, 90, 120, 160, 220]
    for (let i = 0; i < 8; i++) {
      const lowFreq = i === 0 ? 20 : bassFreqs[i] - (bassFreqs[i] - bassFreqs[i-1]) / 2
      const highFreq = i === 7 ? 250 : bassFreqs[i] + (bassFreqs[i+1] - bassFreqs[i]) / 2
      const lowBin = frequencyToBin(lowFreq, sampleRate, fftSize)
      const highBin = frequencyToBin(highFreq, sampleRate, fftSize)
      barValues.push(getAverageForBinRange(dataArray, lowBin, highBin))
    }
    
    // MID (250-4000 Hz)
    const midFreqs = [300, 420, 580, 800, 1100, 1500, 2100, 3000]
    for (let i = 0; i < 8; i++) {
      const lowFreq = i === 0 ? 250 : midFreqs[i] - (midFreqs[i] - midFreqs[i-1]) / 2
      const highFreq = i === 7 ? 4000 : midFreqs[i] + (midFreqs[i+1] - midFreqs[i]) / 2
      const lowBin = frequencyToBin(lowFreq, sampleRate, fftSize)
      const highBin = frequencyToBin(highFreq, sampleRate, fftSize)
      barValues.push(getAverageForBinRange(dataArray, lowBin, highBin))
    }
    
    // TREBLE (4000-20000 Hz)
    const trebleFreqs = [4500, 5500, 7000, 8500, 10500, 13000, 16000, 19000]
    for (let i = 0; i < 8; i++) {
      const lowFreq = i === 0 ? 4000 : trebleFreqs[i] - (trebleFreqs[i] - trebleFreqs[i-1]) / 2
      const highFreq = i === 7 ? 20000 : trebleFreqs[i] + (trebleFreqs[i+1] - trebleFreqs[i]) / 2
      const lowBin = frequencyToBin(lowFreq, sampleRate, fftSize)
      const highBin = frequencyToBin(highFreq, sampleRate, fftSize)
      barValues.push(getAverageForBinRange(dataArray, lowBin, highBin))
    }
    
    // Сглаживание
    for (let i = 0; i < 24; i++) {
      smoothedBarsRef.current[i] = smoothedBarsRef.current[i] + (barValues[i] - smoothedBarsRef.current[i]) * SMOOTHING_FACTOR
    }
    
    // Отрисовка
    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)
    
    const gap = 2
    const sectionGap = 8
    const barWidth = (width - 23 * gap - 2 * sectionGap) / 24
    
    for (let i = 0; i < 24; i++) {
      const section = Math.floor(i / 8)
      const barInSection = i % 8
      const x = barInSection * (barWidth + gap) + section * (8 * (barWidth + gap) + sectionGap)
      const barHeight = Math.max(2, smoothedBarsRef.current[i] * (height - 4))
      
      let gradient: CanvasGradient
      if (section === 0) {
        gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, COLORS.bass)
        gradient.addColorStop(1, '#ff3399')
      } else if (section === 1) {
        gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, COLORS.mid)
        gradient.addColorStop(1, COLORS.accent)
      } else {
        gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, COLORS.high)
        gradient.addColorStop(1, '#66ffee')
      }
      
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.roundRect(x, height - barHeight, barWidth, barHeight, 2)
      ctx.fill()
    }
    
    animationFrameRef.current = requestAnimationFrame(visualize)
  }, [frequencyToBin, getAverageForBinRange])

  const startVisualization = useCallback(() => {
    if (animationFrameRef.current) return
    visualize()
  }, [visualize])

  const stopVisualization = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    smoothedBarsRef.current = new Array(24).fill(0)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  // =====================================================
  // ЭКВАЛАЙЗЕР
  // =====================================================
  const connectAudioChain = useCallback((): boolean => {
    if (isSourceConnectedRef.current) return true
    const audio = audioRef.current
    if (!audio) return false
    const ctx = getAudioContext()
    if (!ctx) return false
    
    try {
      const bassFilter = ctx.createBiquadFilter()
      bassFilter.type = 'lowshelf'
      bassFilter.frequency.value = 250
      bassFilter.gain.value = eqBass
      bassFilterRef.current = bassFilter
      
      const midFilter = ctx.createBiquadFilter()
      midFilter.type = 'peaking'
      midFilter.frequency.value = 1000
      midFilter.Q.value = 0.5
      midFilter.gain.value = eqMid
      midFilterRef.current = midFilter
      
      const trebleFilter = ctx.createBiquadFilter()
      trebleFilter.type = 'highshelf'
      trebleFilter.frequency.value = 4000
      trebleFilter.gain.value = eqTreble
      trebleFilterRef.current = trebleFilter
      
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser
      
      const source = ctx.createMediaElementSource(audio)
      sourceNodeRef.current = source
      
      source.connect(bassFilter)
      bassFilter.connect(midFilter)
      midFilter.connect(trebleFilter)
      trebleFilter.connect(analyser)
      analyser.connect(ctx.destination)
      
      isSourceConnectedRef.current = true
      console.log('[AUDIO] Цепь подключена')
      updateDiagnostics({ eqActive: true })
      return true
    } catch (e) {
      console.error('[AUDIO] Ошибка подключения цепи:', e)
      return false
    }
  }, [getAudioContext, eqBass, eqMid, eqTreble, updateDiagnostics])

  // =====================================================
  // ИНИЦИАЛИЗАЦИЯ АУДИО
  // =====================================================
  useEffect(() => {
    isIOSRef.current = detectIOS()
    const platformName = getPlatformName()
    
    console.log('[AUDIO] Platform:', platformName, 'iOS:', isIOSRef.current)
    
    updateDiagnostics({
      platform: platformName,
      isIOS: isIOSRef.current,
      audioState: 'idle',
      webAudioMode: isIOSRef.current ? 'disabled_for_ios' : 'enabled',
    })
    
    const audio = new Audio()
    audio.preload = 'none'
    audio.crossOrigin = 'anonymous'
    // ВАЖНО для iOS: playsInline
    audio.setAttribute('playsinline', 'true')
    audio.setAttribute('webkit-playsinline', 'true')
    audio.setAttribute('x5-video-player-type', 'h5')
    audio.setAttribute('x5-video-player-fullscreen', 'true')
    audioRef.current = audio
    
    const onPlaying = () => {
      addEventToHistory('playing')
      updateDiagnostics({ audioState: 'playing', lastError: '', errorCode: null })
      setIsPlaying(true)
      setIsLoading(false)
      setBuffering(false)
      setError(null)
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    }
    
    const onPause = () => {
      addEventToHistory('pause')
      updateDiagnostics({ audioState: 'paused' })
      setIsPlaying(false)
      stopVisualization()
    }
    
    const onWaiting = () => { addEventToHistory('waiting'); setBuffering(true); setIsLoading(true) }
    
    const onCanPlay = () => {
      addEventToHistory('canplay')
      updateDiagnostics({ audioState: 'ready' })
      setBuffering(false)
      setIsLoading(false)
    }
    
    const onStalled = () => { addEventToHistory('stalled'); setBuffering(true) }
    
    const onError = () => {
      const mediaError = audio.error
      const errorDetails = mediaError ? getAudioErrorMessage(mediaError) : 'Unknown error'
      addEventToHistory(`ERROR: ${errorDetails}`)
      
      let errorMsg = 'Ошибка воспроизведения'
      if (mediaError) {
        switch (mediaError.code) {
          case MediaError.MEDIA_ERR_ABORTED: errorMsg = 'Воспроизведение отменено'; break
          case MediaError.MEDIA_ERR_NETWORK: errorMsg = 'Ошибка сети'; break
          case MediaError.MEDIA_ERR_DECODE: errorMsg = 'Ошибка декодирования'; break
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: errorMsg = 'Формат не поддерживается'; break
        }
      }
      
      updateDiagnostics({
        audioState: 'error',
        lastError: errorDetails,
        errorCode: mediaError?.code || null,
        networkState: getNetworkStateName(audio.networkState),
        readyState: getReadyStateName(audio.readyState),
        currentStreamUrl: audio.currentSrc || audio.src,
      })
      
      setIsLoading(false)
      setIsPlaying(false)
      setBuffering(false)
      setError(errorMsg)
      stopVisualization()
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
        try { await ctx.resume(); updateDiagnostics({ audioContextState: ctx.state }) } catch (e) {}
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    
    return () => {
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('stalled', onStalled)
      audio.removeEventListener('error', onError)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      audio.pause()
      audio.src = ''
      stopVisualization()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [stopVisualization, updateDiagnostics, addEventToHistory])

  // =====================================================
  // ГРОМКОСТЬ И EQ
  // =====================================================
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume / 100
  }, [volume, isMuted])

  useEffect(() => { if (bassFilterRef.current) bassFilterRef.current.gain.value = eqBass }, [eqBass])
  useEffect(() => { if (midFilterRef.current) midFilterRef.current.gain.value = eqMid }, [eqMid])
  useEffect(() => { if (trebleFilterRef.current) trebleFilterRef.current.gain.value = eqTreble }, [eqTreble])

  // =====================================================
  // TELEGRAM
  // =====================================================
  useEffect(() => {
    const initTelegram = () => {
      const tg = window.Telegram?.WebApp
      if (tg) {
        tg.ready()
        tg.expand()
        setIsTgReady(true)
        const isIOSFromTG = tg.platform === 'ios'
        if (isIOSFromTG) isIOSRef.current = true
        updateDiagnostics({ platform: `Telegram/${tg.platform}`, isIOS: isIOSFromTG || isIOSRef.current })
        return true
      }
      return false
    }
    if (initTelegram()) return
    let attempts = 0
    const interval = setInterval(() => { attempts++; if (initTelegram() || attempts >= 20) clearInterval(interval) }, 100)
    return () => clearInterval(interval)
  }, [updateDiagnostics])

  // =====================================================
  // LISTENER TRACKING
  // =====================================================
  const registerListener = useCallback(async (action: 'open' | 'close' | 'heartbeat') => {
    const tg = window.Telegram?.WebApp
    const user = tg?.initDataUnsafe?.user
    
    console.log('[LISTENER] registerListener called:', action)
    console.log('[LISTENER] Telegram WebApp:', !!tg)
    console.log('[LISTENER] User data:', user)
    
    // Если нет Telegram user - используем fallback
    let userId: number
    let firstName: string
    
    if (user) {
      userId = user.id
      firstName = user.first_name
    } else {
      // Fallback: используем localStorage для постоянного ID
      let sessionId = localStorage.getItem('radio_guest_id')
      if (!sessionId) {
        // Генерируем постоянный ID один раз
        sessionId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
        localStorage.setItem('radio_guest_id', sessionId)
      }
      // Используем хеш от sessionId для стабильного числового ID
      let hash = 0
      for (let i = 0; i < sessionId.length; i++) {
        hash = ((hash << 5) - hash) + sessionId.charCodeAt(i)
        hash = hash & hash
      }
      userId = Math.abs(hash)
      firstName = 'Гость'
      console.log('[LISTENER] Using fallback session:', sessionId, 'userId:', userId)
    }
    
    try {
      const response = await fetch(LISTENERS_API, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          first_name: firstName,
          last_name: user?.last_name || null,
          username: user?.username || null,
          action,
          isAdmin: user?.id === ADMIN_USER_ID,
        }),
      })
      const data = await response.json()
      console.log('[LISTENER] Response:', data)
    } catch (e) {
      console.error('[LISTENER] Error:', e)
    }
  }, [])

  // Регистрация слушателя - ТОЛЬКО когда играет
  // Heartbeat отправляем только при активном воспроизведении
  useEffect(() => {
    if (isPlaying) {
      console.log('[LISTENER] Playback started - registering listener')
      
      // Регистрируем при старте воспроизведения
      registerListener('open')
      
      // Запускаем heartbeat только когда играет
      heartbeatIntervalRef.current = setInterval(() => {
        registerListener('heartbeat')
      }, HEARTBEAT_INTERVAL)
    } else {
      // При остановке - очищаем heartbeat
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
        console.log('[LISTENER] Playback stopped - clearing heartbeat')
      }
    }
    
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
    }
  }, [isPlaying, registerListener])

  const fetchListenersCount = useCallback(async () => {
    try {
      const res = await fetch(LISTENERS_API, { mode: 'cors' })
      if (res.ok) { const data = await res.json(); setListeners(data.total || 0) }
    } catch (e) {}
  }, [])

  useEffect(() => { fetchListenersCount(); const interval = setInterval(fetchListenersCount, 10000); return () => clearInterval(interval) }, [fetchListenersCount])

  const fetchCurrentTrack = useCallback(async () => {
    try {
      const res = await fetch(NOW_PLAYING_API, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      if (res.ok) { const data = await res.json(); if (data.title && data.title !== currentTrack) setCurrentTrack(data.title) }
    } catch (e) {}
  }, [currentTrack])

  useEffect(() => { fetchCurrentTrack(); const interval = setInterval(fetchCurrentTrack, 5000); return () => clearInterval(interval) }, [fetchCurrentTrack])

  useEffect(() => {
    const sendClose = () => {
      const tg = window.Telegram?.WebApp
      const user = tg?.initDataUnsafe?.user

      // Получаем userId и firstName так же как в registerListener
      let userId: number
      let firstName: string

      if (user) {
        userId = user.id
        firstName = user.first_name
      } else {
        const sessionId = localStorage.getItem('radio_guest_id')
        if (sessionId) {
          let hash = 0
          for (let i = 0; i < sessionId.length; i++) {
            hash = ((hash << 5) - hash) + sessionId.charCodeAt(i)
            hash = hash & hash
          }
          userId = Math.abs(hash)
          firstName = 'Гость'
        } else {
          return // Нет сессии - нечего отправлять
        }
      }

      navigator.sendBeacon(LISTENERS_API, new Blob([JSON.stringify({
        user_id: userId,
        first_name: firstName,
        last_name: user?.last_name || null,
        username: user?.username || null,
        action: 'close',
        isAdmin: user?.id === ADMIN_USER_ID,
      })], { type: 'application/json' }))

      console.log('[LISTENER] Sent close beacon for user:', userId)
    }
    window.addEventListener('beforeunload', sendClose)
    window.addEventListener('pagehide', sendClose)
    return () => { window.removeEventListener('beforeunload', sendClose); window.removeEventListener('pagehide', sendClose) }
  }, [])

  // =====================================================
  // PLAY
  // =====================================================
  const handlePlay = async () => {
    const audio = audioRef.current
    if (!audio) return
    
    if (isPlaying) { 
      audio.pause()
      // При паузе отправляем close - перестаём считаться слушателем
      registerListener('close')
      return
    }
    
    setError(null)
    setIsLoading(true)
    
    const isIOS = isIOSRef.current
    
    console.log('[PLAY] === START === iOS:', isIOS)
    
    timeoutRef.current = setTimeout(() => {
      if (isLoading && !isPlaying) {
        setError('Таймаут')
        setIsLoading(false)
        setBuffering(false)
        audio.pause()
      }
    }, LOAD_TIMEOUT)
    
    try {
      audio.volume = isMuted ? 0 : volume / 100
      
      // Устанавливаем источник
      if (!audio.src || audio.src !== STREAM_URL) {
        console.log('[PLAY] Setting src:', STREAM_URL)
        audio.src = STREAM_URL
        audio.load()
        updateDiagnostics({ currentStreamUrl: STREAM_URL })
      }
      
      // =====================================================
      // КЛЮЧЕВОЕ ОТЛИЧИЕ ДЛЯ iOS:
      // НЕ используем WebAudio API для iOS Telegram Mini App!
      // WebAudio + бесконечный поток + WKWebView = MEDIA_ERR_DECODE
      // =====================================================
      
      if (!isIOS) {
        // Для НЕ iOS: используем WebAudio (EQ + Visualizer)
        console.log('[PLAY] Enabling WebAudio for non-iOS')
        const ctx = getAudioContext()
        if (ctx) {
          if (ctx.state === 'suspended') {
            await ctx.resume()
            updateDiagnostics({ audioContextState: ctx.state })
          }
          connectAudioChain()
        }
        startVisualization()
        updateDiagnostics({ webAudioMode: 'enabled' })
      } else {
        // Для iOS: чистый HTML5 Audio без WebAudio
        console.log('[PLAY] iOS mode: pure HTML5 Audio, NO WebAudio')
        updateDiagnostics({ webAudioMode: 'disabled_for_ios', eqActive: false })
        // Визуализатор для iOS - фейковая анимация
        startFakeVisualization()
      }
      
      // Запускаем воспроизведение
      console.log('[PLAY] Calling audio.play()')
      await audio.play()
      console.log('[PLAY] Success!')
      
    } catch (err: any) {
      console.error('[PLAY] Error:', err.name, err.message)
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      setIsLoading(false)
      
      let errorMsg = 'Ошибка воспроизведения'
      if (err.name === 'NotAllowedError') errorMsg = 'Нажмите ещё раз'
      else if (err.name === 'NotSupportedError') errorMsg = 'Формат не поддерживается'
      
      setError(errorMsg)
      updateDiagnostics({ lastError: `${err.name}: ${err.message}`, audioState: 'error' })
    }
  }

  // =====================================================
  // FAKE VISUALIZATION (для iOS)
  // =====================================================
  const startFakeVisualization = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    
    const animate = () => {
      if (!isPlaying) {
        stopVisualization()
        return
      }
      
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)
      
      const time = Date.now() / 1000
      const gap = 2
      const sectionGap = 8
      const barWidth = (width - 23 * gap - 2 * sectionGap) / 24
      
      for (let i = 0; i < 24; i++) {
        const section = Math.floor(i / 8)
        const barInSection = i % 8
        const x = barInSection * (barWidth + gap) + section * (8 * (barWidth + gap) + sectionGap)
        
        // Псевдо-случайная анимация на основе времени
        const baseHeight = 0.3 + Math.sin(time * 2 + i * 0.5) * 0.2 + Math.sin(time * 3.7 + i * 0.3) * 0.15
        const barHeight = Math.max(2, baseHeight * (height - 4))
        
        let gradient: CanvasGradient
        if (section === 0) {
          gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
          gradient.addColorStop(0, COLORS.bass)
          gradient.addColorStop(1, '#ff3399')
        } else if (section === 1) {
          gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
          gradient.addColorStop(0, COLORS.mid)
          gradient.addColorStop(1, COLORS.accent)
        } else {
          gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
          gradient.addColorStop(0, COLORS.high)
          gradient.addColorStop(1, '#66ffee')
        }
        
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.roundRect(x, height - barHeight, barWidth, barHeight, 2)
        ctx.fill()
      }
      
      animationFrameRef.current = requestAnimationFrame(animate)
    }
    
    animate()
  }, [isPlaying, stopVisualization])

  // =====================================================
  // RENDER
  // =====================================================
  const isIOSDevice = isIOSRef.current

  return (
    <>
      <style jsx global>{`
        .volume-slider { -webkit-appearance: none; height: 8px; border-radius: 10px; background: linear-gradient(90deg, rgba(255,0,102,0.3) 0%, rgba(0,199,48,0.3) 50%, rgba(0,255,204,0.3) 100%); }
        .volume-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(145deg, #ffffff, #e6e6e6); border: 3px solid #00c730; cursor: pointer; }
        .volume-slider::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(145deg, #ffffff, #e6e6e6); border: 3px solid #00c730; }
        .skeuo-card { background: linear-gradient(145deg, rgba(46,0,113,0.6), rgba(13,0,38,0.8)); border: 1px solid rgba(0,199,48,0.2); box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05); }
        .eq-slider { -webkit-appearance: none; height: 6px; border-radius: 5px; background: linear-gradient(90deg, #0d0026 0%, #00c730 50%, #0d0026 100%); }
        .eq-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: linear-gradient(145deg, #ffffff, #e6e6e6); border: 2px solid #00c730; cursor: pointer; }
        .diagnostic-panel { font-family: monospace; font-size: 10px; line-height: 1.4; max-height: 200px; overflow-y: auto; }
      `}</style>
      
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: `linear-gradient(180deg, ${COLORS.primary} 0%, ${COLORS.dark} 100%)` }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 80% 50% at 50% 30%, rgba(0,199,48,0.15) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 30% 60%, rgba(255,0,102,0.1) 0%, transparent 50%)` }} />
        
        <div className="relative z-10 w-full max-w-xs">
          <motion.img src={STATION_LOGO} alt={STATION_NAME} className="mx-auto mb-3" style={{ width: '150px', height: '150px', filter: isPlaying ? 'drop-shadow(0 0 30px rgba(0,199,48,0.6))' : 'drop-shadow(0 0 15px rgba(0,199,48,0.3))' }} animate={isPlaying ? { scale: [1, 1.03, 1] } : {}} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} />
          
          <div className="skeuo-card rounded-xl p-2 mb-3">
            <AnimatePresence>{isPlaying && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -top-2 right-2 px-2 py-0.5 rounded-full text-xs font-bold z-20" style={{ background: `linear-gradient(145deg, ${COLORS.secondary}, ${COLORS.accent})`, color: '#0d0026', boxShadow: '0 0 15px rgba(0,199,48,0.8)' }}>LIVE</motion.div>}</AnimatePresence>
            <canvas ref={canvasRef} width={280} height={60} className="w-full rounded" style={{ background: 'transparent' }} />
            <div className="flex justify-between mt-1.5 px-1">
              <span className="text-xs font-medium" style={{ color: COLORS.bass }}>BASS</span>
              <span className="text-xs font-medium" style={{ color: COLORS.mid }}>MID</span>
              <span className="text-xs font-medium" style={{ color: COLORS.high }}>TREBLE</span>
            </div>
          </div>
          
          {/* EQ - только для НЕ iOS */}
          {!isIOSDevice && (
            <div className="skeuo-card rounded-xl p-2 mb-3">
              <div className="text-xs text-center mb-2" style={{ color: COLORS.secondary }}>Эквалайзер</div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs w-10" style={{ color: COLORS.bass }}>Bass</span>
                <input type="range" min="-12" max="12" value={eqBass} onChange={(e) => setEqBass(parseInt(e.target.value, 10))} className="eq-slider flex-1 cursor-pointer" />
                <span className="text-xs w-6 text-right" style={{ color: COLORS.text }}>{eqBass > 0 ? '+' : ''}{eqBass}</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs w-10" style={{ color: COLORS.mid }}>Mid</span>
                <input type="range" min="-12" max="12" value={eqMid} onChange={(e) => setEqMid(parseInt(e.target.value, 10))} className="eq-slider flex-1 cursor-pointer" />
                <span className="text-xs w-6 text-right" style={{ color: COLORS.text }}>{eqMid > 0 ? '+' : ''}{eqMid}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs w-10" style={{ color: COLORS.high }}>Treble</span>
                <input type="range" min="-12" max="12" value={eqTreble} onChange={(e) => setEqTreble(parseInt(e.target.value, 10))} className="eq-slider flex-1 cursor-pointer" />
                <span className="text-xs w-6 text-right" style={{ color: COLORS.text }}>{eqTreble > 0 ? '+' : ''}{eqTreble}</span>
              </div>
            </div>
          )}
          
          {/* iOS notice */}
          {isIOSDevice && (
            <div className="text-xs text-center mb-3 p-2 rounded-xl skeuo-card" style={{ color: COLORS.text }}>
              🍎 iOS режим: визуализатор работает, EQ недоступен
            </div>
          )}
          
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
          
          <div className="mb-3">
            <button onClick={() => setShowDiagnostics(!showDiagnostics)} className="text-xs mb-1 opacity-50 hover:opacity-100" style={{ color: COLORS.secondary }}>{showDiagnostics ? '▼ Скрыть диагностику' : '▶ Показать диагностику'}</button>
            {showDiagnostics && (
              <div className="diagnostic-panel skeuo-card rounded-xl p-2" style={{ background: 'rgba(0,0,0,0.5)' }}>
                <div className="font-bold mb-1" style={{ color: COLORS.secondary }}>🔧 ДИАГНОСТИКА</div>
                <div style={{ color: diagnostics.isIOS ? COLORS.bass : COLORS.accent }}>Platform: {diagnostics.platform} {diagnostics.isIOS && '🍎 iOS'}</div>
                <div style={{ color: COLORS.text }}>Audio: {diagnostics.audioState}</div>
                <div style={{ color: COLORS.text }}>WebAudio: {diagnostics.webAudioMode}</div>
                <div style={{ color: diagnostics.eqActive ? COLORS.accent : COLORS.text }}>EQ: {diagnostics.eqActive ? 'ON' : 'OFF'}</div>
                <div style={{ color: COLORS.text, wordBreak: 'break-all' }}>URL: {diagnostics.currentStreamUrl || '(нет)'}</div>
                {diagnostics.lastError && <div style={{ color: COLORS.bass }}>ERROR: {diagnostics.lastError}</div>}
                <div style={{ color: COLORS.mid }}>Last: {diagnostics.lastEvent}</div>
                <div className="mt-1 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ color: COLORS.secondary }}>History:</div>
                  {diagnostics.eventHistory.map((e, i) => <div key={i} style={{ color: COLORS.text, fontSize: '9px' }}>{e}</div>)}
                </div>
              </div>
            )}
          </div>
          
          <p className="text-center text-xs mt-2" style={{ color: '#555' }}>Powered by <span style={{ color: COLORS.secondary }}>DJ GooD OFF</span></p>
        </div>
      </div>
    </>
  )
}
