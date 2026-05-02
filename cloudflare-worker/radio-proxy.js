/**
 * Cloudflare Worker: HTTPS Proxy for Icecast HTTP Stream
 * 
 * This worker proxies the HTTP Icecast stream to HTTPS for Telegram Mini App compatibility.
 * 
 * Deployment:
 * 1. Go to Cloudflare Dashboard > Workers & Pages
 * 2. Create new Worker or update existing "radio-stream"
 * 3. Paste this code
 * 4. Set environment variable: ICECAST_URL = "http://178.49.69.37:8000/Radio"
 * 5. Deploy
 * 
 * Worker URL will be: https://radio-stream.YOUR-SUBDOMAIN.workers.dev
 */

export default {
  async fetch(request, env, ctx) {
    // Get the Icecast URL from environment variable
    const icecastUrl = env.ICECAST_URL || 'http://178.49.69.37:8000/Radio';
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    
    try {
      // Forward the request to Icecast
      const response = await fetch(icecastUrl, {
        method: request.method,
        headers: {
          'User-Agent': 'DJGooDOFFFM-Proxy/1.0',
          'Range': request.headers.get('Range') || '',
        },
      });
      
      // Create response with CORS headers
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      headers.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
      
      // Important: Don't modify the content-type for audio streams
      // Icecast typically returns: audio/mpeg, audio/aac, application/ogg, etc.
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      
    } catch (error) {
      console.error('Proxy error:', error);
      return new Response(JSON.stringify({ 
        error: 'Stream unavailable',
        message: error.message 
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
