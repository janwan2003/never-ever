// Fess Up Worker: static assets from public/, /api/* to the Store Durable Object, and /r/<id> pages with
// a link preview (Open Graph) that shows the round's live state.
import { Store } from './store.js';
import { previewText } from './preview.js';
export { Store };

const SALT = 'fess-up-v1';

async function ipHash(request) {
  const ip = request.headers.get('cf-connecting-ip') || '0';
  const hour = Math.floor(Date.now() / 3600e3);
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${SALT}:${ip}:${hour}`));
  return [...new Uint8Array(d)].slice(0, 12).map((x) => x.toString(16).padStart(2, '0')).join('');
}

const store = (env) => env.STORE.get(env.STORE.idFromName('main'));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'GET') {
        const origin = request.headers.get('origin');
        if (origin && origin !== url.origin) return new Response('{"error":"Bad origin"}', { status: 403 });
      }
      const headers = new Headers(request.headers);
      headers.set('x-ip-hash', await ipHash(request));
      return store(env).fetch(new Request(request.url, { method: request.method, headers, body: request.body }));
    }
    const m = url.pathname.match(/^\/r\/([a-z0-9]{6,12})\/?$/);
    if (m) {
      const res = await store(env).fetch(new Request(`https://store/__preview/${m[1]}`));
      const p = await res.json();
      const { title, desc } = previewText(p);
      const page = await env.ASSETS.fetch(new Request(new URL('/round', url)));
      let html = await page.text();
      html = html.replaceAll('__OG_TITLE__', esc(title)).replaceAll('__OG_DESC__', esc(desc)).replaceAll('__OG_URL__', esc(url.origin + url.pathname));
      return new Response(html, {
        status: p ? 200 : 404,
        headers: {
          'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
          'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'DENY',
          'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        },
      });
    }
    return env.ASSETS.fetch(request);
  },
};
