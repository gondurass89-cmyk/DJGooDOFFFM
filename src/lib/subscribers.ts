import { Redis } from '@upstash/redis'

// Initialize Redis
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null

const SUBSCRIBERS_KEY = 'djgoodoff:subscribers'
const RADIO_STATUS_KEY = 'djgoodoff:radio_status'

export interface Subscriber {
  user_id: number
  first_name: string
  username?: string
  subscribed_at: number
}

// Add subscriber
export async function addSubscriber(user: {
  user_id: number
  first_name: string
  username?: string
}): Promise<boolean> {
  if (!redis) {
    console.log('Redis not configured, subscriber not saved')
    return false
  }

  try {
    const subscriber: Subscriber = {
      ...user,
      subscribed_at: Date.now()
    }
    
    await redis.hset(SUBSCRIBERS_KEY, {
      [user.user_id]: JSON.stringify(subscriber)
    })
    
    console.log('Subscriber added:', user.user_id)
    return true
  } catch (error) {
    console.error('Error adding subscriber:', error)
    return false
  }
}

// Remove subscriber
export async function removeSubscriber(user_id: number): Promise<boolean> {
  if (!redis) return false

  try {
    await redis.hdel(SUBSCRIBERS_KEY, user_id.toString())
    console.log('Subscriber removed:', user_id)
    return true
  } catch (error) {
    console.error('Error removing subscriber:', error)
    return false
  }
}

// Get all subscribers
export async function getSubscribers(): Promise<Subscriber[]> {
  if (!redis) return []

  try {
    const allSubscribers = await redis.hgetall(SUBSCRIBERS_KEY)
    
    if (!allSubscribers || Object.keys(allSubscribers).length === 0) {
      return []
    }

    const subscribers: Subscriber[] = []
    for (const [id, dataStr] of Object.entries(allSubscribers)) {
      try {
        const data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr
        subscribers.push(data as Subscriber)
      } catch (e) {
        console.error('Parse error for subscriber:', id)
      }
    }

    return subscribers
  } catch (error) {
    console.error('Error getting subscribers:', error)
    return []
  }
}

// Get subscribers count
export async function getSubscribersCount(): Promise<number> {
  const subscribers = await getSubscribers()
  return subscribers.length
}

// Check if user is subscribed
export async function isSubscribed(user_id: number): Promise<boolean> {
  if (!redis) return false

  try {
    const data = await redis.hget(SUBSCRIBERS_KEY, user_id.toString())
    return !!data
  } catch (error) {
    console.error('Error checking subscription:', error)
    return false
  }
}

// Save radio online status
export async function setRadioStatus(online: boolean): Promise<void> {
  if (!redis) return

  try {
    await redis.set(RADIO_STATUS_KEY, online ? '1' : '0')
  } catch (error) {
    console.error('Error saving radio status:', error)
  }
}

// Get radio online status
export async function getRadioStatus(): Promise<boolean | null> {
  if (!redis) return null

  try {
    const status = await redis.get(RADIO_STATUS_KEY)
    if (status === null) return null
    return status === '1'
  } catch (error) {
    console.error('Error getting radio status:', error)
    return null
  }
}
