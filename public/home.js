import { PACKS } from './packs.js';
import { $, esc, api, store, rememberRound, forgetRound, whenText } from './common.js';

function featuredId(now = new Date()) {
  const m = now.getMonth(), d = now.getDate();
  if ((m === 10 && d >= 15) || (m === 11 && d <= 26)) return 'christmas';
  if ((m === 11 && d >= 27) || (m === 0 && d <= 1)) return 'nye';
  const week = Math.floor((now - new Date(now.getFullYear(), 0, 1)) / (7 * 86400e3));
  const pool = PACKS.filter((p) => !p.season);
  return pool[week % pool.length].id;
}

const feat = featuredId();
const ordered = [PACKS.find((p) => p.id === feat), ...PACKS.filter((p) => p.id !== feat)];
$('#pack-grid').innerHTML = ordered.map((p, i) => `
  <button type="button" class="pack${i === 0 ? ' featured' : ''}" data-id="${p.id}">
    <span class="emoji">${p.emoji}</span>
    ${i === 0 ? `<span class="tag">${p.season ? 'In season' : "This week's pack"}</span>` : ''}
    <span class="name">${esc(p.name)}</span><span class="blurb">${esc(p.blurb)}</span>
    ${i === 0 ? `<span class="sample">${p.statements.slice(0, 3).map((s) => `<span>${esc(s)}</span>`).join('')}</span><span class="go">Start a ${esc(p.name)} round →</span>` : ''}
  </button>`).join('');

// Reveal deadline choices, in the creator's local time.
function deadlines(now = new Date()) {
  const at = (days, h) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d.getTime(); };
  const opts = [];
  const tonight = at(0, 21);
  if (tonight - now > 2 * 3600e3) opts.push(tonight);
  const tomorrow = at(1, 20);
  opts.push(tomorrow, at(2, 20), at(3, 20), at(7, 20));
  const base = now.getTime();
  // Default: tomorrow evening, so the whole group has a day to play.
  return [base + 3 * 3600e3, ...opts].map((t) => ({ t, label: whenText(t, base), def: t === tomorrow }));
}

const dlg = $('#setup');
let pack = null;
let size = 5;
function openSetup(p) {
  pack = p;
  $('#s-emoji').textContent = p.emoji;
  $('#s-name').textContent = p.name;
  $('#s-count').textContent = `${p.statements.length} statements`;
  $('#s-title').value = p.id === 'classic' ? 'Never have I ever' : `${p.name} edition`;
  $('#s-nick').value = store.get('nick') || '';
  $('#s-list').innerHTML = p.statements.map((s) => `<li>${esc(s)}</li>`).join('');
  const ds = deadlines();
  $('#s-deadline').innerHTML = ds.map((d, i) => `<option value="${d.t}"${d.def ? ' selected' : ''}>${esc(d.label.charAt(0).toUpperCase() + d.label.slice(1))}</option>`).join('');
  $('#s-err').textContent = '';
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  // Focus the nickname on desktop only: on phones the keyboard would cover the sheet.
  if (!$('#s-nick').value && matchMedia('(pointer: fine)').matches) setTimeout(() => $('#s-nick').focus(), 50);
}
$('#pack-grid').addEventListener('click', (e) => {
  const b = e.target.closest('.pack');
  if (b) openSetup(PACKS.find((p) => p.id === b.dataset.id));
});
$('#s-close').onclick = () => dlg.close();
$('#setup-form').addEventListener('input', () => { $('#s-err').textContent = ''; });
const setSize = (n) => { size = Math.max(2, Math.min(30, n)); $('#s-size').textContent = size; };
$('#s-minus').onclick = () => setSize(size - 1);
$('#s-plus').onclick = () => setSize(size + 1);

$('#setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nickname = $('#s-nick').value.trim();
  if (!nickname) { $('#s-err').textContent = 'Type your nickname.'; $('#s-nick').focus(); return; }
  const go = $('#s-go');
  go.disabled = true; go.textContent = 'Starting…';
  try {
    const r = await api('/rounds', { method: 'POST', body: {
      packId: pack.id, title: $('#s-title').value, nickname, size, deadline: Number($('#s-deadline').value),
      anonymous: $('#s-anon').checked, custom: [$('#s-c1').value, $('#s-c2').value],
    } });
    store.set('nick', nickname);
    store.set('t:' + r.id, r.token);
    rememberRound({ id: r.id, title: $('#s-title').value || `${pack.name} edition`, emoji: pack.emoji });
    location.href = '/r/' + r.id;
  } catch (err) {
    $('#s-err').textContent = err.message;
    go.disabled = false; go.textContent = 'Start the round and answer first';
  }
});

// "Play this pack with another group" lands here as /?pack=<id>.
const want = new URLSearchParams(location.search).get('pack');
if (want && PACKS.some((p) => p.id === want)) openSetup(PACKS.find((p) => p.id === want));

// Your recent rounds, with live status. Rounds deleted by their creator (or after 90 days) drop off the list.
async function showMine() {
  const mine = store.json('rounds', []).slice(0, 8);
  if (!mine.length) return;
  const rows = await Promise.all(mine.map(async (r) => {
    try {
      const s = await api('/rounds/' + r.id, { token: store.get('t:' + r.id) });
      const done = s.members.filter((m) => m.answered).length;
      const st = s.round.revealed ? (s.me && s.me.answers ? 'Revealed' : 'Revealed · your turn')
        : s.me && s.me.answers ? `${done} of ${s.round.size} answered` : 'Your turn';
      return { ...r, title: s.round.title, emoji: s.round.emoji, st, hot: /turn/.test(st) };
    } catch (e) {
      if (e.status === 404) { forgetRound(r.id); return null; }
      return { ...r, st: new Date(r.at).toLocaleDateString([], { day: 'numeric', month: 'short' }) };
    }
  }));
  const live = rows.filter(Boolean);
  if (!live.length) return;
  $('#mine').classList.remove('hidden');
  $('#mine-list').innerHTML = live.map((r) => `<li><span style="font-size:22px">${esc(r.emoji || '🙊')}</span><a href="/r/${esc(r.id)}"><b>${esc(r.title)}</b></a><span class="st${r.hot ? ' hot' : ''}">${esc(r.st)}</span></li>`).join('');
}
showMine();
