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

async function notifyAdmin(data: ListenerData, count: number) {
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
  
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    })
  } catch (e) {
    console.error('Failed to notify admin:', e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_id, first_name, last_name, username, language_code, action } = body
    
    if (!user_id || !first_name) {
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
      notifyAdmin(listenerData, listeners.size)
    } else if (action === 'close') {
      listeners.delete(user_id)
      notifyAdmin(listenerData, listeners.size)
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
  
  return NextResponse.json({
    total: listeners.size,
    listeners: Array.from(listeners.values()).map(l => ({
      name: l.name,
      user_id: l.user_id
    }))
  })
}
