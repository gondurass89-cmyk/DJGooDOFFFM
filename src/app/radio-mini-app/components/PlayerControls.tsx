'use client'

import { motion } from 'framer-motion'
import { Play, Pause, Volume2, VolumeX, Loader2, RefreshCw } from 'lucide-react'
import { COLORS } from '../types'

// =====================================================
// PLAYER CONTROLS COMPONENT
// Play/Pause, Volume, Mute controls
// =====================================================

interface PlayerControlsProps {
  isPlaying: boolean
  isLoading: boolean
  isMuted: boolean
  volume: number
  buffering: boolean
  reconnecting: boolean
  reconnectAttempts: number
  onTogglePlay: () => void
  onToggleMute: () => void
  onVolumeChange: (volume: number) => void
}

export function PlayerControls({
  isPlaying,
  isLoading,
  isMuted,
  volume,
  buffering,
  reconnecting,
  reconnectAttempts,
  onTogglePlay,
  onToggleMute,
  onVolumeChange,
}: PlayerControlsProps) {
  const showSpinner = isLoading || buffering || reconnecting

  return (
    <div className="space-y-4">
      {/* Play/Pause Button */}
      <div className="flex justify-center">
        <motion.button
          onClick={onTogglePlay}
          disabled={showSpinner}
          className="relative w-20 h-20 rounded-full flex items-center justify-center"
          style={{
            background: `linear-gradient(145deg, ${COLORS.secondary}, ${COLORS.accent})`,
            boxShadow: `0 0 30px ${COLORS.secondary}40, inset 0 2px 4px rgba(255,255,255,0.2)`,
          }}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
        >
          {showSpinner ? (
            <>
              <Loader2
                className="w-8 h-8 text-white animate-spin"
                strokeWidth={2.5}
              />
              {reconnecting && (
                <span
                  className="absolute -bottom-6 text-xs font-medium"
                  style={{ color: COLORS.text }}
                >
                  {reconnectAttempts}/5
                </span>
              )}
            </>
          ) : isPlaying ? (
            <Pause className="w-8 h-8 text-white" strokeWidth={2.5} />
          ) : (
            <Play className="w-8 h-8 text-white ml-1" strokeWidth={2.5} />
          )}
        </motion.button>
      </div>

      {/* Volume Control */}
      <div className="flex items-center gap-3 px-4">
        <button
          onClick={onToggleMute}
          className="p-2 rounded-lg transition-colors hover:bg-white/10"
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="w-5 h-5" style={{ color: COLORS.text }} />
          ) : (
            <Volume2 className="w-5 h-5" style={{ color: COLORS.text }} />
          )}
        </button>

        <input
          type="range"
          min="0"
          max="100"
          value={isMuted ? 0 : volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          className="flex-1 volume-slider cursor-pointer"
        />

        <span
          className="text-xs w-8 text-right"
          style={{ color: COLORS.text }}
        >
          {isMuted ? '0%' : `${volume}%`}
        </span>
      </div>

      {/* Volume slider CSS */}
      <style jsx>{`
        .volume-slider {
          -webkit-appearance: none;
          height: 8px;
          border-radius: 10px;
          background: linear-gradient(
            90deg,
            rgba(255, 0, 102, 0.3) 0%,
            rgba(0, 199, 48, 0.3) 50%,
            rgba(0, 255, 204, 0.3) 100%
          );
        }
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 3px solid ${COLORS.secondary};
          cursor: pointer;
        }
        .volume-slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          border: 3px solid ${COLORS.secondary};
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
