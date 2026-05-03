'use client'

import { useRef, useCallback, useEffect } from 'react'
import { COLORS, REAL_MODE_CHECK_FRAMES, REAL_MODE_CHECK_DELAY } from '../types'

// =====================================================
// VISUALIZER HOOK
// Аудио визуализатор с Real и Fallback режимами
// =====================================================

export interface UseVisualizerReturn {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>
  startVisualization: (
    analyser: AnalyserNode | null,
    isFallback: boolean
  ) => void
  stopVisualization: () => void
}

const SMOOTHING_FACTOR = 0.25

// Convert frequency to bin index
function frequencyToBin(frequency: number, sampleRate: number, fftSize: number): number {
  return frequency * (fftSize / 2) / (sampleRate / 2)
}

// Get average value for a bin range
function getAverageForBinRange(dataArray: Uint8Array, startBin: number, endBin: number): number {
  const start = Math.max(0, Math.floor(startBin))
  const end = Math.min(dataArray.length - 1, Math.floor(endBin))
  if (start > end) return 0
  let sum = 0
  for (let i = start; i <= end; i++) sum += dataArray[i]
  return (sum / (end - start + 1)) / 255
}

export function useVisualizer(): UseVisualizerReturn {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const smoothedBarsRef = useRef<number[]>(new Array(24).fill(0))
  const isPlayingRef = useRef(false)

  // Real mode visualizer (Web Audio API)
  const visualizeReal = useCallback((analyser: AnalyserNode) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')

    if (!canvas || !ctx) {
      animationFrameRef.current = requestAnimationFrame(() => visualizeReal(analyser))
      return
    }

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyser.getByteFrequencyData(dataArray)

    const sampleRate = analyser.context.sampleRate
    const fftSize = analyser.fftSize
    const barValues: number[] = []

    // BASS (20-250 Hz) - 8 bars
    const bassFreqs = [20, 30, 45, 65, 90, 120, 160, 220]
    for (let i = 0; i < 8; i++) {
      const lowFreq = i === 0 ? 20 : bassFreqs[i] - (bassFreqs[i] - bassFreqs[i - 1]) / 2
      const highFreq = i === 7 ? 250 : bassFreqs[i] + (bassFreqs[i + 1] - bassFreqs[i]) / 2
      const lowBin = frequencyToBin(lowFreq, sampleRate, fftSize)
      const highBin = frequencyToBin(highFreq, sampleRate, fftSize)
      barValues.push(getAverageForBinRange(dataArray, lowBin, highBin))
    }

    // MID (250-4000 Hz) - 8 bars
    const midFreqs = [300, 420, 580, 800, 1100, 1500, 2100, 3000]
    for (let i = 0; i < 8; i++) {
      const lowFreq = i === 0 ? 250 : midFreqs[i] - (midFreqs[i] - midFreqs[i - 1]) / 2
      const highFreq = i === 7 ? 4000 : midFreqs[i] + (midFreqs[i + 1] - midFreqs[i]) / 2
      const lowBin = frequencyToBin(lowFreq, sampleRate, fftSize)
      const highBin = frequencyToBin(highFreq, sampleRate, fftSize)
      barValues.push(getAverageForBinRange(dataArray, lowBin, highBin))
    }

    // TREBLE (4000-20000 Hz) - 8 bars
    const trebleFreqs = [4500, 5500, 7000, 8500, 10500, 13000, 16000, 19000]
    for (let i = 0; i < 8; i++) {
      const lowFreq = i === 0 ? 4000 : trebleFreqs[i] - (trebleFreqs[i] - trebleFreqs[i - 1]) / 2
      const highFreq = i === 7 ? 20000 : trebleFreqs[i] + (trebleFreqs[i + 1] - trebleFreqs[i]) / 2
      const lowBin = frequencyToBin(lowFreq, sampleRate, fftSize)
      const highBin = frequencyToBin(highFreq, sampleRate, fftSize)
      barValues.push(getAverageForBinRange(dataArray, lowBin, highBin))
    }

    // Smoothing
    for (let i = 0; i < 24; i++) {
      smoothedBarsRef.current[i] = smoothedBarsRef.current[i] +
        (barValues[i] - smoothedBarsRef.current[i]) * SMOOTHING_FACTOR
    }

    // Draw
    drawBars(ctx, canvas.width, canvas.height, smoothedBarsRef.current)

    animationFrameRef.current = requestAnimationFrame(() => visualizeReal(analyser))
  }, [])

  // Fallback mode visualizer (iOS, animated sine waves)
  const visualizeFallback = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const animate = () => {
      if (!isPlayingRef.current) {
        stopVisualization()
        return
      }

      const time = Date.now() / 1000
      const values: number[] = []

      // Generate fake audio data using sine waves
      for (let i = 0; i < 24; i++) {
        const baseHeight = 0.3 +
          Math.sin(time * 2 + i * 0.5) * 0.2 +
          Math.sin(time * 3.7 + i * 0.3) * 0.15
        values.push(baseHeight)
      }

      // Smoothing
      for (let i = 0; i < 24; i++) {
        smoothedBarsRef.current[i] = smoothedBarsRef.current[i] +
          (values[i] - smoothedBarsRef.current[i]) * SMOOTHING_FACTOR
      }

      drawBars(ctx, canvas.width, canvas.height, smoothedBarsRef.current)
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animate()
  }, [])

  // Draw bars on canvas
  const drawBars = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    values: number[]
  ) => {
    ctx.clearRect(0, 0, width, height)

    const gap = 2
    const sectionGap = 8
    const barWidth = (width - 23 * gap - 2 * sectionGap) / 24

    for (let i = 0; i < 24; i++) {
      const section = Math.floor(i / 8)
      const barInSection = i % 8
      const x = barInSection * (barWidth + gap) + section * (8 * (barWidth + gap) + sectionGap)
      const barHeight = Math.max(2, values[i] * (height - 4))

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
  }

  // Start visualization
  const startVisualization = useCallback((
    analyser: AnalyserNode | null,
    isFallback: boolean
  ) => {
    if (animationFrameRef.current) return

    isPlayingRef.current = true
    smoothedBarsRef.current = new Array(24).fill(0)

    if (isFallback || !analyser) {
      visualizeFallback()
    } else {
      visualizeReal(analyser)
    }
  }, [visualizeReal, visualizeFallback])

  // Stop visualization
  const stopVisualization = useCallback(() => {
    isPlayingRef.current = false
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    smoothedBarsRef.current = new Array(24).fill(0)

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [])

  return {
    canvasRef,
    startVisualization,
    stopVisualization,
  }
}
