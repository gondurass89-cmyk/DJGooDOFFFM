import { NextResponse } from 'next/server'
import { getSubscribers, getRadioStatus, setRadioStatus } from '@/lib/subscribers'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8600657705:AAEn6pFmFKcLCPFm8FcF9UiAag404S1av00'
const ICECAST_STATUS_URL = 'http://178.49.69.37:8000/status-json.xsl'
const CRON_SECRET = process.env.CRON_SECRET // For Vercel Cron authorization

// Send message to Telegram
async function sendMessage(chatId: number, text: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    })
    
    const data = await response.json()
    return data.ok
  } catch (error) {
    console.error('Error sending message:', error)
    return false
  }
}

// Check if radio is online
async function checkRadioOnline(): Promise<{ online: boolean; title?: string }> {
  try {
    const response = await fetch(ICECAST_STATUS_URL, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store'
    })
    
    if (!response.ok) {
      return { online: false }
    }
    
    const data = await response.json()
    const source = data?.icestats?.source
    const title = source?.metadata?.x_icy_title || source?.title || ''
    const online = Boolean(title && title.trim().length > 0)
    
    return { online, title: online ? title : undefined }
  } catch (error) {
    console.error('Error checking radio status:', error)
    return { online: false }
  }
}

// Send notification to all subscribers
async function notifySubscribers(title?: string): Promise<{ sent: number; failed: number }> {
  const subscribers = await getSubscribers()
  
  if (subscribers.length === 0) {
    console.log('No subscribers to notify')
    return { sent: 0, failed: 0 }
  }
  
  console.log(`Notifying ${subscribers.length} subscribers...`)
  
  let sent = 0
  let failed = 0
  
  const message = 
    `🎵 <b>DJ GooD OFF FM в эфире!</b>\n\n` +
    `🔴 Радио начало вещание\n\n` +
    (title ? `🎵 Сейчас играет: ${title}\n\n` : '') +
    `Откройте Mini App для прослушивания! 🎧`
  
  // Send notifications with small delays to avoid rate limiting
  for (const subscriber of subscribers) {
    const success = await sendMessage(subscriber.user_id, message)
    
    if (success) {
      sent++
      console.log(`✅ Notified: ${subscriber.first_name} (${subscriber.user_id})`)
    } else {
      failed++
      console.log(`❌ Failed: ${subscriber.first_name} (${subscriber.user_id})`)
    }
    
    // Small delay between messages (50ms) to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  
  return { sent, failed }
}

export async function GET(request: Request) {
  // Verify cron secret if set (for security)
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  console.log('Cron job started: checking radio status...')
  
  try {
    // Get previous status
    const previousStatus = await getRadioStatus()
    
    // Check current status
    const { online, title } = await checkRadioOnline()
    
    console.log(`Radio status: ${online ? 'ONLINE' : 'OFFLINE'} (was: ${previousStatus === null ? 'UNKNOWN' : previousStatus ? 'ONLINE' : 'OFFLINE'})`)
    
    // Detect transition: offline -> online
    const wasOffline = previousStatus === false
    const justWentOnline = wasOffline && online
    
    let notificationResult = { sent: 0, failed: 0 }
    
    if (justWentOnline) {
      console.log('🎉 Radio just went online! Sending notifications...')
      notificationResult = await notifySubscribers(title)
    }
    
    // Update stored status
    await setRadioStatus(online)
    
    return NextResponse.json({
      success: true,
      previousStatus,
      currentStatus: online,
      transitionDetected: justWentOnline,
      notifications: notificationResult,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 })
  }
}
