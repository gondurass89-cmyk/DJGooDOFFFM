'use client'

// =====================================================
// DJ GooD OFF FM - Telegram Mini App
// Радио-плеер с реальным эквалайзером и визуализатором
// AzuraCast API + Cover Art Fallback (Apple Music, Deezer)
// Telegram Theme Adaptation
// =====================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Play, Pause, Volume2, VolumeX, Loader2, ChevronDown, ChevronUp, Share2, ExternalLink, Palette, Sun, Moon } from 'lucide-react'

// =====================================================
// КОНСТАНТЫ
// =====================================================
const AZURACAST_URL = 'http://178.49.69.37'
const STATION_SHORTCODE = 'dj_good_off_fm'
const STREAM_URL = '/api/stream'
const API_URL = '/api/now-playing'
const DIRECT_STREAM_URL = `${AZURACAST_URL}/listen/${STATION_SHORTCODE}/radio.mp3`
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

const THEMES: Record<ThemeName, { name: string; colors: ThemeColors }> = {
  dark: {
    name: 'Тёмная',
    colors: {
      bg: '#0d0d1a',
      text: '#ffffff',
      textMuted: '#a0a0a0',
      primary: '#1a1a2e',
      secondary: '#00c730',
      accent: '#00ff40',
      cardBg: 'rgba(30, 30, 50, 0.8)',
      border: 'rgba(0, 199, 48, 0.3)',
    }
  },
  light: {
    name: 'Светлая',
    colors: {
      bg: '#f5f5f5',
      text: '#1a1a1a',
      textMuted: '#666666',
      primary: '#ffffff',
      secondary: '#00a828',
      accent: '#00c730',
      cardBg: 'rgba(255, 255, 255, 0.9)',
      border: 'rgba(0, 168, 40, 0.3)',
    }
  },
  custom: {
    name: 'Кастомная',
    colors: {
      bg: '#1a0a2e',
      text: '#e0c0ff',
      textMuted: '#a080c0',
      primary: '#2e0071',
      secondary: '#c000ff',
      accent: '#ff00ff',
      cardBg: 'rgba(46, 0, 113, 0.6)',
      border: 'rgba(192, 0, 255, 0.3)',
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
  
  const SMOOTHING_FACTOR = 0.25

  // Colors for visualizer (always vibrant)
  const vizColors = {
    bass: '#ff0066',
    mid: '#00c730',
    high: '#00ffcc',
  }

  // =====================================================
  // TELEGRAM MAIN BUTTON
  // =====================================================
  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (!tg?.MainButton) return
    
    // Set initial button text
    tg.MainButton.text = isPlaying ? '⏸ Пауза' : '▶ Играть'
    tg.MainButton.show()
    
    // Set up click handler
    const handleMainButtonClick = () => {
      handlePlay()
    }
    tg.MainButton.onClick(handleMainButtonClick)
    
    return () => {
      tg.MainButton.hide()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  
  // Update button text when playing state changes
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
  // TELEGRAM INIT
  // =====================================================
  useEffect(() => {
    const initTelegram = () => {
      const tg = window.Telegram?.WebApp
      if (tg) {
        tg.ready()
        tg.expand()
        setIsTelegram(true)
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
      setIsPlaying(true)
      isPlayingRef.current = true
      setIsLoading(false)
      setBuffering(false)
      setError(null)
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      startVisualization()
    }
    
    const onPause = () => {
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
    
    const onError = () => {
      const mediaError = audio.error
      console.error('[AUDIO] Error:', mediaError ? getAudioErrorMessage(mediaError) : 'Unknown')
      
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
  // FETCH COVER
  // =====================================================
  const fetchCover = useCallback(async (artistName: string, trackTitle: string, azuracastArt: string | null) => {
    const cacheKey = `${artistName}-${trackTitle}`
    
    if (coverCacheRef.current.has(cacheKey)) {
      setCoverUrl(coverCacheRef.current.get(cacheKey)!)
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
      } else {
        setCoverUrl(null)
      }
    } catch (e) {
      console.error('[COVER] Fetch error:', e)
      setCoverUrl(null)
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
        setListeners(data.listeners || 0)
        setUniqueListeners(data.unique_listeners || 0)
        
        if (data.artist || data.track_title) {
          const artistName = data.artist || ''
          const trackTitle = data.track_title || ''
          const fullTitle = data.title || `${artistName} - ${trackTitle}`
          
          setCurrentTrack(fullTitle)
          setArtist(artistName)
          setTitle(trackTitle)
          
          fetchCover(artistName, trackTitle, data.art || null)
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
      await fetch('/api/listener', {
        method: 'POST',
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
      const res = await fetch('/api/listener')
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

      navigator.sendBeacon('/api/listener', new Blob([JSON.stringify({
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
    const url = window.location.href
    
    if (isTelegram && window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
      )
    } else {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank')
    }
  }

  // =====================================================
  // OPEN IN PLAYER
  // =====================================================
  const openInPlayer = () => {
    if (isTelegram && window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(DIRECT_STREAM_URL)
    } else {
      window.open(DIRECT_STREAM_URL, '_blank')
    }
  }

  // =====================================================
  // RENDER
  // =====================================================
  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ backgroundColor: themeColors.bg }}
    >
      <div className="relative z-10 w-full max-w-xs">
        
        {/* Cover Art */}
        <motion.div
          animate={{
            y: showEq ? -180 : 0,
            opacity: showEq ? 0 : 1,
            scale: showEq ? 0.8 : 1
          }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          style={{ position: showEq ? 'absolute' : 'relative', width: '100%', pointerEvents: showEq ? 'none' : 'auto' }}
        >
          <motion.div 
            className="w-40 h-40 mx-auto rounded-2xl overflow-hidden relative shadow-2xl"
            animate={isPlaying ? { scale: [1, 1.02, 1] } : {}}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            style={{
              boxShadow: isPlaying 
                ? `0 0 30px ${themeColors.secondary}40, 0 10px 40px rgba(0,0,0,0.3)` 
                : '0 5px 20px rgba(0,0,0,0.3)',
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
                className="w-full h-full flex items-center justify-center"
                style={{ backgroundColor: themeColors.primary }}
              >
                <img 
                  src={STATION_LOGO} 
                  alt={STATION_NAME}
                  className="w-24 h-24 object-contain opacity-80"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              </div>
            )}
            
            {isLoadingCover && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Loader2 className="w-8 h-8 animate-spin text-white" />
              </div>
            )}
          </motion.div>
        </motion.div>

        {/* Track Info */}
        <div className="mt-6 text-center">
          <p 
            className="text-sm font-medium truncate px-2"
            style={{ color: themeColors.text }}
          >
            {currentTrack}
          </p>
          {artist && (
            <p 
              className="text-xs mt-1 truncate px-2"
              style={{ color: themeColors.textMuted }}
            >
              {artist}
            </p>
          )}
        </div>

        {/* Visualizer */}
        <div className="mt-4 h-16 w-full">
          <canvas 
            ref={canvasRef}
            width={280}
            height={64}
            className="w-full h-full"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div 
            className="mt-4 p-3 rounded-lg text-center text-sm"
            style={{ backgroundColor: 'rgba(255,0,0,0.1)', color: '#ff6666' }}
          >
            {error}
          </div>
        )}

        {/* Loading indicator - only show in Telegram mode when loading */}
        {isLoading && !isPlaying && isTelegram && (
          <div className="mt-6 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: themeColors.secondary }} />
          </div>
        )}

        {/* Volume Control */}
        <div className="mt-6 flex items-center gap-3 px-4">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            style={{ color: themeColors.textMuted }}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value))
              setIsMuted(false)
            }}
            className="volume-slider flex-1"
            style={{
              background: `linear-gradient(90deg, ${themeColors.secondary} ${isMuted ? 0 : volume}%, ${themeColors.primary} ${isMuted ? 0 : volume}%)`,
            }}
          />
        </div>

        {/* Equalizer Toggle */}
        <div className="mt-6">
          <button
            onClick={() => setShowEq(!showEq)}
            className="flex items-center justify-center gap-2 w-full py-2 text-sm transition-colors"
            style={{ color: themeColors.textMuted }}
          >
            <span>Эквалайзер</span>
            {showEq ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showEq && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-3 p-4 rounded-xl"
              style={{ backgroundColor: themeColors.cardBg, border: `1px solid ${themeColors.border}` }}
            >
              {/* Bass */}
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1" style={{ color: vizColors.bass }}>
                  <span>Bass</span>
                  <span>{eqBass > 0 ? '+' : ''}{eqBass}dB</span>
                </div>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  value={eqBass}
                  onChange={(e) => setEqBass(Number(e.target.value))}
                  className="eq-slider-bass w-full"
                />
              </div>
              
              {/* Mid */}
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1" style={{ color: vizColors.mid }}>
                  <span>Mid</span>
                  <span>{eqMid > 0 ? '+' : ''}{eqMid}dB</span>
                </div>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  value={eqMid}
                  onChange={(e) => setEqMid(Number(e.target.value))}
                  className="eq-slider-mid w-full"
                />
              </div>
              
              {/* Treble */}
              <div>
                <div className="flex justify-between text-xs mb-1" style={{ color: vizColors.high }}>
                  <span>Treble</span>
                  <span>{eqTreble > 0 ? '+' : ''}{eqTreble}dB</span>
                </div>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  value={eqTreble}
                  onChange={(e) => setEqTreble(Number(e.target.value))}
                  className="eq-slider-treble w-full"
                />
              </div>
            </motion.div>
          )}
        </div>

        {/* Theme Selector */}
        <div className="mt-4">
          <button
            onClick={() => setShowThemeSelector(!showThemeSelector)}
            className="flex items-center justify-center gap-2 w-full py-2 text-sm transition-colors"
            style={{ color: themeColors.textMuted }}
          >
            <Palette className="w-4 h-4" />
            <span>Тема: {THEMES[currentTheme].name}</span>
            {showThemeSelector ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showThemeSelector && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="mt-2 p-3 rounded-xl grid grid-cols-2 gap-2"
              style={{ backgroundColor: themeColors.cardBg, border: `1px solid ${themeColors.border}` }}
            >
              {(Object.keys(THEMES) as ThemeName[]).map((theme) => (
                <button
                  key={theme}
                  onClick={() => {
                    changeTheme(theme)
                    setShowThemeSelector(false)
                  }}
                  className={`p-3 rounded-lg text-sm font-medium transition-all ${currentTheme === theme ? 'ring-2' : ''}`}
                  style={{
                    backgroundColor: THEMES[theme].colors.primary,
                    color: THEMES[theme].colors.text,
                    border: `2px solid ${THEMES[theme].colors.secondary}`,
                    boxShadow: currentTheme === theme ? `0 0 0 2px ${THEMES[theme].colors.secondary}` : 'none',
                  }}
                >
                  {THEMES[theme].name}
                </button>
              ))}
            </motion.div>
          )}
        </div>

        {/* Stats & Actions */}
        <div className="mt-6 flex justify-between items-center px-2">
          <div className="text-xs" style={{ color: themeColors.textMuted }}>
            <span>🎧 {listeners} слушателей</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={shareInTelegram}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              style={{ color: themeColors.textMuted }}
              title="Поделиться"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <button
              onClick={openInPlayer}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              style={{ color: themeColors.textMuted }}
              title="Открыть в плеере"
            >
              <ExternalLink className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Station Info */}
        <div className="mt-6 text-center">
          <p className="text-xs" style={{ color: themeColors.textMuted }}>
            {STATION_NAME} • {isOnline ? '🟢 В эфире' : '🔴 Оффлайн'}
          </p>
        </div>
      </div>

      {/* Global Styles for sliders */}
      <style jsx global>{`
        .volume-slider {
          -webkit-appearance: none;
          height: 6px;
          border-radius: 3px;
          cursor: pointer;
        }
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          border: 2px solid currentColor;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        }
        .volume-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          border: 2px solid currentColor;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        }
        .eq-slider-bass, .eq-slider-mid, .eq-slider-treble {
          -webkit-appearance: none;
          height: 4px;
          border-radius: 2px;
          background: rgba(128,128,128,0.3);
          cursor: pointer;
        }
        .eq-slider-bass::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          border: 2px solid ${vizColors.bass};
          cursor: pointer;
        }
        .eq-slider-mid::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          border: 2px solid ${vizColors.mid};
          cursor: pointer;
        }
        .eq-slider-treble::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          border: 2px solid ${vizColors.high};
          cursor: pointer;
        }
        .eq-slider-bass::-moz-range-thumb,
        .eq-slider-mid::-moz-range-thumb,
        .eq-slider-treble::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
