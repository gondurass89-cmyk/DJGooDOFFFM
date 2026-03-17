'use client'

// =====================================================
// ИМПОРТЫ
// =====================================================
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Volume2, VolumeX, Loader2, Radio, AlertCircle, Wifi } from 'lucide-react'
import Hls from 'hls.js'

// =====================================================
// КОНСТАНТЫ ПОТОКОВ
// =====================================================

// Основной MP3 поток для ПК и Android
const MP3_STREAM_URL = 'https://radio-stream.gondurass89.workers.dev'

// HLS поток для iOS (RadioHeart обычно предоставляет HLS)
// Формат: https://s0.radioheart.ru:8000/RH84200.m3u8
// Или через listen.myrh.ru: https://listen.myrh.ru/id084868.m3u8
const HLS_STREAM_URL = 'https://s0.radioheart.ru:8000/RH84200.m3u8'

// Альтернативные HLS URL (можно переключать)
// const HLS_STREAM_URL_ALT = 'https://listen.myrh.ru/id084868.m3u8'

// =====================================================
// ДРУГИЕ КОНСТАНТЫ
// =====================================================
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

// =====================================================
// ТИПЫ ДЛЯ ДИАГНОСТИКИ
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
  streamType: string // 'MP3' или 'HLS'
  hlsSupported: boolean
  hlsState: string
}

// =====================================================
// РАСШИРЕНИЕ ГЛОБАЛЬНОГО ИНТЕРФЕЙСА WINDOW
// =====================================================
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
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ДИАГНОСТИКИ
// =====================================================

// Функция определения iOS
function detectIOS(): boolean {
  const ua = navigator.userAgent
  const isIPad = /iPad/i.test(ua)
  const isIPhone = /iPhone/i.test(ua)
  const isIPod = /iPod/i.test(ua)
  const isIPadModern = /Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1
  const tgPlatform = window.Telegram?.WebApp?.platform || ''
  const isTgIOS = tgPlatform === 'ios'
  return isIPad || isIPhone || isIPod || isIPadModern || isTgIOS
}

// Функция получения названия платформы
function getPlatformName(): string {
  const ua = navigator.userAgent
  const tgPlatform = window.Telegram?.WebApp?.platform || ''
  if (tgPlatform) return `Telegram/${tgPlatform}`
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Mac/i.test(ua)) return 'Mac'
  if (/Win/i.test(ua)) return 'Windows'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Unknown'
}

// Функция расшифровки кода ошибки аудио
function getAudioErrorMessage(error: MediaError | null): string {
  if (!error) return 'Нет ошибки'
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'MEDIA_ERR_ABORTED (1): Воспроизведение отменено'
    case MediaError.MEDIA_ERR_NETWORK:
      return 'MEDIA_ERR_NETWORK (2): Ошибка сети'
    case MediaError.MEDIA_ERR_DECODE:
      return 'MEDIA_ERR_DECODE (3): Ошибка декодирования - iOS требует HLS!'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'MEDIA_ERR_SRC_NOT_SUPPORTED (4): Формат не поддерживается'
    default:
      return `Неизвестная ошибка (${error.code})`
  }
}

// Функция расшифровки networkState
function getNetworkStateName(state: number): string {
  switch (state) {
    case HTMLMediaElement.NETWORK_EMPTY: return 'NETWORK_EMPTY (0)'
    case HTMLMediaElement.NETWORK_IDLE: return 'NETWORK_IDLE (1)'
    case HTMLMediaElement.NETWORK_LOADING: return 'NETWORK_LOADING (2)'
    case HTMLMediaElement.NETWORK_NO_SOURCE: return 'NETWORK_NO_SOURCE (3)'
    default: return `Unknown (${state})`
  }
}

// Функция расшифровки readyState
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
  // СОСТОЯНИЯ КОМПОНЕНТА
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
  
  // Диагностика
  const [showDiagnostics, setShowDiagnostics] = useState(true)
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
    streamType: 'none',
    hlsSupported: false,
    hlsState: 'none',
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
  const smoothedValuesRef = useRef({ bass: 0, mid: 0, high: 0 })
  const isIOSRef = useRef(false)
  const eventHistoryRef = useRef<string[]>([])
  const hlsRef = useRef<Hls | null>(null)
  
  const SMOOTHING_FACTOR = 0.3

  // =====================================================
  // ФУНКЦИИ ДИАГНОСТИКИ
  // =====================================================
  const updateDiagnostics = useCallback((update: Partial<DiagnosticInfo>) => {
    setDiagnostics(prev => ({ ...prev, ...update }))
  }, [])

  const addEventToHistory = useCallback((event: string) => {
    const timestamp = new Date().toLocaleTimeString()
    const entry = `[${timestamp}] ${event}`
    eventHistoryRef.current = [...eventHistoryRef.current.slice(-9), entry]
    updateDiagnostics({
      lastEvent: entry,
      eventHistory: eventHistoryRef.current,
    })
    console.log(`[AUDIO EVENT] ${entry}`)
  }, [updateDiagnostics])

  // =====================================================
  // AUDIOCONTEXT
  // =====================================================
  const getAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) {
      console.error('[AUDIO] AudioContext не поддерживается')
      return null
    }
    const ctx = new AudioContextClass()
    audioContextRef.current = ctx
    console.log('[AUDIO] AudioContext создан, состояние:', ctx.state)
    updateDiagnostics({ audioContextState: ctx.state })
    return ctx
  }, [updateDiagnostics])

  // =====================================================
  // ВИЗУАЛИЗАТОР
  // =====================================================
  const getFrequencyEnergy = useCallback((
    dataArray: Uint8Array,
    sampleRate: number,
    fftSize: number,
    lowFreq: number,
    highFreq: number
  ): number => {
    const binCount = fftSize / 2
    const frequencyPerBin = sampleRate / fftSize
    const lowBin = Math.floor(lowFreq / frequencyPerBin)
    const highBin = Math.min(Math.floor(highFreq / frequencyPerBin), binCount - 1)
    let sum = 0, count = 0
    for (let i = lowBin; i <= highBin; i++) {
      sum += dataArray[i]
      count++
    }
    return count > 0 ? (sum / count) / 255 : 0
  }, [])

  const smoothValue = useCallback((current: number, previous: number): number => {
    return previous + (current - previous) * SMOOTHING_FACTOR
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
    
    const bassEnergy = getFrequencyEnergy(dataArray, sampleRate, fftSize, 20, 250)
    const midEnergy = getFrequencyEnergy(dataArray, sampleRate, fftSize, 250, 4000)
    const highEnergy = getFrequencyEnergy(dataArray, sampleRate, fftSize, 4000, 16000)
    
    smoothedValuesRef.current.bass = smoothValue(bassEnergy, smoothedValuesRef.current.bass)
    smoothedValuesRef.current.mid = smoothValue(midEnergy, smoothedValuesRef.current.mid)
    smoothedValuesRef.current.high = smoothValue(highEnergy, smoothedValuesRef.current.high)
    
    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)
    
    const barWidth = width / 3 - 8
    const gap = 12
    
    // BASS
    const bassHeight = smoothedValuesRef.current.bass * (height - 10) + 4
    const bassGradient = ctx.createLinearGradient(0, height, 0, height - bassHeight)
    bassGradient.addColorStop(0, COLORS.bass)
    bassGradient.addColorStop(1, '#ff3399')
    ctx.fillStyle = bassGradient
    ctx.beginPath()
    ctx.roundRect(gap, height - bassHeight, barWidth, bassHeight, 4)
    ctx.fill()
    
    // MID
    const midHeight = smoothedValuesRef.current.mid * (height - 10) + 4
    const midGradient = ctx.createLinearGradient(0, height, 0, height - midHeight)
    midGradient.addColorStop(0, COLORS.mid)
    midGradient.addColorStop(1, COLORS.accent)
    ctx.fillStyle = midGradient
    ctx.beginPath()
    ctx.roundRect(barWidth + gap * 2, height - midHeight, barWidth, midHeight, 4)
    ctx.fill()
    
    // HIGH
    const highHeight = smoothedValuesRef.current.high * (height - 10) + 4
    const highGradient = ctx.createLinearGradient(0, height, 0, height - highHeight)
    highGradient.addColorStop(0, COLORS.high)
    highGradient.addColorStop(1, '#66ffee')
    ctx.fillStyle = highGradient
    ctx.beginPath()
    ctx.roundRect(barWidth * 2 + gap * 3, height - highHeight, barWidth, highHeight, 4)
    ctx.fill()
    
    animationFrameRef.current = requestAnimationFrame(visualize)
  }, [getFrequencyEnergy, smoothValue])

  const startVisualization = useCallback(() => {
    if (animationFrameRef.current) return
    console.log('[VIS] Запуск визуализатора')
    visualize()
  }, [visualize])

  const stopVisualization = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
      console.log('[VIS] Визуализатор остановлен')
    }
    smoothedValuesRef.current = { bass: 0, mid: 0, high: 0 }
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  // =====================================================
  // ПОДКЛЮЧЕНИЕ АНАЛИЗАТОРА
  // =====================================================
  const connectAudioToAnalyser = useCallback((): boolean => {
    if (isSourceConnectedRef.current) {
      console.log('[AUDIO] Source уже подключен')
      return true
    }
    const audio = audioRef.current
    if (!audio) return false
    const ctx = getAudioContext()
    if (!ctx) return false
    
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
    } catch (e) {
      console.error('[AUDIO] Ошибка подключения анализатора:', e)
      return false
    }
  }, [getAudioContext])

  // =====================================================
  // ИНИЦИАЛИЗАЦИЯ АУДИО ЭЛЕМЕНТА
  // =====================================================
  useEffect(() => {
    console.log('[AUDIO] === ИНИЦИАЛИЗАЦИЯ ===')
    
    // Определяем iOS
    isIOSRef.current = detectIOS()
    const platformName = getPlatformName()
    
    console.log('[AUDIO] Platform:', platformName)
    console.log('[AUDIO] iOS:', isIOSRef.current)
    console.log('[AUDIO] HLS.js поддерживается:', Hls.isSupported())
    
    updateDiagnostics({
      platform: platformName,
      isIOS: isIOSRef.current,
      hlsSupported: Hls.isSupported(),
      audioState: 'idle',
      audioContextState: 'none',
      streamType: 'none',
      hlsState: 'none',
    })
    
    // Создаём аудио элемент
    const audio = new Audio()
    audio.preload = 'none'
    audio.crossOrigin = 'anonymous'
    audioRef.current = audio
    
    // =====================================================
    // ОБРАБОТЧИКИ СОБЫТИЙ АУДИО
    // =====================================================
    
    const onLoadStart = () => {
      console.log('[AUDIO] loadstart')
      addEventToHistory('loadstart')
      updateDiagnostics({
        audioState: 'loading',
        currentStreamUrl: audio.currentSrc,
        networkState: getNetworkStateName(audio.networkState),
        readyState: getReadyStateName(audio.readyState),
      })
      setIsLoading(true)
      setBuffering(true)
    }
    
    const onLoadedMetadata = () => {
      console.log('[AUDIO] loadedmetadata')
      addEventToHistory('loadedmetadata')
      updateDiagnostics({
        readyState: getReadyStateName(audio.readyState),
      })
    }
    
    const onLoadedData = () => {
      console.log('[AUDIO] loadeddata')
      addEventToHistory('loadeddata')
    }
    
    const onCanPlay = () => {
      console.log('[AUDIO] canplay')
      addEventToHistory('canplay')
      updateDiagnostics({
        audioState: 'ready',
        readyState: getReadyStateName(audio.readyState),
        networkState: getNetworkStateName(audio.networkState),
      })
      setBuffering(false)
      setIsLoading(false)
    }
    
    const onCanPlayThrough = () => {
      console.log('[AUDIO] canplaythrough')
      addEventToHistory('canplaythrough')
    }
    
    const onPlay = () => {
      console.log('[AUDIO] play')
      addEventToHistory('play')
    }
    
    const onPlaying = () => {
      console.log('[AUDIO] playing')
      addEventToHistory('playing')
      updateDiagnostics({
        audioState: 'playing',
        lastError: '',
        errorCode: null,
      })
      setIsPlaying(true)
      setIsLoading(false)
      setBuffering(false)
      setError(null)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
    
    const onPause = () => {
      console.log('[AUDIO] pause')
      addEventToHistory('pause')
      updateDiagnostics({ audioState: 'paused' })
      setIsPlaying(false)
      stopVisualization()
    }
    
    const onStalled = () => {
      console.log('[AUDIO] stalled')
      addEventToHistory('stalled')
      updateDiagnostics({
        networkState: getNetworkStateName(audio.networkState),
        readyState: getReadyStateName(audio.readyState),
      })
      setBuffering(true)
    }
    
    const onWaiting = () => {
      console.log('[AUDIO] waiting')
      addEventToHistory('waiting')
      setBuffering(true)
      setIsLoading(true)
    }
    
    const onSuspend = () => {
      console.log('[AUDIO] suspend')
      addEventToHistory('suspend')
      updateDiagnostics({
        networkState: getNetworkStateName(audio.networkState),
      })
    }
    
    const onAbort = () => {
      console.log('[AUDIO] abort')
      addEventToHistory('abort')
      updateDiagnostics({
        networkState: getNetworkStateName(audio.networkState),
        readyState: getReadyStateName(audio.readyState),
      })
    }
    
    const onEmptied = () => {
      console.log('[AUDIO] emptied')
      addEventToHistory('emptied')
      updateDiagnostics({
        networkState: getNetworkStateName(audio.networkState),
        readyState: getReadyStateName(audio.readyState),
        currentStreamUrl: audio.currentSrc || '(пусто)',
      })
    }
    
    const onError = () => {
      const mediaError = audio.error
      const errorDetails = mediaError ? getAudioErrorMessage(mediaError) : 'Неизвестная ошибка'
      
      console.error('[AUDIO] ERROR')
      console.error('  -> code:', mediaError?.code)
      console.error('  -> message:', mediaError?.message)
      console.error('  -> Расшифровка:', errorDetails)
      console.error('  -> currentSrc:', audio.currentSrc)
      console.error('  -> networkState:', getNetworkStateName(audio.networkState))
      console.error('  -> readyState:', getReadyStateName(audio.readyState))
      
      if (isIOSRef.current && mediaError?.code === MediaError.MEDIA_ERR_DECODE) {
        console.error('  -> [iOS] MP3 поток НЕ поддерживается! Нужен HLS (.m3u8)')
      }
      
      addEventToHistory(`ERROR: ${errorDetails}`)
      
      let errorMsg = 'Ошибка воспроизведения'
      if (mediaError) {
        switch (mediaError.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMsg = 'Воспроизведение отменено'
            break
          case MediaError.MEDIA_ERR_NETWORK:
            errorMsg = 'Ошибка сети'
            break
          case MediaError.MEDIA_ERR_DECODE:
            errorMsg = 'Ошибка декодирования (для iOS нужен HLS)'
            break
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMsg = 'Формат не поддерживается'
            break
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
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
    
    // Подписываемся на события
    audio.addEventListener('loadstart', onLoadStart)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('loadeddata', onLoadedData)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('canplaythrough', onCanPlayThrough)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('stalled', onStalled)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('suspend', onSuspend)
    audio.addEventListener('abort', onAbort)
    audio.addEventListener('emptied', onEmptied)
    audio.addEventListener('error', onError)
    
    // Visibility change для AudioContext
    const onVisibilityChange = async () => {
      const ctx = audioContextRef.current
      console.log('[VISIBILITY]', document.visibilityState)
      if (document.visibilityState === 'visible' && ctx && ctx.state === 'suspended') {
        try {
          await ctx.resume()
          console.log('[VISIBILITY] AudioContext resumed')
          updateDiagnostics({ audioContextState: ctx.state })
        } catch (e) {
          console.error('[VISIBILITY] Resume error:', e)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    
    // Очистка
    return () => {
      console.log('[AUDIO] Размонтирование')
      audio.removeEventListener('loadstart', onLoadStart)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('loadeddata', onLoadedData)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('canplaythrough', onCanPlayThrough)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('stalled', onStalled)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('suspend', onSuspend)
      audio.removeEventListener('abort', onAbort)
      audio.removeEventListener('emptied', onEmptied)
      audio.removeEventListener('error', onError)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      
      // Уничтожаем HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      
      audio.pause()
      audio.src = ''
      stopVisualization()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [stopVisualization, updateDiagnostics, addEventToHistory])

  // =====================================================
  // СИНХРОНИЗАЦИЯ ГРОМКОСТИ
  // =====================================================
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100
    }
  }, [volume, isMuted])

  // =====================================================
  // ИНИЦИАЛИЗАЦИЯ TELEGRAM
  // =====================================================
  useEffect(() => {
    const initTelegram = () => {
      const tg = window.Telegram?.WebApp
      if (tg) {
        tg.ready()
        tg.expand()
        setIsTgReady(true)
        console.log('[TG] Telegram WebApp ready, platform:', tg.platform)
        
        const isIOSFromTG = tg.platform === 'ios'
        if (isIOSFromTG) {
          isIOSRef.current = true
        }
        
        updateDiagnostics({
          platform: `Telegram/${tg.platform}`,
          isIOS: isIOSFromTG || isIOSRef.current,
        })
        return true
      }
      return false
    }
    
    if (initTelegram()) return
    
    let attempts = 0
    const interval = setInterval(() => {
      attempts++
      if (initTelegram() || attempts >= 20) clearInterval(interval)
    }, 100)
    
    return () => clearInterval(interval)
  }, [updateDiagnostics])

  // =====================================================
  // РЕГИСТРАЦИЯ СЛУШАТЕЛЯ
  // =====================================================
  const registerListener = useCallback(async (action: 'open' | 'close') => {
    const tg = window.Telegram?.WebApp
    const user = tg?.initDataUnsafe?.user
    if (!user) return
    
    try {
      await fetch(LISTENERS_API, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          action,
          isAdmin: user.id === ADMIN_USER_ID,
        }),
      })
      console.log('[LISTENER]', action)
    } catch (e) {
      console.error('[LISTENER] Error:', e)
    }
  }, [])

  useEffect(() => {
    if (isTgReady) registerListener('open')
  }, [isTgReady, registerListener])

  // =====================================================
  // ПОЛУЧЕНИЕ ДАННЫХ
  // =====================================================
  const fetchListenersCount = useCallback(async () => {
    try {
      const res = await fetch(LISTENERS_API, { mode: 'cors' })
      if (res.ok) {
        const data = await res.json()
        setListeners(data.total || 0)
      }
    } catch (e) {}
  }, [])

  useEffect(() => {
    fetchListenersCount()
    const interval = setInterval(fetchListenersCount, 10000)
    return () => clearInterval(interval)
  }, [fetchListenersCount])

  const fetchCurrentTrack = useCallback(async () => {
    try {
      const res = await fetch(NOW_PLAYING_API, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.title && data.title !== currentTrack) {
          setCurrentTrack(data.title)
        }
      }
    } catch (e) {}
  }, [currentTrack])

  useEffect(() => {
    fetchCurrentTrack()
    const interval = setInterval(fetchCurrentTrack, 5000)
    return () => clearInterval(interval)
  }, [fetchCurrentTrack])

  // =====================================================
  // ОТПРАВКА ЗАКРЫТИЯ
  // =====================================================
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
    
    return () => {
      window.removeEventListener('beforeunload', sendClose)
      window.removeEventListener('pagehide', sendClose)
    }
  }, [])

  // =====================================================
  // ОСНОВНАЯ ФУНКЦИЯ ВОСПРОИЗВЕДЕНИЯ
  // =====================================================
  const handlePlay = async () => {
    const audio = audioRef.current
    if (!audio) {
      console.error('[PLAY] Нет аудио элемента')
      return
    }
    
    // Если играет - пауза
    if (isPlaying) {
      console.log('[PLAY] Пауза')
      audio.pause()
      return
    }
    
    setError(null)
    setIsLoading(true)
    
    console.log('[PLAY] === НАЧАЛО ВОСПРОИЗВЕДЕНИЯ ===')
    console.log('[PLAY] iOS:', isIOSRef.current)
    console.log('[PLAY] HLS.js поддерживается:', Hls.isSupported())
    
    // Таймаут
    timeoutRef.current = setTimeout(() => {
      if (isLoading && !isPlaying) {
        console.error('[PLAY] Таймаут')
        setError('Таймаут подключения')
        setIsLoading(false)
        setBuffering(false)
        audio.pause()
      }
    }, 25000)
    
    try {
      audio.volume = isMuted ? 0 : volume / 100
      
      // =====================================================
      // ВЫБОР МЕТОДА ВОСПРОИЗВЕДЕНИЯ
      // =====================================================
      
      const isIOS = isIOSRef.current
      const hlsSupported = Hls.isSupported()
      
      // Для iOS используем HLS если поддерживается
      if (isIOS && hlsSupported) {
        console.log('[PLAY] iOS: используем HLS.js')
        updateDiagnostics({ streamType: 'HLS' })
        
        // Уничтожаем старый HLS instance если есть
        if (hlsRef.current) {
          hlsRef.current.destroy()
          hlsRef.current = null
        }
        
        // Создаём новый HLS instance
        const hls = new Hls({
          debug: true, // Включаем debug логи
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
        })
        
        hlsRef.current = hls
        
        // Привязываем к аудио элементу
        hls.attachMedia(audio)
        
        // События HLS
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          console.log('[HLS] MEDIA_ATTACHED')
          addEventToHistory('HLS: MEDIA_ATTACHED')
          updateDiagnostics({ hlsState: 'attached' })
          
          // Загружаем HLS плейлист
          hls.loadSource(HLS_STREAM_URL)
        })
        
        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          console.log('[HLS] MANIFEST_PARSED, уровней:', data.levels.length)
          addEventToHistory('HLS: MANIFEST_PARSED')
          updateDiagnostics({
            hlsState: 'manifest_parsed',
            currentStreamUrl: HLS_STREAM_URL,
          })
          
          // Запускаем воспроизведение
          audio.play().then(() => {
            console.log('[HLS] Воспроизведение запущено')
            startVisualization()
          }).catch((err) => {
            console.error('[HLS] Ошибка play():', err)
            setError('Ошибка запуска воспроизведения')
          })
        })
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('[HLS] ERROR:', data.type, data.details, data.fatal)
          addEventToHistory(`HLS ERROR: ${data.type} - ${data.details}`)
          updateDiagnostics({
            hlsState: `error: ${data.details}`,
            lastError: `HLS ${data.type}: ${data.details}`,
          })
          
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error('[HLS] Сетевая ошибка, пробуем восстановить')
                hls.startLoad()
                break
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error('[HLS] Ошибка медиа, пробуем восстановить')
                hls.recoverMediaError()
                break
              default:
                console.error('[HLS] Фатальная ошибка, уничтожаем')
                setError('Ошибка HLS потока')
                hls.destroy()
                break
            }
          }
        })
        
        hls.on(Hls.Events.FRAG_LOADED, () => {
          console.log('[HLS] FRAG_LOADED')
        })
        
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
          console.log('[HLS] AUDIO_TRACKS_UPDATED')
        })
        
      } else {
        // Для не-iOS или если HLS не поддерживается - используем MP3
        console.log('[PLAY] Используем MP3 поток')
        updateDiagnostics({ streamType: 'MP3' })
        
        if (!audio.src || audio.src !== MP3_STREAM_URL) {
          console.log('[PLAY] Устанавливаем источник:', MP3_STREAM_URL)
          audio.src = MP3_STREAM_URL
          audio.load()
          updateDiagnostics({ currentStreamUrl: MP3_STREAM_URL })
        }
        
        // AudioContext
        const ctx = getAudioContext()
        if (ctx) {
          if (ctx.state === 'suspended') {
            console.log('[PLAY] AudioContext suspended, resume')
            await ctx.resume()
            updateDiagnostics({ audioContextState: ctx.state })
          }
          connectAudioToAnalyser()
        }
        
        await audio.play()
        console.log('[PLAY] Воспроизведение запущено')
        startVisualization()
      }
      
    } catch (err: any) {
      console.error('[PLAY] Ошибка:', err.name, err.message)
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      
      setIsLoading(false)
      
      let errorMsg = 'Ошибка воспроизведения'
      if (err.name === 'NotAllowedError') {
        errorMsg = 'Нажмите ещё раз'
      } else if (err.name === 'NotSupportedError') {
        errorMsg = 'Формат не поддерживается'
      }
      
      setError(errorMsg)
      updateDiagnostics({
        lastError: `${err.name}: ${err.message}`,
        audioState: 'error',
      })
    }
  }

  // =====================================================
  // РЕНДЕР
  // =====================================================
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
        .skeuo-card {
          background: linear-gradient(145deg, rgba(46,0,113,0.6), rgba(13,0,38,0.8));
          border: 1px solid rgba(0,199,48,0.2);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .diagnostic-panel {
          font-family: monospace;
          font-size: 10px;
          line-height: 1.4;
          max-height: 250px;
          overflow-y: auto;
        }
        .diagnostic-panel::-webkit-scrollbar {
          width: 4px;
        }
        .diagnostic-panel::-webkit-scrollbar-thumb {
          background: rgba(0,199,48,0.3);
          border-radius: 2px;
        }
      `}</style>
      
      <div
        className="min-h-screen flex flex-col items-center justify-center p-4"
        style={{
          background: `linear-gradient(180deg, ${COLORS.primary} 0%, ${COLORS.dark} 100%)`,
        }}
      >
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 80% 50% at 50% 30%, rgba(0,199,48,0.15) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 30% 60%, rgba(255,0,102,0.1) 0%, transparent 50%)`,
          }}
        />
        
        <div className="relative z-10 w-full max-w-xs">
          
          <motion.img
            src={STATION_LOGO}
            alt={STATION_NAME}
            className="mx-auto mb-3"
            style={{
              width: '150px',
              height: '150px',
              filter: isPlaying
                ? 'drop-shadow(0 0 30px rgba(0,199,48,0.6))'
                : 'drop-shadow(0 0 15px rgba(0,199,48,0.3))',
            }}
            animate={isPlaying ? { scale: [1, 1.03, 1] } : {}}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          
          <div className="skeuo-card rounded-xl p-2 mb-3">
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
                    boxShadow: '0 0 15px rgba(0,199,48,0.8)',
                  }}
                >
                  LIVE
                </motion.div>
              )}
            </AnimatePresence>
            
            <canvas
              ref={canvasRef}
              width={280}
              height={48}
              className="w-full rounded"
              style={{ background: 'transparent' }}
            />
            
            <div className="flex justify-between mt-1.5 px-2">
              <span className="text-xs font-medium" style={{ color: COLORS.bass }}>BASS</span>
              <span className="text-xs font-medium" style={{ color: COLORS.mid }}>MID</span>
              <span className="text-xs font-medium" style={{ color: COLORS.high }}>HIGH</span>
            </div>
          </div>
          
          <div className="skeuo-card rounded-xl p-2 text-center mb-3">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Radio className="w-3 h-3" style={{ color: COLORS.secondary }} />
              <span className="text-xs uppercase tracking-wider" style={{ color: COLORS.secondary }}>
                Онлайн-радио
              </span>
            </div>
            
            <h1 className="text-base font-bold text-white">{STATION_NAME}</h1>
            
            <p className="text-xs text-center" style={{ color: COLORS.secondary, marginTop: '4px' }}>
              Сейчас в эфире:
            </p>
            
            <p className="text-xs text-center" style={{ color: '#fff' }}>
              {currentTrack}
            </p>
            
            <p className="text-xs mt-0.5" style={{ color: COLORS.accent }}>
              👥 {listeners} {listeners === 1 ? 'слушатель' : 'слушателя'}
            </p>
          </div>
          
          {buffering && (
            <div className="flex items-center justify-center gap-2 mb-2 p-1.5 rounded-xl skeuo-card">
              <Wifi className="w-3 h-3 animate-pulse" style={{ color: COLORS.secondary }} />
              <span className="text-xs" style={{ color: COLORS.secondary }}>Буферизация...</span>
            </div>
          )}
          
          {error && (
            <div
              className="flex items-center justify-center gap-2 mb-2 p-1.5 rounded-xl"
              style={{ background: 'rgba(255,0,102,0.1)' }}
            >
              <AlertCircle className="w-3 h-3" style={{ color: COLORS.bass }} />
              <span className="text-xs" style={{ color: '#ff6699' }}>{error}</span>
            </div>
          )}
          
          <div className="flex justify-center mb-3">
            <motion.button
              onClick={handlePlay}
              disabled={isLoading && !buffering}
              whileTap={{ scale: 0.95 }}
              className="rounded-full flex items-center justify-center"
              style={{
                width: '56px',
                height: '56px',
                background: `linear-gradient(145deg, ${COLORS.accent}, ${COLORS.secondary})`,
                boxShadow: '0 4px 15px rgba(0,199,48,0.5)',
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
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                setVolume(v)
                if (v > 0) setIsMuted(false)
              }}
              className="volume-slider flex-1 cursor-pointer"
            />
            
            <span className="text-xs w-8 text-right" style={{ color: COLORS.secondary }}>
              {isMuted ? 0 : volume}%
            </span>
          </div>
          
          {/* ДИАГНОСТИЧЕСКАЯ ПАНЕЛЬ */}
          <div className="mb-3">
            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="text-xs mb-1 opacity-50 hover:opacity-100"
              style={{ color: COLORS.secondary }}
            >
              {showDiagnostics ? '▼ Скрыть диагностику' : '▶ Показать диагностику'}
            </button>
            
            {showDiagnostics && (
              <div
                className="diagnostic-panel skeuo-card rounded-xl p-2"
                style={{ background: 'rgba(0,0,0,0.5)' }}
              >
                <div className="font-bold mb-1" style={{ color: COLORS.secondary }}>
                  🔧 ДИАГНОСТИКА
                </div>
                
                <div style={{ color: diagnostics.isIOS ? COLORS.bass : COLORS.accent }}>
                  Platform: {diagnostics.platform}
                  {diagnostics.isIOS && ' 🍎 iOS'}
                </div>
                
                <div style={{ color: COLORS.text }}>
                  Stream: {diagnostics.streamType}
                </div>
                
                <div style={{ color: diagnostics.hlsSupported ? COLORS.accent : COLORS.bass }}>
                  HLS.js: {diagnostics.hlsSupported ? '✓' : '✗'}
                </div>
                
                <div style={{ color: COLORS.text }}>
                  HLS State: {diagnostics.hlsState}
                </div>
                
                <div style={{ color: diagnostics.audioState === 'error' ? COLORS.bass : COLORS.text }}>
                  Audio State: {diagnostics.audioState}
                </div>
                
                <div style={{ color: diagnostics.audioContextState === 'suspended' ? COLORS.bass : COLORS.text }}>
                  AudioContext: {diagnostics.audioContextState}
                </div>
                
                <div style={{ color: COLORS.text, wordBreak: 'break-all' }}>
                  URL: {diagnostics.currentStreamUrl || '(нет)'}
                </div>
                
                <div style={{ color: COLORS.text }}>
                  Network: {diagnostics.networkState}
                </div>
                
                <div style={{ color: COLORS.text }}>
                  Ready: {diagnostics.readyState}
                </div>
                
                {diagnostics.lastError && (
                  <div style={{ color: COLORS.bass, wordBreak: 'break-all' }}>
                    ERROR: {diagnostics.lastError}
                  </div>
                )}
                
                {diagnostics.errorCode !== null && (
                  <div style={{ color: COLORS.bass }}>
                    Error Code: {diagnostics.errorCode}
                  </div>
                )}
                
                <div style={{ color: COLORS.mid }}>
                  Last Event: {diagnostics.lastEvent}
                </div>
                
                <div className="mt-1 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ color: COLORS.secondary }}>History:</div>
                  {diagnostics.eventHistory.map((event, i) => (
                    <div key={i} style={{ color: COLORS.text, fontSize: '9px' }}>
                      {event}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <p className="text-center text-xs mt-2" style={{ color: '#555' }}>
            Powered by <span style={{ color: COLORS.secondary }}>DJ GooD OFF</span>
          </p>
        </div>
      </div>
    </>
  )
}
