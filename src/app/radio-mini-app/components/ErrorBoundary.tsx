'use client'

import { Component, ReactNode } from 'react'
import { COLORS } from '../types'
import { logger } from '@/lib/logger'

// =====================================================
// ERROR BOUNDARY
// Отлавливает ошибки рендеринга и показывает fallback UI
// =====================================================

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // В production можно отправить в сервис логирования
    logger.error('[ErrorBoundary]', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          className="flex flex-col items-center justify-center p-6 rounded-xl text-center"
          style={{
            background: `linear-gradient(145deg, rgba(46,0,113,0.6), rgba(13,0,38,0.8))`,
            border: `1px solid rgba(255,0,102,0.3)`,
            minHeight: '200px',
          }}
        >
          <div
            className="text-4xl mb-3"
            style={{ color: COLORS.bass }}
          >
            ⚠️
          </div>
          <h2
            className="text-lg font-bold mb-2"
            style={{ color: COLORS.text }}
          >
            Что-то пошло не так
          </h2>
          <p
            className="text-sm mb-4 opacity-70"
            style={{ color: COLORS.text }}
          >
            Произошла ошибка при загрузке компонента
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 rounded-lg font-medium transition-all"
            style={{
              background: `linear-gradient(145deg, ${COLORS.secondary}, ${COLORS.accent})`,
              color: COLORS.dark,
            }}
          >
            Попробовать снова
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
