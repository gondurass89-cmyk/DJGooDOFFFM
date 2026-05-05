import { NextRequest, NextResponse } from 'next/server'

// Cloudflare Worker URL для подсчёта слушателей
const LISTENERS_WORKER_URL = 'https://listeners.gondurass89.workers.dev/'

// Секрет для авторизации запросов к Worker
const WORKER_SECRET = process.env.WORKER_SECRET || 'djgoodoff-fm-secret-2024'

// =====================================================
// GET /api/listener
// Получить количество активных слушателей
// =====================================================
export async function GET() {
  try {
    const response = await fetch(LISTENERS_WORKER_URL, {
      method: 'GET',
      headers: {
        'X-Worker-Secret': WORKER_SECRET,
      },
    })

    if (!response.ok) {
      console.error('[LISTENER] Worker error:', response.status)
      return NextResponse.json({ total: 0, listeners: [] })
    }

    const data = await response.json()
    return NextResponse.json(data)

  } catch (error) {
    console.error('[LISTENER] GET error:', error)
    return NextResponse.json({ total: 0, listeners: [] })
  }
}

// =====================================================
// POST /api/listener
// Регистрация слушателя (open/close/heartbeat)
// =====================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_id, first_name, last_name, username, action, isAdmin } = body

    // Валидация
    if (!user_id || !first_name) {
      return NextResponse.json({ error: 'Missing user data' }, { status: 400 })
    }

    // Отправляем в Cloudflare Worker
    const response = await fetch(LISTENERS_WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Secret': WORKER_SECRET,
      },
      body: JSON.stringify({
        user_id,
        first_name,
        last_name: last_name || null,
        username: username || null,
        action,
        isAdmin: isAdmin || false,
      }),
    })

    if (!response.ok) {
      console.error('[LISTENER] Worker error:', response.status)
      return NextResponse.json({ success: false, error: 'Worker error' }, { status: 500 })
    }

    const data = await response.json()

    // Отправляем уведомление админу в Telegram (только для open/close)
    if (action === 'open' || action === 'close') {
      await notifyAdmin(user_id, first_name, last_name, username, action, data.total, isAdmin)
    }

    return NextResponse.json(data)

  } catch (error) {
    console.error('[LISTENER] POST error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// =====================================================
// Уведомление админа в Telegram
// =====================================================
const BOT_TOKEN = '8600657705:AAEn6pFmFKcLCPFm8FcF9UiAag404S1av00'
const ADMIN_CHAT_ID = '55068554'

async function notifyAdmin(
  userId: number,
  firstName: string,
  lastName: string | null,
  username: string | null,
  action: string,
  total: number,
  isAdmin: boolean
) {
  // Не уведомляем для админа
  if (isAdmin || userId === Number(ADMIN_CHAT_ID)) {
    return
  }

  const name = username
    ? `@${username}`
    : `${firstName}${lastName ? ' ' + lastName : ''}`

  let emoji = '👂'
  let status = 'открыл Mini App'

  if (action === 'close') {
    emoji = '👋'
    status = 'закрыл приложение'
  }

  const message = `${emoji} *${name}* ${status}

👥 Всего: ${total}
👤 ID: \`${userId}\``

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      }),
    })
  } catch (error) {
    console.error('[LISTENER] Telegram notify error:', error)
  }
}
