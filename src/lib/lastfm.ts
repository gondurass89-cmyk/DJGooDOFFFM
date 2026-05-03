/**
 * Last.fm API Integration
 * Fetches album artwork for currently playing tracks
 */

// Use NEXT_PUBLIC_ prefix for client-side access
const LASTFM_API_KEY = process.env.NEXT_PUBLIC_LASTFM_KEY;
const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';
const ITUNES_API_URL = 'https://itunes.apple.com/search';

export interface TrackArtwork {
  artist: string;
  track: string;
  album: string;
  albumArt: string | null;
  albumArtLarge: string | null;
  source: 'lastfm' | 'itunes' | 'none';
}

/**
 * Extract artist and track name from Icecast title
 * Handles formats like: "Artist - Track", "Artist – Track", etc.
 */
export function parseTrackTitle(title: string): { artist: string; track: string } | null {
  if (!title) return null;
  
  // Common separators: dash (regular, en-dash, em-dash)
  const separators = [' - ', ' – ', ' — ', '-', '–', '—'];
  
  for (const sep of separators) {
    const parts = title.split(sep);
    if (parts.length >= 2) {
      const artist = parts[0].trim();
      const track = parts.slice(1).join(sep).trim();
      
      if (artist && track) {
        return { artist, track };
      }
    }
  }
  
  return null;
}

/**
 * Fetch track info from Last.fm API
 */
export async function fetchTrackInfo(artist: string, track: string): Promise<TrackArtwork | null> {
  if (!LASTFM_API_KEY) {
    console.warn('Last.fm API key not configured');
    return null;
  }
  
  try {
    const params = new URLSearchParams({
      method: 'track.getInfo',
      api_key: LASTFM_API_KEY,
      artist: artist,
      track: track,
      format: 'json',
    });
    
    const response = await fetch(`${LASTFM_API_URL}?${params}`, {
      next: { revalidate: 60 },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.error) return null;
    
    const trackData = data.track;
    if (!trackData) return null;
    
    const album = trackData.album;
    let albumArt: string | null = null;
    let albumArtLarge: string | null = null;
    
    if (album?.image) {
      const images = album.image as Array<{ '#text': string; size: string }>;
      
      const extralargeImg = images.find(img => img.size === 'extralarge');
      const largeImg = images.find(img => img.size === 'large');
      const mediumImg = images.find(img => img.size === 'medium');
      
      albumArt = mediumImg?.['#text'] || null;
      albumArtLarge = extralargeImg?.['#text'] || largeImg?.['#text'] || null;
    }
    
    if (!albumArtLarge) return null;
    
    return {
      artist: trackData.artist?.name || artist,
      track: trackData.name || track,
      album: album?.title || '',
      albumArt,
      albumArtLarge,
      source: 'lastfm',
    };
    
  } catch (error) {
    console.error('Error fetching Last.fm track info:', error);
    return null;
  }
}

/**
 * Search iTunes API for album artwork
 * Returns up to 600x600 artwork, no API key required
 */
export async function searchITunes(artist: string, track: string): Promise<TrackArtwork | null> {
  try {
    const cleanTrack = track
      .replace(/\s*\([^)]*[Mm]ix[^)]*\)/g, '')
      .replace(/\s*\[[^\]]*\]/g, '')
      .trim();
    
    const searchTerm = `${artist} ${cleanTrack}`;
    
    const params = new URLSearchParams({
      term: searchTerm,
      media: 'music',
      limit: '1',
    });
    
    console.log('iTunes search:', searchTerm);
    
    const response = await fetch(`${ITUNES_API_URL}?${params}`, {
      next: { revalidate: 300 },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) return null;
    
    const result = data.results[0];
    
    let artworkUrl = result.artworkUrl100 || result.artworkUrl60 || null;
    
    if (artworkUrl) {
      artworkUrl = artworkUrl.replace(/\/\d+x\d+bb/, '/600x600bb');
    }
    
    if (!artworkUrl) return null;
    
    console.log('iTunes found artwork:', artworkUrl);
    
    return {
      artist: result.artistName || artist,
      track: result.trackName || track,
      album: result.collectionName || '',
      albumArt: result.artworkUrl100 || null,
      albumArtLarge: artworkUrl,
      source: 'itunes',
    };
    
  } catch (error) {
    console.error('Error searching iTunes:', error);
    return null;
  }
}

/**
 * Get artwork from multiple sources with fallback chain
 * 1. Last.fm track.getInfo
 * 2. iTunes Search API
 */
export async function getTrackArtwork(artist: string, track: string): Promise<TrackArtwork | null> {
  const lastfmResult = await fetchTrackInfo(artist, track);
  if (lastfmResult?.albumArtLarge) {
    console.log('Artwork found in Last.fm');
    return lastfmResult;
  }
  
  console.log('Last.fm not found, trying iTunes...');
  const itunesResult = await searchITunes(artist, track);
  if (itunesResult?.albumArtLarge) {
    console.log('Artwork found in iTunes');
    return itunesResult;
  }
  
  console.log('No artwork found');
  return null;
}
