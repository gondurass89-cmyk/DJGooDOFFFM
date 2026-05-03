'use client'

import { motion } from 'framer-motion'
import { STATION_NAME, STATION_LOGO, COLORS } from '../types'

// =====================================================
// TRACK INFO COMPONENT
// Album art and track title display
// =====================================================

interface TrackInfoProps {
  currentTrack: string
  albumArtUrl: string | null
  listeners: number
  showEq: boolean
}

export function TrackInfo({
  currentTrack,
  albumArtUrl,
  listeners,
  showEq,
}: TrackInfoProps) {
  return (
    <motion.div
      animate={{
        y: showEq ? -180 : 0,
        opacity: showEq ? 0 : 1,
        scale: showEq ? 0.8 : 1,
      }}
      transition={{ duration: 0.4, ease: 'easeInOut' }}
      style={{
        position: showEq ? 'absolute' : 'relative',
        width: '100%',
        pointerEvents: showEq ? 'none' : 'auto',
      }}
    >
      {/* Album Art / Logo */}
      <motion.img
        key={albumArtUrl || 'default'}
        src={albumArtUrl || STATION_LOGO}
        alt={albumArtUrl ? `Album art for ${currentTrack}` : STATION_NAME}
        className="mx-auto mb-3 rounded-lg object-cover"
        style={{
          width: '150px',
          height: '150px',
          boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 60px ${COLORS.secondary}30`,
        }}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
      />

      {/* Station Name */}
      <h1
        className="text-center text-lg font-bold mb-1"
        style={{ color: COLORS.accent }}
      >
        {STATION_NAME}
      </h1>

      {/* Current Track */}
      <p
        className="text-center text-sm mb-2 px-2 truncate"
        style={{ color: COLORS.text }}
        title={currentTrack}
      >
        Сейчас в эфире: {currentTrack}
      </p>

      {/* Listeners Count */}
      <p
        className="text-center text-xs"
        style={{ color: COLORS.text }}
      >
        👥 {listeners} {getListenersWord(listeners)}
      </p>
    </motion.div>
  )
}

// Helper: correct Russian word form for listeners
function getListenersWord(count: number): string {
  const lastTwo = count % 100
  const lastOne = count % 10

  if (lastTwo >= 11 && lastTwo <= 14) return 'слушателей'
  if (lastOne === 1) return 'слушатель'
  if (lastOne >= 2 && lastOne <= 4) return 'слушателя'
  return 'слушателей'
}
