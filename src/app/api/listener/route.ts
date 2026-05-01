import { NextRequest, NextResponse } from 'next/server'

// =====================================================
// CONFIGURATION - Use environment variables
// =====================================================
const BOT_TOKEN = process.env.BOT_TOKEN || ''
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || ''

declare global {
  var listenersStorage: Map<number, ListenerData> | undefined
}

interface ListenerData {
  user_id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  name: string
  action: string
  lastSeen: Date
  sessions: number  // Track multiple sessions per user
}

if (!global.listenersStorage) {
  global.listenersStorage = new Map()
}
const listeners = global.listenersStorage

// Send notification - skip if user is admin
function notifyAdmin(data: ListenerData, count: number, isAdmin: boolean) {
  // Check if bot token is configured
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.warn('Telegram notifications disabled: BOT_TOKEN or ADMIN_CHAT_ID not set')
    return
  }

  // Don't notify for admin user
  if (isAdmin) {
    console.log('Skip notification for admin user:', data.user_id)
    return
  }
  
  const name = data.username 
    ? `@${data.username}` 
    : `${data.first_name}${data.last_name ? ' ' + data.last_name : ''}`
  
  let emoji = '👂'
  let status = 'открыл Mini App'
  
  if (data.action === 'close') {
    emoji = '👋'
    status = 'закрыл приложение'
  }
  
  const message = `${emoji} *${name}* ${status}

👥 Всего: ${count}
👤 ID: \`${data.user_id}\``
  
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: ADMIN_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    })
  }).catch(e => console.error('Telegram notify error:', e))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_id, first_name, last_name, username, language_code, action, isAdmin } = body

    if (process.env.NODE_ENV === 'development') {
      console.log('Listener API POST:', { user_id, first_name, action, isAdmin })
    }

    if (!user_id || !first_name) {
      return NextResponse.json({ error: 'Missing user data' }, { status: 400 })
    }

    const name = username ? `@${username}` : `${first_name}${last_name ? ' ' + last_name : ''}`

    if (action === 'open') {
      // Add or update listener, increment session count
      const existing = listeners.get(user_id)
      const listenerData: ListenerData = {
        user_id,
        first_name,
        last_name,
        username,
        language_code,
        name,
        action,
        lastSeen: new Date(),
        sessions: (existing?.sessions || 0) + 1
      }
      listeners.set(user_id, listenerData)
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Added listener session, user:', user_id, 'sessions:', listenerData.sessions, 'total users:', listeners.size)
      }
      
      notifyAdmin(listenerData, listeners.size, isAdmin || user_id === Number(ADMIN_CHAT_ID))
    } else if (action === 'close') {
      // Decrement session count, but don't remove user completely
      const existing = listeners.get(user_id)
      if (existing) {
        existing.sessions = Math.max(0, existing.sessions - 1)
        existing.lastSeen = new Date()
        
        if (process.env.NODE_ENV === 'development') {
          console.log('Removed listener session, user:', user_id, 'sessions:', existing.sessions, 'total users:', listeners.size)
        }
        
        notifyAdmin(existing, listeners.size, isAdmin || user_id === Number(ADMIN_CHAT_ID))
      }
    }

    // Count users with active sessions
    const activeCount = Array.from(listeners.values()).filter(l => l.sessions > 0).length

    return NextResponse.json({
      success: true,
      totalListeners: activeCount
    })

  } catch (error) {
    console.error('Listener API error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET() {
  const now = Date.now()
  const timeout = 30 * 60 * 1000

  // Remove users with expired lastSeen or zero sessions
  Array.from(listeners.entries()).forEach(([id, data]) => {
    const lastSeen = new Date(data.lastSeen).getTime()
    if (now - lastSeen > timeout) {
      listeners.delete(id)
    }
  })

  // Count users with active sessions (sessions > 0)
  const activeListeners = Array.from(listeners.values()).filter(l => l.sessions > 0)
  const count = activeListeners.length

  if (process.env.NODE_ENV === 'development') {
    console.log('Listener API GET, active users:', count, 'total in storage:', listeners.size)
  }

  return NextResponse.json({
    total: count,
    listeners: activeListeners.map(l => ({
      name: l.name,
      user_id: l.user_id,
      sessions: l.sessions
    }))
  })
}
