'use client'

import { forwardRef } from 'react'
import { COLORS } from '../types'

// =====================================================
// AUDIO VISUALIZER COMPONENT
// Canvas-based frequency visualizer
// =====================================================

interface AudioVisualizerProps {
  width?: number
  height?: number
}

export const AudioVisualizer = forwardRef<HTMLCanvasElement, AudioVisualizerProps>(
  ({ width = 280, height = 80 }, ref) => {
    return (
      <div className="flex justify-center w-full">
        <canvas
          ref={ref}
          width={width}
          height={height}
          className="rounded-lg"
          style={{
            background: `linear-gradient(180deg, ${COLORS.dark} 0%, rgba(13,0,38,0.5) 100%)`,
          }}
        />
      </div>
    )
  }
)

AudioVisualizer.displayName = 'AudioVisualizer'
