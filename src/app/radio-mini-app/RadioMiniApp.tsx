'use client'

// =====================================================
// ИМПОРТЫ
// Импортируем необходимые хуки и компоненты из React и библиотек
// =====================================================
import { useState, useEffect, useRef, useCallback } from 'react' // Хуки React для состояния и жизненного цикла
import { motion, AnimatePresence } from 'framer-motion' // Библиотека анимаций для React
import { Play, Pause, Volume2, VolumeX, Loader2, Radio, AlertCircle, Wifi } from 'lucide-react' // Иконки из библиотеки lucide-react

// =====================================================
// КОНСТАНТЫ КОНФИГУРАЦИИ
// Основные настройки приложения: URL потоков, название станции, цвета
// =====================================================

// URL HTTPS MP3 потока через Cloudflare Worker (проксирует HTTP поток RadioHeart)
// Worker работает как "clean MP3 proxy" без транскодинга, без HLS, без MSE
const STREAM_URL = 'https://radio-stream.gondurass89.workers.dev'

// Название радиостанции для отображения в UI
const STATION_NAME = 'DJ GooD OFF FM'

// Путь к логотипу станции (находится в папке public)
const STATION_LOGO = '/logo.png'

// URL Cloudflare Worker для подсчёта слушателей по Telegram User ID
const LISTENERS_API = 'https://listeners.gondurass89.workers.dev'

// Локальный API endpoint для получения названия текущего трека
const NOW_PLAYING_API = '/api/now-playing'

// Интервал отправки heartbeat для отслеживания активных слушателей (30 секунд)
const HEARTBEAT_INTERVAL = 30000

// Таймаут загрузки потока перед показом ошибки (25 секунд)
const LOAD_TIMEOUT = 25000

// =====================================================
// ЦВЕТОВАЯ ПАЛИТРА
// Цвета для UI элементов, градиентов, визуализатора
// =====================================================
const COLORS = {
  primary: '#2e0071',    // Основной фиолетовый цвет фона
  secondary: '#00c730',  // Зелёный акцентный цвет
  accent: '#00ff40',     // Ярко-зелёный акцент
  text: '#c4c4c4',       // Серый цвет текста
  dark: '#0d0026',       // Тёмно-фиолетовый для фона
  bass: '#ff0066',       // Розовый цвет для bass полосы
  mid: '#00c730',        // Зелёный цвет для mid полосы
  high: '#00ffcc',       // Бирюзовый цвет для treble полосы
}

// Telegram User ID администратора (для исключения из уведомлений)
const ADMIN_USER_ID = 55068554

// =====================================================
// ТИПЫ ДЛЯ ДИАГНОСТИКИ
// Интерфейс для хранения диагностической информации
// =====================================================
interface DiagnosticInfo {
  audioState: string         // Состояние аудио: idle/loading/playing/paused/error
  audioContextState: string  // Состояние AudioContext: suspended/running/closed
  currentStreamUrl: string   // Текущий URL потока
  lastError: string          // Текст последней ошибки
  errorCode: number | null   // Код ошибки MediaError
  platform: string           // Платформа (iOS/Android/Desktop)
  isIOS: boolean             // Флаг определения iOS
  networkState: string       // Состояние сети audio элемента
  readyState: string         // Состояние готовности audio элемента
  lastEvent: string          // Последнее событие аудио
  eventHistory: string[]     // История последних событий
  eqActive: boolean          // Активен ли эквалайзер
}

// =====================================================
// РАСШИРЕНИЕ ГЛОБАЛЬНОГО ИНТЕРФЕЙСА WINDOW
// Добавляем типы для Telegram WebApp API и webkitAudioContext
// =====================================================
declare global {
  interface Window {
    // Telegram WebApp API для Mini Apps
    Telegram?: {
      WebApp?: {
        ready: () => void                    // Инициализация Mini App
        expand: () => void                   // Раскрыть на весь экран
        platform: string                     // Платформа: ios/android/tdesktop
        initData: string                     // Данные инициализации
        initDataUnsafe?: {
          user?: {
            id: number                       // Уникальный ID пользователя Telegram
            first_name: string               // Имя
            last_name?: string               // Фамилия
            username?: string                // Username без @
            language_code?: string           // Код языка
          }
        }
        onEvent: (event: string, callback: () => void) => void  // Подписка на события
        close: () => void                    // Закрыть Mini App
      }
    }
    // webkitAudioContext для старых версий Safari/iOS
    webkitAudioContext?: typeof AudioContext
  }
}

// =====================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// Функции для определения платформы и расшифровки ошибок
// =====================================================

/**
 * Определяет, является ли устройство iOS (iPhone/iPad/iPod)
 * Использует userAgent и Telegram WebApp platform
 * @returns true если iOS, false иначе
 */
function detectIOS(): boolean {
  const ua = navigator.userAgent // Получаем строку userAgent браузера
  const isIPad = /iPad/i.test(ua) // Проверяем iPad по userAgent
  const isIPhone = /iPhone/i.test(ua) // Проверяем iPhone по userAgent
  const isIPod = /iPod/i.test(ua) // Проверяем iPod по userAgent
  // iPad на iOS 13+ может определяться как Macintosh с touch points
  const isIPadModern = /Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1
  // Проверяем платформу через Telegram WebApp API
  const tgPlatform = window.Telegram?.WebApp?.platform || ''
  // Возвращаем true если любое из условий выполнено
  return isIPad || isIPhone || isIPod || isIPadModern || tgPlatform === 'ios'
}

/**
 * Возвращает читаемое название платформы
 * @returns Строка с названием платформы
 */
function getPlatformName(): string {
  const ua = navigator.userAgent // Получаем userAgent
  const tgPlatform = window.Telegram?.WebApp?.platform || '' // Платформа Telegram
  // Если Telegram WebApp доступен, возвращаем его платформу
  if (tgPlatform) return `Telegram/${tgPlatform}`
  // Иначе определяем по userAgent
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Mac/i.test(ua)) return 'Mac'
  if (/Win/i.test(ua)) return 'Windows'
  return 'Unknown'
}

/**
 * Расшифровывает код ошибки MediaError в читаемый текст
 * @param error - объект MediaError или null
 * @returns Строка с описанием ошибки
 */
function getAudioErrorMessage(error: MediaError | null): string {
  if (!error) return 'Нет ошибки' // Если ошибки нет
  // Расшифровываем код ошибки
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'MEDIA_ERR_ABORTED (1): Воспроизведение отменено пользователем'
    case MediaError.MEDIA_ERR_NETWORK:
      return 'MEDIA_ERR_NETWORK (2): Ошибка сети при загрузке аудио'
    case MediaError.MEDIA_ERR_DECODE:
      return 'MEDIA_ERR_DECODE (3): Ошибка декодирования аудио'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'MEDIA_ERR_SRC_NOT_SUPPORTED (4): Формат аудио не поддерживается'
    default:
      return `Неизвестная ошибка (код: ${error.code})`
  }
}

/**
 * Преобразует числовой код networkState в читаемую строку
 * @param state - числовой код состояния сети
 * @returns Строка с названием состояния
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
 * Преобразует числовой код readyState в читаемую строку
 * @param state - числовой код готовности
 * @returns Строка с названием состояния
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
// ОСНОВНОЙ КОМПОНЕНТ RadioMiniApp
// Главный компонент Telegram Mini App для интернет-радио
// =====================================================
export default function RadioMiniApp() {
  // =====================================================
  // СОСТОЯНИЯ КОМПОНЕНТА (useState)
  // Управление UI состоянием плеера
  // =====================================================
  
  // Флаг воспроизведения: true если аудио играет
  const [isPlaying, setIsPlaying] = useState(false)
  
  // Флаг загрузки: true во время буферизации/старта
  const [isLoading, setIsLoading] = useState(false)
  
  // Громкость от 0 до 100
  const [volume, setVolume] = useState(100)
  
  // Флаг приглушения звука
  const [isMuted, setIsMuted] = useState(false)
  
  // Название текущего трека
  const [currentTrack, setCurrentTrack] = useState('Загрузка...')
  
  // Количество активных слушателей
  const [listeners, setListeners] = useState(0)
  
  // Флаг готовности Telegram WebApp
  const [isTgReady, setIsTgReady] = useState(false)
  
  // Текст ошибки для отображения в UI
  const [error, setError] = useState<string | null>(null)
  
  // Флаг буферизации
  const [buffering, setBuffering] = useState(false)
  
  // Показывать ли диагностическую панель
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  
  // Значения эквалайзера (в dB, от -12 до +12)
  const [eqBass, setEqBass] = useState(0)     // Bass gain
  const [eqMid, setEqMid] = useState(0)       // Mid gain
  const [eqTreble, setEqTreble] = useState(0) // Treble gain
  
  // Объект с диагностической информацией
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
  })

  // =====================================================
  // REFS (useRef)
  // Ссылки на DOM элементы и объекты, сохраняемые между рендерами
  // =====================================================
  
  // Ссылка на HTMLAudioElement
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // Ссылка на AudioContext (Web Audio API)
  const audioContextRef = useRef<AudioContext | null>(null)
  
  // Ссылка на AnalyserNode для визуализатора
  const analyserRef = useRef<AnalyserNode | null>(null)
  
  // Ссылка на MediaElementAudioSourceNode (создаётся только один раз!)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  
  // Ссылка на canvas элемент визуализатора
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  
  // ID текущего кадра анимации requestAnimationFrame
  const animationFrameRef = useRef<number | null>(null)
  
  // Флаг: подключён ли source к audio context (защита от повторного подключения)
  const isSourceConnectedRef = useRef(false)
  
  // Таймер для timeout загрузки
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Сглаженные значения для визуализатора (для плавной анимации)
  const smoothedBarsRef = useRef<number[]>(new Array(24).fill(0))
  
  // Флаг определения iOS
  const isIOSRef = useRef(false)
  
  // История событий для диагностики
  const eventHistoryRef = useRef<string[]>([])
  
  // ID интервала heartbeat
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Ссылки на фильтры эквалайзера
  const bassFilterRef = useRef<BiquadFilterNode | null>(null)
  const midFilterRef = useRef<BiquadFilterNode | null>(null)
  const trebleFilterRef = useRef<BiquadFilterNode | null>(null)
  
  // Коэффициент сглаживания для анимации визуализатора (0-1)
  const SMOOTHING_FACTOR = 0.25

  // =====================================================
  // ФУНКЦИИ ДИАГНОСТИКИ
  // Обновление диагностической информации
  // =====================================================
  
  /**
   * Обновляет объект диагностики частичными данными
   * @param update - частичный объект DiagnosticInfo
   */
  const updateDiagnostics = useCallback((update: Partial<DiagnosticInfo>) => {
    setDiagnostics(prev => ({ ...prev, ...update })) // Мержим с предыдущим состоянием
  }, [])

  /**
   * Добавляет событие в историю диагностики
   * @param event - текст события
   */
  const addEventToHistory = useCallback((event: string) => {
    const timestamp = new Date().toLocaleTimeString() // Форматируем время
    const entry = `[${timestamp}] ${event}` // Создаём запись
    eventHistoryRef.current = [...eventHistoryRef.current.slice(-9), entry] // Храним последние 10
    updateDiagnostics({
      lastEvent: entry,
      eventHistory: eventHistoryRef.current,
    })
    console.log(`[AUDIO EVENT] ${entry}`) // Логируем в консоль
  }, [updateDiagnostics])

  // =====================================================
  // AUDIO CONTEXT ИНИЦИАЛИЗАЦИЯ
  // Создание AudioContext и подключение аудио цепи
  // =====================================================
  
  /**
   * Получает или создаёт AudioContext
   * AudioContext создаётся только один раз и переиспользуется
   * @returns AudioContext или null если не поддерживается
   */
  const getAudioContext = useCallback(() => {
    // Если уже создан - возвращаем существующий
    if (audioContextRef.current) {
      return audioContextRef.current
    }
    // Получаем класс AudioContext (с webkit префиксом для старых Safari)
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) {
      console.error('[AUDIO] AudioContext не поддерживается браузером')
      return null
    }
    // Создаём новый AudioContext
    const ctx = new AudioContextClass()
    audioContextRef.current = ctx // Сохраняем в ref
    console.log('[AUDIO] AudioContext создан, состояние:', ctx.state)
    updateDiagnostics({ audioContextState: ctx.state })
    return ctx
  }, [updateDiagnostics])

  // =====================================================
  // ВИЗУАЛИЗАТОР (24 ПОЛОСЫ: 8 BASS + 8 MID + 8 TREBLE)
  // Реальный частотный анализатор на базе AnalyserNode
  // =====================================================
  
  /**
   * Вычисляет среднее значение по диапазону частотных бинов
   * @param dataArray - массив данных частот от AnalyserNode
   * @param startBin - начальный индекс бина
   * @param endBin - конечный индекс бина
   * @returns нормализованное значение от 0 до 1
   */
  const getAverageForBinRange = useCallback((
    dataArray: Uint8Array, // Массив значений частот (0-255)
    startBin: number,      // Начальный индекс
    endBin: number         // Конечный индекс
  ): number => {
    // Границы проверки
    const start = Math.max(0, Math.floor(startBin))
    const end = Math.min(dataArray.length - 1, Math.floor(endBin))
    // Если диапазон некорректен
    if (start > end) return 0
    // Суммируем значения в диапазоне
    let sum = 0
    for (let i = start; i <= end; i++) {
      sum += dataArray[i]
    }
    // Возвращаем нормализованное среднее
    return (sum / (end - start + 1)) / 255
  }, [])

  /**
   * Преобразует частоту в индекс бина FFT
   * @param frequency - частота в Hz
   * @param sampleRate - частота дискретизации
   * @param fftSize - размер FFT
   * @returns индекс бина
   */
  const frequencyToBin = useCallback((
    frequency: number, // Частота в Hz
    sampleRate: number, // Частота дискретизации (обычно 44100 или 48000)
    fftSize: number     // Размер FFT (256, 512, 1024, etc.)
  ): number => {
    // Формула: bin = frequency * fftSize / sampleRate
    return frequency * (fftSize / 2) / (sampleRate / 2)
  }, [])

  /**
   * Основная функция визуализации - вызывается каждый кадр анимации
   * Рисует 24 столбика на canvas: 8 bass + 8 mid + 8 treble
   */
  const visualize = useCallback(() => {
    const analyser = analyserRef.current // AnalyserNode
    const canvas = canvasRef.current // Canvas элемент
    const ctx = canvas?.getContext('2d') // 2D контекст canvas
    
    // Если анализатор или canvas недоступны - пропускаем кадр
    if (!analyser || !canvas || !ctx) {
      animationFrameRef.current = requestAnimationFrame(visualize)
      return
    }
    
    // Параметры анализатора
    const bufferLength = analyser.frequencyBinCount // Количество бинов
    const dataArray = new Uint8Array(bufferLength) // Массив для данных
    analyser.getByteFrequencyData(dataArray) // Получаем данные частот
    
    // Параметры для расчёта бинов
    const sampleRate = analyser.context.sampleRate // Частота дискретизации
    const fftSize = analyser.fftSize // Размер FFT
    
    // Массив для 24 значений (8 bass + 8 mid + 8 treble)
    const barValues: number[] = []
    
    // ===== BASS SECTION (20 Hz - 250 Hz) - 8 столбиков =====
    // Логарифмическое распределение частот в диапазоне bass
    const bassFreqs = [20, 30, 45, 65, 90, 120, 160, 220] // Центральные частоты
    for (let i = 0; i < 8; i++) {
      // Вычисляем диапазон частот для каждого столбика
      const lowFreq = i === 0 ? 20 : bassFreqs[i] - (bassFreqs[i] - bassFreqs[i-1]) / 2
      const highFreq = i === 7 ? 250 : bassFreqs[i] + (bassFreqs[i+1] - bassFreqs[i]) / 2
      // Преобразуем частоты в индексы бинов
      const lowBin = frequencyToBin(lowFreq, sampleRate, fftSize)
      const highBin = frequencyToBin(highFreq, sampleRate, fftSize)
      // Получаем среднее значение для диапазона
      barValues.push(getAverageForBinRange(dataArray, lowBin, highBin))
    }
    
    // ===== MID SECTION (250 Hz - 4000 Hz) - 8 столбиков =====
    // Логарифмическое распределение частот в диапазоне mid
    const midFreqs = [300, 420, 580, 800, 1100, 1500, 2100, 3000]
    for (let i = 0; i < 8; i++) {
      const lowFreq = i === 0 ? 250 : midFreqs[i] - (midFreqs[i] - midFreqs[i-1]) / 2
      const highFreq = i === 7 ? 4000 : midFreqs[i] + (midFreqs[i+1] - midFreqs[i]) / 2
      const lowBin = frequencyToBin(lowFreq, sampleRate, fftSize)
      const highBin = frequencyToBin(highFreq, sampleRate, fftSize)
      barValues.push(getAverageForBinRange(dataArray, lowBin, highBin))
    }
    
    // ===== TREBLE SECTION (4000 Hz - 20000 Hz) - 8 столбиков =====
    // Логарифмическое распределение частот в диапазоне treble
    const trebleFreqs = [4500, 5500, 7000, 8500, 10500, 13000, 16000, 19000]
    for (let i = 0; i < 8; i++) {
      const lowFreq = i === 0 ? 4000 : trebleFreqs[i] - (trebleFreqs[i] - trebleFreqs[i-1]) / 2
      const highFreq = i === 7 ? 20000 : trebleFreqs[i] + (trebleFreqs[i+1] - trebleFreqs[i]) / 2
      const lowBin = frequencyToBin(lowFreq, sampleRate, fftSize)
      const highBin = frequencyToBin(highFreq, sampleRate, fftSize)
      barValues.push(getAverageForBinRange(dataArray, lowBin, highBin))
    }
    
    // ===== СГЛАЖИВАНИЕ АНИМАЦИИ =====
    // Применяем сглаживание для плавной анимации
    for (let i = 0; i < 24; i++) {
      // Интерполяция между предыдущим и текущим значением
      smoothedBarsRef.current[i] = smoothedBarsRef.current[i] + 
        (barValues[i] - smoothedBarsRef.current[i]) * SMOOTHING_FACTOR
    }
    
    // ===== ОТРИСОВКА НА CANVAS =====
    const width = canvas.width
    const height = canvas.height
    
    // Очищаем canvas
    ctx.clearRect(0, 0, width, height)
    
    // Параметры столбиков
    const totalBars = 24 // Всего столбиков
    const gap = 2 // Отступ между столбиками
    const sectionGap = 8 // Отступ между секциями (bass/mid/treble)
    const barWidth = (width - (totalBars - 1) * gap - 2 * sectionGap) / totalBars
    
    // Рисуем каждый столбик
    for (let i = 0; i < 24; i++) {
      // Определяем секцию (0 = bass, 1 = mid, 2 = treble)
      const section = Math.floor(i / 8)
      const barInSection = i % 8
      
      // Вычисляем X позицию с учётом отступов между секциями
      const x = barInSection * (barWidth + gap) + section * (8 * (barWidth + gap) + sectionGap)
      
      // Высота столбика на основе значения (минимум 2 пикселя)
      const barHeight = Math.max(2, smoothedBarsRef.current[i] * (height - 4))
      
      // Выбираем цвет и градиент в зависимости от секции
      let gradient: CanvasGradient
      if (section === 0) {
        // BASS - розовый градиент
        gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, COLORS.bass) // Нижний цвет
        gradient.addColorStop(1, '#ff3399')   // Верхний цвет
      } else if (section === 1) {
        // MID - зелёный градиент
        gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, COLORS.mid)
        gradient.addColorStop(1, COLORS.accent)
      } else {
        // TREBLE - бирюзовый градиент
        gradient = ctx.createLinearGradient(0, height, 0, height - barHeight)
        gradient.addColorStop(0, COLORS.high)
        gradient.addColorStop(1, '#66ffee')
      }
      
      // Устанавливаем цвет заливки
      ctx.fillStyle = gradient
      
      // Рисуем скруглённый прямоугольник
      ctx.beginPath()
      ctx.roundRect(x, height - barHeight, barWidth, barHeight, 2)
      ctx.fill()
    }
    
    // Запрашиваем следующий кадр анимации
    animationFrameRef.current = requestAnimationFrame(visualize)
  }, [frequencyToBin, getAverageForBinRange])

  /**
   * Запускает анимацию визуализатора
   */
  const startVisualization = useCallback(() => {
    // Если уже запущен - не перезапускаем
    if (animationFrameRef.current) return
    console.log('[VIS] Запуск визуализатора')
    visualize() // Запускаем цикл анимации
  }, [visualize])

  /**
   * Останавливает анимацию визуализатора и очищает canvas
   */
  const stopVisualization = useCallback(() => {
    // Отменяем текущий кадр анимации
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
      console.log('[VIS] Визуализатор остановлен')
    }
    // Сбрасываем сглаженные значения
    smoothedBarsRef.current = new Array(24).fill(0)
    // Очищаем canvas
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [])

  // =====================================================
  // ЭКВАЛАЙЗЕР (3 ПОЛОСЫ: BASS/MID/TREBLE)
  // Реальный эквалайзер на базе BiquadFilterNode
  // =====================================================
  
  /**
   * Подключает аудио цепь: source -> EQ filters -> analyser -> destination
   * Создаётся только один раз за жизненный цикл плеера
   * @returns true если успешно, false при ошибке
   */
  const connectAudioChain = useCallback((): boolean => {
    // Защита от повторного подключения
    if (isSourceConnectedRef.current) {
      console.log('[AUDIO] Цепь уже подключена')
      return true
    }
    
    const audio = audioRef.current
    if (!audio) {
      console.error('[AUDIO] Нет аудио элемента')
      return false
    }
    
    const ctx = getAudioContext()
    if (!ctx) {
      console.error('[AUDIO] Нет AudioContext')
      return false
    }
    
    try {
      // ===== СОЗДАЁМ ФИЛЬТРЫ ЭКВАЛАЙЗЕРА =====
      
      // Bass filter: lowshelf для частот 20-250 Hz
      const bassFilter = ctx.createBiquadFilter()
      bassFilter.type = 'lowshelf' // Тип фильтра: низкие частоты
      bassFilter.frequency.value = 250 // Частота среза
      bassFilter.gain.value = eqBass // Усиление из состояния
      bassFilterRef.current = bassFilter
      
      // Mid filter: peaking для частот 250-4000 Hz
      const midFilter = ctx.createBiquadFilter()
      midFilter.type = 'peaking' // Тип фильтра: средние частоты
      midFilter.frequency.value = 1000 // Центральная частота
      midFilter.Q.value = 0.5 // Добротность
      midFilter.gain.value = eqMid // Усиление из состояния
      midFilterRef.current = midFilter
      
      // Treble filter: highshelf для частот 4000-20000 Hz
      const trebleFilter = ctx.createBiquadFilter()
      trebleFilter.type = 'highshelf' // Тип фильтра: высокие частоты
      trebleFilter.frequency.value = 4000 // Частота среза
      trebleFilter.gain.value = eqTreble // Усиление из состояния
      trebleFilterRef.current = trebleFilter
      
      // ===== СОЗДАЁМ АНАЛИЗАТОР =====
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512 // Размер FFT для визуализатора
      analyser.smoothingTimeConstant = 0.8 // Сглаживание
      analyserRef.current = analyser
      
      // ===== СОЗДАЁМ ИСТОЧНИК (ТОЛЬКО ОДИН РАЗ!) =====
      const source = ctx.createMediaElementSource(audio)
      sourceNodeRef.current = source
      
      // ===== СОБИРАЕМ ЦЕПЬ =====
      // source -> bassFilter -> midFilter -> trebleFilter -> analyser -> destination
      source.connect(bassFilter)
      bassFilter.connect(midFilter)
      midFilter.connect(trebleFilter)
      trebleFilter.connect(analyser)
      analyser.connect(ctx.destination)
      
      // Отмечаем, что цепь подключена
      isSourceConnectedRef.current = true
      console.log('[AUDIO] Аудио цепь подключена: source -> bass -> mid -> treble -> analyser -> destination')
      
      updateDiagnostics({ eqActive: true })
      return true
      
    } catch (e) {
      console.error('[AUDIO] Ошибка подключения аудио цепи:', e)
      return false
    }
  }, [getAudioContext, eqBass, eqMid, eqTreble, updateDiagnostics])

  /**
   * Обновляет усиление bass фильтра эквалайзера
   */
  const updateBassGain = useCallback((value: number) => {
    if (bassFilterRef.current) {
      bassFilterRef.current.gain.value = value
    }
  }, [])

  /**
   * Обновляет усиление mid фильтра эквалайзера
   */
  const updateMidGain = useCallback((value: number) => {
    if (midFilterRef.current) {
      midFilterRef.current.gain.value = value
    }
  }, [])

  /**
   * Обновляет усиление treble фильтра эквалайзера
   */
  const updateTrebleGain = useCallback((value: number) => {
    if (trebleFilterRef.current) {
      trebleFilterRef.current.gain.value = value
    }
  }, [])

  // =====================================================
  // ИНИЦИАЛИЗАЦИЯ АУДИО ЭЛЕМЕНТА
  // Создание HTMLAudioElement и подписка на события
  // =====================================================
  useEffect(() => {
    console.log('[AUDIO] === ИНИЦИАЛИЗАЦИЯ АУДИО ===')
    
    // Определяем iOS при загрузке
    isIOSRef.current = detectIOS()
    const platformName = getPlatformName()
    
    console.log('[AUDIO] Platform:', platformName)
    console.log('[AUDIO] iOS detected:', isIOSRef.current)
    
    // Обновляем диагностику
    updateDiagnostics({
      platform: platformName,
      isIOS: isIOSRef.current,
      audioState: 'idle',
    })
    
    // ===== СОЗДАЁМ АУДИО ЭЛЕМЕНТ =====
    const audio = new Audio()
    audio.preload = 'none' // Не загружаем автоматически
    audio.crossOrigin = 'anonymous' // CORS для Web Audio API
    audioRef.current = audio
    
    // ===== ОБРАБОТЧИКИ СОБЫТИЙ АУДИО =====
    
    // loadstart - начало загрузки
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
    
    // loadedmetadata - метаданные загружены
    const onLoadedMetadata = () => {
      console.log('[AUDIO] loadedmetadata')
      addEventToHistory('loadedmetadata')
    }
    
    // loadeddata - данные загружены
    const onLoadedData = () => {
      console.log('[AUDIO] loadeddata')
      addEventToHistory('loadeddata')
    }
    
    // canplay - можно воспроизводить
    const onCanPlay = () => {
      console.log('[AUDIO] canplay')
      addEventToHistory('canplay')
      updateDiagnostics({
        audioState: 'ready',
        readyState: getReadyStateName(audio.readyState),
      })
      setBuffering(false)
      setIsLoading(false)
    }
    
    // canplaythrough - можно воспроизводить без буферизации
    const onCanPlayThrough = () => {
      console.log('[AUDIO] canplaythrough')
      addEventToHistory('canplaythrough')
    }
    
    // play - воспроизведение начато
    const onPlay = () => {
      console.log('[AUDIO] play event')
      addEventToHistory('play')
    }
    
    // playing - аудио играет
    const onPlaying = () => {
      console.log('[AUDIO] playing - аудио воспроизводится')
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
      // Очищаем таймаут загрузки
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
    
    // pause - воспроизведение приостановлено
    const onPause = () => {
      console.log('[AUDIO] pause')
      addEventToHistory('pause')
      updateDiagnostics({ audioState: 'paused' })
      setIsPlaying(false)
      stopVisualization()
    }
    
    // stalled - загрузка остановлена
    const onStalled = () => {
      console.log('[AUDIO] stalled')
      addEventToHistory('stalled')
      updateDiagnostics({
        networkState: getNetworkStateName(audio.networkState),
        readyState: getReadyStateName(audio.readyState),
      })
      setBuffering(true)
    }
    
    // waiting - ожидание данных
    const onWaiting = () => {
      console.log('[AUDIO] waiting')
      addEventToHistory('waiting')
      setBuffering(true)
      setIsLoading(true)
    }
    
    // suspend - загрузка приостановлена браузером
    const onSuspend = () => {
      console.log('[AUDIO] suspend')
      addEventToHistory('suspend')
    }
    
    // abort - загрузка отменена
    const onAbort = () => {
      console.log('[AUDIO] abort')
      addEventToHistory('abort')
    }
    
    // emptied - источник очищен
    const onEmptied = () => {
      console.log('[AUDIO] emptied')
      addEventToHistory('emptied')
    }
    
    // error - ОШИБКА ВОСПРОИЗВЕДЕНИЯ
    const onError = () => {
      const mediaError = audio.error
      const errorDetails = mediaError ? getAudioErrorMessage(mediaError) : 'Неизвестная ошибка'
      
      console.error('[AUDIO] ERROR EVENT')
      console.error('  -> error.code:', mediaError?.code)
      console.error('  -> error.message:', mediaError?.message)
      console.error('  -> Расшифровка:', errorDetails)
      console.error('  -> currentSrc:', audio.currentSrc)
      console.error('  -> networkState:', getNetworkStateName(audio.networkState))
      console.error('  -> readyState:', getReadyStateName(audio.readyState))
      
      addEventToHistory(`ERROR: ${errorDetails}`)
      
      // Определяем сообщение для пользователя
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
    
    // ===== ПОДПИСЫВАЕМСЯ НА ВСЕ СОБЫТИЯ =====
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
    
    // ===== ОБРАБОТЧИК ИЗМЕНЕНИЯ ВИДИМОСТИ =====
    // Для iOS: восстанавливаем AudioContext при возвращении на страницу
    const onVisibilityChange = async () => {
      const ctx = audioContextRef.current
      console.log('[VISIBILITY] Состояние:', document.visibilityState)
      
      if (document.visibilityState === 'visible' && ctx && ctx.state === 'suspended') {
        try {
          await ctx.resume()
          console.log('[VISIBILITY] AudioContext возобновлён')
          updateDiagnostics({ audioContextState: ctx.state })
        } catch (e) {
          console.error('[VISIBILITY] Ошибка resume:', e)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    
    // ===== ФУНКЦИЯ ОЧИСТКИ ПРИ РАЗМОНТИРОВАНИИ =====
    return () => {
      console.log('[AUDIO] Размонтирование компонента')
      
      // Удаляем все обработчики событий
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
      
      // Останавливаем воспроизведение
      audio.pause()
      audio.src = ''
      
      // Останавливаем визуализатор
      stopVisualization()
      
      // Очищаем таймеры
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current)
      
      console.log('[AUDIO] Очистка завершена')
    }
  }, [stopVisualization, updateDiagnostics, addEventToHistory])

  // =====================================================
  // СИНХРОНИЗАЦИЯ ГРОМКОСТИ
  // Обновляем громкость аудио при изменении состояния
  // =====================================================
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100
    }
  }, [volume, isMuted])

  // =====================================================
  // СИНХРОНИЗАЦИЯ ЭКВАЛАЙЗЕРА
  // Обновляем фильтры при изменении значений EQ
  // =====================================================
  useEffect(() => {
    updateBassGain(eqBass)
  }, [eqBass, updateBassGain])

  useEffect(() => {
    updateMidGain(eqMid)
  }, [eqMid, updateMidGain])

  useEffect(() => {
    updateTrebleGain(eqTreble)
  }, [eqTreble, updateTrebleGain])

  // =====================================================
  // ИНИЦИАЛИЗАЦИЯ TELEGRAM WEBAPP
  // Подключаемся к Telegram Mini App API
  // =====================================================
  useEffect(() => {
    /**
     * Инициализирует Telegram WebApp
     * @returns true если успешно, false если Telegram API недоступен
     */
    const initTelegram = () => {
      const tg = window.Telegram?.WebApp
      if (tg) {
        tg.ready() // Готовность Mini App
        tg.expand() // Раскрыть на весь экран
        setIsTgReady(true)
        console.log('[TG] Telegram WebApp ready, platform:', tg.platform)
        
        // Обновляем флаг iOS если Telegram определил iOS
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
    if (initTelegram()) return
    
    // Если не удалось - пробуем с интервалом (Telegram может загружаться не мгновенно)
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
  // LISTENER TRACKING - РЕГИСТРАЦИЯ СЛУШАТЕЛЯ
  // Отправляем событие открытия Mini App
  // =====================================================
  const registerListener = useCallback(async (action: 'open' | 'close' | 'heartbeat') => {
    const tg = window.Telegram?.WebApp
    const user = tg?.initDataUnsafe?.user
    
    // Если нет данных пользователя - не регистрируем
    if (!user) {
      console.log('[LISTENER] Нет данных пользователя Telegram')
      return
    }
    
    try {
      const response = await fetch(LISTENERS_API, {
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
      
      if (response.ok) {
        console.log('[LISTENER] Зарегистрирован:', action)
      }
    } catch (e) {
      console.error('[LISTENER] Ошибка регистрации:', e)
    }
  }, [])

  // Регистрируем открытие при готовности Telegram
  useEffect(() => {
    if (isTgReady) {
      registerListener('open')
      
      // Запускаем heartbeat для отслеживания активных слушателей
      heartbeatIntervalRef.current = setInterval(() => {
        registerListener('heartbeat')
      }, HEARTBEAT_INTERVAL)
    }
    
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
    }
  }, [isTgReady, registerListener])

  // =====================================================
  // ПОЛУЧЕНИЕ КОЛИЧЕСТВА СЛУШАТЕЛЕЙ
  // Периодически запрашиваем количество активных слушателей
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
  // Периодически запрашиваем название текущего трека
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
  // Используем sendBeacon для надёжной доставки
  // =====================================================
  useEffect(() => {
    /**
     * Отправляет событие закрытия через sendBeacon
     */
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
  // ОСНОВНАЯ ФУНКЦИЯ ВОСПРОИЗВЕДЕНИЯ (handlePlay)
  // Запуск/остановка воспроизведения через HTML5 Audio
  // =====================================================
  const handlePlay = async () => {
    const audio = audioRef.current
    if (!audio) {
      console.error('[PLAY] Аудио элемент не инициализирован')
      return
    }
    
    // ===== ЕСЛИ УЖЕ ИГРАЕТ - СТАВИМ НА ПАУЗУ =====
    if (isPlaying) {
      console.log('[PLAY] Ставим на паузу')
      audio.pause()
      return
    }
    
    // ===== СБРАСЫВАЕМ СОСТОЯНИЕ =====
    setError(null)
    setIsLoading(true)
    
    console.log('[PLAY] === НАЧАЛО ВОСПРОИЗВЕДЕНИЯ ===')
    console.log('[PLAY] Platform:', isIOSRef.current ? 'iOS' : 'Desktop/Android')
    
    // ===== УСТАНАВЛИВАЕМ ТАЙМАУТ ЗАГРУЗКИ =====
    timeoutRef.current = setTimeout(() => {
      if (isLoading && !isPlaying) {
        console.error('[PLAY] Таймаут загрузки')
        setError('Таймаут подключения')
        setIsLoading(false)
        setBuffering(false)
        audio.pause()
      }
    }, LOAD_TIMEOUT)
    
    try {
      // ===== УСТАНАВЛИВАЕМ ГРОМКОСТЬ =====
      audio.volume = isMuted ? 0 : volume / 100
      
      // ===== УСТАНАВЛИВАЕМ ИСТОЧНИК (HTTPS MP3 PROXY) =====
      // Используем один и тот же HTTPS URL для всех платформ
      // Cloudflare Worker проксирует HTTP поток RadioHeart по HTTPS
      if (!audio.src || audio.src !== STREAM_URL) {
        console.log('[PLAY] Устанавливаем источник:', STREAM_URL)
        audio.src = STREAM_URL
        audio.load() // Загружаем новый источник
        updateDiagnostics({ currentStreamUrl: STREAM_URL })
      }
      
      // ===== ПОЛУЧАЕМ/СОЗДАЁМ AUDIOCONTEXT =====
      const ctx = getAudioContext()
      if (ctx) {
        // Если AudioContext приостановлен - возобновляем (iOS требует user gesture)
        if (ctx.state === 'suspended') {
          console.log('[PLAY] AudioContext suspended, выполняем resume()')
          await ctx.resume()
          console.log('[PLAY] AudioContext после resume:', ctx.state)
          updateDiagnostics({ audioContextState: ctx.state })
        }
        
        // Подключаем аудио цепь (source -> EQ -> analyser -> destination)
        // Важно: вызывается только один раз!
        connectAudioChain()
      }
      
      // ===== ЗАПУСКАЕМ ВОСПРОИЗВЕДЕНИЕ =====
      console.log('[PLAY] Вызываем audio.play()')
      await audio.play()
      console.log('[PLAY] Воспроизведение успешно запущено')
      
      // ===== ЗАПУСКАЕМ ВИЗУАЛИЗАТОР =====
      startVisualization()
      
    } catch (err: any) {
      console.error('[PLAY] Ошибка:', err.name, err.message)
      
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
  // Возвращаем JSX с UI плеера
  // =====================================================
  return (
    <>
      {/* ГЛОБАЛЬНЫЕ CSS СТИЛИ */}
      <style jsx global>{`
        /* Стиль для слайдера громкости */
        .volume-slider {
          -webkit-appearance: none; /* Убираем стандартный стиль */
          height: 8px; /* Высота слайдера */
          border-radius: 10px; /* Скругление */
          background: linear-gradient(90deg, rgba(255,0,102,0.3) 0%, rgba(0,199,48,0.3) 50%, rgba(0,255,204,0.3) 100%);
        }
        /* Ползунок слайдера для WebKit браузеров */
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 3px solid #00c730;
          cursor: pointer;
        }
        /* Ползунок слайдера для Firefox */
        .volume-slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 3px solid #00c730;
        }
        /* Карточка в стиле скевоморфизма */
        .skeuo-card {
          background: linear-gradient(145deg, rgba(46,0,113,0.6), rgba(13,0,38,0.8));
          border: 1px solid rgba(0,199,48,0.2);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        /* Стиль слайдера эквалайзера */
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
      
      {/* ОСНОВНОЙ КОНТЕЙНЕР */}
      <div
        className="min-h-screen flex flex-col items-center justify-center p-4"
        style={{
          background: `linear-gradient(180deg, ${COLORS.primary} 0%, ${COLORS.dark} 100%)`,
        }}
      >
        {/* ДЕКОРАТИВНЫЙ ФОН */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 80% 50% at 50% 30%, rgba(0,199,48,0.15) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 30% 60%, rgba(255,0,102,0.1) 0%, transparent 50%)`,
          }}
        />
        
        {/* ОСНОВНОЙ КОНТЕНТ */}
        <div className="relative z-10 w-full max-w-xs">
          
          {/* ЛОГОТИП СТАНЦИИ */}
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
          
          {/* ВИЗУАЛИЗАТОР (24 ПОЛОСЫ) */}
          <div className="skeuo-card rounded-xl p-2 mb-3">
            {/* Бейдж LIVE при воспроизведении */}
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
              height={60}
              className="w-full rounded"
              style={{ background: 'transparent' }}
            />
            
            {/* Подписи секций */}
            <div className="flex justify-between mt-1.5 px-1">
              <span className="text-xs font-medium" style={{ color: COLORS.bass }}>BASS</span>
              <span className="text-xs font-medium" style={{ color: COLORS.mid }}>MID</span>
              <span className="text-xs font-medium" style={{ color: COLORS.high }}>TREBLE</span>
            </div>
          </div>
          
          {/* ЭКВАЛАЙЗЕР (3 ПОЛОСЫ) */}
          <div className="skeuo-card rounded-xl p-2 mb-3">
            <div className="text-xs text-center mb-2" style={{ color: COLORS.secondary }}>
              Эквалайзер
            </div>
            
            {/* Bass слайдер */}
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
            
            {/* Mid слайдер */}
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
            
            {/* Treble слайдер */}
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
          
          {/* ИНФОРМАЦИЯ О СТАНЦИИ */}
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
            <p className="text-xs text-center" style={{ color: '#fff' }}>{currentTrack}</p>
            <p className="text-xs mt-0.5" style={{ color: COLORS.accent }}>
              👥 {listeners} {listeners === 1 ? 'слушатель' : 'слушателя'}
            </p>
          </div>
          
          {/* ИНДИКАТОР БУФЕРИЗАЦИИ */}
          {buffering && (
            <div className="flex items-center justify-center gap-2 mb-2 p-1.5 rounded-xl skeuo-card">
              <Wifi className="w-3 h-3 animate-pulse" style={{ color: COLORS.secondary }} />
              <span className="text-xs" style={{ color: COLORS.secondary }}>Буферизация...</span>
            </div>
          )}
          
          {/* ИНДИКАТОР ОШИБКИ */}
          {error && (
            <div
              className="flex items-center justify-center gap-2 mb-2 p-1.5 rounded-xl"
              style={{ background: 'rgba(255,0,102,0.1)' }}
            >
              <AlertCircle className="w-3 h-3" style={{ color: COLORS.bass }} />
              <span className="text-xs" style={{ color: '#ff6699' }}>{error}</span>
            </div>
          )}
          
          {/* КНОПКА PLAY/PAUSE */}
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
          
          {/* РЕГУЛЯТОР ГРОМКОСТИ */}
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
                  Platform: {diagnostics.platform} {diagnostics.isIOS && '🍎 iOS'}
                </div>
                <div style={{ color: COLORS.text }}>
                  Audio State: {diagnostics.audioState}
                </div>
                <div style={{ color: COLORS.text }}>
                  AudioContext: {diagnostics.audioContextState}
                </div>
                <div style={{ color: diagnostics.eqActive ? COLORS.accent : COLORS.text }}>
                  EQ Active: {diagnostics.eqActive ? 'Yes' : 'No'}
                </div>
                <div style={{ color: COLORS.text, wordBreak: 'break-all' }}>
                  URL: {diagnostics.currentStreamUrl || '(не установлен)'}
                </div>
                {diagnostics.lastError && (
                  <div style={{ color: COLORS.bass }}>
                    ERROR: {diagnostics.lastError}
                  </div>
                )}
                <div style={{ color: COLORS.mid }}>
                  Last Event: {diagnostics.lastEvent}
                </div>
                <div className="mt-1 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ color: COLORS.secondary }}>History:</div>
                  {diagnostics.eventHistory.map((e, i) => (
                    <div key={i} style={{ color: COLORS.text, fontSize: '9px' }}>
                      {e}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* ПОДПИСЬ */}
          <p className="text-center text-xs mt-2" style={{ color: '#555' }}>
            Powered by <span style={{ color: COLORS.secondary }}>DJ GooD OFF</span>
          </p>
        </div>
      </div>
    </>
  )
}
