// Fess Up storage: one SQLite-backed Durable Object holds every round (the account is at the free plan's
// 10 D1 databases). The Worker forwards /api/* and preview lookups here.
//
// Sealing is enforced here, not in the browser: before the reveal a response carries who joined and who has
// answered, and only your own answers. After the reveal, results go only to people who have answered.
import { DurableObject } from 'cloudflare:workers';
import { PACKS } from '../public/packs.js';
import { cleanText, isBlocked } from './filter.js';

const DAY = 86400e3;
const MAX_MEMBERS = 60;
const KEEP_DAYS = 90;
const LIMITS = { create: 20, join: 60, write: 600 }; // per IP hash per hour

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS rounds (id TEXT PRIMARY KEY, title TEXT NOT NULL, pack_id TEXT NOT NULL,
     statements TEXT NOT NULL, custom INTEGER NOT NULL DEFAULT 0, anonymous INTEGER NOT NULL DEFAULT 0,
     size INTEGER NOT NULL, deadline INTEGER NOT NULL, created_at INTEGER NOT NULL, revealed_at INTEGER,
     creator_id TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, round_id TEXT NOT NULL, nickname TEXT NOT NULL,
     token_hash TEXT NOT NULL, answers TEXT, answered_at INTEGER, joined_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS members_round ON members(round_id)`,
  `CREATE TABLE IF NOT EXISTS hits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, exp INTEGER NOT NULL)`,
];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const err = (status, error) => json({ error }, status);

function rid(n = 8) {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const b = crypto.getRandomValues(new Uint8Array(n));
  return [...b].map((x) => abc[x % abc.length]).join('');
}
function token() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export class Store extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.env = env;
    for (const s of SCHEMA) this.sql.exec(s);
  }

  q(query, ...args) { return this.sql.exec(query, ...args).toArray(); }
  one(query, ...args) { return this.q(query, ...args)[0] ?? null; }

  limit(kind, ipHash) {
    const now = Date.now();
    const k = `${kind}:${ipHash}`;
    const row = this.one('SELECT n, exp FROM hits WHERE k = ?', k);
    if (!row || row.exp < now) {
      this.sql.exec('INSERT OR REPLACE INTO hits (k, n, exp) VALUES (?, 1, ?)', k, now + 3600e3);
      return true;
    }
    if (row.n >= LIMITS[kind]) return false;
    this.sql.exec('UPDATE hits SET n = n + 1 WHERE k = ?', k);
    return true;
  }

  cleanup() {
    const now = Date.now();
    const old = now - KEEP_DAYS * DAY;
    this.sql.exec('DELETE FROM members WHERE round_id IN (SELECT id FROM rounds WHERE created_at < ?)', old);
    this.sql.exec('DELETE FROM rounds WHERE created_at < ?', old);
    this.sql.exec('DELETE FROM hits WHERE exp < ?', now);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // ['api','rounds',id,action]
    if (parts[0] === '__preview') return json(this.preview(parts[1]));
    if (parts[0] === 'api' && parts[1] === 'stats' && request.method === 'GET') return json(this.stats());
    if (parts[0] !== 'api' || parts[1] !== 'rounds') return err(404, 'Not found');
    const ip = request.headers.get('x-ip-hash') || 'unknown';
    const method = request.method;
    let body = {};
    if (method === 'POST') {
      try { body = await request.json(); } catch { return err(400, 'Bad request'); }
      if (!body || typeof body !== 'object') return err(400, 'Bad request');
    }
    const id = parts[2];
    const action = parts[3];
    const tok = request.headers.get('x-token') || '';
    try {
      if (!id && method === 'POST') return await this.create(body, ip);
      if (!id) return err(404, 'Not found');
      const round = this.one('SELECT * FROM rounds WHERE id = ?', id);
      if (!round) return err(404, 'This round does not exist or was deleted.');
      this.maybeReveal(round);
      const me = tok ? this.one('SELECT * FROM members WHERE round_id = ? AND token_hash = ?', id, await sha(tok)) : null;
      if (method === 'GET' && !action) return json(this.view(round, me));
      if (method === 'POST' && action === 'join') return await this.join(round, me, body, ip);
      if (method === 'POST' || method === 'DELETE') {
        if (!this.limit('write', ip)) return err(429, 'Too many requests. Try again in a while.');
        if (!me) return err(403, 'Join the round first.');
      }
      if (method === 'POST' && action === 'answers') return this.answer(round, me, body);
      if (method === 'POST' && action === 'reveal') return this.reveal(round, me);
      if (method === 'POST' && action === 'remove') return this.remove(round, me, body);
      if (method === 'POST' && action === 'leave') return this.leave(round, me);
      if (method === 'POST' && action === 'rename') return this.rename(round, me, body);
      if (method === 'DELETE' && !action) return this.del(round, me);
      return err(404, 'Not found');
    } catch (e) {
      return err(500, 'Something went wrong. Please try again.');
    }
  }

  nick(raw) {
    const n = cleanText(raw, 24);
    if (!n) return { error: 'Type a nickname.' };
    if (isBlocked(n)) return { error: 'Please pick a different nickname.' };
    return { n };
  }

  async create(b, ip) {
    if (!this.limit('create', ip)) return err(429, 'You have started a lot of rounds. Try again in an hour.');
    const pack = PACKS.find((p) => p.id === b.packId);
    if (!pack) return err(400, 'Pick a pack.');
    const { n, error } = this.nick(b.nickname);
    if (error) return err(400, error);
    const title = cleanText(b.title, 50) || `${pack.name} edition`;
    if (isBlocked(title)) return err(400, 'Please pick a different title.');
    let statements = pack.statements.slice();
    const custom = [];
    for (const raw of Array.isArray(b.custom) ? b.custom.slice(0, 2) : []) {
      let s = cleanText(raw, 80).replace(/^never\s+have\s+i\s+ever\s*/i, '').replace(/[.!?]+$/, '').trim();
      if (!s) continue;
      if (s.length < 4) return err(400, 'Your own statement is too short.');
      if (isBlocked(s)) return err(400, `"${s}" isn't allowed. Keep it PG-13.`);
      custom.push(s.charAt(0).toLowerCase() + s.slice(1));
    }
    statements = statements.concat(custom);
    const size = Math.max(2, Math.min(MAX_MEMBERS, Math.round(Number(b.size) || 5)));
    const now = Date.now();
    let deadline = Math.round(Number(b.deadline) || 0);
    if (!deadline) deadline = now + 2 * DAY;
    deadline = Math.max(now + 15 * 60e3, Math.min(now + 14 * DAY, deadline));
    const id = rid(8);
    const mid = rid(10);
    const t = token();
    this.cleanup();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`INSERT INTO rounds (id, title, pack_id, statements, custom, anonymous, size, deadline, created_at, creator_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, title, pack.id, JSON.stringify(statements), custom.length,
        b.anonymous ? 1 : 0, size, deadline, now, mid);
      this.sql.exec('INSERT INTO members (id, round_id, nickname, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)',
        mid, id, n, '', now);
    });
    this.sql.exec('UPDATE members SET token_hash = ? WHERE id = ?', await sha(t), mid);
    return json({ id, memberId: mid, token: t });
  }

  async join(round, me, b, ip) {
    if (me) return json({ memberId: me.id, already: true });
    if (!this.limit('join', ip)) return err(429, 'Too many joins from here. Try again in a while.');
    const { n, error } = this.nick(b.nickname);
    if (error) return err(400, error);
    const count = this.one('SELECT COUNT(*) AS c FROM members WHERE round_id = ?', round.id).c;
    if (count >= MAX_MEMBERS) return err(409, 'This round is full.');
    if (this.one('SELECT 1 AS x FROM members WHERE round_id = ? AND lower(nickname) = lower(?)', round.id, n)) {
      return err(409, `Someone in this round is already called ${n}. Add an initial?`);
    }
    const mid = rid(10);
    const t = token();
    this.sql.exec('INSERT INTO members (id, round_id, nickname, token_hash, joined_at) VALUES (?, ?, ?, ?, ?)',
      mid, round.id, n, await sha(t), Date.now());
    return json({ memberId: mid, token: t });
  }

  answer(round, me, b) {
    const st = JSON.parse(round.statements);
    const a = typeof b.answers === 'string' ? b.answers : '';
    if (a.length !== st.length || !/^[hnp]+$/.test(a)) return err(400, 'Answer every statement (Pass is fine).');
    if (me.answers && round.revealed_at) return err(409, 'Answers are locked after the reveal.');
    this.sql.exec('UPDATE members SET answers = ?, answered_at = ? WHERE id = ?', a, Date.now(), me.id);
    this.maybeReveal(round);
    return json(this.view(this.one('SELECT * FROM rounds WHERE id = ?', round.id), this.one('SELECT * FROM members WHERE id = ?', me.id)));
  }

  answeredCount(roundId) {
    return this.one('SELECT COUNT(*) AS c FROM members WHERE round_id = ? AND answers IS NOT NULL', roundId).c;
  }

  maybeReveal(round) {
    if (round.revealed_at) return;
    const now = Date.now();
    const answered = this.answeredCount(round.id);
    if (answered >= round.size || (now >= round.deadline && answered >= 1)) {
      round.revealed_at = now;
      this.sql.exec('UPDATE rounds SET revealed_at = ? WHERE id = ? AND revealed_at IS NULL', now, round.id);
    }
  }

  reveal(round, me) {
    if (me.id !== round.creator_id) return err(403, 'Only the person who started the round can reveal early.');
    if (round.revealed_at) return json(this.view(round, me));
    if (this.answeredCount(round.id) < 2) return err(409, 'At least 2 people need to answer before the reveal.');
    round.revealed_at = Date.now();
    this.sql.exec('UPDATE rounds SET revealed_at = ? WHERE id = ?', round.revealed_at, round.id);
    return json(this.view(round, me));
  }

  remove(round, me, b) {
    if (me.id !== round.creator_id) return err(403, 'Only the person who started the round can remove players.');
    if (b.memberId === me.id) return err(400, 'You cannot remove yourself. Delete the round instead.');
    this.sql.exec('DELETE FROM members WHERE id = ? AND round_id = ?', String(b.memberId || ''), round.id);
    return json(this.view(round, me));
  }

  leave(round, me) {
    if (me.id === round.creator_id) return err(400, 'You started this round. Delete it instead.');
    this.sql.exec('DELETE FROM members WHERE id = ?', me.id);
    return json({ ok: true });
  }

  rename(round, me, b) {
    const { n, error } = this.nick(b.nickname);
    if (error) return err(400, error);
    if (this.one('SELECT 1 AS x FROM members WHERE round_id = ? AND lower(nickname) = lower(?) AND id != ?', round.id, n, me.id)) {
      return err(409, `Someone in this round is already called ${n}.`);
    }
    this.sql.exec('UPDATE members SET nickname = ? WHERE id = ?', n, me.id);
    return json(this.view(round, this.one('SELECT * FROM members WHERE id = ?', me.id)));
  }

  del(round, me) {
    if (me.id !== round.creator_id) return err(403, 'Only the person who started the round can delete it.');
    this.sql.exec('DELETE FROM members WHERE round_id = ?', round.id);
    this.sql.exec('DELETE FROM rounds WHERE id = ?', round.id);
    return json({ ok: true });
  }

  view(round, me) {
    const pack = PACKS.find((p) => p.id === round.pack_id) || { name: 'Custom', emoji: '🙊' };
    const members = this.q('SELECT id, nickname, answers, joined_at FROM members WHERE round_id = ? ORDER BY joined_at', round.id);
    const statements = JSON.parse(round.statements);
    const out = {
      round: {
        id: round.id, title: round.title, packId: round.pack_id, packName: pack.name, emoji: pack.emoji,
        statements, custom: round.custom, anonymous: !!round.anonymous, size: round.size, deadline: round.deadline,
        createdAt: round.created_at, revealed: !!round.revealed_at, revealedAt: round.revealed_at,
        creatorName: (members.find((m) => m.id === round.creator_id) || {}).nickname || null,
      },
      now: Date.now(),
      me: me ? { id: me.id, nickname: me.nickname, isCreator: me.id === round.creator_id, answers: me.answers } : null,
      members: members.map((m) => ({ id: m.id, nickname: m.nickname, answered: !!m.answers, isCreator: m.id === round.creator_id })),
      results: null,
    };
    if (round.revealed_at && me && me.answers) {
      const done = members.filter((m) => m.answers);
      if (round.anonymous) {
        const counts = statements.map((_, i) => {
          const c = { have: 0, never: 0, pass: 0 };
          for (const m of done) c[m.answers[i] === 'h' ? 'have' : m.answers[i] === 'n' ? 'never' : 'pass']++;
          return c;
        });
        out.results = { anonymous: true, n: done.length, counts };
      } else {
        out.results = {
          anonymous: false,
          players: done.map((m) => ({ id: m.id, nickname: m.nickname })),
          answers: Object.fromEntries(done.map((m) => [m.id, m.answers])),
        };
      }
    }
    return out;
  }

  // Link preview data: no names beyond the creator's, never anyone's answers.
  preview(id) {
    const round = this.one('SELECT * FROM rounds WHERE id = ?', id || '');
    if (!round) return null;
    this.maybeReveal(round);
    const pack = PACKS.find((p) => p.id === round.pack_id) || { name: 'Custom', emoji: '🙊' };
    const m = this.one('SELECT COUNT(*) AS joined, SUM(answers IS NOT NULL) AS answered FROM members WHERE round_id = ?', round.id);
    return {
      title: round.title, packName: pack.name, emoji: pack.emoji, size: round.size, deadline: round.deadline,
      revealed: !!round.revealed_at, joined: m.joined, answered: m.answered || 0, count: JSON.parse(round.statements).length,
    };
  }

  // Aggregate counts for VENTURE.md metrics. No names, no answers.
  stats() {
    const since = Date.now() - 7 * DAY;
    return {
      rounds: this.one('SELECT COUNT(*) AS c FROM rounds').c,
      roundsLast7d: this.one('SELECT COUNT(*) AS c FROM rounds WHERE created_at > ?', since).c,
      players: this.one('SELECT COUNT(*) AS c FROM members').c,
      playersLast7d: this.one('SELECT COUNT(*) AS c FROM members WHERE joined_at > ?', since).c,
      revealed: this.one('SELECT COUNT(*) AS c FROM rounds WHERE revealed_at IS NOT NULL').c,
    };
  }
}
