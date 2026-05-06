'use client'

import { useEffect, useRef } from 'react'

// =====================================================
// MATRIX BACKGROUND - анимация падающих символов
// =====================================================
export default function MatrixBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Resize handler
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Matrix characters (Japanese + numbers + letters)
    const chars = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const charArray = chars.split('')
    const fontSize = 16
    const columns = Math.floor(canvas.width / fontSize)
    const drops: number[] = []

    // Initialize drops - начинаем с разных позиций
    for (let i = 0; i < columns; i++) {
      drops[i] = Math.random() * -50 // Случайная начальная позиция выше экрана
    }

    // Draw function
    const draw = () => {
      // Более прозрачный след для более длинного хвоста
      ctx.fillStyle = 'rgba(13, 0, 38, 0.03)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Основной цвет символов - яркий зелёный
      ctx.font = `${fontSize}px monospace`

      for (let i = 0; i < drops.length; i++) {
        const text = charArray[Math.floor(Math.random() * charArray.length)]
        const x = i * fontSize
        const y = drops[i] * fontSize

        // Градиент яркости - голова ярче, хвост тусклее
        const distanceFromTop = y / canvas.height
        const brightness = Math.max(0.2, 1 - distanceFromTop * 0.5)
        
        // Голова (первый символ) - самая яркая с свечением
        if (drops[i] > 0) {
          ctx.fillStyle = `rgba(180, 255, 180, ${brightness})` // Яркая голова
          ctx.shadowColor = '#0F0'
          ctx.shadowBlur = 10
          ctx.fillText(text, x, y)
          ctx.shadowBlur = 0
        }

        // Падение до самого низа экрана
        if (y > canvas.height && Math.random() > 0.98) {
          drops[i] = 0 // Сброс наверх
        }
        drops[i]++
      }
    }

    // Animation loop - быстрее анимация
    const interval = setInterval(draw, 35)

    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        opacity: 0.6, // Более яркий эффект
        pointerEvents: 'none',
      }}
    />
  )
}
