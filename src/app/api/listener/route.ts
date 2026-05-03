import { NextRequest, NextResponse } from 'next/server'

// =====================================================
// ENVIRONMENT VARIABLES (безопасность)
// =====================================================
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID

// =====================================================
// RATE LIMITING (защита от спама)
// =====================================================
const rateLimitMap = new Map<number, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 минута
const RATE_LIMIT_MAX = 30 // максимум запросов в окне

function checkRateLimit(userId: number): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(userId)

  if (!record || now > record.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return true
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false
  }

  record.count++
  return true
}

// Периодическая очистка старых записей (каждые 5 минут)
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key)
    }
  }
}, 5 * 60 * 1000)

// =====================================================
// CLOUDFLARE D1 WORKER URL
// =====================================================
const LISTENERS_WORKER_URL = 'https://listeners.gondurass89.workers.dev'

// =====================================================
// SEND TELEGRAM NOTIFICATION
// =====================================================
async function notifyAdmin(data: {
  user_id: number
  first_name: string
  last_name?: string
  username?: string
  action: string
}, count: number, isAdmin: boolean) {
  // Don't notify for admin user or if credentials not configured
  if (isAdmin || !BOT_TOKEN || !ADMIN_CHAT_ID) {
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
    console.error('Telegram notify error:', e)
  }
}

// =====================================================
// PROXY TO CLOUDFLARE D1 WORKER
// =====================================================
async function proxyToWorker(action: string, data: any) {
  try {
    const response = await fetch(LISTENERS_WORKER_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        action,
        isAdmin: data.user_id === Number(ADMIN_CHAT_ID)
      })
    })

    if (!response.ok) {
      console.error('Worker error:', response.status)
      return null
    }

    return await response.json()
  } catch (e) {
    console.error('Worker fetch error:', e)
    return null
  }
}

// =====================================================
// POST HANDLER
// =====================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_id, first_name, last_name, username, action, isAdmin } = body

    console.log('Listener API POST:', { user_id, first_name, action, isAdmin })

    if (!user_id || !first_name) {
      return NextResponse.json({ error: 'Missing user data' }, { status: 400 })
    }

    // Rate limiting
    if (!checkRateLimit(user_id)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
    }

    // Proxy to Cloudflare D1 Worker for persistent storage
    const result = await proxyToWorker(action, {
      user_id,
      first_name,
      last_name,
      username
    })

    // Get count from worker response
    const count = result?.total || 0

    // Send notification (async, non-blocking)
    notifyAdmin({ user_id, first_name, last_name, username, action }, count, isAdmin)

    return NextResponse.json({
      success: true,
      totalListeners: count
    })

  } catch (error) {
    console.error('Listener API error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// =====================================================
// GET HANDLER
// =====================================================
export async function GET() {
  try {
    // Fetch from Cloudflare D1 Worker
    const response = await fetch(LISTENERS_WORKER_URL, {
      method: 'GET',
      mode: 'cors'
    })

    if (!response.ok) {
      console.error('Worker GET error:', response.status)
      return NextResponse.json({ total: 0, listeners: [] })
    }

    const data = await response.json()
    console.log('Listener API GET, count:', data.total)

    return NextResponse.json(data)
  } catch (error) {
    console.error('Listener API GET error:', error)
    return NextResponse.json({ total: 0, listeners: [] })
  }
}
