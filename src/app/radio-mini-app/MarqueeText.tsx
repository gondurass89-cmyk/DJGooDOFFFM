'use client'

import { useEffect, useRef } from 'react'

// =====================================================
// MARQUEE TEXT - бесконечная бегущая строка
// Плавная анимация через requestAnimationFrame
// Текст уходит влево, появляется справа - бесшовный цикл
// =====================================================

interface MarqueeTextProps {
  text: string
  speed?: number // пикселей в секунду
  className?: string
}

export default function MarqueeText({ text, speed = 50, className = '' }: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | null>(null)
  const positionRef = useRef(0)
  const lastTimeRef = useRef(0)
  const textWidthRef = useRef(0)

  // Запускаем анимацию
  useEffect(() => {
    const container = containerRef.current
    const inner = innerRef.current
    if (!container || !inner) return

    const containerWidth = container.offsetWidth
    textWidthRef.current = inner.scrollWidth / 2 // Делим на 2 (текст дублирован)
    const textWidth = textWidthRef.current

    // Если текст помещается - не анимируем
    if (textWidth <= containerWidth || containerWidth === 0) {
      inner.style.transform = 'translateX(0)'
      return
    }

    // Начальная позиция
    positionRef.current = 0
    lastTimeRef.current = performance.now()

    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTimeRef.current) / 1000
      lastTimeRef.current = currentTime

      // Двигаем влево
      positionRef.current -= speed * deltaTime

      // Когда первый текст скрылся - сбрасываем позицию
      // [TEXT][TEXT] - когда позиция = -textWidth, первый скрылся
      if (positionRef.current <= -textWidth) {
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
          textShadow: '0 0 8px #0F0, 0 0 15px #0F0',
          fontFamily: 'monospace',
          letterSpacing: '0.5px',
        }}
      >
        {/* Оригинальный текст */}
        <span>{text}</span>
        {/* Разделитель */}
        <span style={{ margin: '0 1.5em', opacity: 0.7 }}>●</span>
        {/* Дубликат для бесшовности */}
        <span>{text}</span>
        {/* Разделитель */}
        <span style={{ margin: '0 1.5em', opacity: 0.7 }}>●</span>
      </div>
    </div>
  )
}
