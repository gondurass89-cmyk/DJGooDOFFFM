'use client'

import { useEffect, useRef, useState } from 'react'

// =====================================================
// MATRIX CHARS - символы для эффекта перебора
// =====================================================
const MATRIX_CHARS = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// =====================================================
// MARQUEE TEXT - бесконечная бегущая строка
// Плавная анимация через requestAnimationFrame
// Текст уходит влево, появляется справа - бесшовный цикл
// С эффектом Matrix при появлении
// =====================================================

interface MarqueeTextProps {
  text: string
  speed?: number // пикселей в секунду
  className?: string
  matrixDuration?: number // длительность эффекта Matrix в мс
}

export default function MarqueeText({ text, speed = 50, className = '', matrixDuration = 1500 }: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
  const positionRef = useRef(0)
  const lastTimeRef = useRef(0)

  // Эффект Matrix при появлении
  const [displayText, setDisplayText] = useState('')
  const [isAnimating, setIsAnimating] = useState(true)
  const matrixRef = useRef<NodeJS.Timeout | null>(null)

  // Запуск анимации Matrix при монтировании или смене текста
  useEffect(() => {
    setIsAnimating(true)

    // Очищаем предыдущую анимацию
    if (matrixRef.current) {
      clearInterval(matrixRef.current)
    }

    const startTime = Date.now()
    const textLength = text.length
    const revealedIndices = new Set<number>()

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / matrixDuration, 1)

      // Сколько символов должно быть раскрыто
      const targetRevealed = Math.floor(progress * textLength)

      // Добавляем новые раскрытые индексы
      while (revealedIndices.size < targetRevealed) {
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
          result += text[i]
        } else {
          result += MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
        }
      }

      setDisplayText(result)

      // Завершаем анимацию
      if (progress >= 1) {
        clearInterval(interval)
        setDisplayText(text)
        setIsAnimating(false)
      }
    }, 30)

    matrixRef.current = interval

    return () => {
      if (matrixRef.current) {
        clearInterval(matrixRef.current)
      }
    }
  }, [text, matrixDuration])

  // Запускаем бегущую строку
  // Родительский компонент уже проверил ширину, поэтому просто анимируем
  useEffect(() => {
    const inner = innerRef.current
    if (!inner || !text) return

    // Измеряем ширину одного экземпляра текста (используем исходный текст, не displayText!)
    const measureEl = document.createElement('span')
    measureEl.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: nowrap;
      font-size: 0.75rem;
      font-family: monospace;
      letter-spacing: 0.5px;
    `
    measureEl.textContent = text
    document.body.appendChild(measureEl)
    const singleTextWidth = measureEl.scrollWidth
    document.body.removeChild(measureEl)

    // Ширина цикла: текст + разделитель
    const separatorWidth = 40 // примерная ширина разделителя "●" с отступами
    const cycleWidth = singleTextWidth + separatorWidth

    // Начальная позиция
    positionRef.current = 0
    lastTimeRef.current = performance.now()

    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTimeRef.current) / 1000
      lastTimeRef.current = currentTime

      // Двигаем влево
      positionRef.current -= speed * deltaTime

      // Когда первый текст скрылся - сбрасываем позицию для бесшовного цикла
      if (positionRef.current <= -cycleWidth) {
        positionRef.current = 0
      }

      inner.style.transform = `translateX(${positionRef.current}px)`
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [text, speed])

  return (
    <div
      ref={containerRef}
      style={{
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        width: '100%',
      }}
    >
      <div
        ref={innerRef}
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          willChange: 'transform',
          color: '#0F0',
          textShadow: isAnimating
            ? '0 0 10px #0F0, 0 0 20px #0F0, 0 0 30px #0F0'
            : '0 0 8px #0F0, 0 0 15px #0F0',
          fontFamily: 'monospace',
          letterSpacing: '0.5px',
        }}
      >
        {/* Оригинальный текст */}
        <span>{displayText}</span>
        {/* Разделитель */}
        <span style={{ margin: '0 1.5em', opacity: 0.7 }}>●</span>
        {/* Дубликат для бесшовности */}
        <span>{displayText}</span>
        {/* Разделитель */}
        <span style={{ margin: '0 1.5em', opacity: 0.7 }}>●</span>
      </div>
    </div>
  )
}
