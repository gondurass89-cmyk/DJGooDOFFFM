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
      // Быстрое затухание для коротких хвостов (как капли дождя)
      ctx.fillStyle = 'rgba(13, 0, 38, 0.1)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Яркий зелёный цвет символов
      ctx.font = `${fontSize}px monospace`

      for (let i = 0; i < drops.length; i++) {
        const text = charArray[Math.floor(Math.random() * charArray.length)]
        const x = i * fontSize
        const y = drops[i] * fontSize

        // Голова капли - ярко-зелёная со свечением
        if (drops[i] > 0) {
          ctx.fillStyle = '#0F0' // Яркий зелёный
          ctx.shadowColor = '#0F0'
          ctx.shadowBlur = 8
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

    // Animation loop
    const interval = setInterval(draw, 40)

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
        opacity: 0.7,
        pointerEvents: 'none',
      }}
    />
  )
}
