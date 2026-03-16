import { NextRequest, NextResponse } from 'next/server'

const BOT_TOKEN = '8600657705:AAEn6pFmFKcLCPFm8FcF9UiAag404S1av00'
const ADMIN_CHAT_ID = '55068554'

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
}

if (!global.listenersStorage) {
  global.listenersStorage = new Map()
}
const listeners = global.listenersStorage

// Send notification - skip if user is admin
function notifyAdmin(data: ListenerData, count: number, isAdmin: boolean) {
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
    
    console.log('Listener API POST:', { user_id, first_name, action, isAdmin })
    
    if (!user_id || !first_name) {
      console.log('Missing user data')
      return NextResponse.json({ error: 'Missing user data' }, { status: 400 })
    }
    
    const name = username ? `@${username}` : `${first_name}${last_name ? ' ' + last_name : ''}`
    
    const listenerData: ListenerData = {
      user_id,
      first_name,
      last_name,
      username,
      language_code,
      name,
      action,
      lastSeen: new Date()
    }
    
    if (action === 'open') {
      listeners.set(user_id, listenerData)
      console.log('Added listener, total:', listeners.size)
      notifyAdmin(listenerData, listeners.size, isAdmin || user_id === Number(ADMIN_CHAT_ID))
    } else if (action === 'close') {
      listeners.delete(user_id)
      console.log('Removed listener, total:', listeners.size)
      notifyAdmin(listenerData, listeners.size, isAdmin || user_id === Number(ADMIN_CHAT_ID))
    }
    
    return NextResponse.json({ 
      success: true, 
      totalListeners: listeners.size
    })
    
  } catch (error) {
    console.error('Listener API error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET() {
  const now = Date.now()
  const timeout = 30 * 60 * 1000
  
  Array.from(listeners.entries()).forEach(([id, data]) => {
    const lastSeen = new Date(data.lastSeen).getTime()
    if (now - lastSeen > timeout) {
      listeners.delete(id)
    }
  })
  
  console.log('Listener API GET, total:', listeners.size)
  
  return NextResponse.json({
    total: listeners.size,
    listeners: Array.from(listeners.values()).map(l => ({
      name: l.name,
      user_id: l.user_id
    }))
  })
}
