'use client'

// =====================================================
// DJ GooD OFF FM - Telegram Mini App
// Радио-плеер с реальным эквалайзером и визуализатором
// Архитектура: REAL-FIRST, FALLBACK-ONLY-ON-FAILURE
// =====================================================

// =====================================================
// ИМПОРТЫ НЕОБХОДИМЫХ МОДУЛЕЙ
// =====================================================
import { useState, useEffect, useRef, useCallback } from 'react' // React хуки для состояния и жизненного цикла
import { motion, AnimatePresence } from 'framer-motion' // Анимации для UI элементов
import { Play, Pause, Volume2, VolumeX, Loader2, Radio, AlertCircle, Wifi } from 'lucide-react' // Иконки интерфейса

// =====================================================
// КОНСТАНТЫ ПРИЛОЖЕНИЯ
// =====================================================
// URL аудио потока через Cloudflare Worker (HTTPS proxy для MP3)
const STREAM_URL = 'https://radio-stream.gondurass89.workers.dev'
// Название радиостанции для отображения в UI
const STATION_NAME = 'DJ GooD OFF FM'
// Путь к логотипу станции
const STATION_LOGO = '/logo.png'
// API endpoint для отслеживания слушателей
const LISTENERS_API = 'https://listeners.gondurass89.workers.dev'
// Локальный API endpoint для получения названия текущего трека
const NOW_PLAYING_API = '/api/now-playing'
// Интервал отправки heartbeat (30 секунд) для поддержания статуса слушателя
const HEARTBEAT_INTERVAL = 30000
// Таймаут загрузки потока (30 секунд)
const LOAD_TIMEOUT = 30000
// Количество кадров для проверки REAL MODE перед fallback
const REAL_MODE_CHECK_FRAMES = 10
// Задержка перед проверкой REAL MODE (в миллисекундах)
const REAL_MODE_CHECK_DELAY = 500

// =====================================================
// ЦВЕТОВАЯ СХЕМА ПРИЛОЖЕНИЯ
// =====================================================
const COLORS = {
  primary: '#2e0071',    // Основной фиолетовый цвет
  secondary: '#00c730',  // Вторичный зелёный цвет
  accent: '#00ff40',     // Акцентный ярко-зелёный
  text: '#c4c4c4',       // Цвет текста (серый)
  dark: '#0d0026',       // Тёмный фон
  bass: '#ff0066',       // Цвет бас-секции (розовый)
  mid: '#00c730',        // Цвет средних частот (зелёный)
  high: '#00ffcc',       // Цвет высоких частот (бирюзовый)
}

// ID администратора для особых прав
const ADMIN_USER_ID = 55068554

// =====================================================
// ТИПЫ ДАННЫХ
// =====================================================
// Интерфейс для диагностической информации
interface DiagnosticInfo {
  audioState: string        // Текущее состояние аудио
  audioContextState: string // Состояние AudioContext
  currentStreamUrl: string  // URL текущего потока
  lastError: string         // Последняя ошибка
  errorCode: number | null  // Код ошибки
  platform: string          // Платформа пользователя
  isIOS: boolean           // Является ли устройство iOS
  networkState: string     // Состояние сети
  readyState: string       // Состояние готовности
  lastEvent: string        // Последнее событие
  eventHistory: string[]   // История событий
  eqActive: boolean        // Активен ли эквалайзер
  webAudioMode: string     // Режим WebAudio: 'real' | 'fallback' | 'none'
  realModeConfirmed: boolean // Подтверждён ли REAL MODE
}

// Расширение глобального интерфейса Window для Telegram WebApp
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void                              // Инициализация WebApp
        expand: () => void                             // Раскрыть на весь экран
        platform: string                               // Платформа (ios, android, etc)
        initData: string                               // Инициализационные данные
        initDataUnsafe?: {                             // Небезопасные данные (распарсенные)
          user?: {                                     // Данные пользователя
            id: number                                 // Telegram User ID
            first_name: string                         // Имя
            last_name?: string                         // Фамилия
            username?: string                          // Username
            language_code?: string                     // Код языка
          }
        }
        onEvent: (event: string, callback: () => void) => void // Подписка на события
        close: () => void                              // Закрыть WebApp
      }
    }
    webkitAudioContext?: typeof AudioContext           // Safari-специфичный AudioContext
  }
}

// =====================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =====================================================

/**
 * Определяет, является ли устройство iOS
 * Проверяет User-Agent и Telegram platform
 * @returns true если устройство iOS
 */
function detectIOS(): boolean {
  const ua = navigator.userAgent                           // Получаем User-Agent
  const isIPad = /iPad/i.test(ua)                          // Проверка iPad
  const isIPhone = /iPhone/i.test(ua)                      // Проверка iPhone
  const isIPod = /iPod/i.test(ua)                          // Проверка iPod
  // Современные iPad могут определяться как Macintosh с touch-точками
  const isIPadModern = /Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1
  const tgPlatform = window.Telegram?.WebApp?.platform || '' // Получаем платформу Telegram
  return isIPad || isIPhone || isIPod || isIPadModern || tgPlatform === 'ios'
}

/**
 * Получает человекочитаемое название платформы
 * @returns Название платформы
 */
function getPlatformName(): string {
  const ua = navigator.userAgent
  const tgPlatform = window.Telegram?.WebApp?.platform || ''
  if (tgPlatform) return `Telegram/${tgPlatform}`          // Приоритет Telegram-платформе
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Mac/i.test(ua)) return 'Mac'
  if (/Win/i.test(ua)) return 'Windows'
  return 'Unknown'
}

/**
 * Преобразует код ошибки MediaError в человекочитаемую строку
 * @param error - Объект MediaError или null
 * @returns Описание ошибки
 */
function getAudioErrorMessage(error: MediaError | null): string {
  if (!error) return 'Нет ошибки'
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED: return 'MEDIA_ERR_ABORTED (1): Отменено пользователем'
    case MediaError.MEDIA_ERR_NETWORK: return 'MEDIA_ERR_NETWORK (2): Ошибка сети'
    case MediaError.MEDIA_ERR_DECODE: return 'MEDIA_ERR_DECODE (3): Ошибка декодирования'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: return 'MEDIA_ERR_SRC_NOT_SUPPORTED (4): Формат не поддерживается'
    default: return `Неизвестная ошибка (${error.code})`
  }
}

/**
 * Преобразует код networkState в строку
 * @param state - Код состояния сети
 * @returns Описание состояния сети
 */
function getNetworkStateName(state: number): string {
  switch (state) {
    case HTMLMediaElement.NETWORK_EMPTY: return 'NETWORK_EMPTY (0)'
    case HTMLMediaElement.NETWORK_IDLE: return 'NETWORK_IDLE (1)'
    case HTMLMediaElement.NETWORK_LOADING: return 'NETWORK_LOADING (2)'
    case HTMLMediaElement.NETWORK_NO_SOURCE: return 'NETWORK_NO_SOURCE (3)'
    default: return `Unknown (${state})`
  }
}

/**
 * Преобразует код readyState в строку
 * @param state - Код состояния готовности
 * @returns Описание состояния готовности
 */
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
// ОСНОВНОЙ КОМПОНЕНТ ПРИЛОЖЕНИЯ
// =====================================================
export default function RadioMiniApp() {
  // =====================================================
  // СОСТОЯНИЯ КОМПОНЕНТА (useState)
  // =====================================================
  const [isPlaying, setIsPlaying] = useState(false)           // Флаг воспроизведения
  const [isLoading, setIsLoading] = useState(false)           // Флаг загрузки
  const [volume, setVolume] = useState(100)                   // Громкость (0-100)
  const [isMuted, setIsMuted] = useState(false)               // Флаг отключения звука
  const [currentTrack, setCurrentTrack] = useState('Загрузка...') // Название текущего трека
  const [listeners, setListeners] = useState(0)               // Количество слушателей
  const [isTgReady, setIsTgReady] = useState(false)           // Готовность Telegram WebApp
  const [error, setError] = useState<string | null>(null)     // Текст ошибки
  const [buffering, setBuffering] = useState(false)           // Флаг буферизации
  const [showDiagnostics, setShowDiagnostics] = useState(false) // Показать панель диагностики
  const [eqBass, setEqBass] = useState(0)                     // Усиление баса (-12...+12 dB)
  const [eqMid, setEqMid] = useState(0)                       // Усиление средних частот
  const [eqTreble, setEqTreble] = useState(0)                 // Усиление высоких частот
  
  // Состояние диагностики
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo>({
    audioState: 'idle',           // Начальное состояние аудио
    audioContextState: 'none',    // AudioContext не создан
    currentStreamUrl: '',         // URL потока пуст
    lastError: '',                // Нет ошибки
    errorCode: null,              // Код ошибки отсутствует
    platform: '',                 // Платформа не определена
    isIOS: false,                 // Не iOS по умолчанию
    networkState: '',             // Состояние сети не определено
    readyState: '',               // Состояние готовности не определено
    lastEvent: '',                // Последнее событие пусто
    eventHistory: [],             // История событий пуста
    eqActive: false,              // Эквалайзер не активен
    webAudioMode: 'none',         // Режим WebAudio не определён
    realModeConfirmed: false,     // REAL MODE не подтверждён
  })

  // =====================================================
  // ССЫЛКИ (useRef) - сохраняются между рендерами
  // =====================================================
  const audioRef = useRef<HTMLAudioElement | null>(null)      // Ссылка на HTMLAudioElement
  const audioContextRef = useRef<AudioContext | null>(null)   // Ссылка на AudioContext
  const analyserRef = useRef<AnalyserNode | null>(null)       // Ссылка на AnalyserNode
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null) // Источник аудио
  const canvasRef = useRef<HTMLCanvasElement | null>(null)    // Canvas для визуализатора
  const animationFrameRef = useRef<number | null>(null)       // ID кадра анимации
  const isSourceConnectedRef = useRef(false)                  // Флаг: источник подключён
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)      // Таймаут загрузки
  const smoothedBarsRef = useRef<number[]>(new Array(24).fill(0)) // Сглаженные значения столбцов
  const isIOSRef = useRef(false)                              // iOS-флаг (в ref для стабильности)
  const eventHistoryRef = useRef<string[]>([])                // История событий
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null) // Интервал heartbeat
  const bassFilterRef = useRef<BiquadFilterNode | null>(null) // Фильтр баса
  const midFilterRef = useRef<BiquadFilterNode | null>(null)  // Фильтр средних частот
  const trebleFilterRef = useRef<BiquadFilterNode | null>(null) // Фильтр высоких частот
  const realModeCheckRef = useRef<boolean>(false)             // Флаг: проверка REAL MODE выполнена
  const fallbackModeRef = useRef<boolean>(false)              // Флаг: активен FALLBACK MODE
  const realModeCheckCountRef = useRef<number>(0)             // Счётчик кадров для проверки
  
  // Константа сглаживания для визуализатора
  const SMOOTHING_FACTOR = 0.25

  // =====================================================
  // ДИАГНОСТИКА
  // =====================================================
  
  /**
   * Обновляет состояние диагностики
   * @param update - Частичные данные для обновления
   */
  const updateDiagnostics = useCallback((update: Partial<DiagnosticInfo>) => {
    setDiagnostics(prev => ({ ...prev, ...update }))
  }, [])

  /**
   * Добавляет событие в историю
   * @param event - Описание события
   */
  const addEventToHistory = useCallback((event: string) => {
    const timestamp = new Date().toLocaleTimeString()        // Текущее время
    const entry = `[${timestamp}] ${event}`                  // Форматируем запись
    eventHistoryRef.current = [...eventHistoryRef.current.slice(-9), entry] // Храним последние 10
    updateDiagnostics({ lastEvent: entry, eventHistory: eventHistoryRef.current })
    console.log(`[AUDIO EVENT] ${entry}`)                    // Логируем в консоль
  }, [updateDiagnostics])

  // =====================================================
  // AUDIO CONTEXT - Создание и управление
  // =====================================================
  
  /**
   * Получает или создаёт AudioContext
   * Возвращает null если WebAudio не поддерживается
   * @returns AudioContext или null
   */
  const getAudioContext = useCallback(() => {
    // Если контекст уже существует - возвращаем его
    if (audioContextRef.current) return audioContextRef.current
    // Проверяем поддержку AudioContext (стандартный или webkit)
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null                      // WebAudio не поддерживается
    // Создаём новый контекст
    const ctx = new AudioContextClass()
    audioContextRef.current = ctx
    console.log('[AUDIO] AudioContext создан, состояние:', ctx.state)
    updateDiagnostics({ audioContextState: ctx.state })
    return ctx
  }, [updateDiagnostics])

  // =====================================================
  // ВИЗУАЛИЗАТОР - REAL MODE (частотный анализ)
  // =====================================================
  
  /**
   * Вычисляет среднее значение для диапазона bins
   * @param dataArray - Массив частотных данных
   * @param startBin - Начальный bin
   * @param endBin - Конечный bin
   * @returns Нормализованное значение (0-1)
   */
  const getAverageForBinRange = useCallback((dataArray: Uint8Array, startBin: number, endBin: number): number => {
    const start = Math.max(0, Math.floor(startBin))          // Ограничиваем начало
    const end = Math.min(dataArray.length - 1, Math.floor(endBin)) // Ограничиваем конец
    if (start > end) return 0                                // Неверный диапазон
    let sum = 0
    for (let i = start; i <= end; i++) sum += dataArray[i]   // Суммируем значения
    return (sum / (end - start + 1)) / 255                   // Нормализуем к 0-1
  }, [])

  /**
   * Преобразует частоту в номер bin анализатора
   * @param frequency - Частота в Hz
   * @param sampleRate - Частота дискретизации
   * @param fftSize - Размер FFT
   * @returns Номер bin
   */
  const frequencyToBin = useCallback((frequency: number, sampleRate: number, fftSize: number): number => {
    return frequency * (fftSize / 2) / (sampleRate / 2)
  }, [])

  /**
   * Основная функция визуализации - REAL MODE
   * Анализирует частоты и рисует 24 столбца (8 bass + 8 mid + 8 treble)
   */
  const visualizeReal = useCallback(() => {
    const analyser = analyserRef.current                     // Получаем анализатор
    const canvas = canvasRef.current                        // Получаем canvas
    const ctx = canvas?.getContext('2d')                     // Контекст рисования
    
    // Если нет анализатора или canvas - продолжаем цикл
    if (!analyser || !canvas || !ctx) {
      animationFrameRef.current = requestAnimationFrame(visualizeReal)
      return
    }
    
    // Получаем частотные данные
    const bufferLength = analyser.frequencyBinCount          // Количество bins
    const dataArray = new Uint8Array(bufferLength)           // Массив для данных
    analyser.getByteFrequencyData(dataArray)                 // Получаем данные
    
    // =====================================================
    // ПРОВЕРКА REAL MODE - анализируем есть ли реальные данные
    // =====================================================
    if (!realModeCheckRef.current && !fallbackModeRef.current) {
      // Проверяем наличие ненулевых данных
      let hasNonZeroData = false
      for (let i = 0; i < dataArray.length; i++) {
        if (dataArray[i] > 10) {                             // Порог шума
          hasNonZeroData = true
          break
        }
      }
      
      if (hasNonZeroData) {
        realModeCheckCountRef.current++                      // Увеличиваем счётчик
        if (realModeCheckCountRef.current >= REAL_MODE_CHECK_FRAMES) {
          // REAL MODE подтверждён
          realModeCheckRef.current = true
          console.log('[AUDIO] REAL MODE подтверждён - анализатор работает')
          updateDiagnostics({ realModeConfirmed: true, webAudioMode: 'real' })
        }
      }
    }
    
    // Параметры анализатора
    const sampleRate = analyser.context.sampleRate           // Частота дискретизации
    const fftSize = analyser.fftSize                         // Размер FFT
    const barValues: number[] = []                           // Значения для столбцов
    
    // =====================================================
    // BASS SECTION (20-250 Hz) - 8 столбцов
    // =====================================================
    const bassFreqs = [20, 30, 45, 65, 90, 120, 160, 220]    // Центральные частоты
    for (let i = 0; i < 8; i++) {
      // Вычисляем границы диапазона для каждого столбца
      const lowFreq = i === 0 ? 20 : bassFreqs[i] - (bassFreqs[i] - bassFreqs[i-1]) / 2
      const highFreq = i === 7 ? 250 : bassFreqs[i] + (bassFreqs[i+1] - bassFreqs[i]) / 2
      // Преобразуем частоты в bins
      const lowBin = frequencyToBin(lowFreq, sampleRate, fftSize)
      const highBin = frequencyToBin(highFreq, sampleRate, fftSize)
      // Получаем среднее значение для диапазона
      barValues.push(getAverageForBinRange(dataArray, lowBin, highBin))
    }
    
    // =====================================================
    // MID SECTION (250-4000 Hz) - 8 столбцов
    // =====================================================
    const midFreqs = [300, 420, 580, 800, 1100, 1500, 2100, 3000]
    for (let i = 0; i < 8; i++) {
      const lowFreq = i === 0 ? 250 : midFreqs[i] - (midFreqs[i] - midFreqs[i-1]) / 2
      const highFreq = i === 7 ? 4000 : midFreqs[i] + (midFreqs[i+1] - midFreqs[i]) / 2
      const lowBin = frequencyToBin(lowFreq, sampleRate, fftSize)
      const highBin = frequencyToBin(highFreq, sampleRate, fftSize)
      barValues.push(getAverageForBinRange(dataArray, lowBin, highBin))
    }
    
    // =====================================================
    // TREBLE SECTION (4000-20000 Hz) - 8 столбцов
    // =====================================================
    const trebleFreqs = [4500, 5500, 7000, 8500, 10500, 13000, 16000, 19000]
    for (let i = 0; i < 8; i++) {
      const lowFreq = i === 0 ? 4000 : trebleFreqs[i] - (trebleFreqs[i] - trebleFreqs[i-1]) / 2
      const highFreq = i === 7 ? 20000 : trebleFreqs[i] + (trebleFreqs[i+1] - trebleFreqs[i]) / 2
      const lowBin = frequencyToBin(lowFreq, sampleRate, fftSize)
      const highBin = frequencyToBin(highFreq, sampleRate, fftSize)
      barValues.push(getAverageForBinRange(dataArray, lowBin, highBin))
    }
    
    // =====================================================
    // СГЛАЖИВАНИЕ - для плавности анимации
    // =====================================================
    for (let i = 0; i < 24; i++) {
      smoothedBarsRef.current[i] = smoothedBarsRef.current[i] + (barValues[i] - smoothedBarsRef.current[i]) * SMOOTHING_FACTOR
    }
    
    // =====================================================
    // ОТРИСОВКА
    // =====================================================
    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)                       // Очищаем canvas
    
    const gap = 2                                            // Отступ между столбцами
    const sectionGap = 8                                     // Отступ между секциями
    const barWidth = (width - 23 * gap - 2 * sectionGap) / 24 // Ширина столбца
    
    for (let i = 0; i < 24; i++) {
      const section = Math.floor(i / 8)                      // Определяем секцию (0=bass, 1=mid, 2=treble)
      const barInSection = i % 8                             // Позиция в секции
      const x = barInSection * (barWidth + gap) + section * (8 * (barWidth + gap) + sectionGap)
      const barHeight = Math.max(2, smoothedBarsRef.current[i] * (height - 4))
      
      // Создаём градиент в зависимости от секции
      let gradient: CanvasGradient
      if (section === 0) {
        // Bass - розовый градиент
        gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, COLORS.bass)
        gradient.addColorStop(1, '#ff3399')
      } else if (section === 1) {
        // Mid - зелёный градиент
        gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, COLORS.mid)
        gradient.addColorStop(1, COLORS.accent)
      } else {
        // Treble - бирюзовый градиент
        gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, COLORS.high)
        gradient.addColorStop(1, '#66ffee')
      }
      
      // Рисуем столбец с закруглёнными углами
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.roundRect(x, height - barHeight, barWidth, barHeight, 2)
      ctx.fill()
    }
    
    // Продолжаем анимацию
    animationFrameRef.current = requestAnimationFrame(visualizeReal)
  }, [frequencyToBin, getAverageForBinRange, updateDiagnostics])

  /**
   * Визуализация FALLBACK MODE - декоративная анимация
   * Используется ТОЛЬКО если REAL MODE не работает
   */
  const visualizeFallback = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    
    // Функция анимации
    const animate = () => {
      // Проверяем, что воспроизведение активно
      if (!isPlaying) {
        stopVisualization()
        return
      }
      
      const width = canvas.width
      const height = canvas.height
      ctx.clearRect(0, 0, width, height)
      
      const time = Date.now() / 1000                          // Время для анимации
      const gap = 2
      const sectionGap = 8
      const barWidth = (width - 23 * gap - 2 * sectionGap) / 24
      
      for (let i = 0; i < 24; i++) {
        const section = Math.floor(i / 8)
        const barInSection = i % 8
        const x = barInSection * (barWidth + gap) + section * (8 * (barWidth + gap) + sectionGap)
        
        // Псевдо-случайная анимация на основе синусоид
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
  }, [isPlaying])

  /**
   * Запускает визуализацию в зависимости от режима
   */
  const startVisualization = useCallback(() => {
    if (animationFrameRef.current) return                    // Уже запущена
    
    if (fallbackModeRef.current) {
      // FALLBACK MODE - декоративная анимация
      console.log('[VISUALIZER] Запуск FALLBACK режима')
      visualizeFallback()
    } else {
      // REAL MODE - анализ частот
      console.log('[VISUALIZER] Запуск REAL режима')
      visualizeReal()
    }
  }, [visualizeReal, visualizeFallback])

  /**
   * Останавливает визуализацию
   */
  const stopVisualization = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)         // Отменяем кадр
      animationFrameRef.current = null
    }
    smoothedBarsRef.current = new Array(24).fill(0)          // Сбрасываем сглаживание
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height) // Очищаем canvas
  }, [])

  // =====================================================
  // ЭКВАЛАЙЗЕР - REAL MODE
  // =====================================================
  
  /**
   * Подключает аудио-цепь: source -> filters -> analyser -> destination
   * Создаётся ТОЛЬКО ОДИН РАЗ за lifecycle
   * @returns true если подключение успешно
   */
  const connectAudioChain = useCallback((): boolean => {
    // Если уже подключено - возвращаем успех
    if (isSourceConnectedRef.current) return true
    
    const audio = audioRef.current
    if (!audio) return false
    
    const ctx = getAudioContext()
    if (!ctx) return false
    
    try {
      // =====================================================
      // Создаём 3-полосный эквалайзер (BiquadFilter)
      // =====================================================
      
      // BASS FILTER - lowshelf, влияет на частоты до 250 Hz
      const bassFilter = ctx.createBiquadFilter()
      bassFilter.type = 'lowshelf'                           // Тип фильтра
      bassFilter.frequency.value = 250                       // Частота среза
      bassFilter.gain.value = eqBass                         // Усиление из состояния
      bassFilterRef.current = bassFilter
      
      // MID FILTER - peaking, влияет на 250-4000 Hz
      const midFilter = ctx.createBiquadFilter()
      midFilter.type = 'peaking'                             // Тип фильтра
      midFilter.frequency.value = 1000                       // Центральная частота
      midFilter.Q.value = 0.5                                // Добротность
      midFilter.gain.value = eqMid                           // Усиление из состояния
      midFilterRef.current = midFilter
      
      // TREBLE FILTER - highshelf, влияет на частоты выше 4000 Hz
      const trebleFilter = ctx.createBiquadFilter()
      trebleFilter.type = 'highshelf'                        // Тип фильтра
      trebleFilter.frequency.value = 4000                    // Частота среза
      trebleFilter.gain.value = eqTreble                     // Усиление из состояния
      trebleFilterRef.current = trebleFilter
      
      // =====================================================
      // Создаём анализатор частот
      // =====================================================
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512                                 // Размер FFT (256 bins)
      analyser.smoothingTimeConstant = 0.8                   // Сглаживание
      analyserRef.current = analyser
      
      // =====================================================
      // Создаём источник из audio элемента (ТОЛЬКО ОДИН РАЗ!)
      // =====================================================
      const source = ctx.createMediaElementSource(audio)
      sourceNodeRef.current = source
      
      // =====================================================
      // Подключаем цепь: source -> bass -> mid -> treble -> analyser -> destination
      // =====================================================
      source.connect(bassFilter)                             // Источник -> bass filter
      bassFilter.connect(midFilter)                          // Bass -> mid filter
      midFilter.connect(trebleFilter)                        // Mid -> treble filter
      trebleFilter.connect(analyser)                         // Treble -> analyser
      analyser.connect(ctx.destination)                      // Analyser -> выход
      
      isSourceConnectedRef.current = true                     // Помечаем как подключённое
      console.log('[AUDIO] Аудио-цепь подключена: source -> bass -> mid -> treble -> analyser -> destination')
      updateDiagnostics({ eqActive: true })
      return true
    } catch (e) {
      console.error('[AUDIO] Ошибка подключения аудио-цепи:', e)
      return false
    }
  }, [getAudioContext, eqBass, eqMid, eqTreble, updateDiagnostics])

  // =====================================================
  // ИНИЦИАЛИЗАЦИЯ АУДИО ЭЛЕМЕНТА
  // =====================================================
  useEffect(() => {
    // Определяем платформу при монтировании
    isIOSRef.current = detectIOS()
    const platformName = getPlatformName()
    
    console.log('[AUDIO] Инициализация. Платформа:', platformName, 'iOS:', isIOSRef.current)
    
    updateDiagnostics({
      platform: platformName,
      isIOS: isIOSRef.current,
      audioState: 'idle',
      webAudioMode: 'none',
    })
    
    // =====================================================
    // Создаём HTMLAudioElement
    // =====================================================
    const audio = new Audio()
    audio.preload = 'none'                                   // Не загружаем автоматически
    audio.crossOrigin = 'anonymous'                          // CORS для WebAudio
    
    // ВАЖНО для iOS: атрибуты для корректной работы в WKWebView
    audio.setAttribute('playsinline', 'true')
    audio.setAttribute('webkit-playsinline', 'true')
    audio.setAttribute('x5-video-player-type', 'h5')         // Для WeChat/Tencent
    audio.setAttribute('x5-video-player-fullscreen', 'true')
    audioRef.current = audio
    
    // =====================================================
    // Обработчики событий аудио
    // =====================================================
    
    // Событие: воспроизведение началось
    const onPlaying = () => {
      addEventToHistory('playing')
      updateDiagnostics({ audioState: 'playing', lastError: '', errorCode: null })
      setIsPlaying(true)
      setIsLoading(false)
      setBuffering(false)
      setError(null)
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    }
    
    // Событие: воспроизведение на паузе
    const onPause = () => {
      addEventToHistory('pause')
      updateDiagnostics({ audioState: 'paused' })
      setIsPlaying(false)
      stopVisualization()
    }
    
    // Событие: ожидание данных (буферизация)
    const onWaiting = () => {
      addEventToHistory('waiting')
      setBuffering(true)
      setIsLoading(true)
    }
    
    // Событие: можно начинать воспроизведение
    const onCanPlay = () => {
      addEventToHistory('canplay')
      updateDiagnostics({ audioState: 'ready' })
      setBuffering(false)
      setIsLoading(false)
    }
    
    // Событие: stalled (нет данных)
    const onStalled = () => {
      addEventToHistory('stalled')
      setBuffering(true)
    }
    
    // Событие: ошибка воспроизведения
    const onError = () => {
      const mediaError = audio.error
      const errorDetails = mediaError ? getAudioErrorMessage(mediaError) : 'Unknown error'
      addEventToHistory(`ERROR: ${errorDetails}`)
      
      // Проверяем на MEDIA_ERR_DECODE - признак проблемы с WebAudio на iOS
      if (mediaError?.code === MediaError.MEDIA_ERR_DECODE) {
        console.error('[AUDIO] MEDIA_ERR_DECODE - возможная проблема WebAudio с бесконечным потоком')
        // Если это iOS и мы пытались использовать REAL MODE - переключаемся в fallback
        if (isIOSRef.current && !fallbackModeRef.current) {
          console.log('[AUDIO] Переключение в FALLBACK MODE из-за MEDIA_ERR_DECODE')
          fallbackModeRef.current = true
          updateDiagnostics({ webAudioMode: 'fallback', realModeConfirmed: false })
        }
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
    
    // Подписываемся на события
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('stalled', onStalled)
    audio.addEventListener('error', onError)
    
    // =====================================================
    // Обработка видимости страницы (resume AudioContext)
    // =====================================================
    const onVisibilityChange = async () => {
      const ctx = audioContextRef.current
      if (document.visibilityState === 'visible' && ctx && ctx.state === 'suspended') {
        try {
          await ctx.resume()
          updateDiagnostics({ audioContextState: ctx.state })
        } catch (e) {
          console.error('[AUDIO] Ошибка resume AudioContext:', e)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    
    // =====================================================
    // Очистка при размонтировании
    // =====================================================
    return () => {
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('stalled', onStalled)
      audio.removeEventListener('error', onError)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      audio.pause()                                          // Останавливаем воспроизведение
      audio.src = ''                                         // Очищаем источник
      stopVisualization()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [stopVisualization, updateDiagnostics, addEventToHistory])

  // =====================================================
  // УПРАВЛЕНИЕ ГРОМКОСТЬЮ
  // =====================================================
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100
    }
  }, [volume, isMuted])

  // =====================================================
  // УПРАВЛЕНИЕ ЭКВАЛАЙЗЕРОМ (обновление значений фильтров)
  // =====================================================
  useEffect(() => {
    if (bassFilterRef.current) {
      bassFilterRef.current.gain.value = eqBass
      console.log('[EQ] Bass gain:', eqBass)
    }
  }, [eqBass])
  
  useEffect(() => {
    if (midFilterRef.current) {
      midFilterRef.current.gain.value = eqMid
      console.log('[EQ] Mid gain:', eqMid)
    }
  }, [eqMid])
  
  useEffect(() => {
    if (trebleFilterRef.current) {
      trebleFilterRef.current.gain.value = eqTreble
      console.log('[EQ] Treble gain:', eqTreble)
    }
  }, [eqTreble])

  // =====================================================
  // ИНИЦИАЛИЗАЦИЯ TELEGRAM WEBAPP
  // =====================================================
  useEffect(() => {
    const initTelegram = () => {
      const tg = window.Telegram?.WebApp
      if (tg) {
        tg.ready()                                           // Сигнализируем о готовности
        tg.expand()                                          // Раскрываем на весь экран
        setIsTgReady(true)
        const isIOSFromTG = tg.platform === 'ios'
        if (isIOSFromTG) isIOSRef.current = true             // Обновляем iOS-флаг
        updateDiagnostics({ platform: `Telegram/${tg.platform}`, isIOS: isIOSFromTG || isIOSRef.current })
        return true
      }
      return false
    }
    
    // Пробуем инициализировать сразу
    if (initTelegram()) return
    
    // Если не удалось - пробуем с интервалом (Telegram SDK может загружаться асинхронно)
    let attempts = 0
    const interval = setInterval(() => {
      attempts++
      if (initTelegram() || attempts >= 20) clearInterval(interval)
    }, 100)
    
    return () => clearInterval(interval)
  }, [updateDiagnostics])

  // =====================================================
  // LISTENER TRACKING - отслеживание слушателей
  // =====================================================
  
  /**
   * Регистрирует слушателя на сервере
   * @param action - Действие: 'open' | 'close' | 'heartbeat'
   */
  const registerListener = useCallback(async (action: 'open' | 'close' | 'heartbeat') => {
    const tg = window.Telegram?.WebApp
    const user = tg?.initDataUnsafe?.user
    
    console.log('[LISTENER] registerListener called:', action)
    console.log('[LISTENER] Telegram WebApp:', !!tg)
    console.log('[LISTENER] User data:', user)
    
    // Определяем ID пользователя
    let userId: number
    let firstName: string
    
    if (user) {
      // Есть Telegram user - используем его данные
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
      // Хешируем sessionId для числового ID
      let hash = 0
      for (let i = 0; i < sessionId.length; i++) {
        hash = ((hash << 5) - hash) + sessionId.charCodeAt(i)
        hash = hash & hash
      }
      userId = Math.abs(hash)
      firstName = 'Гость'
      console.log('[LISTENER] Using fallback session:', sessionId, 'userId:', userId)
    }
    
    // Отправляем запрос на сервер
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

  // Регистрация слушателя при воспроизведении
  useEffect(() => {
    if (isPlaying) {
      console.log('[LISTENER] Playback started - registering listener')
      registerListener('open')
      heartbeatIntervalRef.current = setInterval(() => {
        registerListener('heartbeat')
      }, HEARTBEAT_INTERVAL)
    } else {
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

  // Получение количества слушателей
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

  // Получение названия текущего трека
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

  // Отправка close при закрытии страницы
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

      console.log('[LISTENER] Sent close beacon for user:', userId)
    }
    window.addEventListener('beforeunload', sendClose)
    window.addEventListener('pagehide', sendClose)
    return () => {
      window.removeEventListener('beforeunload', sendClose)
      window.removeEventListener('pagehide', sendClose)
    }
  }, [])

  // =====================================================
  // ОБРАБОТЧИК PLAY/PAUSE
  // =====================================================
  const handlePlay = async () => {
    const audio = audioRef.current
    if (!audio) return
    
    // Если уже играем - ставим на паузу
    if (isPlaying) {
      audio.pause()
      registerListener('close')
      return
    }
    
    setError(null)
    setIsLoading(true)
    
    const isIOS = isIOSRef.current
    console.log('[PLAY] === START === iOS:', isIOS, 'Fallback mode:', fallbackModeRef.current)
    
    // Устанавливаем таймаут загрузки
    timeoutRef.current = setTimeout(() => {
      if (isLoading && !isPlaying) {
        setError('Таймаут загрузки')
        setIsLoading(false)
        setBuffering(false)
        audio.pause()
      }
    }, LOAD_TIMEOUT)
    
    try {
      // Устанавливаем громкость
      audio.volume = isMuted ? 0 : volume / 100
      
      // Устанавливаем источник если нужно
      if (!audio.src || audio.src !== STREAM_URL) {
        console.log('[PLAY] Setting src:', STREAM_URL)
        audio.src = STREAM_URL
        audio.load()
        updateDiagnostics({ currentStreamUrl: STREAM_URL })
      }
      
      // =====================================================
      // REAL-FIRST ARCHITECTURE
      // Всегда пытаемся создать WebAudio граф первым делом
      // =====================================================
      
      // Проверяем, не находимся ли мы уже в fallback режиме
      if (!fallbackModeRef.current) {
        console.log('[PLAY] Попытка REAL MODE')
        
        // Создаём AudioContext если нужно
        const ctx = getAudioContext()
        if (ctx) {
          // Resume если suspended (требуется user gesture на iOS)
          if (ctx.state === 'suspended') {
            await ctx.resume()
            updateDiagnostics({ audioContextState: ctx.state })
          }
          
          // Подключаем аудио-цепь (EQ + Analyser)
          const chainConnected = connectAudioChain()
          
          if (chainConnected) {
            console.log('[PLAY] WebAudio цепь создана успешно')
            updateDiagnostics({ webAudioMode: 'real' })
            
            // Запускаем визуализацию REAL MODE
            startVisualization()
            
            // Запускаем проверку REAL MODE после небольшой задержки
            setTimeout(() => {
              if (!realModeCheckRef.current && !fallbackModeRef.current) {
                // Проверяем, что анализатор получает данные
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
                    console.log('[PLAY] REAL MODE подтверждён')
                    realModeCheckRef.current = true
                    updateDiagnostics({ realModeConfirmed: true })
                  }
                }
              }
            }, REAL_MODE_CHECK_DELAY)
          } else {
            console.log('[PLAY] Не удалось создать WebAudio цепь - включаем FALLBACK')
            fallbackModeRef.current = true
            updateDiagnostics({ webAudioMode: 'fallback', eqActive: false })
          }
        } else {
          console.log('[PLAY] AudioContext не поддерживается - FALLBACK')
          fallbackModeRef.current = true
          updateDiagnostics({ webAudioMode: 'fallback' })
        }
      } else {
        console.log('[PLAY] Уже в FALLBACK режиме')
        updateDiagnostics({ webAudioMode: 'fallback' })
      }
      
      // Запускаем воспроизведение
      console.log('[PLAY] Calling audio.play()')
      await audio.play()
      console.log('[PLAY] audio.play() resolved successfully!')
      
    } catch (err: any) {
      console.error('[PLAY] Error:', err.name, err.message)
      
      // Обрабатываем ошибку
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      setIsLoading(false)
      
      let errorMsg = 'Ошибка воспроизведения'
      if (err.name === 'NotAllowedError') {
        errorMsg = 'Нажмите кнопку воспроизведения ещё раз'
      } else if (err.name === 'NotSupportedError') {
        errorMsg = 'Формат аудио не поддерживается'
      } else if (err.name === 'AbortError') {
        errorMsg = 'Воспроизведение прервано'
      }
      
      setError(errorMsg)
      updateDiagnostics({ lastError: `${err.name}: ${err.message}`, audioState: 'error' })
      
      // Если ошибка на iOS и мы в REAL MODE - переключаемся в fallback
      if (isIOS && !fallbackModeRef.current) {
        console.log('[PLAY] Переключение в FALLBACK MODE из-за ошибки')
        fallbackModeRef.current = true
        updateDiagnostics({ webAudioMode: 'fallback' })
      }
    }
  }

  // =====================================================
  // RENDER
  // =====================================================
  const isIOSDevice = isIOSRef.current
  const isFallbackActive = fallbackModeRef.current
  const isRealModeActive = realModeCheckRef.current

  return (
    <>
      {/* Глобальные стили компонента */}
      <style jsx global>{`
        /* Слайдер громкости - стилизация */
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
        /* Карточка в скевоморфном стиле */
        .skeuo-card {
          background: linear-gradient(145deg, rgba(46,0,113,0.6), rgba(13,0,38,0.8));
          border: 1px solid rgba(0,199,48,0.2);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        /* Слайдер эквалайзера */
        .eq-slider {
          -webkit-appearance: none;
          height: 6px;
          border-radius: 5px;
          background: linear-gradient(90deg, #0d0026 0%, #00c730 50%, #0d0026 100%);
        }
        .eq-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 2px solid #00c730;
          cursor: pointer;
        }
        /* Панель диагностики */
        .diagnostic-panel {
          font-family: monospace;
          font-size: 10px;
          line-height: 1.4;
          max-height: 200px;
          overflow-y: auto;
        }
      `}</style>
      
      {/* Основной контейнер */}
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: `linear-gradient(180deg, ${COLORS.primary} 0%, ${COLORS.dark} 100%)` }}>
        {/* Декоративный фон */}
        <div className="fixed inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 80% 50% at 50% 30%, rgba(0,199,48,0.15) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 30% 60%, rgba(255,0,102,0.1) 0%, transparent 50%)` }} />
        
        <div className="relative z-10 w-full max-w-xs">
          {/* Логотип станции */}
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
          
          {/* Визуализатор */}
          <div className="skeuo-card rounded-xl p-2 mb-3">
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
            
            {/* Canvas визуализатора */}
            <canvas ref={canvasRef} width={280} height={60} className="w-full rounded" style={{ background: 'transparent' }} />
            
            {/* Подписи секций */}
            <div className="flex justify-between mt-1.5 px-1">
              <span className="text-xs font-medium" style={{ color: COLORS.bass }}>BASS</span>
              <span className="text-xs font-medium" style={{ color: COLORS.mid }}>MID</span>
              <span className="text-xs font-medium" style={{ color: COLORS.high }}>TREBLE</span>
            </div>
          </div>
          
          {/* Эквалайзер - показываем если (не iOS) ИЛИ (iOS но REAL MODE работает) */}
          {(!isIOSDevice || isRealModeActive) && !isFallbackActive && (
            <div className="skeuo-card rounded-xl p-2 mb-3">
              <div className="text-xs text-center mb-2" style={{ color: COLORS.secondary }}>
                Эквалайзер {isRealModeActive ? '✓ REAL' : ''}
              </div>
              
              {/* Bass slider */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs w-10" style={{ color: COLORS.bass }}>Bass</span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  value={eqBass}
                  onChange={(e) => setEqBass(parseInt(e.target.value, 10))}
                  className="eq-slider flex-1 cursor-pointer"
                />
                <span className="text-xs w-6 text-right" style={{ color: COLORS.text }}>
                  {eqBass > 0 ? '+' : ''}{eqBass}
                </span>
              </div>
              
              {/* Mid slider */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs w-10" style={{ color: COLORS.mid }}>Mid</span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  value={eqMid}
                  onChange={(e) => setEqMid(parseInt(e.target.value, 10))}
                  className="eq-slider flex-1 cursor-pointer"
                />
                <span className="text-xs w-6 text-right" style={{ color: COLORS.text }}>
                  {eqMid > 0 ? '+' : ''}{eqMid}
                </span>
              </div>
              
              {/* Treble slider */}
              <div className="flex items-center gap-2">
                <span className="text-xs w-10" style={{ color: COLORS.high }}>Treble</span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  value={eqTreble}
                  onChange={(e) => setEqTreble(parseInt(e.target.value, 10))}
                  className="eq-slider flex-1 cursor-pointer"
                />
                <span className="text-xs w-6 text-right" style={{ color: COLORS.text }}>
                  {eqTreble > 0 ? '+' : ''}{eqTreble}
                </span>
              </div>
            </div>
          )}
          
          {/* Уведомление о режиме совместимости - только если FALLBACK активен */}
          {isFallbackActive && (
            <div className="text-xs text-center mb-3 p-2 rounded-xl skeuo-card" style={{ color: COLORS.text }}>
              ⚠️ Режим совместимости: EQ недоступен, визуализатор декоративный
            </div>
          )}
          
          {/* Информация о станции */}
          <div className="skeuo-card rounded-xl p-2 text-center mb-3">
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
          </div>
          
          {/* Индикатор буферизации */}
          {buffering && (
            <div className="flex items-center justify-center gap-2 mb-2 p-1.5 rounded-xl skeuo-card">
              <Wifi className="w-3 h-3 animate-pulse" style={{ color: COLORS.secondary }} />
              <span className="text-xs" style={{ color: COLORS.secondary }}>Буферизация...</span>
            </div>
          )}
          
          {/* Сообщение об ошибке */}
          {error && (
            <div className="flex items-center justify-center gap-2 mb-2 p-1.5 rounded-xl" style={{ background: 'rgba(255,0,102,0.1)' }}>
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
          
          {/* Панель диагностики */}
          <div className="mb-3">
            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="text-xs mb-1 opacity-50 hover:opacity-100"
              style={{ color: COLORS.secondary }}
            >
              {showDiagnostics ? '▼ Скрыть диагностику' : '▶ Показать диагностику'}
            </button>
            
            {showDiagnostics && (
              <div className="diagnostic-panel skeuo-card rounded-xl p-2" style={{ background: 'rgba(0,0,0,0.5)' }}>
                <div className="font-bold mb-1" style={{ color: COLORS.secondary }}>🔧 ДИАГНОСТИКА</div>
                <div style={{ color: diagnostics.isIOS ? COLORS.bass : COLORS.accent }}>
                  Platform: {diagnostics.platform} {diagnostics.isIOS && '🍎 iOS'}
                </div>
                <div style={{ color: COLORS.text }}>Audio: {diagnostics.audioState}</div>
                <div style={{ color: COLORS.text }}>WebAudio: {diagnostics.webAudioMode}</div>
                <div style={{ color: diagnostics.realModeConfirmed ? COLORS.accent : COLORS.text }}>
                  REAL MODE: {diagnostics.realModeConfirmed ? '✓ подтверждён' : 'не подтверждён'}
                </div>
                <div style={{ color: diagnostics.eqActive ? COLORS.accent : COLORS.text }}>
                  EQ: {diagnostics.eqActive ? 'ON' : 'OFF'}
                </div>
                <div style={{ color: COLORS.text, wordBreak: 'break-all' }}>
                  URL: {diagnostics.currentStreamUrl || '(нет)'}
                </div>
                {diagnostics.lastError && (
                  <div style={{ color: COLORS.bass }}>ERROR: {diagnostics.lastError}</div>
                )}
                <div style={{ color: COLORS.mid }}>Last: {diagnostics.lastEvent}</div>
                <div className="mt-1 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ color: COLORS.secondary }}>History:</div>
                  {diagnostics.eventHistory.map((e, i) => (
                    <div key={i} style={{ color: COLORS.text, fontSize: '9px' }}>{e}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Футер */}
          <p className="text-center text-xs mt-2" style={{ color: '#555' }}>
            Powered by <span style={{ color: COLORS.secondary }}>DJ GooD OFF</span>
          </p>
        </div>
      </div>
    </>
  )
}
