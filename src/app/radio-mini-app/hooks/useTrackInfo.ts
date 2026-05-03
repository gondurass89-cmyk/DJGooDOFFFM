'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
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
  const lastTrackRef = useRef<string>('')

  // Fetch current track from API
  const fetchCurrentTrack = useCallback(async () => {
    try {
      const res = await fetch(NOW_PLAYING_API, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      })

      if (res.ok) {
        const data = await res.json()
        // Update if we have a valid title that's different from last one
        if (data.title && data.title.trim() && data.title !== lastTrackRef.current) {
          lastTrackRef.current = data.title
          setCurrentTrack(data.title)
        }
      }
    } catch (e) {
      console.error('[TRACK] Fetch error:', e)
    }
  }, []) // No dependency on currentTrack - use ref instead

  // Fetch album art when track changes
  useEffect(() => {
    if (!currentTrack || currentTrack === 'Загрузка...') return

    const fetchAlbumArt = async () => {
      try {
        console.log('[ALBUM_ART] Fetching for:', currentTrack)
        const res = await fetch(`${ALBUM_ART_API}?title=${encodeURIComponent(currentTrack)}`)
        if (res.ok) {
          const data = await res.json()
          console.log('[ALBUM_ART] Response:', data.albumArtLarge ? 'found' : 'not found')
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
