'use client'

// =====================================================
// DJ GooD OFF FM - Telegram Mini App
// Радио-плеер с реальным эквалайзером и визуализатором
// AzuraCast API + Cover Art Fallback (Apple Music, Deezer)
// Telegram Theme Adaptation
// =====================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Play, Pause, Volume2, VolumeX, Loader2, ChevronDown, ChevronUp, Share2, ExternalLink, Palette, Sun, Moon, Sliders } from 'lucide-react'

// =====================================================
// КОНСТАНТЫ
// =====================================================
const AZURACAST_URL = 'https://stream.volfrings.ru'
const STATION_SHORTCODE = 'djgoodofffm'
const STREAM_URL = `${AZURACAST_URL}/listen/${STATION_SHORTCODE}/radio.mp3` // Прямой HTTPS поток
const API_URL = '/api/now-playing'
const STATION_NAME = 'DJ GooD OFF FM'
const STATION_LOGO = '/logo.png'
const COVER_API = '/api/cover'
const HEARTBEAT_INTERVAL = 30000
const LOAD_TIMEOUT = 30000
const REAL_MODE_CHECK_FRAMES = 10
const REAL_MODE_CHECK_DELAY = 500

// =====================================================
// ТЕМЫ
// =====================================================
type ThemeName = 'dark' | 'light' | 'custom'

// Цветовые схемы с улучшенным контрастом и визуальной гармонией
const THEMES: Record<ThemeName, { name: string; colors: ThemeColors }> = {
  dark: {
    name: 'Тёмная',
    colors: {
      bg: '#0a0a12',           // Глубокий тёмно-синий
      text: '#f0f0f0',         // Чистый белый с мягкостью
      textMuted: '#b8b8c8',    // Светло-серый с лёгким синим оттенком
      primary: '#14142a',      // Тёмно-синий для карточек
      secondary: '#00e640',    // Яркий неоновый зелёный
      accent: '#00ff55',       // Яркий акцент
      cardBg: 'rgba(20, 20, 42, 0.95)',
      border: 'rgba(0, 230, 64, 0.4)',
    }
  },
  light: {
    name: 'Светлая',
    colors: {
      bg: '#fafafa',           // Чистый светлый фон
      text: '#1a1a2e',         // Тёмно-синий текст
      textMuted: '#4a4a5e',    // Приглушённый тёмный
      primary: '#ffffff',      // Белый для карточек
      secondary: '#00b82e',    // Насыщенный зелёный
      accent: '#00d935',       // Яркий зелёный акцент
      cardBg: 'rgba(255, 255, 255, 0.98)',
      border: 'rgba(0, 184, 46, 0.35)',
    }
  },
  custom: {
    name: 'Кастомная',
    colors: {
      bg: '#28005a',          // Глубокий фиолетовый
      text: '#ffffff',         // Чистый белый
      textMuted: '#d4c8e8',    // Светло-лавандовый - читаемый на фиолетовом
      primary: '#3d1a6e',      // Фиолетовый для карточек
      secondary: '#00e633',    // Ядовито-зелёный (неоновый)
      accent: '#00ff44',       // Яркий акцент
      cardBg: 'rgba(61, 26, 110, 0.85)',
      border: 'rgba(0, 230, 51, 0.5)',
    }
  },
}

const DEFAULT_COLORS = THEMES.dark.colors

const ADMIN_USER_ID = 55068554

// =====================================================
// ТИПЫ
// =====================================================
interface ThemeColors {
  bg: string
  text: string
  textMuted: string
  primary: string
  secondary: string
  accent: string
  cardBg: string
  border: string
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
        openLink: (url: string) => void
        openTelegramLink: (url: string) => void
        MainButton: {
          text: string
          show: () => void
          hide: () => void
          onClick: (callback: () => void) => void
        }
        BackButton: {
          show: () => void
          hide: () => void
          onClick: (callback: () => void) => void
        }
        themeParams: {
          bg_color?: string
          text_color?: string
          hint_color?: string
          link_color?: string
          button_color?: string
          button_text_color?: string
          secondary_bg_color?: string
        }
        colorScheme: 'light' | 'dark'
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

// Determine if a color is light or dark
function isLightColor(color: string): boolean {
  const hex = color.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128
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
  const [displayTrack, setDisplayTrack] = useState('Загрузка...') // То что показываем (синхронизировано с обложкой)
  const [artist, setArtist] = useState('')
  const [title, setTitle] = useState('')
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [isLoadingCover, setIsLoadingCover] = useState(false)
  const [listeners, setListeners] = useState(0)
  const [uniqueListeners, setUniqueListeners] = useState(0)
  const [isOnline, setIsOnline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [buffering, setBuffering] = useState(false)
  const [eqBass, setEqBass] = useState(0)
  const [eqMid, setEqMid] = useState(0)
  const [eqTreble, setEqTreble] = useState(0)
  const [showEq, setShowEq] = useState(false)
  const [isTelegram, setIsTelegram] = useState(false)
  const [currentTheme, setCurrentTheme] = useState<ThemeName>('dark')
  const [showThemeSelector, setShowThemeSelector] = useState(false)
  const [themeColors, setThemeColors] = useState<ThemeColors>(DEFAULT_COLORS)

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
  const realModeCheckRef = useRef<boolean>(false)
  const fallbackModeRef = useRef<boolean>(false)
  const realModeCheckCountRef = useRef<number>(0)
  const isPlayingRef = useRef<boolean>(false)
  const coverCacheRef = useRef<Map<string, string>>(new Map())
  
  // Автопереподключение
  const shouldPlayRef = useRef<boolean>(false) // Пользователь хочет играть
  const userPausedRef = useRef<boolean>(false) // Пользователь явно нажал паузу
  const reconnectAttemptsRef = useRef<number>(0) // Количество попыток переподключения
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null) // Таймер переподключения
  const stallCheckRef = useRef<NodeJS.Timeout | null>(null) // Таймер проверки зависания
  const lastProgressRef = useRef<number>(0) // Последняя позиция воспроизведения
  const isInteractingWithSliderRef = useRef<boolean>(false) // Взаимодействие со слайдером

  const SMOOTHING_FACTOR = 0.25
  const MAX_RECONNECT_ATTEMPTS = 5
  const RECONNECT_DELAY = 2000 // 2 секунды
  const STALL_TIMEOUT = 30000 // 30 секунд без прогресса = зависание

  // Colors for visualizer (always vibrant)
  const vizColors = {
    bass: '#ff0066',
    mid: '#00c730',
    high: '#00ffcc',
  }

  // =====================================================
  // TELEGRAM INIT + MAIN BUTTON
  // =====================================================
  useEffect(() => {
    const initTelegramAndButton = () => {
      const tg = window.Telegram?.WebApp
      if (!tg) return false

      // Проверяем, что мы реально в Telegram Mini App (есть initData)
      // На обычном сайте SDK загружен, но initData пустой
      const isRealTelegram = !!tg.initData && tg.initData.length > 0

      if (!isRealTelegram) {
        console.log('[TELEGRAM] SDK loaded but not in Telegram Mini App (no initData)')
        return false
      }

      // Init Telegram WebApp
      tg.ready()
      tg.expand()
      setIsTelegram(true)

      // Detect iOS
      if (tg.platform === 'ios') {
        isIOSRef.current = true
      }

      // Setup MainButton
      if (tg.MainButton) {
        tg.MainButton.text = isPlaying ? '⏸ Пауза' : '▶ Играть'
        tg.MainButton.show()

        const handleClick = () => {
          handlePlay()
        }
        tg.MainButton.onClick(handleClick)

        console.log('[TELEGRAM] MainButton initialized')
      }

      return true
    }

    // Try immediately
    if (initTelegramAndButton()) return

    // Wait for Telegram SDK to load
    let attempts = 0
    const maxAttempts = 50 // 5 seconds
    const interval = setInterval(() => {
      attempts++
      if (initTelegramAndButton() || attempts >= maxAttempts) {
        clearInterval(interval)
        if (attempts >= maxAttempts) {
          console.log('[TELEGRAM] SDK not loaded after 5s - running as website')
        }
      }
    }, 100)

    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update MainButton text when playing state changes
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg?.MainButton) return

    tg.MainButton.text = isPlaying ? '⏸ Пауза' : '▶ Играть'
  }, [isPlaying, isLoading])

  // =====================================================
  // THEME MANAGEMENT
  // =====================================================
  const changeTheme = useCallback((theme: ThemeName) => {
    setCurrentTheme(theme)
    setThemeColors(THEMES[theme].colors)
    localStorage.setItem('radio_theme', theme)
  }, [])

  // Load saved theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('radio_theme') as ThemeName | null
    if (savedTheme && THEMES[savedTheme]) {
      changeTheme(savedTheme)
    }
  }, [changeTheme])

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
    
    // Smoothing
    for (let i = 0; i < 24; i++) {
      smoothedBarsRef.current[i] = smoothedBarsRef.current[i] + (barValues[i] - smoothedBarsRef.current[i]) * SMOOTHING_FACTOR
    }
    
    // Draw
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
        gradient.addColorStop(0, vizColors.bass)
        gradient.addColorStop(1, '#ff3399')
      } else if (section === 1) {
        gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, vizColors.mid)
        gradient.addColorStop(1, vizColors.high)
      } else {
        gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, vizColors.high)
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
    if (!canvas || !ctx) return
    
    const animate = () => {
      if (!isPlayingRef.current) {
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
          gradient.addColorStop(0, vizColors.bass)
          gradient.addColorStop(1, '#ff3399')
        } else if (section === 1) {
          gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
          gradient.addColorStop(0, vizColors.mid)
          gradient.addColorStop(1, vizColors.high)
        } else {
          gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
          gradient.addColorStop(0, vizColors.high)
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
      console.log('[AUDIO] Аудио-цепь подключена')
      return true
    } catch (e) {
      console.error('[AUDIO] Ошибка подключения аудио-цепи:', e)
      return false
    }
  }, [getAudioContext, eqBass, eqMid, eqTreble])

  // =====================================================
  // АВТОПЕРЕПОДКЛЮЧЕНИЕ
  // =====================================================
  const attemptReconnect = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !shouldPlayRef.current) {
      console.log('[RECONNECT] Skip - shouldPlay is false')
      return
    }

    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[RECONNECT] Max attempts reached')
      setError('Потеряно соединение. Нажмите "Играть" для переподключения.')
      shouldPlayRef.current = false
      setIsPlaying(false)
      setIsLoading(false)
      reconnectAttemptsRef.current = 0
      return
    }

    reconnectAttemptsRef.current++
    console.log(`[RECONNECT] Attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`)

    setIsLoading(true)
    setBuffering(true)

    // Очищаем предыдущий источник
    audio.pause()
    audio.src = ''
    audio.load()

    // Переподключаемся через задержку
    reconnectTimeoutRef.current = setTimeout(async () => {
      if (!shouldPlayRef.current) return

      try {
        audio.volume = isMuted ? 0 : volume / 100
        audio.src = STREAM_URL
        audio.load()
        await audio.play()
        console.log('[RECONNECT] Success!')
        reconnectAttemptsRef.current = 0
        setError(null)
      } catch (err: any) {
        console.error('[RECONNECT] Failed:', err.message)
        // Попробуем ещё раз
        attemptReconnect()
      }
    }, RECONNECT_DELAY)
  }, [isMuted, volume])

  // Сброс таймера проверки зависания
  const resetStallCheck = useCallback(() => {
    if (stallCheckRef.current) {
      clearTimeout(stallCheckRef.current)
      stallCheckRef.current = null
    }
  }, [])

  // Запуск таймера проверки зависания
  const startStallCheck = useCallback(() => {
    resetStallCheck()

    stallCheckRef.current = setTimeout(() => {
      const audio = audioRef.current
      if (!audio || !shouldPlayRef.current) return

      // Проверяем, есть ли прогресс воспроизведения
      const timeSinceLastProgress = Date.now() - lastProgressRef.current
      console.log(`[STALL-CHECK] Time since last progress: ${timeSinceLastProgress}ms`)

      // Если давно не было прогресса И аудио на паузе - переподключаемся
      if (audio.paused && shouldPlayRef.current && timeSinceLastProgress > STALL_TIMEOUT) {
        console.log('[STALL-CHECK] Audio paused unexpectedly, reconnecting...')
        attemptReconnect()
      }
    }, STALL_TIMEOUT)
  }, [resetStallCheck, attemptReconnect])

  // =====================================================
  // ИНИЦИАЛИЗАЦИЯ АУДИО
  // =====================================================
  useEffect(() => {
    isIOSRef.current = detectIOS()

    const audio = new Audio()
    audio.preload = 'none'
    audio.crossOrigin = 'anonymous'
    audio.setAttribute('playsinline', 'true')
    audio.setAttribute('webkit-playsinline', 'true')
    audioRef.current = audio

    const onPlaying = () => {
      console.log('[AUDIO] Playing event')
      setIsPlaying(true)
      isPlayingRef.current = true
      setIsLoading(false)
      setBuffering(false)
      setError(null)
      reconnectAttemptsRef.current = 0 // Сбрасываем счётчик попыток
      lastProgressRef.current = Date.now()
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      startVisualization()
      startStallCheck()
    }

    const onPause = () => {
      // Если пользователь хочет играть и не нажимал паузу - это системная пауза
      // Пытаемся восстановить воспроизведение
      if (shouldPlayRef.current && !userPausedRef.current) {
        console.log('[AUDIO] Unexpected pause while shouldPlay=true, resuming...')
        setTimeout(() => {
          if (audioRef.current && shouldPlayRef.current && !userPausedRef.current) {
            audioRef.current.play().catch((e) => console.log('[AUDIO] Resume failed:', e.message))
          }
        }, 50)
        return
      }
      console.log('[AUDIO] Pause event, userPaused:', userPausedRef.current)
      setIsPlaying(false)
      isPlayingRef.current = false
      stopVisualization()
      resetStallCheck()
    }

    const onWaiting = () => {
      console.log('[AUDIO] Waiting/buffering')
      setBuffering(true)
      setIsLoading(true)
    }

    const onCanPlay = () => {
      console.log('[AUDIO] Can play')
      setBuffering(false)
      setIsLoading(false)
    }

    const onStalled = () => {
      console.log('[AUDIO] Stalled - network issue')
      setBuffering(true)
    }

    const onSuspend = () => {
      console.log('[AUDIO] Suspended')
      setBuffering(true)
    }

    const onEmptied = () => {
      console.log('[AUDIO] Emptied - source lost')
    }

    const onError = () => {
      const mediaError = audio.error
      console.error('[AUDIO] Error:', mediaError ? getAudioErrorMessage(mediaError) : 'Unknown')

      let errorMsg = 'Ошибка воспроизведения'
      let shouldReconnect = false

      if (mediaError) {
        switch (mediaError.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMsg = 'Воспроизведение отменено'
            break
          case MediaError.MEDIA_ERR_NETWORK:
            errorMsg = 'Ошибка сети, переподключение...'
            shouldReconnect = true
            break
          case MediaError.MEDIA_ERR_DECODE:
            errorMsg = 'Ошибка декодирования'
            // Не переподключаемся при decode ошибке - это может быть проблема с форматом
            break
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMsg = 'Формат не поддерживается'
            break
        }
      }

      setIsLoading(false)
      setIsPlaying(false)
      setBuffering(false)
      setError(errorMsg)
      stopVisualization()
      resetStallCheck()
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }

      // Автопереподключение ТОЛЬКО при сетевых ошибках
      if (shouldReconnect && shouldPlayRef.current) {
        attemptReconnect()
      }
    }

    // Обработка прогресса для обнаружения зависаний
    const onProgress = () => {
      lastProgressRef.current = Date.now()
    }

    const onTimeUpdate = () => {
      lastProgressRef.current = Date.now()
      // Продлеваем stall check
      if (shouldPlayRef.current) {
        startStallCheck()
      }
    }

    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('stalled', onStalled)
    audio.addEventListener('suspend', onSuspend)
    audio.addEventListener('emptied', onEmptied)
    audio.addEventListener('error', onError)
    audio.addEventListener('progress', onProgress)
    audio.addEventListener('timeupdate', onTimeUpdate)

    const onVisibilityChange = async () => {
      const ctx = audioContextRef.current
      if (document.visibilityState === 'visible' && ctx && ctx.state === 'suspended') {
        try { await ctx.resume() } catch (e) { console.error('[AUDIO] Resume error:', e) }
      }

      // При возврате на вкладку проверяем состояние
      if (document.visibilityState === 'visible' && shouldPlayRef.current && audio.paused) {
        console.log('[VISIBILITY] Returning to tab, audio paused - reconnecting...')
        attemptReconnect()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('stalled', onStalled)
      audio.removeEventListener('suspend', onSuspend)
      audio.removeEventListener('emptied', onEmptied)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('progress', onProgress)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      document.removeEventListener('visibilitychange', onVisibilityChange)

      // Очищаем все таймеры
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current)
      if (stallCheckRef.current) clearTimeout(stallCheckRef.current)

      audio.pause()
      audio.src = ''
      stopVisualization()
    }
  }, [stopVisualization, startVisualization, attemptReconnect, startStallCheck, resetStallCheck])

  // =====================================================
  // VOLUME
  // =====================================================
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100
    }
  }, [volume, isMuted])

  // =====================================================
  // EQ UPDATES
  // =====================================================
  useEffect(() => {
    if (bassFilterRef.current) bassFilterRef.current.gain.value = eqBass
  }, [eqBass])
  
  useEffect(() => {
    if (midFilterRef.current) midFilterRef.current.gain.value = eqMid
  }, [eqMid])
  
  useEffect(() => {
    if (trebleFilterRef.current) trebleFilterRef.current.gain.value = eqTreble
  }, [eqTreble])

  // =====================================================
  // FETCH COVER - с синхронизацией названия
  // =====================================================
  const fetchCover = useCallback(async (artistName: string, trackTitle: string, fullTitle: string, azuracastArt: string | null) => {
    const cacheKey = `${artistName}-${trackTitle}`
    
    if (coverCacheRef.current.has(cacheKey)) {
      const cachedCover = coverCacheRef.current.get(cacheKey)!
      setCoverUrl(cachedCover)
      setDisplayTrack(fullTitle) // Синхронно обновляем название
      return
    }
    
    setIsLoadingCover(true)
    
    try {
      const response = await fetch(`${COVER_API}?artist=${encodeURIComponent(artistName)}&title=${encodeURIComponent(trackTitle)}&azuracast_art=${encodeURIComponent(azuracastArt || '')}`)
      
      if (response.ok) {
        const data = await response.json()
        if (data.cover) {
          coverCacheRef.current.set(cacheKey, data.cover)
          setCoverUrl(data.cover)
        } else {
          setCoverUrl(null)
        }
        // Обновляем название ТОЛЬКО после загрузки обложки
        setDisplayTrack(fullTitle)
      } else {
        setCoverUrl(null)
        setDisplayTrack(fullTitle)
      }
    } catch (e) {
      console.error('[COVER] Fetch error:', e)
      setCoverUrl(null)
      setDisplayTrack(fullTitle)
    }
    
    setIsLoadingCover(false)
  }, [])

  // =====================================================
  // FETCH TRACK INFO
  // =====================================================
  const fetchTrackInfo = useCallback(async () => {
    try {
      const response = await fetch(API_URL, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })
      
      if (response.ok) {
        const data = await response.json()
        
        setIsOnline(data.is_online ?? true)
        // НЕ берём listeners из AzuraCast - используем только Worker
        
        if (data.artist || data.track_title) {
          const artistName = data.artist || ''
          const trackTitle = data.track_title || ''
          const fullTitle = data.title || `${artistName} - ${trackTitle}`
          
          // Обновляем внутреннее состояние
          setCurrentTrack(fullTitle)
          setArtist(artistName)
          setTitle(trackTitle)
          
          // Загружаем обложку и синхронизируем с названием
          fetchCover(artistName, trackTitle, fullTitle, data.art || null)
        }
      }
    } catch (err) {
      console.error('Failed to fetch track info:', err)
    }
  }, [fetchCover])

  useEffect(() => {
    fetchTrackInfo()
    const interval = setInterval(fetchTrackInfo, 10000)
    return () => clearInterval(interval)
  }, [fetchTrackInfo])

  // =====================================================
  // LISTENER TRACKING - ТОЛЬКО ДЛЯ TELEGRAM USERS
  // =====================================================
  const registerListener = useCallback(async (action: 'open' | 'close' | 'heartbeat') => {
    const tg = window.Telegram?.WebApp
    const user = tg?.initDataUnsafe?.user
    
    // Регистрируем ТОЛЬКО Telegram пользователей, не гостей
    if (!user) {
      console.log('[LISTENER] Skip registration - not a Telegram user')
      return
    }
    
    const userId = user.id
    const firstName = user.first_name
    
    try {
      await fetch('/api/listener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          first_name: firstName,
          last_name: user.last_name || null,
          username: user.username || null,
          action,
          isAdmin: user.id === ADMIN_USER_ID,
          isTelegram: true, // Помечаем как Telegram пользователя
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
      const res = await fetch('/api/listener')
      if (res.ok) {
        const data = await res.json()
        setUniqueListeners(data.total || 0)
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
  // CLOSE ON UNLOAD - ТОЛЬКО ДЛЯ TELEGRAM USERS
  // =====================================================
  useEffect(() => {
    const sendClose = () => {
      const tg = window.Telegram?.WebApp
      const user = tg?.initDataUnsafe?.user

      // Отправляем close только для Telegram пользователей
      if (!user) return

      navigator.sendBeacon('/api/listener', new Blob([JSON.stringify({
        user_id: user.id,
        first_name: user.first_name,
        last_name: user.last_name || null,
        username: user.username || null,
        action: 'close',
        isAdmin: user.id === ADMIN_USER_ID,
        isTelegram: true,
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
      // Пользователь нажал паузу - останавливаем автопереподключение
      shouldPlayRef.current = false
      userPausedRef.current = true // Пользователь явно нажал паузу
      reconnectAttemptsRef.current = 0
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      resetStallCheck()

      audio.pause()
      isPlayingRef.current = false
      registerListener('close')
      return
    }

    // Пользователь хочет играть
    userPausedRef.current = false // Сбрасываем флаг явной паузы
    shouldPlayRef.current = true
    setError(null)
    setIsLoading(true)

    const isIOS = isIOSRef.current

    if (isIOS) {
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
          connectAudioChain()
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
  // SHARE IN TELEGRAM
  // =====================================================
  const shareInTelegram = () => {
    const text = `🎵 Слушаю ${STATION_NAME}!\n\nСейчас играет: ${currentTrack}\n\n🎧 Присоединяйся:`
    const shareUrl = 'https://t.me/RadioGoodOFF_bot?startapp=play'

    if (isTelegram && window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`
      )
    } else {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`, '_blank')
    }
  }

  // =====================================================
  // OPEN IN PLAYER
  // =====================================================
  const openInPlayer = () => {
    if (isTelegram && window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(STREAM_URL)
    } else {
      window.open(STREAM_URL, '_blank')
    }
  }

  // =====================================================
  // RENDER
  // =====================================================

  // Цвет названия трека - ядовито-зелёный в кастомной теме
  const trackTitleColor = currentTheme === 'custom' ? '#06c633' : themeColors.secondary

  // Длина названия трека для бегущей строки
  const TRACK_MAX_LENGTH = 40
  const shouldMarquee = displayTrack.length > TRACK_MAX_LENGTH

  return (
    <div
      className="h-screen flex flex-col items-center justify-between overflow-hidden tma-container relative"
      style={{ backgroundColor: themeColors.bg }}
    >
      {/* Theme Button - Top Left Corner */}
      <div className="absolute top-2 left-2 z-10">
        <button
          onClick={() => setShowThemeSelector(!showThemeSelector)}
          className="p-2 rounded-full transition-all"
          style={{
            backgroundColor: themeColors.cardBg,
            color: themeColors.text,
            border: `1px solid ${themeColors.border}`,
          }}
          title="Выбор темы"
        >
          <Palette className="w-5 h-5" />
        </button>

        {/* Theme Selector Dropdown */}
        {showThemeSelector && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-12 left-0 p-2 rounded-lg grid grid-cols-1 gap-1 min-w-[130px]"
            style={{
              backgroundColor: themeColors.cardBg,
              border: `1px solid ${themeColors.border}`,
            }}
          >
            {(Object.keys(THEMES) as ThemeName[]).map((theme) => (
              <button
                key={theme}
                onClick={() => { changeTheme(theme); setShowThemeSelector(false) }}
                className={`py-2 px-3 rounded text-sm font-medium transition-all w-full whitespace-nowrap ${currentTheme === theme ? 'ring-2' : ''}`}
                style={{
                  backgroundColor: currentTheme === theme ? THEMES[theme].colors.secondary : THEMES[theme].colors.primary,
                  color: currentTheme === theme ? '#000' : THEMES[theme].colors.text,
                  border: `1px solid ${THEMES[theme].colors.secondary}`,
                }}
              >
                {THEMES[theme].name}
              </button>
            ))}
          </motion.div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full px-4 pt-1 pb-2">

        {/* Cover Art - увеличенный размер */}
        <motion.div
          className="w-52 h-52 rounded-2xl overflow-hidden relative shadow-xl"
          animate={isPlaying ? { scale: [1, 1.02, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{
            boxShadow: isPlaying
              ? `0 0 20px ${themeColors.secondary}40`
              : '0 4px 15px rgba(0,0,0,0.3)',
            border: `2px solid ${themeColors.secondary}`,
            backgroundColor: themeColors.primary,
          }}
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={title || 'Track cover'}
              className="w-full h-full object-cover"
              onError={() => setCoverUrl(null)}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center p-4"
              style={{ backgroundColor: themeColors.primary }}
            >
              <img
                src={STATION_LOGO}
                alt={STATION_NAME}
                className="w-full h-full object-contain opacity-90"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            </div>
          )}
          {isLoadingCover && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            </div>
          )}
        </motion.div>

        {/* Track Info - "Сейчас в эфире:" + название */}
        <div className="mt-4 w-full text-center">
          <p className="text-xs" style={{ color: themeColors.textMuted }}>
            Сейчас в эфире:
          </p>
          <div className="track-marquee-container mt-1 px-2">
            {shouldMarquee ? (
              <div className="inline-flex">
                <span
                  className="track-marquee text-sm font-bold"
                  style={{ color: trackTitleColor, minWidth: '100%' }}
                >
                  {displayTrack}&nbsp;&nbsp;&nbsp;&nbsp;{displayTrack}&nbsp;&nbsp;&nbsp;&nbsp;
                </span>
              </div>
            ) : (
              <span
                className="text-sm font-bold"
                style={{ color: trackTitleColor }}
              >
                {displayTrack}
              </span>
            )}
          </div>
        </div>

        {/* Visualizer */}
        <div className="mt-3 h-16 w-full max-w-sm">
          <canvas
            ref={canvasRef}
            width={320}
            height={64}
            className="w-full h-full"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div
            className="mt-2 px-3 py-1 rounded text-xs text-center"
            style={{ backgroundColor: 'rgba(255,0,0,0.1)', color: '#ff6666' }}
          >
            {error}
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !isPlaying && (
          <div className="mt-2">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: themeColors.secondary }} />
          </div>
        )}

        {/* Play Button - ONLY on website (not in Telegram) */}
        {!isTelegram && (
          <motion.button
            onClick={handlePlay}
            className="mt-4 w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              backgroundColor: isPlaying ? themeColors.cardBg : themeColors.secondary,
              border: `2px solid ${themeColors.secondary}`,
              boxShadow: isPlaying
                ? `0 0 15px ${themeColors.secondary}60`
                : `0 4px 20px ${themeColors.secondary}40`,
            }}
          >
            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: isPlaying ? themeColors.secondary : themeColors.bg }} />
            ) : isPlaying ? (
              <Pause className="w-8 h-8" style={{ color: themeColors.secondary }} />
            ) : (
              <Play className="w-8 h-8 ml-1" style={{ color: themeColors.bg }} />
            )}
          </motion.button>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="w-full px-4 pb-2">
        {/* Volume Control */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded-full hover:bg-white/10"
            style={{ color: themeColors.textMuted }}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volume}
            onChange={(e) => { e.stopPropagation(); setVolume(Number(e.target.value)); setIsMuted(false) }}
            onMouseDown={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = true }}
            onMouseUp={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = false }}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = true }}
            onTouchEnd={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = false }}
            onTouchMove={(e) => e.stopPropagation()}
            className="volume-slider flex-1 h-1"
            style={{
              background: `linear-gradient(90deg, ${themeColors.secondary} ${isMuted ? 0 : volume}%, ${themeColors.primary} ${isMuted ? 0 : volume}%)`,
            }}
          />
        </div>

        {/* Stats */}
        <div className="flex justify-between items-center text-xs" style={{ color: themeColors.textMuted }}>
          <span>🎧 {uniqueListeners} слушателей</span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowEq(!showEq)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              style={{ color: themeColors.textMuted }}
              title="Эквалайзер"
            >
              <Sliders className="w-4 h-4" />
            </button>
            <button
              onClick={shareInTelegram}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              style={{ color: themeColors.textMuted }}
              title="Поделиться"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Equalizer - выпадающее */}
        {showEq && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="mt-2 p-3 rounded-lg"
            style={{ backgroundColor: themeColors.cardBg, border: `1px solid ${themeColors.border}` }}
          >
            {/* Bass */}
            <div className="mb-2">
              <div className="flex justify-between text-xs mb-0.5" style={{ color: vizColors.bass }}>
                <span>Bass</span>
                <span>{eqBass > 0 ? '+' : ''}{eqBass}dB</span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                value={eqBass}
                onChange={(e) => { e.stopPropagation(); setEqBass(Number(e.target.value)) }}
                onMouseDown={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = true }}
                onMouseUp={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = false }}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = true }}
                onTouchEnd={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = false }}
                onTouchMove={(e) => e.stopPropagation()}
                className="eq-slider-bass w-full"
              />
            </div>
            {/* Mid */}
            <div className="mb-2">
              <div className="flex justify-between text-xs mb-0.5" style={{ color: vizColors.mid }}>
                <span>Mid</span>
                <span>{eqMid > 0 ? '+' : ''}{eqMid}dB</span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                value={eqMid}
                onChange={(e) => { e.stopPropagation(); setEqMid(Number(e.target.value)) }}
                onMouseDown={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = true }}
                onMouseUp={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = false }}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = true }}
                onTouchEnd={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = false }}
                onTouchMove={(e) => e.stopPropagation()}
                className="eq-slider-mid w-full"
              />
            </div>
            {/* Treble */}
            <div>
              <div className="flex justify-between text-xs mb-0.5" style={{ color: vizColors.high }}>
                <span>Treble</span>
                <span>{eqTreble > 0 ? '+' : ''}{eqTreble}dB</span>
              </div>
              <input
                type="range"
                min="-12"
                max="12"
                value={eqTreble}
                onChange={(e) => { e.stopPropagation(); setEqTreble(Number(e.target.value)) }}
                onMouseDown={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = true }}
                onMouseUp={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = false }}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = true }}
                onTouchEnd={(e) => { e.stopPropagation(); isInteractingWithSliderRef.current = false }}
                onTouchMove={(e) => e.stopPropagation()}
                className="eq-slider-treble w-full"
              />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
