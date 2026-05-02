import { NextRequest, NextResponse } from 'next/server'
import { addSubscriber, removeSubscriber, isSubscribed, getSubscribersCount } from '@/lib/subscribers'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8600657705:AAEn6pFmFKcLCPFm8FcF9UiAag404S1av00'

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
}

interface TelegramMessage {
  message_id: number
  from: TelegramUser
  chat: {
    id: number
    type: string
  }
  text?: string
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

// Send message to Telegram
async function sendMessage(chatId: number, text: string, parseMode: string = 'HTML'): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true
      })
    })
  } catch (error) {
    console.error('Error sending message:', error)
  }
}

// Handle /start command
async function handleStart(user: TelegramUser, params: string): Promise<void> {
  const name = user.first_name
  
  // Check for subscribe_notify parameter
  if (params === 'subscribe_notify') {
    const alreadySubscribed = await isSubscribed(user.id)
    
    if (alreadySubscribed) {
      await sendMessage(user.id, 
        `👋 ${name}, вы уже подписаны на уведомления!\n\n` +
        `Мы сообщим, когда радио начнёт вещание. 🎵`
      )
    } else {
      const success = await addSubscriber({
        user_id: user.id,
        first_name: user.first_name,
        username: user.username
      })
      
      if (success) {
        const count = await getSubscribersCount()
        await sendMessage(user.id,
          `✅ ${name}, вы подписаны на уведомления!\n\n` +
          `📢 Мы отправим сообщение, когда радио начнёт вещание.\n\n` +
          `👥 Подписчиков: ${count}\n\n` +
          `Чтобы отписаться, отправьте /unsubscribe`
        )
      } else {
        await sendMessage(user.id,
          `❌ Произошла ошибка при подписке. Попробуйте позже.`
        )
      }
    }
    return
  }
  
  // Default /start message
  await sendMessage(user.id,
    `🎵 <b>DJ GooD OFF FM</b>\n\n` +
    `Добро пожаловать, ${name}!\n\n` +
    `🎧 Открой Mini App для прослушивания радио\n\n` +
    `📋 Доступные команды:\n` +
    `/subscribe - подписаться на уведомления\n` +
    `/unsubscribe - отписаться от уведомлений\n` +
    `/status - проверить статус радио`,
    'HTML'
  )
}

// Handle /subscribe command
async function handleSubscribe(user: TelegramUser): Promise<void> {
  const alreadySubscribed = await isSubscribed(user.id)
  
  if (alreadySubscribed) {
    await sendMessage(user.id,
      `👋 ${user.first_name}, вы уже подписаны на уведомления!\n\n` +
      `Мы сообщим, когда радио начнёт вещание. 🎵`
    )
    return
  }
  
  const success = await addSubscriber({
    user_id: user.id,
    first_name: user.first_name,
    username: user.username
  })
  
  if (success) {
    const count = await getSubscribersCount()
    await sendMessage(user.id,
      `✅ ${user.first_name}, вы подписаны на уведомления!\n\n` +
      `📢 Мы отправим сообщение, когда радио начнёт вещание.\n\n` +
      `👥 Подписчиков: ${count}`
    )
  } else {
    await sendMessage(user.id,
      `❌ Произошла ошибка при подписке. Попробуйте позже.`
    )
  }
}

// Handle /unsubscribe command
async function handleUnsubscribe(user: TelegramUser): Promise<void> {
  const subscribed = await isSubscribed(user.id)
  
  if (!subscribed) {
    await sendMessage(user.id,
      `❌ Вы не подписаны на уведомления.`
    )
    return
  }
  
  const success = await removeSubscriber(user.id)
  
  if (success) {
    await sendMessage(user.id,
      `👋 ${user.first_name}, вы отписались от уведомлений.\n\n` +
      `Вы можете снова подписаться в любое время командой /subscribe`
    )
  } else {
    await sendMessage(user.id,
      `❌ Произошла ошибка. Попробуйте позже.`
    )
  }
}

// Handle /status command
async function handleStatus(user: TelegramUser): Promise<void> {
  try {
    // Fetch current track to check if radio is online
    const response = await fetch('http://178.49.69.37:8000/status-json.xsl', {
      signal: AbortSignal.timeout(5000)
    })
    
    if (!response.ok) {
      await sendMessage(user.id, `❌ Не удалось проверить статус радио.`)
      return
    }
    
    const data = await response.json()
    const source = data?.icestats?.source
    const title = source?.metadata?.x_icy_title || source?.title || ''
    const online = Boolean(title && title.trim().length > 0)
    
    if (online) {
      await sendMessage(user.id,
        `🟢 <b>Радио в эфире!</b>\n\n` +
        `🎵 Сейчас играет: ${title}\n\n` +
        `Откройте Mini App для прослушивания!`,
        'HTML'
      )
    } else {
      await sendMessage(user.id,
        `🔴 <b>Радио не ведёт вещание</b>\n\n` +
        `Подпишитесь на уведомления командой /subscribe`,
        'HTML'
      )
    }
  } catch (error) {
    console.error('Error checking status:', error)
    await sendMessage(user.id, `❌ Не удалось проверить статус радио.`)
  }
}

// Main webhook handler
export async function POST(request: NextRequest) {
  try {
    const body: TelegramUpdate = await request.json()
    console.log('Telegram webhook received:', JSON.stringify(body))
    
    const message = body.message
    
    if (!message || !message.from) {
      return NextResponse.json({ ok: true })
    }
    
    const user = message.from
    const text = message.text || ''
    
    console.log('Message from:', user.id, user.first_name, 'Text:', text)
    
    // Parse command
    if (text.startsWith('/start')) {
      const params = text.split(' ')[1] || ''
      await handleStart(user, params)
    } else if (text === '/subscribe') {
      await handleSubscribe(user)
    } else if (text === '/unsubscribe') {
      await handleUnsubscribe(user)
    } else if (text === '/status') {
      await handleStatus(user)
    }
    // Ignore other messages
    
    return NextResponse.json({ ok: true })
    
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ ok: true }) // Always return ok to Telegram
  }
}

// GET for testing
export async function GET() {
  return NextResponse.json({ 
    status: 'Telegram webhook endpoint is running',
    commands: ['/start', '/subscribe', '/unsubscribe', '/status']
  })
}
