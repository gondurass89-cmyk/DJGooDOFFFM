import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

const BOT_TOKEN = '8600657705:AAEn6pFmFKcLCPFm8FcF9UiAag404S1av00'
const ADMIN_CHAT_ID = '55068554'
const ICECAST_STATUS_URL = 'http://178.49.69.37:8000/status-json.xsl'
const ICECAST_ADMIN_URL = 'http://178.49.69.37:8000/admin/listclients?mount=/Radio'
const ICECAST_ADMIN_USER = 'admin'
const ICECAST_ADMIN_PASS = 'hackme111'

// AWS/Vercel IP ranges to exclude (these are proxy IPs, not real listeners)
// AWS IP prefixes - these represent Vercel serverless functions connecting to Icecast
const AWS_IP_PREFIXES = [
  // AWS US East (Virginia)
  '3.80.', '3.81.', '3.82.', '3.83.', '3.84.', '3.85.', '3.86.', '3.87.', '3.88.', '3.89.', '3.90.',
  '3.208.', '3.209.', '3.210.', '3.211.', '3.212.', '3.213.', '3.214.', '3.215.', '3.216.', '3.217.', '3.218.', '3.219.', '3.220.', '3.221.', '3.222.', '3.223.', '3.224.', '3.225.', '3.226.', '3.227.', '3.228.', '3.229.', '3.230.', '3.231.', '3.232.', '3.233.', '3.234.', '3.235.', '3.236.', '3.237.', '3.238.', '3.239.', '3.240.', '3.241.', '3.242.', '3.243.', '3.244.', '3.245.', '3.246.', '3.247.', '3.248.', '3.249.', '3.250.', '3.251.', '3.252.', '3.253.', '3.254.', '3.255.',
  // AWS EU (Frankfurt)
  '3.64.', '3.65.', '3.66.', '3.67.', '3.68.', '3.69.', '3.70.', '3.71.', '3.72.', '3.73.', '3.74.', '3.75.', '3.76.', '3.77.', '3.78.', '3.79.',
  '52.28.', '52.29.', '52.30.', '52.31.', '52.56.', '52.57.', '52.58.', '52.59.',
  // AWS US East (Ohio)
  '3.12.', '3.13.', '3.14.', '3.15.', '3.16.', '3.17.', '3.18.',
  '18.216.', '18.217.', '18.218.', '18.219.', '18.220.', '18.221.', '18.222.', '18.223.', '18.224.', '18.225.', '18.226.', '18.227.', '18.228.', '18.229.', '18.230.', '18.231.',
  // AWS common ranges
  '34.192.', '34.193.', '34.194.', '34.195.', '34.196.', '34.197.', '34.198.', '34.199.', '34.200.', '34.201.', '34.202.', '34.203.', '34.204.', '34.205.', '34.206.', '34.207.', '34.208.', '34.209.', '34.210.', '34.211.', '34.212.', '34.213.', '34.214.', '34.215.', '34.216.', '34.217.', '34.218.', '34.219.', '34.220.', '34.221.', '34.222.', '34.223.', '34.224.', '34.225.', '34.226.', '34.227.', '34.228.', '34.229.', '34.230.', '34.231.', '34.232.', '34.233.', '34.234.', '34.235.', '34.236.', '34.237.', '34.238.', '34.239.',
  '44.192.', '44.193.', '44.194.', '44.195.', '44.196.', '44.197.', '44.198.', '44.199.', '44.200.', '44.201.', '44.202.', '44.203.', '44.204.', '44.205.', '44.206.', '44.207.', '44.208.', '44.209.', '44.210.', '44.211.', '44.212.', '44.213.', '44.214.', '44.215.', '44.216.', '44.217.', '44.218.', '44.219.', '44.220.', '44.221.', '44.222.', '44.223.', '44.224.', '44.225.', '44.226.', '44.227.', '44.228.', '44.229.', '44.230.', '44.231.',
  '52.0.', '52.1.', '52.2.', '52.3.', '52.4.', '52.5.', '52.6.', '52.7.', '52.8.', '52.9.', '52.10.', '52.11.', '52.12.', '52.13.', '52.14.', '52.15.', '52.16.', '52.17.', '52.18.', '52.19.', '52.20.', '52.21.', '52.22.', '52.23.', '52.24.', '52.25.', '52.26.', '52.27.', '52.28.', '52.29.', '52.30.', '52.31.', '52.32.', '52.33.', '52.34.', '52.35.', '52.36.', '52.37.', '52.38.', '52.39.', '52.40.', '52.41.', '52.42.', '52.43.', '52.44.', '52.45.', '52.46.', '52.47.', '52.48.', '52.49.', '52.50.', '52.51.', '52.52.', '52.53.', '52.54.', '52.55.', '52.56.', '52.57.', '52.58.', '52.59.', '52.60.', '52.61.', '52.62.', '52.63.', '52.64.', '52.65.', '52.66.', '52.67.', '52.68.', '52.69.', '52.70.', '52.71.', '52.72.', '52.73.', '52.74.', '52.75.', '52.76.', '52.77.', '52.78.', '52.79.', '52.80.', '52.81.', '52.82.', '52.83.', '52.84.', '52.85.', '52.86.', '52.87.', '52.88.', '52.89.', '52.90.', '52.91.', '52.92.', '52.93.', '52.94.', '52.95.', '52.200.', '52.201.', '52.202.', '52.203.', '52.204.', '52.205.', '52.206.', '52.207.', '52.208.', '52.209.', '52.210.', '52.211.', '52.212.', '52.213.', '52.214.', '52.215.', '52.216.', '52.217.', '52.218.', '52.219.', '52.220.', '52.221.', '52.222.', '52.223.', '52.224.', '52.225.', '52.226.', '52.227.', '52.228.', '52.229.', '52.230.', '52.231.', '52.232.', '52.233.', '52.234.', '52.235.', '52.236.', '52.237.', '52.238.', '52.239.', '52.240.', '52.241.', '52.242.', '52.243.', '52.244.', '52.245.', '52.246.', '52.247.', '52.248.', '52.249.', '52.250.', '52.251.', '52.252.', '52.253.', '52.254.', '52.255.',
  '54.80.', '54.81.', '54.82.', '54.83.', '54.84.', '54.85.', '54.86.', '54.87.', '54.88.', '54.89.', '54.90.', '54.91.', '54.92.', '54.93.', '54.94.', '54.95.', '54.96.', '54.97.', '54.98.', '54.99.', '54.100.', '54.101.', '54.102.', '54.103.', '54.104.', '54.105.', '54.106.', '54.107.', '54.108.', '54.109.', '54.110.', '54.111.', '54.112.', '54.113.', '54.114.', '54.115.', '54.116.', '54.117.', '54.118.', '54.119.', '54.120.', '54.121.', '54.122.', '54.123.', '54.124.', '54.125.', '54.126.', '54.127.', '54.128.', '54.129.', '54.130.', '54.131.', '54.132.', '54.133.', '54.134.', '54.135.', '54.136.', '54.137.', '54.138.', '54.139.', '54.140.', '54.141.', '54.142.', '54.143.', '54.144.', '54.145.', '54.146.', '54.147.', '54.148.', '54.149.', '54.150.', '54.151.', '54.152.', '54.153.', '54.154.', '54.155.', '54.156.', '54.157.', '54.158.', '54.159.', '54.160.', '54.161.', '54.162.', '54.163.', '54.164.', '54.165.', '54.166.', '54.167.', '54.168.', '54.169.', '54.170.', '54.171.', '54.172.', '54.173.', '54.174.', '54.175.', '54.176.', '54.177.', '54.178.', '54.179.', '54.180.', '54.181.', '54.182.', '54.183.', '54.184.', '54.185.', '54.186.', '54.187.', '54.188.', '54.189.', '54.190.', '54.191.', '54.192.', '54.193.', '54.194.', '54.195.', '54.196.', '54.197.', '54.198.', '54.199.', '54.200.', '54.201.', '54.202.', '54.203.', '54.204.', '54.205.', '54.206.', '54.207.', '54.208.', '54.209.', '54.210.', '54.211.', '54.212.', '54.213.', '54.214.', '54.215.', '54.216.', '54.217.', '54.218.', '54.219.', '54.220.', '54.221.', '54.222.', '54.223.', '54.224.', '54.225.', '54.226.', '54.227.', '54.228.', '54.229.', '54.230.', '54.231.', '54.232.', '54.233.', '54.234.', '54.235.', '54.236.', '54.237.', '54.238.', '54.239.', '54.240.', '54.241.', '54.242.', '54.243.', '54.244.', '54.245.', '54.246.', '54.247.', '54.248.', '54.249.', '54.250.', '54.251.', '54.252.', '54.253.', '54.254.', '54.255.',
  '98.80.', '98.81.', '98.82.', '98.83.', '98.84.', '98.85.', '98.86.', '98.87.', '98.88.', '98.89.', '98.90.', '98.91.', '98.92.', '98.93.', '98.94.', '98.95.', '98.96.', '98.97.', '98.98.', '98.99.', '98.100.', '98.101.', '98.102.', '98.103.', '98.104.', '98.105.', '98.106.', '98.107.', '98.108.', '98.109.', '98.110.', '98.111.', '98.112.', '98.113.', '98.114.', '98.115.', '98.116.', '98.117.', '98.118.', '98.119.', '98.120.', '98.121.', '98.122.', '98.123.', '98.124.', '98.125.', '98.126.', '98.127.', '98.128.', '98.129.', '98.130.', '98.131.', '98.132.', '98.133.', '98.134.', '98.135.', '98.136.', '98.137.', '98.138.', '98.139.', '98.140.', '98.141.', '98.142.', '98.143.', '98.144.', '98.145.', '98.146.', '98.147.', '98.148.', '98.149.', '98.150.', '98.151.', '98.152.', '98.153.', '98.154.', '98.155.', '98.156.', '98.157.', '98.158.', '98.159.',
  '100.24.', '100.25.', '100.26.', '100.27.', '100.28.', '100.29.', '100.30.', '100.31.',
  '107.20.', '107.21.', '107.22.', '107.23.',
  // Test/own IPs (Alibaba, etc.)
  '47.76.', '47.77.', '47.78.', '47.79.', '47.80.', '47.81.', '47.82.', '47.83.', '47.84.', '47.85.', '47.86.', '47.87.', '47.88.', '47.89.', '47.90.', '47.91.', '47.92.', '47.93.', '47.94.', '47.95.', '47.96.', '47.97.', '47.98.', '47.99.', '47.238.', '47.239.', '47.129.',
]

// Check if IP belongs to AWS/Vercel/proxy
function isProxyIP(ip: string): boolean {
  // Local IPs
  if (ip.startsWith('127.') || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return true
  }
  // Own server
  if (ip === '178.49.69.37') {
    return true
  }
  // AWS/Vercel ranges
  return AWS_IP_PREFIXES.some(prefix => ip.startsWith(prefix))
}

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

interface IcecastClient {
  ip: string
  useragent: string
  connected: number
}

// In-memory fallback for local dev
if (!global.listenersStorage) {
  global.listenersStorage = new Map()
}
const localListeners = global.listenersStorage

const LISTENERS_KEY = 'djgoodoff:listeners'

// Fetch listeners list from Icecast admin API and filter out proxy IPs
async function getIcecastDirectListeners(): Promise<{ unique: number; clients: IcecastClient[] }> {
  try {
    const response = await fetch(ICECAST_ADMIN_URL, {
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ICECAST_ADMIN_USER}:${ICECAST_ADMIN_PASS}`).toString('base64')
      }
    })

    if (!response.ok) {
      console.error('Icecast admin API error:', response.status)
      return { unique: 0, clients: [] }
    }

    const text = await response.text()

    // Parse XML response to extract client IPs
    const clients: IcecastClient[] = []
    const ipRegex = /<ip>([^<]+)<\/ip>/g
    const agentRegex = /<useragent>([^<]*)<\/useragent>/g
    const connectedRegex = /<connected>(\d+)<\/connected>/g

    const ips = text.match(ipRegex) || []
    const agents = text.match(agentRegex) || []
    const connected = text.match(connectedRegex) || []

    for (let i = 0; i < ips.length; i++) {
      const ip = ips[i].replace(/<\/?ip>/g, '')
      const useragent = agents[i]?.replace(/<\/?useragent>/g, '') || ''
      const connTime = parseInt(connected[i]?.replace(/<\/?connected>/g, '') || '0')

      clients.push({ ip, useragent, connected: connTime })
    }

    // Filter out proxy IPs and count unique real listeners
    const realClients = clients.filter(c => !isProxyIP(c.ip))
    const uniqueIPs = new Set(realClients.map(c => c.ip))

    console.log('Icecast clients:', clients.length, 'Real listeners:', uniqueIPs.size, 'Unique IPs:', [...uniqueIPs])

    return { unique: uniqueIPs.size, clients: realClients }
  } catch (error) {
    console.error('Error fetching Icecast listeners:', error)
    return { unique: 0, clients: [] }
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
      console.log('Using Redis for listener storage')
      
      if (action === 'open') {
        const setResult = await redis.hset(LISTENERS_KEY, { [user_id]: JSON.stringify(listenerData) })
        console.log('Redis hset result:', setResult, 'for user_id:', user_id)
      } else if (action === 'close') {
        const delResult = await redis.hdel(LISTENERS_KEY, user_id.toString())
        console.log('Redis hdel result:', delResult)
      }

      // Get total count (clean up stale entries)
      const allListeners = await redis.hgetall(LISTENERS_KEY)
      console.log('Redis hgetall result:', JSON.stringify(allListeners))
      
      const now = Date.now()

      let count = 0
      if (allListeners && Object.keys(allListeners).length > 0) {
        for (const [id, dataStr] of Object.entries(allListeners)) {
          try {
            const data = JSON.parse(String(dataStr)) as ListenerData
            if (now - data.lastSeen > timeout) {
              await redis.hdel(LISTENERS_KEY, id)
            } else {
              count++
            }
          } catch (e) {
            console.error('Parse error for id:', id, e)
            await redis.hdel(LISTENERS_KEY, id)
          }
        }
      }

      console.log('Redis listeners count:', count, 'raw entries:', allListeners ? Object.keys(allListeners).length : 0)
      notifyAdmin(listenerData, count, isAdmin || user_id === Number(ADMIN_CHAT_ID))

      return NextResponse.json({
        success: true,
        telegramListeners: count,
        debug: {
          redisEntries: allListeners ? Object.keys(allListeners).length : 0,
          action,
          userId: user_id
        }
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

  // Debug: check if Redis is configured
  const redisConfigured = !!redis
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL ? 'SET' : 'NOT SET'
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ? 'SET' : 'NOT SET'

  // Get Telegram listeners count
  let telegramCount = 0

  if (redis) {
    const allListeners = await redis.hgetall(LISTENERS_KEY)
    console.log('GET: Redis hgetall raw result:', JSON.stringify(allListeners))
    
    if (!allListeners || Object.keys(allListeners).length === 0) {
      console.log('GET: No listeners in Redis')
    } else {
      for (const [id, dataStr] of Object.entries(allListeners)) {
        console.log('GET: Processing id:', id, 'dataStr type:', typeof dataStr, 'value:', dataStr)
        try {
          // Upstash can return the data already parsed or as string
          const data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr
          console.log('GET: Parsed data:', JSON.stringify(data))
          if (now - data.lastSeen > timeout) {
            console.log('GET: Entry expired, deleting')
            await redis.hdel(LISTENERS_KEY, id)
          } else {
            console.log('GET: Entry valid, counting')
            telegramCount++
          }
        } catch (e) {
          console.error('GET: Parse error:', e)
          await redis.hdel(LISTENERS_KEY, id)
        }
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

  // Get Icecast direct listeners (excluding Vercel/AWS proxy IPs)
  const icecastData = await getIcecastDirectListeners()

  console.log('Listener API GET - Telegram:', telegramCount, 'Icecast direct:', icecastData.unique)

  return NextResponse.json({
    telegram: telegramCount,
    icecast: icecastData.unique,
    total: telegramCount + icecastData.unique,
    clients: icecastData.clients, // for debugging
    debug: {
      redisConfigured,
      redisUrl,
      redisToken,
      timestamp: now
    }
  })
}
