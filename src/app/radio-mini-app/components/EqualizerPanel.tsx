'use client'

import { motion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'
import { COLORS } from '../types'

// =====================================================
// EQUALIZER PANEL COMPONENT
// 3-band equalizer (Bass, Mid, Treble) with reset
// =====================================================

interface EqualizerPanelProps {
  bass: number
  mid: number
  treble: number
  onBassChange: (value: number) => void
  onMidChange: (value: number) => void
  onTrebleChange: (value: number) => void
  onReset: () => void
  show: boolean
}

export function EqualizerPanel({
  bass,
  mid,
  treble,
  onBassChange,
  onMidChange,
  onTrebleChange,
  onReset,
  show,
}: EqualizerPanelProps) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: show ? 'auto' : 0, opacity: show ? 1 : 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-hidden"
    >
      <div className="skeuo-card rounded-xl p-4 mb-4 space-y-4">
        {/* Header with Reset button */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium" style={{ color: COLORS.text }}>
            Эквалайзер
          </h3>
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all hover:bg-white/10"
            style={{ color: COLORS.secondary }}
            title="Сбросить настройки"
          >
            <RotateCcw className="w-3 h-3" />
            Сбросить
          </button>
        </div>

        {/* Bass */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span style={{ color: COLORS.bass }}>Bass</span>
            <span style={{ color: COLORS.text }}>{bass > 0 ? '+' : ''}{bass} dB</span>
          </div>
          <input
            type="range"
            min="-12"
            max="12"
            value={bass}
            onChange={(e) => onBassChange(Number(e.target.value))}
            className="w-full eq-slider-bass cursor-pointer"
          />
        </div>

        {/* Mid */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span style={{ color: COLORS.mid }}>Mid</span>
            <span style={{ color: COLORS.text }}>{mid > 0 ? '+' : ''}{mid} dB</span>
          </div>
          <input
            type="range"
            min="-12"
            max="12"
            value={mid}
            onChange={(e) => onMidChange(Number(e.target.value))}
            className="w-full eq-slider-mid cursor-pointer"
          />
        </div>

        {/* Treble */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span style={{ color: COLORS.high }}>Treble</span>
            <span style={{ color: COLORS.text }}>{treble > 0 ? '+' : ''}{treble} dB</span>
          </div>
          <input
            type="range"
            min="-12"
            max="12"
            value={treble}
            onChange={(e) => onTrebleChange(Number(e.target.value))}
            className="w-full eq-slider-treble cursor-pointer"
          />
        </div>
      </div>

      {/* CSS for equalizer sliders */}
      <style jsx>{`
        .eq-slider-bass, .eq-slider-mid, .eq-slider-treble {
          -webkit-appearance: none;
          height: 6px;
          border-radius: 5px;
        }
        .eq-slider-bass {
          background: linear-gradient(90deg, #330015 0%, ${COLORS.bass} 50%, #330015 100%);
        }
        .eq-slider-mid {
          background: linear-gradient(90deg, #003315 0%, ${COLORS.mid} 50%, #003315 100%);
        }
        .eq-slider-treble {
          background: linear-gradient(90deg, #003330 0%, ${COLORS.high} 50%, #003330 100%);
        }
        .eq-slider-bass::-webkit-slider-thumb,
        .eq-slider-mid::-webkit-slider-thumb,
        .eq-slider-treble::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(145deg, #ffffff, #e6e6e6);
          cursor: pointer;
          box-shadow: 0 0 8px rgba(255,255,255,0.3);
        }
        .eq-slider-bass::-webkit-slider-thumb { border: 2px solid ${COLORS.bass}; }
        .eq-slider-mid::-webkit-slider-thumb { border: 2px solid ${COLORS.mid}; }
        .eq-slider-treble::-webkit-slider-thumb { border: 2px solid ${COLORS.high}; }
      `}</style>
    </motion.div>
  )
}
