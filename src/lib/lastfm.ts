/**
 * Last.fm API Integration
 * Fetches album artwork for currently playing tracks
 */

// Use NEXT_PUBLIC_ prefix for client-side access (already configured in Vercel)
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
      const track = parts.slice(1).join(sep).trim(); // Handle "Artist - Track - Remix"
      
      if (artist && track) {
        return { artist, track };
      }
    }
  }
  
  // If no separator found, treat entire string as track (no artist)
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
      next: { revalidate: 60 }, // Cache for 60 seconds
    });
    
    if (!response.ok) {
      console.error('Last.fm API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (data.error) {
      console.error('Last.fm API error:', data.message);
      return null;
    }
    
    const trackData = data.track;
    if (!trackData) return null;
    
    // Extract album art from various sizes
    const album = trackData.album;
    let albumArt: string | null = null;
    let albumArtLarge: string | null = null;
    
    if (album?.image) {
      // Last.fm returns array of images with different sizes
      // Sizes: small, medium, large, extralarge
      const images = album.image as Array<{ '#text': string; size: string }>;
      
      // Get extralarge (300x300) for best quality, fallback to large
      const extralargeImg = images.find(img => img.size === 'extralarge');
      const largeImg = images.find(img => img.size === 'large');
      const mediumImg = images.find(img => img.size === 'medium');
      
      albumArt = mediumImg?.['#text'] || null;
      albumArtLarge = extralargeImg?.['#text'] || largeImg?.['#text'] || null;
    }
    
    // Only return if we have artwork
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
 * Search for album art by artist and track
 * Fallback method when track.getInfo doesn't return artwork
 */
export async function searchAlbumArt(artist: string, track: string): Promise<string | null> {
  if (!LASTFM_API_KEY) return null;
  
  try {
    const params = new URLSearchParams({
      method: 'track.search',
      api_key: LASTFM_API_KEY,
      artist: artist,
      track: track,
      format: 'json',
      limit: '1',
    });
    
    const response = await fetch(`${LASTFM_API_URL}?${params}`, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const trackMatch = data.results?.trackmatches?.track?.[0];
    
    if (trackMatch?.image) {
      const largeImg = trackMatch.image.find((img: any) => img.size === 'large');
      return largeImg?.['#text'] || null;
    }
    
    return null;
  } catch (error) {
    console.error('Error searching Last.fm:', error);
    return null;
  }
}

/**
 * Search iTunes API for album artwork
 * Returns up to 600x600 artwork, no API key required
 */
export async function searchITunes(artist: string, track: string): Promise<TrackArtwork | null> {
  try {
    // Clean track name - remove remix info in brackets for better search
    const cleanTrack = track
      .replace(/\s*\([^)]*[Mm]ix[^)]*\)/g, '')  // Remove (Original Mix), (Remix), etc.
      .replace(/\s*\[[^\]]*\]/g, '')             // Remove [by DragoN_Sky] etc.
      .trim();
    
    const searchTerm = `${artist} ${cleanTrack}`;
    
    const params = new URLSearchParams({
      term: searchTerm,
      media: 'music',
      limit: '1',
    });
    
    console.log('iTunes search:', searchTerm);
    
    const response = await fetch(`${ITUNES_API_URL}?${params}`, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });
    
    if (!response.ok) {
      console.error('iTunes API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      console.log('iTunes: no results');
      return null;
    }
    
    const result = data.results[0];
    
    // iTunes returns artwork URLs, we can get higher res by replacing size in URL
    // Default: 100x100, we can get 600x600 by replacing '100x100' with '600x600'
    let artworkUrl = result.artworkUrl100 || result.artworkUrl60 || null;
    
    if (artworkUrl) {
      // Get highest quality: 600x600
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
  // Try Last.fm first
  const lastfmResult = await fetchTrackInfo(artist, track);
  if (lastfmResult?.albumArtLarge) {
    console.log('Artwork found in Last.fm');
    return lastfmResult;
  }
  
  // Fallback to iTunes
  console.log('Last.fm not found, trying iTunes...');
  const itunesResult = await searchITunes(artist, track);
  if (itunesResult?.albumArtLarge) {
    console.log('Artwork found in iTunes');
    return itunesResult;
  }
  
  console.log('No artwork found anywhere');
  return null;
}
