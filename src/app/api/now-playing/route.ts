import { NextResponse } from 'next/server'
import { cleanTrackTitle, cleanArtistName, toTitleCase } from '@/lib/track-cleaner'

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic'

// =====================================================
// ПРЯМОЕ ПОДКЛЮЧЕНИЕ К AZURACAST API
// Раньше шло через Cloudflare Worker (nowplaying-worker)
// Теперь — напрямую, т.к. AzuraCast сам отдаёт HTTPS + CORS
// =====================================================
const AZURACAST_API = 'https://djgoodoff.duckdns.org/api/nowplaying/djgoodofffm'

// Валидация AzuraCast art URL (не placeholder)
function isValidAzuraCastArt(artUrl: string | null): boolean {
  if (!artUrl || artUrl.trim() === '') return false
  if (artUrl.includes('/api/internal-radio-art')) return false
  if (artUrl.includes('default_album_art')) return false
  if (artUrl.includes('placeholder')) return false
  return true
}

// Прямой запрос к AzuraCast API с полной очисткой треков
async function fetchFromAzuraCast() {
  try {
    const url = `${AZURACAST_API}?_t=${Date.now()}`

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DJGooDOFF-FM/1.0',
        'Cache-Control': 'no-cache',
      },
    })

    if (!response.ok) {
      console.log('AzuraCast API error:', response.status)
      return null
    }

    const data = await response.json()
    const nowPlaying = data.now_playing || {}
    const song = nowPlaying.song || {}
    const station = data.station || {}

    // Используем отдельные поля artist и title (более точные!)
    let cleanArtist = ''
    let cleanTitleStr = ''

    if (song.artist && song.title) {
      // Очищаем artist от Camelot key и Energy в начале
      cleanArtist = cleanArtistName(song.artist)
      cleanTitleStr = song.title.trim()

      // Если после очистки artist пустой
      if (!cleanArtist) {
        cleanArtist = toTitleCase(cleanTitleStr)
        cleanTitleStr = ''
      }
    }

    // Fallback: парсим song.text
    if (!cleanArtist && !cleanTitleStr) {
      const rawText = song.text || ''
      const cleanedText = cleanTrackTitle(rawText)
      if (cleanedText) {
        const parts = cleanedText.split(' - ')
        if (parts.length >= 2) {
          cleanArtist = parts[0].trim()
          cleanTitleStr = parts.slice(1).join(' - ').trim()
        } else {
          cleanArtist = cleanedText
          cleanTitleStr = ''
        }
      }
    }

    // Форматируем в Title Case
    cleanArtist = toTitleCase(cleanArtist)
    cleanTitleStr = toTitleCase(cleanTitleStr)

    // Итоговая строка
    const finalTitle = cleanTitleStr ? `${cleanArtist} - ${cleanTitleStr}` : cleanArtist

    // Art URL
    const art = isValidAzuraCastArt(song.art) ? song.art : null

    return {
      title: finalTitle || 'DJ GooD OFF FM',
      artist: cleanArtist,
      track: cleanTitleStr,
      listeners: data.listeners?.total || 0,
      online: data.is_online || false,
      station: station.name || 'DJ GooD OFF FM',
      art,
      duration: nowPlaying.duration || 0,
      elapsed: nowPlaying.elapsed || 0,
    }
  } catch (error) {
    console.log('AzuraCast fetch error:', error)
    return null
  }
}

export async function GET() {
  const trackData = await fetchFromAzuraCast()

  if (trackData) {
    return NextResponse.json(trackData, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      }
    })
  }

  // Fallback если AzuraCast недоступен
  return NextResponse.json({
    title: 'DJ GooD OFF FM',
    artist: '',
    track: '',
    listeners: 0,
    online: false,
    station: 'DJ GooD OFF FM',
    art: null,
    duration: 0,
    elapsed: 0,
    timestamp: Date.now()
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    }
  })
}
