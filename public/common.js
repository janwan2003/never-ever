// Shared browser helpers for Fess Up.
export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const KEY = 'fessup:';
export const store = {
  get(k) { try { return localStorage.getItem(KEY + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(KEY + k, v); } catch {} },
  del(k) { try { localStorage.removeItem(KEY + k); } catch {} },
  json(k, fallback) { try { return JSON.parse(this.get(k)) ?? fallback; } catch { return fallback; } },
};

export function rememberRound(r) {
  const list = store.json('rounds', []).filter((x) => x.id !== r.id);
  list.unshift({ id: r.id, title: r.title, emoji: r.emoji, at: Date.now() });
  store.set('rounds', JSON.stringify(list.slice(0, 20)));
}
export function forgetRound(id) {
  store.set('rounds', JSON.stringify(store.json('rounds', []).filter((x) => x.id !== id)));
  store.del('t:' + id);
  store.del('p:' + id);
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers['x-token'] = token;
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('No connection. Check your internet and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || `Something went wrong (${res.status}).`);
    e.status = res.status;
    throw e;
  }
  return data;
}

let toastTimer;
export function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

const COLORS = ['#ff5a4e', '#4a43d6', '#17905a', '#d2671b', '#b0399b', '#1f7fb8', '#7a5cff', '#c23b5a', '#2f8f8a', '#8a6d1d'];
export function avatar(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return `<span class="avatar" style="background:${COLORS[h % COLORS.length]}">${esc([...String(name)][0]?.toUpperCase() || '?')}</span>`;
}

export function whenText(ts, now = Date.now()) {
  const d = new Date(ts);
  const ms = ts - now;
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (ms <= 0) return 'now';
  if (ms < 3600e3) return `in ${Math.max(1, Math.round(ms / 60e3))} min`;
  const today = new Date(now); const tmr = new Date(now + 86400e3);
  if (d.toDateString() === today.toDateString()) return `today at ${time}`;
  if (d.toDateString() === tmr.toDateString()) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} at ${time}`;
}

export async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Link copied. Paste it in your group chat.'); return 'copied'; } catch {}
  prompt('Copy this link:', url);
  return 'prompted';
}
