'use client'

import { useState, useCallback, useEffect } from 'react'
import { NOW_PLAYING_API, ALBUM_ART_API } from '../types'

// =====================================================
// TRACK INFO HOOK
// Получение названия трека и обложки альбома
// =====================================================

export interface UseTrackInfoReturn {
  currentTrack: string
  albumArtUrl: string | null
  fetchCurrentTrack: () => Promise<void>
}

export function useTrackInfo(): UseTrackInfoReturn {
  const [currentTrack, setCurrentTrack] = useState('Загрузка...')
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null)

  // Fetch current track from API
  const fetchCurrentTrack = useCallback(async () => {
    try {
      const res = await fetch(NOW_PLAYING_API, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })

      if (res.ok) {
        const data = await res.json()
        if (data.title && data.title !== currentTrack) {
          setCurrentTrack(data.title)
        }
      }
    } catch (e) {
      console.error('[TRACK] Fetch error:', e)
    }
  }, [currentTrack])

  // Fetch album art when track changes
  useEffect(() => {
    if (!currentTrack || currentTrack === 'Загрузка...') return

    const fetchAlbumArt = async () => {
      try {
        const res = await fetch(`${ALBUM_ART_API}?title=${encodeURIComponent(currentTrack)}`)
        if (res.ok) {
          const data = await res.json()
          setAlbumArtUrl(data.albumArtLarge || null)
        }
      } catch (e) {
        console.error('[ALBUM_ART] Fetch error:', e)
        setAlbumArtUrl(null)
      }
    }

    fetchAlbumArt()
  }, [currentTrack])

  // Poll for track updates
  useEffect(() => {
    fetchCurrentTrack()
    const interval = setInterval(fetchCurrentTrack, 5000)
    return () => clearInterval(interval)
  }, [fetchCurrentTrack])

  return {
    currentTrack,
    albumArtUrl,
    fetchCurrentTrack,
  }
}
