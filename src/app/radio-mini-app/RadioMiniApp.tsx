'use client'

// =====================================================
// ИМПОРТЫ
// =====================================================
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Volume2, VolumeX, Loader2, Radio, AlertCircle, Wifi } from 'lucide-react'

// =====================================================
// КОНСТАНТЫ ПОТОКОВ
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
  method: string // 'HTML5', 'MSE', 'NativeHLS'
  mseState: string
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
    method: 'none',
    mseState: 'none',
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
  const mediaSourceRef = useRef<MediaSource | null>(null)
  const sourceBufferRef = useRef<SourceBuffer | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  const SMOOTHING_FACTOR = 0.3

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
    updateDiagnostics({
      lastEvent: entry,
      eventHistory: eventHistoryRef.current,
    })
    console.log(`[EVENT] ${entry}`)
  }, [updateDiagnostics])

  // =====================================================
  // AUDIOCONTEXT
  // =====================================================
  const getAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    const ctx = new AudioContextClass()
    audioContextRef.current = ctx
    updateDiagnostics({ audioContextState: ctx.state })
    return ctx
  }, [updateDiagnostics])

  // =====================================================
  // ВИЗУАЛИЗАТОР
  // =====================================================
  const getFrequencyEnergy = useCallback((
    dataArray: Uint8Array, sampleRate: number, fftSize: number, lowFreq: number, highFreq: number
  ): number => {
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
    const bassHeight = smoothedValuesRef.current.bass * (height - 10) + 4
    const bassGradient = ctx.createLinearGradient(0, height, 0, height - bassHeight)
    bassGradient.addColorStop(0, COLORS.bass)
    bassGradient.addColorStop(1, '#ff3399')
    ctx.fillStyle = bassGradient
    ctx.beginPath()
    ctx.roundRect(gap, height - bassHeight, barWidth, bassHeight, 4)
    ctx.fill()
    const midHeight = smoothedValuesRef.current.mid * (height - 10) + 4
    const midGradient = ctx.createLinearGradient(0, height, 0, height - midHeight)
    midGradient.addColorStop(0, COLORS.mid)
    midGradient.addColorStop(1, COLORS.accent)
    ctx.fillStyle = midGradient
    ctx.beginPath()
    ctx.roundRect(barWidth + gap * 2, height - midHeight, barWidth, midHeight, 4)
    ctx.fill()
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
    visualize()
  }, [visualize])

  const stopVisualization = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    smoothedValuesRef.current = { bass: 0, mid: 0, high: 0 }
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const connectAudioToAnalyser = useCallback((): boolean => {
    if (isSourceConnectedRef.current) return true
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
      return true
    } catch (e) {
      return false
    }
  }, [getAudioContext])

  // =====================================================
  // ИНИЦИАЛИЗАЦИЯ
  // =====================================================
  useEffect(() => {
    isIOSRef.current = detectIOS()
    const platformName = getPlatformName()
    
    // Проверяем поддержку MSE
    const mseSupported = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg')
    
    updateDiagnostics({
      platform: platformName,
      isIOS: isIOSRef.current,
      audioState: 'idle',
      method: 'none',
      mseState: mseSupported ? 'supported' : 'not_supported',
    })
    
    const audio = new Audio()
    audio.preload = 'none'
    audio.crossOrigin = 'anonymous'
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
    
    const onWaiting = () => {
      addEventToHistory('waiting')
      setBuffering(true)
      setIsLoading(true)
    }
    
    const onCanPlay = () => {
      addEventToHistory('canplay')
      updateDiagnostics({ audioState: 'ready' })
      setBuffering(false)
      setIsLoading(false)
    }
    
    const onStalled = () => {
      addEventToHistory('stalled')
      setBuffering(true)
    }
    
    const onError = () => {
      const mediaError = audio.error
      const errorDetails = mediaError ? getAudioErrorMessage(mediaError) : 'Unknown error'
      addEventToHistory(`ERROR: ${errorDetails}`)
      updateDiagnostics({
        audioState: 'error',
        lastError: errorDetails,
        errorCode: mediaError?.code || null,
        networkState: getNetworkStateName(audio.networkState),
        readyState: getReadyStateName(audio.readyState),
      })
      setIsLoading(false)
      setIsPlaying(false)
      setBuffering(false)
      setError('Ошибка воспроизведения')
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
        try {
          await ctx.resume()
          updateDiagnostics({ audioContextState: ctx.state })
        } catch (e) {}
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
      if (abortControllerRef.current) abortControllerRef.current.abort()
      if (mediaSourceRef.current && mediaSourceRef.current.readyState === 'open') {
        mediaSourceRef.current.endOfStream()
      }
    }
  }, [stopVisualization, updateDiagnostics, addEventToHistory])

  // =====================================================
  // ГРОМКОСТЬ
  // =====================================================
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100
    }
  }, [volume, isMuted])

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
  // LISTENER & TRACK
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
    } catch (e) {}
  }, [])

  useEffect(() => {
    if (isTgReady) registerListener('open')
  }, [isTgReady, registerListener])

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
      const res = await fetch(NOW_PLAYING_API, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      if (res.ok) {
        const data = await res.json()
        if (data.title && data.title !== currentTrack) setCurrentTrack(data.title)
      }
    } catch (e) {}
  }, [currentTrack])

  useEffect(() => {
    fetchCurrentTrack()
    const interval = setInterval(fetchCurrentTrack, 5000)
    return () => clearInterval(interval)
  }, [fetchCurrentTrack])

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
  // MSE PLAYBACK (для iOS)
  // =====================================================
  const playWithMSE = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return false
    
    addEventToHistory('MSE: Starting')
    updateDiagnostics({ method: 'MSE', mseState: 'initializing' })
    
    try {
      // Создаём MediaSource
      const mediaSource = new MediaSource()
      mediaSourceRef.current = mediaSource
      
      // Создаём blob URL для MediaSource
      const blobUrl = URL.createObjectURL(mediaSource)
      audio.src = blobUrl
      
      updateDiagnostics({ currentStreamUrl: blobUrl.substring(0, 50) + '...' })
      
      // Ждём когда MediaSource откроется
      await new Promise<void>((resolve, reject) => {
        mediaSource.addEventListener('sourceopen', () => {
          addEventToHistory('MSE: sourceopen')
          resolve()
        }, { once: true })
        mediaSource.addEventListener('sourceerror', (e) => {
          addEventToHistory('MSE: sourceerror')
          reject(e)
        }, { once: true })
        setTimeout(() => reject(new Error('MSE timeout')), 5000)
      })
      
      // Создаём SourceBuffer для MP3
      // Пробуем разные MIME типы
      let sourceBuffer: SourceBuffer | null = null
      const mimeTypes = [
        'audio/mpeg',
        'audio/mp3',
        'audio/mpeg;codecs="mp3"',
        'audio/mp4;codecs="mp4a.40.2"',
      ]
      
      for (const mime of mimeTypes) {
        try {
          if (MediaSource.isTypeSupported(mime)) {
            sourceBuffer = mediaSource.addSourceBuffer(mime)
            addEventToHistory(`MSE: Supported ${mime}`)
            break
          }
        } catch (e) {
          // Try next
        }
      }
      
      if (!sourceBuffer) {
        addEventToHistory('MSE: No supported codec')
        updateDiagnostics({ mseState: 'no_codec' })
        return false
      }
      
      sourceBufferRef.current = sourceBuffer
      updateDiagnostics({ mseState: 'buffer_created' })
      
      // Начинаем стримить данные
      abortControllerRef.current = new AbortController()
      
      const response = await fetch(STREAM_URL, {
        signal: abortControllerRef.current.signal,
        headers: { 'Icy-MetaData': '1' },
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      addEventToHistory('MSE: Fetch started')
      
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No reader')
      }
      
      // Функция для чтения и добавления чанков
      const processChunk = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              addEventToHistory('MSE: Stream ended')
              break
            }
            
            if (sourceBuffer && !sourceBuffer.updating) {
              try {
                sourceBuffer.appendBuffer(value)
                updateDiagnostics({ mseState: 'appending' })
              } catch (e: any) {
                if (e.name === 'QuotaExceededError') {
                  // Буфер переполнен - нужно очистить старые данные
                  addEventToHistory('MSE: Quota exceeded, clearing')
                  // Очистка буфера не всегда работает для live stream
                }
              }
            }
          }
        } catch (e: any) {
          if (e.name !== 'AbortError') {
            addEventToHistory(`MSE: Read error - ${e.message}`)
          }
        }
      }
      
      // Запускаем чтение в фоне
      processChunk()
      
      // Ждём немного данных перед воспроизведением
      await new Promise(r => setTimeout(r, 500))
      
      // Запускаем воспроизведение
      await audio.play()
      addEventToHistory('MSE: Playing')
      updateDiagnostics({ mseState: 'playing' })
      
      return true
      
    } catch (e: any) {
      addEventToHistory(`MSE: Error - ${e.message}`)
      updateDiagnostics({ mseState: `error: ${e.message}`, lastError: e.message })
      return false
    }
  }, [addEventToHistory, updateDiagnostics])

  // =====================================================
  // PLAY
  // =====================================================
  const handlePlay = async () => {
    const audio = audioRef.current
    if (!audio) return
    
    if (isPlaying) {
      audio.pause()
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      return
    }
    
    setError(null)
    setIsLoading(true)
    
    timeoutRef.current = setTimeout(() => {
      if (isLoading && !isPlaying) {
        setError('Таймаут')
        setIsLoading(false)
        setBuffering(false)
        audio.pause()
      }
    }, 25000)
    
    try {
      audio.volume = isMuted ? 0 : volume / 100
      
      const isIOS = isIOSRef.current
      const mseSupported = typeof MediaSource !== 'undefined'
      
      // Для iOS пробуем MSE
      if (isIOS && mseSupported) {
        addEventToHistory('Trying MSE for iOS')
        const mseSuccess = await playWithMSE()
        
        if (mseSuccess) {
          // MSE работает
          const ctx = getAudioContext()
          if (ctx && ctx.state === 'suspended') {
            await ctx.resume()
            updateDiagnostics({ audioContextState: ctx.state })
          }
          connectAudioToAnalyser()
          startVisualization()
          return
        }
        
        // MSE не сработал - пробуем обычный метод
        addEventToHistory('MSE failed, trying HTML5')
      }
      
      // Стандартный метод для ПК/Android
      updateDiagnostics({ method: 'HTML5' })
      
      if (!audio.src || audio.src !== STREAM_URL) {
        audio.src = STREAM_URL
        audio.load()
        updateDiagnostics({ currentStreamUrl: STREAM_URL })
      }
      
      const ctx = getAudioContext()
      if (ctx) {
        if (ctx.state === 'suspended') {
          await ctx.resume()
          updateDiagnostics({ audioContextState: ctx.state })
        }
        connectAudioToAnalyser()
      }
      
      await audio.play()
      startVisualization()
      
    } catch (err: any) {
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
  // RENDER
  // =====================================================
  return (
    <>
      <style jsx global>{`
        .volume-slider { -webkit-appearance: none; height: 8px; border-radius: 10px; background: linear-gradient(90deg, rgba(255,0,102,0.3) 0%, rgba(0,199,48,0.3) 50%, rgba(0,255,204,0.3) 100%); }
        .volume-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(145deg, #ffffff, #e6e6e6); border: 3px solid #00c730; cursor: pointer; }
        .volume-slider::-moz-range-thumb { width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(145deg, #ffffff, #e6e6e6); border: 3px solid #00c730; }
        .skeuo-card { background: linear-gradient(145deg, rgba(46,0,113,0.6), rgba(13,0,38,0.8)); border: 1px solid rgba(0,199,48,0.2); box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05); }
        .diagnostic-panel { font-family: monospace; font-size: 10px; line-height: 1.4; max-height: 250px; overflow-y: auto; }
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
          
          {/* DIAGNOSTICS */}
          <div className="mb-3">
            <button onClick={() => setShowDiagnostics(!showDiagnostics)} className="text-xs mb-1 opacity-50 hover:opacity-100" style={{ color: COLORS.secondary }}>{showDiagnostics ? '▼ Скрыть диагностику' : '▶ Показать диагностику'}</button>
            {showDiagnostics && (
              <div className="diagnostic-panel skeuo-card rounded-xl p-2" style={{ background: 'rgba(0,0,0,0.5)' }}>
                <div className="font-bold mb-1" style={{ color: COLORS.secondary }}>🔧 ДИАГНОСТИКА</div>
                <div style={{ color: diagnostics.isIOS ? COLORS.bass : COLORS.accent }}>Platform: {diagnostics.platform} {diagnostics.isIOS && '🍎 iOS'}</div>
                <div style={{ color: COLORS.text }}>Method: {diagnostics.method}</div>
                <div style={{ color: COLORS.text }}>MSE: {diagnostics.mseState}</div>
                <div style={{ color: diagnostics.audioState === 'error' ? COLORS.bass : COLORS.text }}>Audio: {diagnostics.audioState}</div>
                <div style={{ color: COLORS.text }}>AudioContext: {diagnostics.audioContextState}</div>
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
