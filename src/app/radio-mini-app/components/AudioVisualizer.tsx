'use client'

import { forwardRef, useEffect, useRef, useImperativeHandle } from 'react'
import { COLORS } from '../types'

// =====================================================
// AUDIO VISUALIZER COMPONENT
// Canvas-based frequency visualizer
// =====================================================

interface AudioVisualizerProps {
  height?: number
}

export const AudioVisualizer = forwardRef<HTMLCanvasElement, AudioVisualizerProps>(
  ({ height = 60 }, ref) => {
    const innerRef = useRef<HTMLCanvasElement>(null)
    
    // Merge refs
    useImperativeHandle(ref, () => innerRef.current!)
    
    // Update canvas size on mount and resize
    useEffect(() => {
      const canvas = innerRef.current
      if (!canvas) return
      
      const updateSize = () => {
        const container = canvas.parentElement
        if (container) {
          canvas.width = container.clientWidth
        }
      }
      
      updateSize()
      window.addEventListener('resize', updateSize)
      return () => window.removeEventListener('resize', updateSize)
    }, [])
    
    return (
      <canvas
        ref={innerRef}
        height={height}
        className="w-full rounded-lg"
        style={{
          background: `linear-gradient(180deg, ${COLORS.dark} 0%, rgba(13,0,38,0.5) 100%)`,
        }}
      />
    )
  }
)

AudioVisualizer.displayName = 'AudioVisualizer'
