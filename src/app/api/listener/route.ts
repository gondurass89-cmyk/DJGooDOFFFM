import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

const BOT_TOKEN = '8600657705:AAEn6pFmFKcLCPFm8FcF9UiAag404S1av00'
const ADMIN_CHAT_ID = '55068554'
const ICECAST_STATUS_URL = 'http://178.49.69.37:8000/status-json.xsl'

// Initialize Redis - uses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null

// Fallback to in-memory for local development
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
  lastSeen: number // timestamp
}

// In-memory fallback for local dev
if (!global.listenersStorage) {
  global.listenersStorage = new Map()
}
const localListeners = global.listenersStorage

const LISTENERS_KEY = 'djgoodoff:listeners'

// Fetch listeners count from Icecast (direct stream connections)
async function getIcecastListeners(): Promise<number> {
  try {
    const response = await fetch(ICECAST_STATUS_URL, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })

    if (!response.ok) return 0

    const data = await response.json()
    const source = data?.icestats?.source

    if (source) {
      // listeners field contains current listeners count
      return source.listeners || 0
    }

    return 0
  } catch (error) {
    console.error('Error fetching Icecast listeners:', error)
    return 0
  }
}

// Send notification - skip if user is admin
function notifyAdmin(data: ListenerData, count: number, isAdmin: boolean) {
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

👥 Telegram: ${count}
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
      lastSeen: Date.now()
    }

    const timeout = 30 * 60 * 1000 // 30 minutes

    if (redis) {
      // Use Redis
      if (action === 'open') {
        await redis.hset(LISTENERS_KEY, { [user_id]: JSON.stringify(listenerData) })
      } else if (action === 'close') {
        await redis.hdel(LISTENERS_KEY, user_id.toString())
      }

      // Get total count (clean up stale entries)
      const allListeners = await redis.hgetall(LISTENERS_KEY) || {}
      const now = Date.now()

      let count = 0
      for (const [id, dataStr] of Object.entries(allListeners)) {
        try {
          const data = JSON.parse(String(dataStr)) as ListenerData
          if (now - data.lastSeen > timeout) {
            await redis.hdel(LISTENERS_KEY, id)
          } else {
            count++
          }
        } catch {
          await redis.hdel(LISTENERS_KEY, id)
        }
      }

      console.log('Redis listeners count:', count)
      notifyAdmin(listenerData, count, isAdmin || user_id === Number(ADMIN_CHAT_ID))

      return NextResponse.json({
        success: true,
        telegramListeners: count
      })
    } else {
      // Fallback to in-memory (local dev)
      if (action === 'open') {
        localListeners.set(user_id, listenerData)
        console.log('Added listener, total:', localListeners.size)
      } else if (action === 'close') {
        localListeners.delete(user_id)
        console.log('Removed listener, total:', localListeners.size)
      }

      notifyAdmin(listenerData, localListeners.size, isAdmin || user_id === Number(ADMIN_CHAT_ID))

      return NextResponse.json({
        success: true,
        telegramListeners: localListeners.size
      })
    }

  } catch (error) {
    console.error('Listener API error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function GET() {
  const now = Date.now()
  const timeout = 30 * 60 * 1000 // 30 minutes

  // Get Telegram listeners count
  let telegramCount = 0

  if (redis) {
    const allListeners = await redis.hgetall(LISTENERS_KEY) || {}

    for (const [id, dataStr] of Object.entries(allListeners)) {
      try {
        const data = JSON.parse(String(dataStr)) as ListenerData
        if (now - data.lastSeen > timeout) {
          await redis.hdel(LISTENERS_KEY, id)
        } else {
          telegramCount++
        }
      } catch {
        await redis.hdel(LISTENERS_KEY, id)
      }
    }
  } else {
    // Fallback to in-memory
    Array.from(localListeners.entries()).forEach(([id, data]) => {
      if (now - data.lastSeen > timeout) {
        localListeners.delete(id)
      } else {
        telegramCount++
      }
    })
  }

  // Get Icecast listeners (direct stream connections)
  const icecastListeners = await getIcecastListeners()

  console.log('Listener API GET - Telegram:', telegramCount, 'Icecast:', icecastListeners)

  return NextResponse.json({
    telegram: telegramCount,
    icecast: icecastListeners,
    total: telegramCount + icecastListeners
  })
}
