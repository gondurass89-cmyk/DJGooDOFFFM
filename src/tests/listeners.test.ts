import { describe, it, expect } from 'vitest'

// Helper: correct Russian word form for listeners
function getListenersWord(count: number): string {
  const lastTwo = count % 100
  const lastOne = count % 10

  if (lastTwo >= 11 && lastTwo <= 14) return 'слушателей'
  if (lastOne === 1) return 'слушатель'
  if (lastOne >= 2 && lastOne <= 4) return 'слушателя'
  return 'слушателей'
}

describe('getListenersWord', () => {
  it('should return "слушатель" for 1', () => {
    expect(getListenersWord(1)).toBe('слушатель')
  })

  it('should return "слушателя" for 2-4', () => {
    expect(getListenersWord(2)).toBe('слушателя')
    expect(getListenersWord(3)).toBe('слушателя')
    expect(getListenersWord(4)).toBe('слушателя')
  })

  it('should return "слушателей" for 5-20', () => {
    expect(getListenersWord(5)).toBe('слушателей')
    expect(getListenersWord(10)).toBe('слушателей')
    expect(getListenersWord(20)).toBe('слушателей')
  })

  it('should return "слушатель" for 21, 31, 41, etc.', () => {
    expect(getListenersWord(21)).toBe('слушатель')
    expect(getListenersWord(31)).toBe('слушатель')
    expect(getListenersWord(101)).toBe('слушатель')
  })

  it('should return "слушателя" for 22-24, 32-34, etc.', () => {
    expect(getListenersWord(22)).toBe('слушателя')
    expect(getListenersWord(23)).toBe('слушателя')
    expect(getListenersWord(24)).toBe('слушателя')
    expect(getListenersWord(32)).toBe('слушателя')
  })

  it('should return "слушателей" for 11-14 (special case)', () => {
    expect(getListenersWord(11)).toBe('слушателей')
    expect(getListenersWord(12)).toBe('слушателей')
    expect(getListenersWord(13)).toBe('слушателей')
    expect(getListenersWord(14)).toBe('слушателей')
  })

  it('should return "слушателей" for 0', () => {
    expect(getListenersWord(0)).toBe('слушателей')
  })

  it('should handle large numbers correctly', () => {
    expect(getListenersWord(100)).toBe('слушателей')
    expect(getListenersWord(121)).toBe('слушатель')
    expect(getListenersWord(111)).toBe('слушателей')
    expect(getListenersWord(112)).toBe('слушателей')
  })
})
