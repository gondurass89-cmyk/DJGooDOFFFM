'use client'

// =====================================================
// DJ GooD OFF FM - Telegram Mini App
// Радио-плеер с реальным эквалайзером и визуализатором
// Архитектура: REAL-FIRST, FALLBACK-ONLY-ON-FAILURE
// =====================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Volume2, VolumeX, Loader2, Radio, AlertCircle, Wifi, ChevronDown, ChevronUp } from 'lucide-react'

// =====================================================
// КОНСТАНТЫ
// =====================================================
// ПРЯМОЙ HTTPS ПОТОК AZURACAST - надежнее чем Worker!
const STREAM_URL = 'https://stream.volfrings.ru/listen/djgoodofffm/radio.mp3'
const STATION_NAME = 'DJ GooD OFF FM'
const STATION_LOGO = '/logo.png'
const LISTENERS_API = 'https://listeners.gondurass89.workers.dev'
const NOW_PLAYING_API = '/api/now-playing'
const HEARTBEAT_INTERVAL = 30000
const LOAD_TIMEOUT = 30000
const REAL_MODE_CHECK_FRAMES = 10
const REAL_MODE_CHECK_DELAY = 500

// =====================================================
// ЦВЕТОВАЯ СХЕМА
// =====================================================
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

function getAudioErrorMessage(error: MediaError | null): string {
  if (!error) return 'Нет ошибки'
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED: return 'Отменено пользователем'
    case MediaError.MEDIA_ERR_NETWORK: return 'Ошибка сети'
    case MediaError.MEDIA_ERR_DECODE: return 'Ошибка декодирования'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: return 'Формат не поддерживается'
    default: return `Неизвестная ошибка (${error.code})`
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
  const [volume, setVolume] = useState(() => {
    // Восстановление громкости из localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('radio_volume')
      return saved ? parseInt(saved, 10) : 100
    }
    return 100
  })
  const [isMuted, setIsMuted] = useState(false)
  const [currentTrack, setCurrentTrack] = useState('Загрузка...')
  const [listeners, setListeners] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [buffering, setBuffering] = useState(false)
  const [eqBass, setEqBass] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('radio_eq_bass')
      return saved ? parseInt(saved, 10) : 0
    }
    return 0
  })
  const [eqMid, setEqMid] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('radio_eq_mid')
      return saved ? parseInt(saved, 10) : 0
    }
    return 0
  })
  const [eqTreble, setEqTreble] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('radio_eq_treble')
      return saved ? parseInt(saved, 10) : 0
    }
    return 0
  })
  const [showEq, setShowEq] = useState(false) // Скрыт/раскрыт эквалайзер
  const [reconnecting, setReconnecting] = useState(false) // Статус переподключения

  // =====================================================
  // ССЫЛКИ (useRef)
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
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const bassFilterRef = useRef<BiquadFilterNode | null>(null)
  const midFilterRef = useRef<BiquadFilterNode | null>(null)
  const trebleFilterRef = useRef<BiquadFilterNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)  // GainNode для управления громкостью в WebAudio
  const realModeCheckRef = useRef<boolean>(false)
  const fallbackModeRef = useRef<boolean>(false)
  const realModeCheckCountRef = useRef<number>(0)
  const isPlayingRef = useRef<boolean>(false)
  const reconnectAttemptsRef = useRef<number>(0)  // Счётчик попыток переподключения
  const maxReconnectAttempts = 3  // Максимум попыток
  
  const SMOOTHING_FACTOR = 0.25

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
    return ctx
  }, [])

  // =====================================================
  // ОСТАНОВКА ВИЗУАЛИЗАЦИИ
  // =====================================================
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
  // ВИЗУАЛИЗАТОР - REAL MODE
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

  const visualizeReal = useCallback(() => {
    const analyser = analyserRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    
    if (!analyser || !canvas || !ctx) {
      animationFrameRef.current = requestAnimationFrame(visualizeReal)
      return
    }
    
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyser.getByteFrequencyData(dataArray)
    
    // Проверка REAL MODE
    if (!realModeCheckRef.current && !fallbackModeRef.current) {
      let hasNonZeroData = false
      for (let i = 0; i < dataArray.length; i++) {
        if (dataArray[i] > 10) {
          hasNonZeroData = true
          break
        }
      }
      if (hasNonZeroData) {
        realModeCheckCountRef.current++
        if (realModeCheckCountRef.current >= REAL_MODE_CHECK_FRAMES) {
          realModeCheckRef.current = true
          console.log('[AUDIO] REAL MODE подтверждён')
        }
      }
    }
    
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
    
    animationFrameRef.current = requestAnimationFrame(visualizeReal)
  }, [frequencyToBin, getAverageForBinRange])

  // =====================================================
  // ВИЗУАЛИЗАТОР - FALLBACK MODE (iOS)
  // =====================================================
  const visualizeFallback = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) {
      console.log('[VISUALIZER] FALLBACK: canvas недоступен')
      return
    }
    
    console.log('[VISUALIZER] FALLBACK: Запуск анимации')
    
    const animate = () => {
      if (!isPlayingRef.current) {
        console.log('[VISUALIZER] FALLBACK: Остановка')
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
  }, [stopVisualization])

  // =====================================================
  // УПРАВЛЕНИЕ ВИЗУАЛИЗАТОРОМ
  // =====================================================
  const startVisualization = useCallback(() => {
    if (animationFrameRef.current) return
    
    console.log('[VISUALIZER] startVisualization, fallback:', fallbackModeRef.current)
    
    if (fallbackModeRef.current) {
      visualizeFallback()
    } else {
      visualizeReal()
    }
  }, [visualizeReal, visualizeFallback])

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
      // GainNode для управления громкостью в WebAudio цепи
      // КРИТИЧНО: audio.volume не работает когда WebAudio активен!
      const gainNode = ctx.createGain()
      gainNode.gain.value = isMuted ? 0 : volume / 100
      gainNodeRef.current = gainNode
      
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
      
      // Цепь: source -> bass -> mid -> treble -> analyser -> gainNode -> destination
      source.connect(bassFilter)
      bassFilter.connect(midFilter)
      midFilter.connect(trebleFilter)
      trebleFilter.connect(analyser)
      analyser.connect(gainNode)  // GainNode после analyser, перед destination
      gainNode.connect(ctx.destination)
      
      isSourceConnectedRef.current = true
      console.log('[AUDIO] Аудио-цепь подключена с GainNode для громкости')
      return true
    } catch (e) {
      console.error('[AUDIO] Ошибка подключения аудио-цепи:', e)
      return false
    }
  }, [getAudioContext, eqBass, eqMid, eqTreble, volume, isMuted])

  // =====================================================
  // ИНИЦИАЛИЗАЦИЯ АУДИО
  // =====================================================
  useEffect(() => {
    isIOSRef.current = detectIOS()
    console.log('[AUDIO] Инициализация. iOS:', isIOSRef.current)
    
    const audio = new Audio()
    audio.preload = 'none'
    audio.crossOrigin = 'anonymous'
    audio.setAttribute('playsinline', 'true')
    audio.setAttribute('webkit-playsinline', 'true')
    audio.setAttribute('x5-video-player-type', 'h5')
    audio.setAttribute('x5-video-player-fullscreen', 'true')
    audioRef.current = audio
    
    const onPlaying = () => {
      console.log('[AUDIO] playing')
      setIsPlaying(true)
      isPlayingRef.current = true
      setIsLoading(false)
      setBuffering(false)
      setError(null)
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      startVisualization()
    }
    
    const onPause = () => {
      console.log('[AUDIO] pause')
      setIsPlaying(false)
      isPlayingRef.current = false
      stopVisualization()
    }
    
    const onWaiting = () => {
      setBuffering(true)
      setIsLoading(true)
    }
    
    const onCanPlay = () => {
      setBuffering(false)
      setIsLoading(false)
    }
    
    const onStalled = () => setBuffering(true)
    
    // =====================================================
    // АВТОПЕРЕПОДКЛЮЧЕНИЕ
    // =====================================================
    const attemptReconnect = async () => {
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        console.log('[AUDIO] Max reconnect attempts reached')
        setReconnecting(false)
        setError('Не удалось переподключиться')
        return
      }
      
      reconnectAttemptsRef.current++
      setReconnecting(true)
      console.log(`[AUDIO] Reconnect attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`)
      
      await new Promise(resolve => setTimeout(resolve, 3000)) // Ждём 3 секунды
      
      if (!isPlayingRef.current) {
        setReconnecting(false)
        return
      }
      
      audio.src = ''
      audio.src = STREAM_URL
      audio.load()
      
      try {
        await audio.play()
        console.log('[AUDIO] Reconnected successfully')
        reconnectAttemptsRef.current = 0
        setReconnecting(false)
      } catch (e) {
        console.error('[AUDIO] Reconnect failed:', e)
        attemptReconnect()
      }
    }
    
    const onError = () => {
      const mediaError = audio.error
      console.error('[AUDIO] Error:', mediaError ? getAudioErrorMessage(mediaError) : 'Unknown')
      
      if (mediaError?.code === MediaError.MEDIA_ERR_DECODE) {
        if (isIOSRef.current && !fallbackModeRef.current) {
          console.log('[AUDIO] Переключение в FALLBACK MODE')
          fallbackModeRef.current = true
        }
      }
      
      // Попытка автопереподключения при сетевой ошибке
      if (mediaError?.code === MediaError.MEDIA_ERR_NETWORK && isPlayingRef.current) {
        console.log('[AUDIO] Network error, attempting reconnect...')
        attemptReconnect()
        return
      }
      
      let errorMsg = 'Ошибка воспроизведения'
      if (mediaError) {
        switch (mediaError.code) {
          case MediaError.MEDIA_ERR_ABORTED: errorMsg = 'Воспроизведение отменено'; break
          case MediaError.MEDIA_ERR_NETWORK: errorMsg = 'Ошибка сети'; break
          case MediaError.MEDIA_ERR_DECODE: errorMsg = 'Ошибка декодирования'; break
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: errorMsg = 'Формат не поддерживается'; break
        }
      }
      
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
        try { await ctx.resume() } catch (e) { console.error('[AUDIO] Resume error:', e) }
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
  }, [stopVisualization, startVisualization])

  // =====================================================
  // ГРОМКОСТЬ
  // =====================================================
  useEffect(() => {
    const effectiveVolume = isMuted ? 0 : volume / 100
    
    // Приоритет: GainNode (WebAudio) > audio.volume (прямой)
    if (gainNodeRef.current) {
      // WebAudio режим - используем GainNode
      gainNodeRef.current.gain.value = effectiveVolume
      console.log('[VOLUME] GainNode volume:', effectiveVolume)
    } else if (audioRef.current) {
      // Прямой режим - используем audio.volume
      audioRef.current.volume = effectiveVolume
    }
    
    // Сохранение в localStorage
    localStorage.setItem('radio_volume', String(volume))
  }, [volume, isMuted])

  // =====================================================
  // ЭКВАЛАЙЗЕР - обновление фильтров и сохранение
  // =====================================================
  useEffect(() => {
    if (bassFilterRef.current) bassFilterRef.current.gain.value = eqBass
    localStorage.setItem('radio_eq_bass', String(eqBass))
  }, [eqBass])
  
  useEffect(() => {
    if (midFilterRef.current) midFilterRef.current.gain.value = eqMid
    localStorage.setItem('radio_eq_mid', String(eqMid))
  }, [eqMid])
  
  useEffect(() => {
    if (trebleFilterRef.current) trebleFilterRef.current.gain.value = eqTreble
    localStorage.setItem('radio_eq_treble', String(eqTreble))
  }, [eqTreble])

  // =====================================================
  // TELEGRAM WEBAPP
  // =====================================================
  useEffect(() => {
    const initTelegram = () => {
      const tg = window.Telegram?.WebApp
      if (tg) {
        tg.ready()
        tg.expand()
        const isIOSFromTG = tg.platform === 'ios'
        if (isIOSFromTG) isIOSRef.current = true
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
  }, [])

  // =====================================================
  // LISTENER TRACKING
  // =====================================================
  const registerListener = useCallback(async (action: 'open' | 'close' | 'heartbeat') => {
    const tg = window.Telegram?.WebApp
    const user = tg?.initDataUnsafe?.user
    
    let userId: number
    let firstName: string
    
    if (user) {
      userId = user.id
      firstName = user.first_name
    } else {
      let sessionId = localStorage.getItem('radio_guest_id')
      if (!sessionId) {
        sessionId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
        localStorage.setItem('radio_guest_id', sessionId)
      }
      let hash = 0
      for (let i = 0; i < sessionId.length; i++) {
        hash = ((hash << 5) - hash) + sessionId.charCodeAt(i)
        hash = hash & hash
      }
      userId = Math.abs(hash)
      firstName = 'Гость'
    }
    
    try {
      await fetch(LISTENERS_API, {
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
    } catch (e) {
      console.error('[LISTENER] Error:', e)
    }
  }, [])

  useEffect(() => {
    if (isPlaying) {
      registerListener('open')
      heartbeatIntervalRef.current = setInterval(() => registerListener('heartbeat'), HEARTBEAT_INTERVAL)
    } else {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
    }
    
    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
    }
  }, [isPlaying, registerListener])

  const fetchListenersCount = useCallback(async () => {
    try {
      const res = await fetch(LISTENERS_API, { mode: 'cors' })
      if (res.ok) {
        const data = await res.json()
        setListeners(data.total || 0)
      }
    } catch (e) {
      console.error('[LISTENERS] Fetch error:', e)
    }
  }, [])

  useEffect(() => {
    fetchListenersCount()
    const interval = setInterval(fetchListenersCount, 10000)
    return () => clearInterval(interval)
  }, [fetchListenersCount])

  // =====================================================
  // CURRENT TRACK
  // =====================================================
  const fetchCurrentTrack = useCallback(async () => {
    try {
      const res = await fetch(NOW_PLAYING_API, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      if (res.ok) {
        const data = await res.json()
        if (data.title && data.title !== currentTrack) {
          setCurrentTrack(data.title)
        }
      }
    } catch (e) {
      console.error('[TRACK] Fetch error:', e)
    }
  }, [currentTrack])

  useEffect(() => {
    fetchCurrentTrack()
    const interval = setInterval(fetchCurrentTrack, 5000)
    return () => clearInterval(interval)
  }, [fetchCurrentTrack])

  // =====================================================
  // CLOSE ON UNLOAD
  // =====================================================
  useEffect(() => {
    const sendClose = () => {
      const tg = window.Telegram?.WebApp
      const user = tg?.initDataUnsafe?.user

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
          return
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
    }
    window.addEventListener('beforeunload', sendClose)
    window.addEventListener('pagehide', sendClose)
    return () => {
      window.removeEventListener('beforeunload', sendClose)
      window.removeEventListener('pagehide', sendClose)
    }
  }, [])

  // =====================================================
  // PLAY/PAUSE HANDLER
  // =====================================================
  const handlePlay = async () => {
    const audio = audioRef.current
    if (!audio) return
    
    if (isPlaying) {
      audio.pause()
      isPlayingRef.current = false
      registerListener('close')
      return
    }
    
    setError(null)
    setIsLoading(true)
    
    const isIOS = isIOSRef.current
    console.log('[PLAY] iOS:', isIOS, 'Fallback:', fallbackModeRef.current)
    
    if (isIOS) {
      console.log('[PLAY] iOS - using FALLBACK mode')
      fallbackModeRef.current = true
    }
    
    timeoutRef.current = setTimeout(() => {
      if (isLoading && !isPlaying) {
        setError('Таймаут загрузки')
        setIsLoading(false)
        setBuffering(false)
        audio.pause()
      }
    }, LOAD_TIMEOUT)
    
    try {
      audio.volume = isMuted ? 0 : volume / 100
      
      if (!audio.src || audio.src !== STREAM_URL) {
        audio.src = STREAM_URL
        audio.load()
      }
      
      if (!fallbackModeRef.current) {
        const ctx = getAudioContext()
        if (ctx) {
          if (ctx.state === 'suspended') await ctx.resume()
          
          const chainConnected = connectAudioChain()
          
          if (chainConnected) {
            console.log('[PLAY] WebAudio цепь создана')
            
            setTimeout(() => {
              if (!realModeCheckRef.current && !fallbackModeRef.current) {
                const analyser = analyserRef.current
                if (analyser) {
                  const dataArray = new Uint8Array(analyser.frequencyBinCount)
                  analyser.getByteFrequencyData(dataArray)
                  
                  let hasData = false
                  for (let i = 0; i < dataArray.length; i++) {
                    if (dataArray[i] > 10) {
                      hasData = true
                      break
                    }
                  }
                  
                  if (hasData) {
                    realModeCheckRef.current = true
                  }
                }
              }
            }, REAL_MODE_CHECK_DELAY)
          } else {
            fallbackModeRef.current = true
          }
        } else {
          fallbackModeRef.current = true
        }
      }
      
      await audio.play()
      isPlayingRef.current = true
      
    } catch (err: any) {
      console.error('[PLAY] Error:', err.name, err.message)
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      setIsLoading(false)
      
      let errorMsg = 'Ошибка воспроизведения'
      if (err.name === 'NotAllowedError') errorMsg = 'Нажмите кнопку ещё раз'
      else if (err.name === 'NotSupportedError') errorMsg = 'Формат не поддерживается'
      else if (err.name === 'AbortError') errorMsg = 'Воспроизведение прервано'
      
      setError(errorMsg)
      
      if (isIOS && !fallbackModeRef.current) {
        fallbackModeRef.current = true
      }
    }
  }

  // =====================================================
  // RENDER
  // =====================================================
  const isIOSDevice = isIOSRef.current
  const isFallbackActive = fallbackModeRef.current

  return (
    <>
      {/* Глобальные стили */}
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
        /* Слайдеры эквалайзера с цветами частот */
        .eq-slider-bass {
          -webkit-appearance: none;
          height: 6px;
          border-radius: 5px;
          background: linear-gradient(90deg, #330015 0%, ${COLORS.bass} 50%, #330015 100%);
        }
        .eq-slider-bass::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 2px solid ${COLORS.bass};
          cursor: pointer;
          box-shadow: 0 0 8px ${COLORS.bass}66;
        }
        .eq-slider-bass::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 2px solid ${COLORS.bass};
          box-shadow: 0 0 8px ${COLORS.bass}66;
        }
        .eq-slider-mid {
          -webkit-appearance: none;
          height: 6px;
          border-radius: 5px;
          background: linear-gradient(90deg, #003315 0%, ${COLORS.mid} 50%, #003315 100%);
        }
        .eq-slider-mid::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 2px solid ${COLORS.mid};
          cursor: pointer;
          box-shadow: 0 0 8px ${COLORS.mid}66;
        }
        .eq-slider-mid::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 2px solid ${COLORS.mid};
          box-shadow: 0 0 8px ${COLORS.mid}66;
        }
        .eq-slider-treble {
          -webkit-appearance: none;
          height: 6px;
          border-radius: 5px;
          background: linear-gradient(90deg, #003330 0%, ${COLORS.high} 50%, #003330 100%);
        }
        .eq-slider-treble::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 2px solid ${COLORS.high};
          cursor: pointer;
          box-shadow: 0 0 8px ${COLORS.high}66;
        }
        .eq-slider-treble::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 2px solid ${COLORS.high};
          box-shadow: 0 0 8px ${COLORS.high}66;
        }
      `}</style>
      
      {/* Основной контейнер */}
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: `linear-gradient(180deg, ${COLORS.primary} 0%, ${COLORS.dark} 100%)` }}>
        {/* Декоративный фон */}
        <div className="fixed inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 80% 50% at 50% 30%, rgba(0,199,48,0.15) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 30% 60%, rgba(255,0,102,0.1) 0%, transparent 50%)` }} />
        
        <div className="relative z-10 w-full max-w-xs">
          
          {/* Логотип станции - с параллакс эффектом */}
          <motion.div
            animate={{
              y: showEq ? -180 : 0,
              opacity: showEq ? 0 : 1,
              scale: showEq ? 0.8 : 1
            }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            style={{ position: showEq ? 'absolute' : 'relative', width: '100%', pointerEvents: showEq ? 'none' : 'auto' }}
          >
            <motion.img
              src={STATION_LOGO}
              alt={STATION_NAME}
              className="mx-auto mb-3"
              style={{
                width: '150px',
                height: '150px',
                filter: isPlaying ? 'drop-shadow(0 0 30px rgba(0,199,48,0.6))' : 'drop-shadow(0 0 15px rgba(0,199,48,0.3))'
              }}
              animate={isPlaying ? { scale: [1, 1.03, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>
          
          {/* Визуализатор */}
          <motion.div
            animate={{ y: showEq ? -10 : 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="skeuo-card rounded-xl p-2 mb-3 relative"
          >
            {/* Индикатор LIVE */}
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
                    boxShadow: '0 0 15px rgba(0,199,48,0.8)'
                  }}
                >
                  LIVE
                </motion.div>
              )}
            </AnimatePresence>
            
            <canvas ref={canvasRef} width={280} height={60} className="w-full rounded" style={{ background: 'transparent' }} />
            
            {!isIOSDevice && (
              <div className="flex justify-between mt-1.5 px-1">
                <span className="text-xs font-medium" style={{ color: COLORS.bass }}>BASS</span>
                <span className="text-xs font-medium" style={{ color: COLORS.mid }}>MID</span>
                <span className="text-xs font-medium" style={{ color: COLORS.high }}>TREBLE</span>
              </div>
            )}
            
            {isIOSDevice && isPlaying && (
              <div className="text-xs text-center mt-1" style={{ color: COLORS.text, opacity: 0.7 }}>
                🎵 Визуализация
              </div>
            )}
          </motion.div>
          
          {/* Кнопка раскрытия эквалайзера - только для НЕ iOS */}
          {!isIOSDevice && !isFallbackActive && (
            <motion.div
              animate={{ y: showEq ? -15 : 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
              <button
                onClick={() => setShowEq(!showEq)}
                className="w-full flex items-center justify-center gap-1 py-1.5 mb-2 rounded-xl skeuo-card text-xs transition-all"
                style={{ color: COLORS.secondary }}
              >
                {showEq ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    Скрыть эквалайзер
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Раскрыть эквалайзер
                  </>
                )}
              </button>
            </motion.div>
          )}
          
          {/* Эквалайзер - только для НЕ iOS */}
          {!isIOSDevice && !isFallbackActive && (
            <AnimatePresence>
              {showEq && (
                <motion.div
                  initial={{ height: 0, opacity: 0, y: -20 }}
                  animate={{ height: 'auto', opacity: 1, y: 0 }}
                  exit={{ height: 0, opacity: 0, y: -20 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  className="skeuo-card rounded-xl p-3 mb-3 overflow-hidden"
                >
                  <div className="text-xs text-center mb-3 font-medium" style={{ color: COLORS.secondary }}>
                    Эквалайзер • настрой звук под себя
                  </div>
                  
                  {/* Bass slider */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs w-10 font-bold" style={{ color: COLORS.bass }}>Bass</span>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      value={eqBass}
                      onChange={(e) => setEqBass(parseInt(e.target.value, 10))}
                      className="eq-slider-bass flex-1 cursor-pointer"
                    />
                    <span className="text-xs w-6 text-right font-mono" style={{ color: COLORS.bass }}>
                      {eqBass > 0 ? '+' : ''}{eqBass}
                    </span>
                  </div>
                  
                  {/* Mid slider */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs w-10 font-bold" style={{ color: COLORS.mid }}>Mid</span>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      value={eqMid}
                      onChange={(e) => setEqMid(parseInt(e.target.value, 10))}
                      className="eq-slider-mid flex-1 cursor-pointer"
                    />
                    <span className="text-xs w-6 text-right font-mono" style={{ color: COLORS.mid }}>
                      {eqMid > 0 ? '+' : ''}{eqMid}
                    </span>
                  </div>
                  
                  {/* Treble slider */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-10 font-bold" style={{ color: COLORS.high }}>Treble</span>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      value={eqTreble}
                      onChange={(e) => setEqTreble(parseInt(e.target.value, 10))}
                      className="eq-slider-treble flex-1 cursor-pointer"
                    />
                    <span className="text-xs w-6 text-right font-mono" style={{ color: COLORS.high }}>
                      {eqTreble > 0 ? '+' : ''}{eqTreble}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
          
          {/* Уведомление о режиме совместимости */}
          {isFallbackActive && !isIOSDevice && (
            <div className="text-xs text-center mb-3 p-2 rounded-xl skeuo-card" style={{ color: COLORS.text }}>
              ⚠️ Режим совместимости: EQ недоступен
            </div>
          )}
          
          {/* Информация о станции */}
          <motion.div
            animate={{ y: showEq ? -15 : 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="skeuo-card rounded-xl p-2 text-center mb-3"
          >
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Radio className="w-3 h-3" style={{ color: COLORS.secondary }} />
              <span className="text-xs uppercase tracking-wider" style={{ color: COLORS.secondary }}>Онлайн-радио</span>
            </div>
            <h1 className="text-base font-bold text-white">{STATION_NAME}</h1>
            <p className="text-xs text-center" style={{ color: COLORS.secondary, marginTop: '4px' }}>Сейчас в эфире:</p>
            <p className="text-xs text-center" style={{ color: '#fff' }}>{currentTrack}</p>
            <p className="text-xs mt-0.5" style={{ color: COLORS.accent }}>
              👥 {listeners} {listeners === 1 ? 'слушатель' : 'слушателя'}
            </p>
          </motion.div>
          
          {/* Индикатор буферизации */}
          {buffering && (
            <motion.div
              animate={{ y: showEq ? -15 : 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="flex items-center justify-center gap-2 mb-2 p-1.5 rounded-xl skeuo-card"
            >
              <Wifi className="w-3 h-3 animate-pulse" style={{ color: COLORS.secondary }} />
              <span className="text-xs" style={{ color: COLORS.secondary }}>Буферизация...</span>
            </motion.div>
          )}
          
          {/* Сообщение об ошибке */}
          {error && (
            <motion.div
              animate={{ y: showEq ? -15 : 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="flex items-center justify-center gap-2 mb-2 p-1.5 rounded-xl"
              style={{ background: 'rgba(255,0,102,0.1)' }}
            >
              <AlertCircle className="w-3 h-3" style={{ color: COLORS.bass }} />
              <span className="text-xs" style={{ color: '#ff6699' }}>{error}</span>
            </motion.div>
          )}
          
          {/* Кнопка Play/Pause */}
          <motion.div
            animate={{ y: showEq ? -15 : 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="flex justify-center mb-3"
          >
            <motion.button
              onClick={handlePlay}
              disabled={isLoading && !buffering}
              whileTap={{ scale: 0.95 }}
              className="rounded-full flex items-center justify-center"
              style={{
                width: '56px',
                height: '56px',
                background: `linear-gradient(145deg, ${COLORS.accent}, ${COLORS.secondary})`,
                boxShadow: '0 4px 15px rgba(0,199,48,0.5)'
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
          </motion.div>
          
          {/* Регулятор громкости */}
          <motion.div
            animate={{ y: showEq ? -15 : 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          >
            {!isIOSDevice ? (
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
            ) : (
              <div className="text-xs text-center mb-3 p-2 rounded-xl skeuo-card" style={{ color: COLORS.text }}>
                🍎 Управляйте громкостью кнопками телефона
              </div>
            )}
          </motion.div>
          
          {/* Футер */}
          <motion.p
            animate={{ y: showEq ? -15 : 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="text-center text-xs mt-2"
            style={{ color: '#555' }}
          >
            Powered by <span style={{ color: COLORS.secondary }}>DJ GooD OFF</span>
          </motion.p>
        </div>
      </div>
    </>
  )
}
