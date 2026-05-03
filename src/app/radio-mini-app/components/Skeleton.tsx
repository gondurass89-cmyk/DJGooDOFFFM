'use client'

import { COLORS } from '../types'

// =====================================================
// SKELETON COMPONENT
// Показывается во время загрузки данных
// =====================================================

interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: string
  className?: string
}

export function Skeleton({ 
  width = '100%', 
  height = '20px', 
  borderRadius = '8px',
  className = ''
}: SkeletonProps) {
  return (
    <div
      className={`animate-pulse ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius,
        background: `linear-gradient(90deg, 
          rgba(255,255,255,0.05) 0%, 
          rgba(255,255,255,0.1) 50%, 
          rgba(255,255,255,0.05) 100%)`,
      }}
    />
  )
}

// Album art skeleton (150x150)
export function AlbumArtSkeleton() {
  return (
    <div
      className="mx-auto mb-3 rounded-lg animate-pulse"
      style={{
        width: '150px',
        height: '150px',
        background: `linear-gradient(145deg, 
          rgba(46,0,113,0.4) 0%, 
          rgba(13,0,38,0.6) 100%)`,
        border: `1px solid rgba(0,199,48,0.1)`,
      }}
    />
  )
}

// Track title skeleton
export function TrackTitleSkeleton() {
  return (
    <div className="text-center mb-2">
      <Skeleton width="60%" height="12px" borderRadius="4px" className="mx-auto mb-2" />
      <Skeleton width="80%" height="16px" borderRadius="4px" className="mx-auto" />
    </div>
  )
}

// Listeners count skeleton
export function ListenersSkeleton() {
  return (
    <Skeleton width="100px" height="14px" borderRadius="4px" className="mx-auto" />
  )
}

// Full loading state for TrackInfo
export function TrackInfoSkeleton() {
  return (
    <div className="flex flex-col items-center">
      <AlbumArtSkeleton />
      <Skeleton width="120px" height="20px" borderRadius="4px" className="mb-1" />
      <TrackTitleSkeleton />
      <ListenersSkeleton />
    </div>
  )
}
