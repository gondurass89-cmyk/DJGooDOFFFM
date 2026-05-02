/**
 * Cloudflare Worker: HTTPS Proxy for Icecast HTTP Stream
 * 
 * Solves: Mixed Content error when HTTPS site loads HTTP audio stream
 * 
 * Deployment:
 * 1. Go to Cloudflare Dashboard > Workers & Pages
 * 2. Create new Worker named "radio-stream"
 * 3. Paste this code
 * 4. Deploy
 * 
 * Worker URL: https://radio-stream.YOUR-SUBDOMAIN.workers.dev
 */

const ICECAST_URL = 'http://178.49.69.37:8000/Radio';

// Icecast headers to proxy through
const ICECAST_HEADERS = [
  'content-type',
  'icy-name',
  'icy-description',
  'icy-genre',
  'icy-url',
  'icy-br',
  'icy-metaint',
  'audio-info',
];

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type, Icy-MetaData',
          'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Icy-Name, Icy-Genre, Icy-Br',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow GET, HEAD, OPTIONS
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    try {
      // Build headers to forward to Icecast
      const forwardHeaders = new Headers();
      forwardHeaders.set('User-Agent', request.headers.get('user-agent') || 'DJGooDOFFFM-Proxy/1.0');
      
      // Forward Icy-MetaData header if client wants metadata
      const icyMeta = request.headers.get('icy-metadata');
      if (icyMeta) {
        forwardHeaders.set('Icy-MetaData', icyMeta);
      }
      
      // Forward Range header for seeking (if any)
      const range = request.headers.get('range');
      if (range) {
        forwardHeaders.set('Range', range);
      }

      // Fetch from Icecast
      const response = await fetch(ICECAST_URL, {
        method: request.method,
        headers: forwardHeaders,
      });

      // Check if Icecast responded successfully
      if (!response.ok && response.status !== 206) {
        // 206 = Partial Content (valid for Range requests)
        return new Response(JSON.stringify({ error: 'Stream offline' }), {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Build response headers
      const responseHeaders = new Headers();
      
      // Copy Icecast headers
      for (const header of ICECAST_HEADERS) {
        const value = response.headers.get(header);
        if (value) {
          responseHeaders.set(header, value);
        }
      }
      
      // Add CORS headers
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      responseHeaders.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Icy-Name, Icy-Genre, Icy-Br, Icy-Metaint');
      
      // Prevent caching of live stream
      responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      responseHeaders.set('Pragma', 'no-cache');

      // Stream the response body directly (no buffering)
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });

    } catch (error) {
      // Network error, timeout, or Icecast unreachable
      console.error('Stream proxy error:', error);
      
      return new Response(JSON.stringify({ error: 'Stream offline' }), {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
