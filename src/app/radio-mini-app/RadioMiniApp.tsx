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
// Основной URL потока для ПК и Android
const STREAM_URL = 'https://radio-stream.gondurass89.workers.dev'

// Отдельный URL потока для iOS (можно заменить на HLS .m3u8 при необходимости)
// Для HLS: 'https://ваш-сервер/stream.m3u8'
const IOS_STREAM_URL = 'https://radio-stream.gondurass89.workers.dev'

// Альтернативный HLS поток для iOS (если понадобится)
// const IOS_HLS_URL = 'https://ваш-сервер/stream.m3u8'

// Включить ли использование HLS для iOS (true = использовать HLS, false = использовать IOS_STREAM_URL)
const USE_HLS_FOR_IOS = false

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
  // Статус аудио элемента
  audioState: string // 'idle' | 'loading' | 'playing' | 'paused' | 'error'
  // Состояние AudioContext
  audioContextState: string // 'suspended' | 'running' | 'closed'
  // Текущий URL потока
  currentStreamUrl: string
  // Последняя ошибка
  lastError: string
  // Код ошибки (если есть)
  errorCode: number | null
  // Платформа
  platform: string
  // Является ли iOS
  isIOS: boolean
  // networkState аудио
  networkState: string
  // readyState аудио
  readyState: string
  // Время последнего события
  lastEvent: string
  // История событий (последние 10)
  eventHistory: string[]
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
  // Проверка через userAgent
  const ua = navigator.userAgent
  const isIPad = /iPad/i.test(ua)
  const isIPhone = /iPhone/i.test(ua)
  const isIPod = /iPod/i.test(ua)
  
  // Дополнительная проверка для iPad на iOS 13+ (они представляются как Mac)
  const isIPadModern = /Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1
  
  // Проверка через Telegram WebApp platform
  const tgPlatform = window.Telegram?.WebApp?.platform || ''
  const isTgIOS = tgPlatform === 'ios'
  
  return isIPad || isIPhone || isIPod || isIPadModern || isTgIOS
}

// Функция получения названия платформы
function getPlatformName(): string {
  const ua = navigator.userAgent
  const tgPlatform = window.Telegram?.WebApp?.platform || ''
  
  if (tgPlatform) {
    // Возвращаем платформу Telegram
    return `Telegram/${tgPlatform}`
  }
  
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
      return 'MEDIA_ERR_ABORTED (1): Воспроизведение отменено пользователем'
    case MediaError.MEDIA_ERR_NETWORK:
      return 'MEDIA_ERR_NETWORK (2): Ошибка сети при загрузке'
    case MediaError.MEDIA_ERR_DECODE:
      return 'MEDIA_ERR_DECODE (3): Ошибка декодирования аудио'
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
  const [isPlaying, setIsPlaying] = useState(false) // Играет ли радио
  const [isLoading, setIsLoading] = useState(false) // Идёт ли загрузка
  const [volume, setVolume] = useState(100) // Громкость (0-100)
  const [isMuted, setIsMuted] = useState(false) // Приглушён ли звук
  const [currentTrack, setCurrentTrack] = useState('Загрузка...') // Текущий трек
  const [listeners, setListeners] = useState(0) // Количество слушателей
  const [isTgReady, setIsTgReady] = useState(false) // Инициализирован ли Telegram
  const [error, setError] = useState<string | null>(null) // Ошибка для отображения
  const [buffering, setBuffering] = useState(false) // Идёт ли буферизация
  
  // Состояние для диагностической панели
  const [showDiagnostics, setShowDiagnostics] = useState(true) // Показывать панель диагностики
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
  })

  // =====================================================
  // REFS (ССЫЛКИ НА ЭЛЕМЕНТЫ)
  // =====================================================
  const audioRef = useRef<HTMLAudioElement | null>(null) // Аудио элемент
  const audioContextRef = useRef<AudioContext | null>(null) // AudioContext
  const analyserRef = useRef<AnalyserNode | null>(null) // Анализатор частот
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null) // Источник аудио
  const canvasRef = useRef<HTMLCanvasElement | null>(null) // Canvas для визуализатора
  const animationFrameRef = useRef<number | null>(null) // ID кадра анимации
  const isSourceConnectedRef = useRef(false) // Подключён ли источник
  const timeoutRef = useRef<NodeJS.Timeout | null>(null) // Таймаут загрузки
  const smoothedValuesRef = useRef({ bass: 0, mid: 0, high: 0 }) // Сглаженные значения
  const isIOSRef = useRef(false) // Кэш определения iOS
  const eventHistoryRef = useRef<string[]>([]) // История событий
  
  // Константа сглаживания для визуализатора
  const SMOOTHING_FACTOR = 0.3

  // =====================================================
  // ФУНКЦИЯ ОБНОВЛЕНИЯ ДИАГНОСТИКИ
  // =====================================================
  const updateDiagnostics = useCallback((update: Partial<DiagnosticInfo>) => {
    setDiagnostics(prev => ({ ...prev, ...update }))
  }, [])

  // =====================================================
  // ФУНКЦИЯ ДОБАВЛЕНИЯ СОБЫТИЯ В ИСТОРИЮ
  // =====================================================
  const addEventToHistory = useCallback((event: string) => {
    const timestamp = new Date().toLocaleTimeString()
    const entry = `[${timestamp}] ${event}`
    
    // Добавляем в локальный ref
    eventHistoryRef.current = [...eventHistoryRef.current.slice(-9), entry]
    
    // Обновляем состояние
    updateDiagnostics({
      lastEvent: entry,
      eventHistory: eventHistoryRef.current,
    })
    
    // Также выводим в консоль
    console.log(`[AUDIO EVENT] ${entry}`)
  }, [updateDiagnostics])

  // =====================================================
  // ФУНКЦИЯ ПОЛУЧЕНИЯ/СОЗДАНИЯ AUDIOCONTEXT
  // =====================================================
  const getAudioContext = useCallback(() => {
    // Если уже создан - возвращаем существующий
    if (audioContextRef.current) {
      return audioContextRef.current
    }
    
    // Получаем класс AudioContext (с префиксом webkit для старых Safari)
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    
    if (!AudioContextClass) {
      console.error('[AUDIO] AudioContext не поддерживается браузером')
      return null
    }
    
    // Создаём новый AudioContext
    const ctx = new AudioContextClass()
    audioContextRef.current = ctx
    
    console.log('[AUDIO] AudioContext создан, начальное состояние:', ctx.state)
    
    // Обновляем диагностику
    updateDiagnostics({ audioContextState: ctx.state })
    
    return ctx
  }, [updateDiagnostics])

  // =====================================================
  // ФУНКЦИЯ РАСЧЁТА ЭНЕРГИИ ЧАСТОТНОГО ДИАПАЗОНА
  // =====================================================
  const getFrequencyEnergy = useCallback((
    dataArray: Uint8Array,      // Массив частотных данных
    sampleRate: number,          // Частота дискретизации
    fftSize: number,             // Размер FFT
    lowFreq: number,             // Нижняя частота диапазона
    highFreq: number             // Верхняя частота диапазона
  ): number => {
    // Количество бинов = fftSize / 2
    const binCount = fftSize / 2
    
    // Частота на один бин
    const frequencyPerBin = sampleRate / fftSize
    
    // Вычисляем индексы бинов для диапазона
    const lowBin = Math.floor(lowFreq / frequencyPerBin)
    const highBin = Math.min(Math.floor(highFreq / frequencyPerBin), binCount - 1)
    
    // Суммируем значения в диапазоне
    let sum = 0
    let count = 0
    
    for (let i = lowBin; i <= highBin; i++) {
      sum += dataArray[i]
      count++
    }
    
    // Возвращаем нормализованное значение (0-1)
    return count > 0 ? (sum / count) / 255 : 0
  }, [])

  // =====================================================
  // ФУНКЦИЯ СГЛАЖИВАНИЯ ЗНАЧЕНИЙ
  // =====================================================
  const smoothValue = useCallback((current: number, previous: number): number => {
    return previous + (current - previous) * SMOOTHING_FACTOR
  }, [])

  // =====================================================
  // ФУНКЦИЯ ВИЗУАЛИЗАЦИИ (ОСНОВНОЙ ЦИКЛ)
  // =====================================================
  const visualize = useCallback(() => {
    const analyser = analyserRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    
    // Если нет анализатора или canvas - пропускаем кадр
    if (!analyser || !canvas || !ctx) {
      animationFrameRef.current = requestAnimationFrame(visualize)
      return
    }
    
    // Получаем частотные данные
    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyser.getByteFrequencyData(dataArray)
    
    // Параметры анализатора
    const sampleRate = analyser.context.sampleRate
    const fftSize = analyser.fftSize
    
    // Вычисляем энергию для трёх диапазонов
    const bassEnergy = getFrequencyEnergy(dataArray, sampleRate, fftSize, 20, 250)
    const midEnergy = getFrequencyEnergy(dataArray, sampleRate, fftSize, 250, 4000)
    const highEnergy = getFrequencyEnergy(dataArray, sampleRate, fftSize, 4000, 16000)
    
    // Сглаживаем значения
    smoothedValuesRef.current.bass = smoothValue(bassEnergy, smoothedValuesRef.current.bass)
    smoothedValuesRef.current.mid = smoothValue(midEnergy, smoothedValuesRef.current.mid)
    smoothedValuesRef.current.high = smoothValue(highEnergy, smoothedValuesRef.current.high)
    
    // Рисуем на canvas
    const width = canvas.width
    const height = canvas.height
    
    // Очищаем canvas
    ctx.clearRect(0, 0, width, height)
    
    // Параметры столбцов
    const barWidth = width / 3 - 8
    const gap = 12
    
    // === BASS столбец ===
    const bassHeight = smoothedValuesRef.current.bass * (height - 10) + 4
    const bassGradient = ctx.createLinearGradient(0, height, 0, height - bassHeight)
    bassGradient.addColorStop(0, COLORS.bass)
    bassGradient.addColorStop(1, '#ff3399')
    ctx.fillStyle = bassGradient
    ctx.beginPath()
    ctx.roundRect(gap, height - bassHeight, barWidth, bassHeight, 4)
    ctx.fill()
    
    // === MID столбец ===
    const midHeight = smoothedValuesRef.current.mid * (height - 10) + 4
    const midGradient = ctx.createLinearGradient(0, height, 0, height - midHeight)
    midGradient.addColorStop(0, COLORS.mid)
    midGradient.addColorStop(1, COLORS.accent)
    ctx.fillStyle = midGradient
    ctx.beginPath()
    ctx.roundRect(barWidth + gap * 2, height - midHeight, barWidth, midHeight, 4)
    ctx.fill()
    
    // === HIGH столбец ===
    const highHeight = smoothedValuesRef.current.high * (height - 10) + 4
    const highGradient = ctx.createLinearGradient(0, height, 0, height - highHeight)
    highGradient.addColorStop(0, COLORS.high)
    highGradient.addColorStop(1, '#66ffee')
    ctx.fillStyle = highGradient
    ctx.beginPath()
    ctx.roundRect(barWidth * 2 + gap * 3, height - highHeight, barWidth, highHeight, 4)
    ctx.fill()
    
    // Запрашиваем следующий кадр
    animationFrameRef.current = requestAnimationFrame(visualize)
  }, [getFrequencyEnergy, smoothValue])

  // =====================================================
  // ФУНКЦИЯ ЗАПУСКА ВИЗУАЛИЗАТОРА
  // =====================================================
  const startVisualization = useCallback(() => {
    // Если уже запущен - не перезапускаем
    if (animationFrameRef.current) {
      return
    }
    
    console.log('[VIS] Запуск визуализатора')
    visualize()
  }, [visualize])

  // =====================================================
  // ФУНКЦИЯ ОСТАНОВКИ ВИЗУАЛИЗАТОРА
  // =====================================================
  const stopVisualization = useCallback(() => {
    // Отменяем анимацию
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
      console.log('[VIS] Визуализатор остановлен')
    }
    
    // Сбрасываем сглаженные значения
    smoothedValuesRef.current = { bass: 0, mid: 0, high: 0 }
    
    // Очищаем canvas
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [])

  // =====================================================
  // ФУНКЦИЯ ПОДКЛЮЧЕНИЯ АУДИО К АНАЛИЗАТОРУ
  // =====================================================
  const connectAudioToAnalyser = useCallback((): boolean => {
    // Если уже подключено - не делаем повторно
    if (isSourceConnectedRef.current) {
      console.log('[AUDIO] Source уже подключен к анализатору')
      return true
    }
    
    const audio = audioRef.current
    if (!audio) {
      console.error('[AUDIO] Нет аудио элемента для подключения')
      return false
    }
    
    const ctx = getAudioContext()
    if (!ctx) {
      console.error('[AUDIO] Нет AudioContext для подключения')
      return false
    }
    
    try {
      // Создаём анализатор
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256 // Меньший размер для iOS совместимости
      analyser.smoothingTimeConstant = 0.8
      
      analyserRef.current = analyser
      
      // Создаём источник из аудио элемента (ТОЛЬКО ОДИН РАЗ!)
      const source = ctx.createMediaElementSource(audio)
      sourceNodeRef.current = source
      
      // Подключаем: source -> analyser -> destination
      source.connect(analyser)
      analyser.connect(ctx.destination)
      
      isSourceConnectedRef.current = true
      
      console.log('[AUDIO] Аудио подключено к анализатору, fftSize:', analyser.fftSize)
      
      return true
    } catch (e) {
      console.error('[AUDIO] Ошибка подключения анализатора:', e)
      return false
    }
  }, [getAudioContext])

  // =====================================================
  // ИНИЦИАЛИЗАЦИЯ АУДИО ЭЛЕМЕНТА (ОСНОВНОЙ USE EFFECT)
  // =====================================================
  useEffect(() => {
    console.log('[AUDIO] === ИНИЦИАЛИЗАЦИЯ АУДИО ЭЛЕМЕНТА ===')
    
    // Определяем iOS при первой загрузке
    isIOSRef.current = detectIOS()
    const platformName = getPlatformName()
    
    console.log('[AUDIO] Платформа:', platformName)
    console.log('[AUDIO] iOS обнаружен:', isIOSRef.current)
    
    // Обновляем диагностику
    updateDiagnostics({
      platform: platformName,
      isIOS: isIOSRef.current,
      audioState: 'idle',
      audioContextState: 'none',
    })
    
    // Создаём аудио элемент
    const audio = new Audio()
    audio.preload = 'none' // Не загружаем автоматически
    audio.crossOrigin = 'anonymous' // Для CORS
    audioRef.current = audio
    
    console.log('[AUDIO] Аудио элемент создан')
    
    // =====================================================
    // ВСЕ ОБРАБОТЧИКИ СОБЫТИЙ АУДИО (ДЛЯ ДИАГНОСТИКИ)
    // =====================================================
    
    // --- loadstart ---
    const onLoadStart = () => {
      console.log('[AUDIO EVENT] loadstart - Начало загрузки')
      console.log('  -> currentSrc:', audio.currentSrc)
      console.log('  -> networkState:', getNetworkStateName(audio.networkState))
      console.log('  -> readyState:', getReadyStateName(audio.readyState))
      
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
    
    // --- loadedmetadata ---
    const onLoadedMetadata = () => {
      console.log('[AUDIO EVENT] loadedmetadata - Метаданные загружены')
      console.log('  -> duration:', audio.duration)
      console.log('  -> readyState:', getReadyStateName(audio.readyState))
      
      addEventToHistory('loadedmetadata')
      updateDiagnostics({
        readyState: getReadyStateName(audio.readyState),
      })
    }
    
    // --- loadeddata ---
    const onLoadedData = () => {
      console.log('[AUDIO EVENT] loadeddata - Данные загружены')
      console.log('  -> readyState:', getReadyStateName(audio.readyState))
      
      addEventToHistory('loadeddata')
      updateDiagnostics({
        readyState: getReadyStateName(audio.readyState),
      })
    }
    
    // --- canplay ---
    const onCanPlay = () => {
      console.log('[AUDIO EVENT] canplay - Можно воспроизводить')
      console.log('  -> readyState:', getReadyStateName(audio.readyState))
      console.log('  -> networkState:', getNetworkStateName(audio.networkState))
      
      addEventToHistory('canplay')
      updateDiagnostics({
        audioState: 'ready',
        readyState: getReadyStateName(audio.readyState),
        networkState: getNetworkStateName(audio.networkState),
      })
      
      setBuffering(false)
      setIsLoading(false)
    }
    
    // --- canplaythrough ---
    const onCanPlayThrough = () => {
      console.log('[AUDIO EVENT] canplaythrough - Можно воспроизводить без буферизации')
      console.log('  -> readyState:', getReadyStateName(audio.readyState))
      
      addEventToHistory('canplaythrough')
    }
    
    // --- play ---
    const onPlay = () => {
      console.log('[AUDIO EVENT] play - Воспроизведение начато')
      console.log('  -> currentTime:', audio.currentTime)
      console.log('  -> paused:', audio.paused)
      
      addEventToHistory('play')
    }
    
    // --- playing ---
    const onPlaying = () => {
      console.log('[AUDIO EVENT] playing - Аудио играет')
      console.log('  -> currentTime:', audio.currentTime)
      console.log('  -> readyState:', getReadyStateName(audio.readyState))
      
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
      
      // Очищаем таймаут
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
    
    // --- pause ---
    const onPause = () => {
      console.log('[AUDIO EVENT] pause - Воспроизведение приостановлено')
      console.log('  -> currentTime:', audio.currentTime)
      console.log('  -> ended:', audio.ended)
      
      addEventToHistory('pause')
      updateDiagnostics({
        audioState: 'paused',
      })
      
      setIsPlaying(false)
      stopVisualization()
    }
    
    // --- stalled ---
    const onStalled = () => {
      console.log('[AUDIO EVENT] stalled - Загрузка остановлена')
      console.log('  -> networkState:', getNetworkStateName(audio.networkState))
      console.log('  -> readyState:', getReadyStateName(audio.readyState))
      
      addEventToHistory('stalled')
      updateDiagnostics({
        networkState: getNetworkStateName(audio.networkState),
        readyState: getReadyStateName(audio.readyState),
      })
      
      setBuffering(true)
    }
    
    // --- waiting ---
    const onWaiting = () => {
      console.log('[AUDIO EVENT] waiting - Ожидание данных')
      console.log('  -> readyState:', getReadyStateName(audio.readyState))
      console.log('  -> currentTime:', audio.currentTime)
      
      addEventToHistory('waiting')
      
      setBuffering(true)
      setIsLoading(true)
    }
    
    // --- suspend ---
    const onSuspend = () => {
      console.log('[AUDIO EVENT] suspend - Загрузка приостановлена браузером')
      console.log('  -> networkState:', getNetworkStateName(audio.networkState))
      
      addEventToHistory('suspend')
      updateDiagnostics({
        networkState: getNetworkStateName(audio.networkState),
      })
    }
    
    // --- abort ---
    const onAbort = () => {
      console.log('[AUDIO EVENT] abort - Загрузка отменена')
      console.log('  -> networkState:', getNetworkStateName(audio.networkState))
      console.log('  -> readyState:', getReadyStateName(audio.readyState))
      
      addEventToHistory('abort')
      updateDiagnostics({
        networkState: getNetworkStateName(audio.networkState),
        readyState: getReadyStateName(audio.readyState),
      })
    }
    
    // --- emptied ---
    const onEmptied = () => {
      console.log('[AUDIO EVENT] emptied - Источник очищен')
      console.log('  -> networkState:', getNetworkStateName(audio.networkState))
      console.log('  -> readyState:', getReadyStateName(audio.readyState))
      console.log('  -> currentSrc:', audio.currentSrc)
      
      addEventToHistory('emptied')
      updateDiagnostics({
        networkState: getNetworkStateName(audio.networkState),
        readyState: getReadyStateName(audio.readyState),
        currentStreamUrl: audio.currentSrc || '(пусто)',
      })
    }
    
    // --- error (КРИТИЧЕСКИ ВАЖНО) ---
    const onError = () => {
      const mediaError = audio.error
      const errorDetails = mediaError ? getAudioErrorMessage(mediaError) : 'Неизвестная ошибка'
      
      console.error('[AUDIO EVENT] error - ОШИБКА ВОСПРОИЗВЕДЕНИЯ')
      console.error('  -> error.code:', mediaError?.code)
      console.error('  -> error.message:', mediaError?.message)
      console.error('  -> Расшифровка:', errorDetails)
      console.error('  -> currentSrc:', audio.currentSrc)
      console.error('  -> networkState:', getNetworkStateName(audio.networkState))
      console.error('  -> readyState:', getReadyStateName(audio.readyState))
      console.error('  -> src:', audio.src)
      
      // Дополнительная информация для iOS
      if (isIOSRef.current) {
        console.error('  -> [iOS] Возможные причины:')
        console.error('     1. Формат потока не поддерживается iOS Safari')
        console.error('     2. Проблема с CORS заголовками сервера')
        console.error('     3. Поток требует HLS (.m3u8) для iOS')
        console.error('     4. Проблема с кодеком (iOS поддерживает только AAC/MP3)')
      }
      
      addEventToHistory(`ERROR: ${errorDetails}`)
      
      // Определяем сообщение об ошибке для пользователя
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
            errorMsg = 'Ошибка декодирования аудио'
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
      
      // Очищаем таймаут
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
    
    // =====================================================
    // ПОДПИСЫВАЕМСЯ НА ВСЕ СОБЫТИЯ
    // =====================================================
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
    
    // =====================================================
    // ОБРАБОТЧИК ИЗМЕНЕНИЯ ВИДИМОСТИ (ДЛЯ AUDIOCONTEXT)
    // =====================================================
    const onVisibilityChange = async () => {
      const ctx = audioContextRef.current
      
      console.log('[VISIBILITY] Состояние изменилось:', document.visibilityState)
      
      if (document.visibilityState === 'visible' && ctx) {
        console.log('[VISIBILITY] Страница видима, состояние AudioContext:', ctx.state)
        
        if (ctx.state === 'suspended') {
          try {
            await ctx.resume()
            console.log('[VISIBILITY] AudioContext возобновлён, состояние:', ctx.state)
            updateDiagnostics({ audioContextState: ctx.state })
          } catch (e) {
            console.error('[VISIBILITY] Ошибка при resume AudioContext:', e)
          }
        }
      }
    }
    
    document.addEventListener('visibilitychange', onVisibilityChange)
    
    // =====================================================
    // ФУНКЦИЯ ОЧИСТКИ ПРИ РАЗМОНТИРОВАНИИ
    // =====================================================
    return () => {
      console.log('[AUDIO] Размонтирование компонента, очистка...')
      
      // Удаляем все обработчики
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
      
      // Останавливаем и очищаем аудио
      audio.pause()
      audio.src = ''
      
      // Останавливаем визуализацию
      stopVisualization()
      
      // Очищаем таймаут
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      
      console.log('[AUDIO] Очистка завершена')
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
  // ИНИЦИАЛИЗАЦИЯ TELEGRAM WEBAPP
  // =====================================================
  useEffect(() => {
    const initTelegram = () => {
      const tg = window.Telegram?.WebApp
      
      if (tg) {
        tg.ready()
        tg.expand()
        setIsTgReady(true)
        
        console.log('[TG] Telegram WebApp инициализирован')
        console.log('[TG] Platform:', tg.platform)
        console.log('[TG] initData:', tg.initData ? '(есть)' : '(нет)')
        
        // Обновляем платформу с учётом Telegram
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
    
    // Пробуем инициализировать сразу
    if (initTelegram()) {
      return
    }
    
    // Если не удалось - пробуем с интервалом
    let attempts = 0
    const interval = setInterval(() => {
      attempts++
      if (initTelegram() || attempts >= 20) {
        clearInterval(interval)
      }
    }, 100)
    
    return () => clearInterval(interval)
  }, [updateDiagnostics])

  // =====================================================
  // РЕГИСТРАЦИЯ СЛУШАТЕЛЯ
  // =====================================================
  const registerListener = useCallback(async (action: 'open' | 'close') => {
    const tg = window.Telegram?.WebApp
    const user = tg?.initDataUnsafe?.user
    
    if (!user) {
      console.log('[LISTENER] Нет данных пользователя')
      return
    }
    
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
      
      console.log('[LISTENER] Зарегистрирован:', action)
    } catch (e) {
      console.error('[LISTENER] Ошибка регистрации:', e)
    }
  }, [])

  // Регистрируем при готовности Telegram
  useEffect(() => {
    if (isTgReady) {
      registerListener('open')
    }
  }, [isTgReady, registerListener])

  // =====================================================
  // ПОЛУЧЕНИЕ КОЛИЧЕСТВА СЛУШАТЕЛЕЙ
  // =====================================================
  const fetchListenersCount = useCallback(async () => {
    try {
      const res = await fetch(LISTENERS_API, { mode: 'cors' })
      if (res.ok) {
        const data = await res.json()
        setListeners(data.total || 0)
      }
    } catch (e) {
      // Игнорируем ошибки
    }
  }, [])

  useEffect(() => {
    fetchListenersCount()
    const interval = setInterval(fetchListenersCount, 10000)
    return () => clearInterval(interval)
  }, [fetchListenersCount])

  // =====================================================
  // ПОЛУЧЕНИЕ ТЕКУЩЕГО ТРЕКА
  // =====================================================
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
    } catch (e) {
      // Игнорируем ошибки
    }
  }, [currentTrack])

  useEffect(() => {
    fetchCurrentTrack()
    const interval = setInterval(fetchCurrentTrack, 5000)
    return () => clearInterval(interval)
  }, [fetchCurrentTrack])

  // =====================================================
  // ОТПРАВКА ЗАКРЫТИЯ ПРИ ВЫХОДЕ
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
      console.error('[PLAY] Аудио элемент не инициализирован')
      return
    }
    
    // Если уже играет - ставим на паузу
    if (isPlaying) {
      console.log('[PLAY] Ставим на паузу')
      audio.pause()
      return
    }
    
    // Сбрасываем ошибку
    setError(null)
    setIsLoading(true)
    
    console.log('[PLAY] === НАЧАЛО ВОСПРОИЗВЕДЕНИЯ ===')
    console.log('[PLAY] iOS:', isIOSRef.current)
    
    // Устанавливаем таймаут на случай зависания
    timeoutRef.current = setTimeout(() => {
      if (isLoading && !isPlaying) {
        console.error('[PLAY] Таймаут загрузки (25 сек)')
        setError('Таймаут подключения')
        setIsLoading(false)
        setBuffering(false)
        audio.pause()
      }
    }, 25000)
    
    try {
      // Устанавливаем громкость
      audio.volume = isMuted ? 0 : volume / 100
      
      // Определяем URL потока в зависимости от платформы
      let streamUrl = STREAM_URL
      
      if (isIOSRef.current && USE_HLS_FOR_IOS) {
        // Если включён HLS для iOS - используем HLS URL
        // streamUrl = IOS_HLS_URL // Раскомментировать при наличии HLS
        console.log('[PLAY] iOS: планируется HLS (но пока используется стандартный URL)')
      } else if (isIOSRef.current) {
        // iOS без HLS - используем специальный URL для iOS
        streamUrl = IOS_STREAM_URL
        console.log('[PLAY] iOS: используем IOS_STREAM_URL')
      }
      
      // Устанавливаем источник, если ещё не установлен или изменился
      if (!audio.src || audio.src !== streamUrl) {
        console.log('[PLAY] Устанавливаем источник:', streamUrl)
        audio.src = streamUrl
        audio.load() // Важно: вызываем load() после установки src
        
        updateDiagnostics({ currentStreamUrl: streamUrl })
      }
      
      // Получаем/создаём AudioContext
      const ctx = getAudioContext()
      
      if (ctx) {
        // Восстанавливаем AudioContext если приостановлен
        if (ctx.state === 'suspended') {
          console.log('[PLAY] AudioContext suspended, вызываем resume()')
          await ctx.resume()
          console.log('[PLAY] AudioContext после resume:', ctx.state)
          updateDiagnostics({ audioContextState: ctx.state })
        }
        
        // Подключаем аудио к анализатору (только один раз)
        connectAudioToAnalyser()
      }
      
      // Запускаем воспроизведение
      console.log('[PLAY] Вызываем audio.play()')
      await audio.play()
      
      console.log('[PLAY] Воспроизведение запущено успешно')
      
      // Запускаем визуализацию
      startVisualization()
      
    } catch (err: any) {
      console.error('[PLAY] Ошибка при запуске воспроизведения:')
      console.error('  -> name:', err.name)
      console.error('  -> message:', err.message)
      console.error('  -> stack:', err.stack)
      
      // Очищаем таймаут
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      
      setIsLoading(false)
      
      // Определяем сообщение об ошибке
      let errorMsg = 'Ошибка воспроизведения'
      
      if (err.name === 'NotAllowedError') {
        errorMsg = 'Нажмите ещё раз для воспроизведения'
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
  // РЕНДЕР КОМПОНЕНТА
  // =====================================================
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
        .diagnostic-panel {
          font-family: monospace;
          font-size: 10px;
          line-height: 1.4;
          max-height: 200px;
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
      
      {/* Основной контейнер */}
      <div
        className="min-h-screen flex flex-col items-center justify-center p-4"
        style={{
          background: `linear-gradient(180deg, ${COLORS.primary} 0%, ${COLORS.dark} 100%)`,
        }}
      >
        {/* Декоративный фон */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 80% 50% at 50% 30%, rgba(0,199,48,0.15) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 30% 60%, rgba(255,0,102,0.1) 0%, transparent 50%)`,
          }}
        />
        
        {/* Основной контент */}
        <div className="relative z-10 w-full max-w-xs">
          
          {/* Логотип станции */}
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
          
          {/* Визуализатор / Эквалайзер */}
          <div className="skeuo-card rounded-xl p-2 mb-3">
            {/* Бейдж LIVE */}
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
            
            {/* Canvas для визуализатора */}
            <canvas
              ref={canvasRef}
              width={280}
              height={48}
              className="w-full rounded"
              style={{ background: 'transparent' }}
            />
            
            {/* Подписи частот */}
            <div className="flex justify-between mt-1.5 px-2">
              <span className="text-xs font-medium" style={{ color: COLORS.bass }}>BASS</span>
              <span className="text-xs font-medium" style={{ color: COLORS.mid }}>MID</span>
              <span className="text-xs font-medium" style={{ color: COLORS.high }}>HIGH</span>
            </div>
          </div>
          
          {/* Информация о станции */}
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
          
          {/* Индикатор буферизации */}
          {buffering && (
            <div className="flex items-center justify-center gap-2 mb-2 p-1.5 rounded-xl skeuo-card">
              <Wifi className="w-3 h-3 animate-pulse" style={{ color: COLORS.secondary }} />
              <span className="text-xs" style={{ color: COLORS.secondary }}>Буферизация...</span>
            </div>
          )}
          
          {/* Индикатор ошибки */}
          {error && (
            <div
              className="flex items-center justify-center gap-2 mb-2 p-1.5 rounded-xl"
              style={{ background: 'rgba(255,0,102,0.1)' }}
            >
              <AlertCircle className="w-3 h-3" style={{ color: COLORS.bass }} />
              <span className="text-xs" style={{ color: '#ff6699' }}>{error}</span>
            </div>
          )}
          
          {/* Кнопка Play/Pause */}
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
          
          {/* Регулятор громкости */}
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
          
          {/* ===================================================== */}
          {/* ДИАГНОСТИЧЕСКАЯ ПАНЕЛЬ (ВРЕМЕННАЯ ДЛЯ ОТЛАДКИ) */}
          {/* ===================================================== */}
          <div className="mb-3">
            {/* Кнопка показа/скрытия панели */}
            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="text-xs mb-1 opacity-50 hover:opacity-100"
              style={{ color: COLORS.secondary }}
            >
              {showDiagnostics ? '▼ Скрыть диагностику' : '▶ Показать диагностику'}
            </button>
            
            {/* Панель диагностики */}
            {showDiagnostics && (
              <div
                className="diagnostic-panel skeuo-card rounded-xl p-2"
                style={{ background: 'rgba(0,0,0,0.5)' }}
              >
                {/* Заголовок */}
                <div className="font-bold mb-1" style={{ color: COLORS.secondary }}>
                  🔧 ДИАГНОСТИКА (временно)
                </div>
                
                {/* Платформа */}
                <div style={{ color: diagnostics.isIOS ? COLORS.bass : COLORS.accent }}>
                  Platform: {diagnostics.platform}
                  {diagnostics.isIOS && ' 🍎 iOS'}
                </div>
                
                {/* Статус аудио */}
                <div style={{ color: diagnostics.audioState === 'error' ? COLORS.bass : COLORS.text }}>
                  Audio State: {diagnostics.audioState}
                </div>
                
                {/* AudioContext */}
                <div style={{ color: diagnostics.audioContextState === 'suspended' ? COLORS.bass : COLORS.text }}>
                  AudioContext: {diagnostics.audioContextState}
                </div>
                
                {/* URL потока */}
                <div style={{ color: COLORS.text, wordBreak: 'break-all' }}>
                  URL: {diagnostics.currentStreamUrl || '(не установлен)'}
                </div>
                
                {/* Network State */}
                <div style={{ color: COLORS.text }}>
                  Network: {diagnostics.networkState}
                </div>
                
                {/* Ready State */}
                <div style={{ color: COLORS.text }}>
                  Ready: {diagnostics.readyState}
                </div>
                
                {/* Последняя ошибка */}
                {diagnostics.lastError && (
                  <div style={{ color: COLORS.bass, wordBreak: 'break-all' }}>
                    ERROR: {diagnostics.lastError}
                  </div>
                )}
                
                {/* Код ошибки */}
                {diagnostics.errorCode !== null && (
                  <div style={{ color: COLORS.bass }}>
                    Error Code: {diagnostics.errorCode}
                  </div>
                )}
                
                {/* Последнее событие */}
                <div style={{ color: COLORS.mid }}>
                  Last Event: {diagnostics.lastEvent}
                </div>
                
                {/* История событий */}
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
          
          {/* Подпись */}
          <p className="text-center text-xs mt-2" style={{ color: '#555' }}>
            Powered by <span style={{ color: COLORS.secondary }}>DJ GooD OFF</span>
          </p>
        </div>
      </div>
    </>
  )
}
