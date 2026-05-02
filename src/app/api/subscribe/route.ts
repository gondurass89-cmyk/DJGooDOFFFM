import { NextRequest, NextResponse } from 'next/server'
import { addSubscriber, removeSubscriber, isSubscribed } from '@/lib/subscribers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_id, first_name, username, action } = body

    if (!user_id || !first_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (action === 'subscribe') {
      const alreadySubscribed = await isSubscribed(user_id)

      if (alreadySubscribed) {
        return NextResponse.json({
          success: true,
          message: 'Already subscribed',
          wasSubscribed: true
        })
      }

      const success = await addSubscriber({
        user_id,
        first_name,
        username
      })

      if (success) {
        return NextResponse.json({
          success: true,
          message: 'Subscribed successfully',
          wasSubscribed: false
        })
      } else {
        return NextResponse.json({
          success: false,
          message: 'Failed to subscribe'
        }, { status: 500 })
      }

    } else if (action === 'unsubscribe') {
      const success = await removeSubscriber(user_id)

      return NextResponse.json({
        success,
        message: success ? 'Unsubscribed' : 'Failed to unsubscribe'
      })

    } else if (action === 'check') {
      const subscribed = await isSubscribed(user_id)

      return NextResponse.json({
        success: true,
        subscribed
      })

    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Subscribe API error:', error)
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Subscribe API is running',
    actions: ['subscribe', 'unsubscribe', 'check']
  })
}
