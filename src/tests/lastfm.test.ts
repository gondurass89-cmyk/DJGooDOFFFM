import { describe, it, expect } from 'vitest'
import { parseTrackTitle } from '@/lib/lastfm'

describe('parseTrackTitle', () => {
  it('should parse "Artist - Track" format', () => {
    const result = parseTrackTitle('Artist - Track Name')
    expect(result).toEqual({ artist: 'Artist', track: 'Track Name' })
  })

  it('should parse "Artist – Track" with en-dash', () => {
    const result = parseTrackTitle('Artist – Track Name')
    expect(result).toEqual({ artist: 'Artist', track: 'Track Name' })
  })

  it('should parse "Artist — Track" with em-dash', () => {
    const result = parseTrackTitle('Artist — Track Name')
    expect(result).toEqual({ artist: 'Artist', track: 'Track Name' })
  })

  it('should handle multiple dashes in track name', () => {
    const result = parseTrackTitle('Artist - Track - Name - With - Dashes')
    expect(result).toEqual({ artist: 'Artist', track: 'Track - Name - With - Dashes' })
  })

  it('should return null for invalid format', () => {
    expect(parseTrackTitle('No separator here')).toBeNull()
  })

  it('should return null for empty string', () => {
    expect(parseTrackTitle('')).toBeNull()
  })

  it('should return null for null/undefined', () => {
    expect(parseTrackTitle(null as unknown as string)).toBeNull()
    expect(parseTrackTitle(undefined as unknown as string)).toBeNull()
  })

  it('should trim whitespace', () => {
    const result = parseTrackTitle('  Artist  -  Track Name  ')
    expect(result).toEqual({ artist: 'Artist', track: 'Track Name' })
  })

  it('should handle Cyrillic characters', () => {
    const result = parseTrackTitle('Артист - Название трека')
    expect(result).toEqual({ artist: 'Артист', track: 'Название трека' })
  })

  it('should handle special characters in names', () => {
    const result = parseTrackTitle("AC/DC - Back In Black")
    expect(result).toEqual({ artist: 'AC/DC', track: 'Back In Black' })
  })
})
