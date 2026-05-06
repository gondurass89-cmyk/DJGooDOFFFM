'use client'

import { useEffect, useState, useRef } from 'react'

// =====================================================
// MATRIX TEXT - эффект перебора символов
// =====================================================

const MATRIX_CHARS = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

interface MatrixTextProps {
  text: string
  className?: string
  duration?: number // длительность эффекта в мс
  animateOnMount?: boolean // запускать анимацию при монтировании (даже если текст не менялся)
}

export default function MatrixText({ text, className = '', duration = 2000, animateOnMount = false }: MatrixTextProps) {
  const [displayText, setDisplayText] = useState(animateOnMount ? '' : text)
  const [isAnimating, setIsAnimating] = useState(false)
  const prevTextRef = useRef<string | null>(null)
  const animationRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(false)

  // Функция запуска анимации
  const startAnimation = (targetText: string) => {
    setIsAnimating(true)

    // Очищаем предыдущую анимацию
    if (animationRef.current) {
      clearInterval(animationRef.current)
    }

    const startTime = Date.now()
    const textLength = targetText.length

    // Массив индексов символов, которые уже "раскрылись"
    const revealedIndices = new Set<number>()

    // Интервал обновления символов
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Сколько символов должно быть раскрыто
      const targetRevealed = Math.floor(progress * textLength)

      // Добавляем новые раскрытые индексы
      while (revealedIndices.size < targetRevealed) {
        // Выбираем случайный нераскрытый индекс
        const remaining = []
        for (let i = 0; i < textLength; i++) {
          if (!revealedIndices.has(i)) remaining.push(i)
        }
        if (remaining.length === 0) break
        const randomIndex = remaining[Math.floor(Math.random() * remaining.length)]
        revealedIndices.add(randomIndex)
      }

      // Формируем строку
      let result = ''
      for (let i = 0; i < textLength; i++) {
        if (revealedIndices.has(i)) {
          result += targetText[i]
        } else {
          // Случайный символ
          result += MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
        }
      }

      setDisplayText(result)

      // Завершаем анимацию
      if (progress >= 1) {
        clearInterval(interval)
        setDisplayText(targetText)
        setIsAnimating(false)
      }
    }, 30) // Обновление каждые 30мс

    animationRef.current = interval
  }

  useEffect(() => {
    // Первый рендер - запускаем анимацию если animateOnMount
    if (!mountedRef.current) {
      mountedRef.current = true
      prevTextRef.current = text
      if (animateOnMount && text) {
        startAnimation(text)
      }
      return
    }

    // Если текст не изменился - ничего не делаем
    if (text === prevTextRef.current) return

    prevTextRef.current = text
    startAnimation(text)
  }, [text, duration, animateOnMount])

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current)
      }
    }
  }, [])

  return (
    <span
      className={className}
      style={{
        color: '#0F0',
        textShadow: isAnimating
          ? '0 0 10px #0F0, 0 0 20px #0F0, 0 0 30px #0F0'
          : '0 0 5px #0F0, 0 0 10px #0F0',
        fontFamily: 'monospace',
        letterSpacing: '0.5px',
      }}
    >
      {displayText}
    </span>
  )
}
