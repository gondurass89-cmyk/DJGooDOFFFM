import { NextRequest, NextResponse } from 'next/server'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8600657705:AAEn6pFmFKcLCPFm8FcF9UiAag404S1av00'
const SETUP_SECRET = process.env.SETUP_SECRET // Optional secret for security

export async function GET(request: NextRequest) {
  // Optional security check
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  
  if (SETUP_SECRET && secret !== SETUP_SECRET) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 403 })
  }
  
  try {
    // Determine the webhook URL based on the request
    const host = request.headers.get('host') || 'localhost:3000'
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    const webhookUrl = `${protocol}://${host}/api/telegram-webhook`
    
    console.log('Setting webhook to:', webhookUrl)
    
    // Set the webhook
    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message']
        })
      }
    )
    
    const data = await response.json()
    
    if (data.ok) {
      // Get webhook info
      const infoResponse = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`
      )
      const infoData = await infoResponse.json()
      
      return NextResponse.json({
        success: true,
        message: 'Webhook set successfully!',
        webhookUrl,
        telegramResponse: data,
        webhookInfo: infoData.result
      })
    } else {
      return NextResponse.json({
        success: false,
        error: data.description || 'Failed to set webhook',
        telegramResponse: data
      }, { status: 500 })
    }
    
  } catch (error) {
    console.error('Error setting webhook:', error)
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 })
  }
}
