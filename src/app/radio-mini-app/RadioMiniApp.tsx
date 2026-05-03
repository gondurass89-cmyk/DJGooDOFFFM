'use client'

// =====================================================
// DJ GooD OFF FM - Telegram Mini App
// Радио-плеер с реальным эквалайзером и визуализатором
// Модульная архитектура: hooks + components
// =====================================================

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'

// Types & Constants
import { COLORS, STATION_NAME, STATION_LOGO, REAL_MODE_CHECK_DELAY } from './types'

// Hooks
import { useTelegram } from './hooks/useTelegram'
import { useAudioPlayer } from './hooks/useAudioPlayer'
import { useVisualizer } from './hooks/useVisualizer'
import { useTrackInfo } from './hooks/useTrackInfo'
import { useListeners, useListenersCount } from './hooks/useListeners'

// Components
import { AudioVisualizer } from './components/AudioVisualizer'
import { EqualizerPanel } from './components/EqualizerPanel'
import { PlayerControls } from './components/PlayerControls'
import { TrackInfo } from './components/TrackInfo'

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function RadioMiniApp() {
  // Telegram integration
  const { user, isIOS } = useTelegram()

  // Audio player
  const audio = useAudioPlayer()

  // Visualizer
  const visualizer = useVisualizer()

  // Track info
  const { currentTrack, albumArtUrl } = useTrackInfo()

  // Listeners
  const listeners = useListenersCount()

  // Equalizer state
  const [eqBass, setEqBass] = useState(0)
  const [eqMid, setEqMid] = useState(0)
  const [eqTreble, setEqTreble] = useState(0)
  const [showEq, setShowEq] = useState(false)

  // Connect audio chain when playing starts
  useEffect(() => {
    if (audio.isPlaying && !audio.fallbackModeRef.current) {
      const ctx = audio.getAudioContext()
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume()
        }

        const chainConnected = audio.connectAudioChain(eqBass, eqMid, eqTreble)

        if (chainConnected) {
          // Check if real mode works after delay
          setTimeout(() => {
            if (audio.analyserRef.current) {
              const dataArray = new Uint8Array(audio.analyserRef.current.frequencyBinCount)
              audio.analyserRef.current.getByteFrequencyData(dataArray)

              let hasData = false
              for (let i = 0; i < dataArray.length; i++) {
                if (dataArray[i] > 10) {
                  hasData = true
                  break
                }
              }

              if (!hasData) {
                audio.fallbackModeRef.current = true
              }
            }
          }, REAL_MODE_CHECK_DELAY)
        } else {
          audio.fallbackModeRef.current = true
        }
      } else {
        audio.fallbackModeRef.current = true
      }
    }
  }, [audio.isPlaying, audio, eqBass, eqMid, eqTreble])

  // Start/stop visualization when playing changes
  useEffect(() => {
    if (audio.isPlaying) {
      visualizer.startVisualization(
        audio.analyserRef.current,
        audio.fallbackModeRef.current
      )
    } else {
      visualizer.stopVisualization()
    }
  }, [audio.isPlaying, audio.analyserRef, audio.fallbackModeRef, visualizer])

  // Update EQ filters
  useEffect(() => {
    if (audio.bassFilterRef.current) {
      audio.bassFilterRef.current.gain.value = eqBass
    }
  }, [eqBass, audio.bassFilterRef])

  useEffect(() => {
    if (audio.midFilterRef.current) {
      audio.midFilterRef.current.gain.value = eqMid
    }
  }, [eqMid, audio.midFilterRef])

  useEffect(() => {
    if (audio.trebleFilterRef.current) {
      audio.trebleFilterRef.current.gain.value = eqTreble
    }
  }, [eqTreble, audio.trebleFilterRef])

  // Handle play with iOS fallback
  const handleTogglePlay = useCallback(async () => {
    if (isIOS) {
      audio.fallbackModeRef.current = true
    }
    await audio.togglePlay()
  }, [audio, isIOS])

  return (
    <>
      {/* Global Styles */}
      <style jsx global>{`
        .skeuo-card {
          background: linear-gradient(145deg, rgba(46,0,113,0.6), rgba(13,0,38,0.8));
          border: 1px solid rgba(0,199,48,0.2);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05);
        }
      `}</style>

      {/* Main Container */}
      <div
        className="min-h-screen flex flex-col items-center justify-center p-4"
        style={{
          background: `linear-gradient(180deg, ${COLORS.primary} 0%, ${COLORS.dark} 100%)`,
        }}
      >
        {/* Decorative Background */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse 80% 50% at 50% 30%, rgba(0,199,48,0.15) 0%, transparent 50%),
              radial-gradient(ellipse 60% 40% at 30% 60%, rgba(255,0,102,0.1) 0%, transparent 50%)
            `,
          }}
        />

        <div className="relative z-10 w-full max-w-xs">
          {/* Track Info */}
          <TrackInfo
            currentTrack={currentTrack}
            albumArtUrl={albumArtUrl}
            listeners={listeners}
            showEq={showEq}
          />

          {/* Visualizer */}
          <motion.div
            animate={{ y: showEq ? -10 : 0 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="skeuo-card rounded-xl p-2 mb-3 relative"
          >
            {/* LIVE Indicator */}
            <AnimatePresence>
              {audio.isPlaying && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -top-2 right-2 px-2 py-0.5 rounded-full text-xs font-bold z-20"
                  style={{
                    background: `linear-gradient(145deg, ${COLORS.secondary}, ${COLORS.accent})`,
                    color: COLORS.dark,
                    boxShadow: '0 0 15px rgba(0,199,48,0.8)',
                  }}
                >
                  LIVE
                </motion.div>
              )}
            </AnimatePresence>

            <AudioVisualizer ref={visualizer.canvasRef} width={280} height={60} />

            {/* Frequency Labels */}
            {!isIOS && (
              <div className="flex justify-between mt-1.5 px-1">
                <span className="text-xs font-medium" style={{ color: COLORS.bass }}>BASS</span>
                <span className="text-xs font-medium" style={{ color: COLORS.mid }}>MID</span>
                <span className="text-xs font-medium" style={{ color: COLORS.high }}>TREBLE</span>
              </div>
            )}

            {isIOS && audio.isPlaying && (
              <div
                className="text-xs text-center mt-1"
                style={{ color: COLORS.text, opacity: 0.7 }}
              >
                🎵 Визуализация
              </div>
            )}
          </motion.div>

          {/* EQ Toggle Button */}
          {!isIOS && !audio.fallbackModeRef.current && (
            <motion.div
              animate={{ y: showEq ? -15 : 0 }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
            >
              <button
                onClick={() => setShowEq(!showEq)}
                className="w-full flex items-center justify-center gap-1 py-1.5 mb-2 rounded-xl skeuo-card text-xs transition-all"
                style={{ color: COLORS.secondary }}
              >
                {showEq ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    Скрыть эквалайзер
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Эквалайзер
                  </>
                )}
              </button>
            </motion.div>
          )}

          {/* Equalizer Panel */}
          {!isIOS && !audio.fallbackModeRef.current && (
            <EqualizerPanel
              bass={eqBass}
              mid={eqMid}
              treble={eqTreble}
              onBassChange={setEqBass}
              onMidChange={setEqMid}
              onTrebleChange={setEqTreble}
              show={showEq}
            />
          )}

          {/* Player Controls */}
          <PlayerControls
            isPlaying={audio.isPlaying}
            isLoading={audio.isLoading}
            isMuted={audio.isMuted}
            volume={audio.volume}
            buffering={audio.buffering}
            reconnecting={audio.reconnecting}
            reconnectAttempts={audio.reconnectAttempts}
            onTogglePlay={handleTogglePlay}
            onToggleMute={audio.toggleMute}
            onVolumeChange={audio.setVolume}
          />

          {/* Error Display */}
          <AnimatePresence>
            {audio.error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mt-4 p-3 rounded-xl flex items-center gap-2"
                style={{
                  background: 'rgba(255,0,102,0.2)',
                  border: '1px solid rgba(255,0,102,0.3)',
                }}
              >
                <AlertCircle className="w-5 h-5" style={{ color: COLORS.bass }} />
                <span className="text-sm" style={{ color: COLORS.text }}>
                  {audio.error}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Station Name Footer */}
          <motion.div
            className="mt-4 text-center text-xs"
            style={{ color: COLORS.text, opacity: 0.5 }}
            animate={{ opacity: audio.isPlaying ? 0.7 : 0.5 }}
          >
            {STATION_NAME} • Telegram Mini App
          </motion.div>
        </div>
      </div>
    </>
  )
}
