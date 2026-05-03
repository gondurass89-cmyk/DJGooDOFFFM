/**
 * Logger Utility
 * Логирование только в development режиме
 */

const isDev = process.env.NODE_ENV === 'development'

export const logger = {
  log: (...args: unknown[]) => {
    if (isDev) console.log(...args)
  },

  error: (...args: unknown[]) => {
    if (isDev) console.error(...args)
  },

  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args)
  },

  debug: (...args: unknown[]) => {
    if (isDev) console.debug(...args)
  },

  info: (...args: unknown[]) => {
    if (isDev) console.info(...args)
  },
}

// For API routes (server-side)
export const serverLog = {
  log: (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') console.log(...args)
  },

  error: (...args: unknown[]) => {
    // Always log errors on server, but consider sending to monitoring service
    console.error(...args)
  },

  warn: (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development') console.warn(...args)
  },
}
