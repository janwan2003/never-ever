import { $, esc, api, store, rememberRound, forgetRound, toast, avatar, whenText, shareLink } from './common.js';
import { analyse, analyseCounts, surprises, shortNames } from './game.js';
import { drawCard } from './card.js';

const id = location.pathname.split('/')[2];
const app = $('#app');

// A personal link (#k=<token>) signs you in on another device; strip it from the address bar.
const k = new URLSearchParams(location.hash.slice(1)).get('k');
if (k) { store.set('t:' + id, k); history.replaceState(null, '', location.pathname); }

let token = store.get('t:' + id);
let state = null;
let editing = false;
let answers = '';
let slide = -1; // -1 = reveal intro, 0..n-1 slides, n = end screen
let pollTimer = null;
let result = null;

async function load() {
  try {
    state = await api('/rounds/' + id, { token });
  } catch (e) {
    $('#head').classList.add('hidden');
    if (e.status === 404) {
      forgetRound(id);
      app.innerHTML = `<div class="panel center"><div class="seal">🫥</div><h2>Round not found</h2><p class="muted">${esc(e.message)}</p><a class="btn have" href="/#packs">Start a new round</a></div>`;
    } else {
      app.innerHTML = `<div class="panel center"><div class="seal">📡</div><h2>Couldn't load the round</h2><p class="muted">${esc(e.message)}</p><button class="btn have" id="retry-load">Try again</button></div>`;
      $('#retry-load').onclick = () => { app.innerHTML = '<div class="panel center muted">Loading…</div>'; load(); };
    }
    return;
  }
  if (token && !state.me) { store.del('t:' + id); token = null; }
  if (state.me) rememberRound({ id, title: state.round.title, emoji: state.round.emoji });
  render();
}

function head() {
  const r = state.round;
  const done = state.members.filter((m) => m.answered).length;
  $('#head').classList.remove('hidden');
  $('#h-emoji').textContent = r.emoji;
  $('#h-title').textContent = r.title;
  document.title = `${r.title} · Fess Up`;
  const by = r.creatorName ? `Started by ${esc(r.creatorName)}` : '';
  const late = r.deadline <= state.now;
  $('#h-sub').innerHTML = r.revealed
    ? `${by} · revealed · ${done} played`
    : `${by} · ${done} of ${r.size} answered · ${late ? 'reveals with the first answer' : `reveal by ${esc(whenText(r.deadline, state.now))}`}`;
}

function render() {
  clearInterval(pollTimer);
  head();
  if (!state.me) return renderJoin();
  if (!state.me.answers || editing) return renderPlay();
  if (!state.round.revealed) return renderWait();
  return renderReveal();
}

function renderJoin() {
  const r = state.round;
  const lead = r.revealed
    ? `<h2>The results are in 👀</h2><p class="muted">Answer the ${r.statements.length} statements to see what everyone said.</p>`
    : `<h2>You're invited</h2><p class="muted">${r.creatorName ? esc(r.creatorName) + ' started a round of' : 'A round of'} <b>Never have I ever</b>. Tap I have, Never or Pass on ${r.statements.length} statements. Nobody sees your answers until the reveal.</p>`;
  app.innerHTML = `<form class="panel" id="join" novalidate>${lead}
    <label class="field" for="nick">Your nickname</label>
    <input type="text" id="nick" maxlength="24" autocomplete="nickname" placeholder="e.g. Tom" value="${esc(store.get('nick') || '')}">
    <p class="err" id="j-err" role="alert"></p>
    <button class="btn have block" type="submit">Play</button>
    <p class="muted small center" style="margin:12px 0 0">No app, no account. ${r.anonymous ? 'Anonymous round: the reveal shows counts, not names.' : 'Pass is always allowed.'}</p></form>`;
  $('#join').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = $('#nick').value.trim();
    if (!nickname) { $('#j-err').textContent = 'Type a nickname.'; $('#nick').focus(); return; }
    const b = e.submitter || $('#join button');
    b.disabled = true;
    try {
      const res = await api(`/rounds/${id}/join`, { method: 'POST', body: { nickname } });
      token = res.token;
      store.set('t:' + id, token);
      store.set('nick', nickname);
      await load();
    } catch (err) { $('#j-err').textContent = err.message; b.disabled = false; }
  });
}

function renderPlay() {
  const st = state.round.statements;
  answers = store.get('p:' + id) || '';
  if (answers.length > st.length) answers = '';
  const draw = () => {
    const i = answers.length;
    if (i >= st.length) return submit();
    app.innerHTML = `<div class="panel pop" id="play">
      <div class="progress" aria-label="Statement ${i + 1} of ${st.length}">${st.map((_, j) => `<i class="${j < i ? 'done' : j === i ? 'cur' : ''}"></i>`).join('')}</div>
      <div class="stmt" id="stmt"><span class="lead">Never have I ever…</span>${esc(st[i])}</div>
      <div class="answer-btns">
        <button class="btn have" data-a="h">✋ I have</button>
        <button class="btn never" data-a="n">🙅 Never</button>
        <button class="btn pass" data-a="p">Pass</button>
      </div>
      <div class="play-foot"><button class="btn ghost" id="back"${i ? '' : ' style="visibility:hidden"'}>← Back</button><span class="muted small">${i + 1} / ${st.length}</span></div>
    </div>`;
    app.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
      answers += b.dataset.a;
      store.set('p:' + id, answers);
      draw();
    }));
    $('#back').onclick = () => { answers = answers.slice(0, -1); store.set('p:' + id, answers); draw(); };
  };
  // Keyboard: H / N / P to answer, Backspace to go back.
  document.onkeydown = (e) => {
    if (!$('#play') || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    const map = { h: 'h', y: 'h', n: 'n', p: 'p' };
    if (map[key]) { e.preventDefault(); app.querySelector(`[data-a="${map[key]}"]`).click(); }
    else if (key === 'backspace' && answers.length) { e.preventDefault(); $('#back').click(); }
  };
  const submit = async () => {
    app.innerHTML = `<div class="panel center"><div class="seal">✉️</div><h2>Sealing your answers…</h2></div>`;
    try {
      state = await api(`/rounds/${id}/answers`, { method: 'POST', body: { answers }, token });
      store.del('p:' + id);
      editing = false;
      render();
    } catch (e) {
      app.innerHTML = `<div class="panel center"><h2>Not sent</h2><p class="err">${esc(e.message)}</p><button class="btn have" id="retry">Try again</button></div>`;
      $('#retry').onclick = submit;
    }
  };
  draw();
}

function inviteText() {
  return `Never have I ever: "${state.round.title}". Answer in secret, the reveal is when we've all played 👀`;
}
const roundUrl = () => `${location.origin}/r/${id}`;

function renderWait() {
  const r = state.round, me = state.me;
  const done = state.members.filter((m) => m.answered).length;
  const left = Math.max(0, r.size - done);
  app.innerHTML = `<div class="panel center pop">
      <div class="seal">🔒</div>
      <h2>Your answers are sealed</h2>
      <p class="muted">Nobody sees anything until the reveal: when ${left} more ${left === 1 ? 'person answers' : 'people answer'}, or ${esc(whenText(r.deadline, state.now))}, whichever is first.</p>
      <div class="meter"><b style="width:${Math.min(100, Math.round((done * 100) / r.size))}%"></b></div>
      <p class="small muted">${done} of ${r.size} answered</p>
      <button class="btn have block" id="share">Send the link to the group</button>
    </div>
    <div class="panel"><h3>Who's in</h3><ul class="people">${state.members.map((m) => `<li>${avatar(m.nickname)}<span>${esc(m.nickname)}${m.id === me.id ? ' <span class="muted small">(you)</span>' : ''}</span>
      <span class="st${m.answered ? ' done' : ''}">${m.answered ? '✓ answered' : 'playing…'}</span>
      ${me.isCreator && m.id !== me.id ? `<button class="x" data-rm="${esc(m.id)}" aria-label="Remove ${esc(m.nickname)}">×</button>` : ''}</li>`).join('')}</ul>
      ${me.isCreator ? `<button class="btn secondary block" id="reveal"${done < 2 ? ' disabled' : ''}>Reveal now</button><p class="muted small center" style="margin:8px 0 0">${done < 2 ? 'You can reveal early once 2 people have answered.' : 'Only you can do this, because you started the round.'}</p>` : ''}
    </div>
    <div class="actions">
      <button class="btn ghost" id="edit">Change my answers</button>
      <button class="btn ghost" id="mylink">Use on another device</button>
      <button class="btn ghost" id="leave">${me.isCreator ? 'Delete the round' : 'Leave the round'}</button>
    </div>`;
  $('#share').onclick = () => shareLink({ title: r.title, text: inviteText(), url: roundUrl() });
  $('#edit').onclick = () => { editing = true; store.del('p:' + id); render(); };
  $('#mylink').onclick = async () => {
    const url = `${roundUrl()}#k=${token}`;
    try { await navigator.clipboard.writeText(url); toast('Your personal link is copied. Keep it to yourself.'); } catch { prompt('Your personal link (keep it to yourself):', url); }
  };
  $('#leave').onclick = async () => {
    if (!confirm(me.isCreator ? 'Delete this round for everyone?' : 'Leave this round? Your answers are removed.')) return;
    try {
      if (me.isCreator) await api('/rounds/' + id, { method: 'DELETE', token });
      else await api(`/rounds/${id}/leave`, { method: 'POST', body: {}, token });
      forgetRound(id);
      location.href = '/';
    } catch (e) { toast(e.message); }
  };
  if (me.isCreator) {
    $('#reveal').onclick = async () => {
      try { state = await api(`/rounds/${id}/reveal`, { method: 'POST', body: {}, token }); render(); } catch (e) { toast(e.message); }
    };
    app.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => {
      if (!confirm('Remove this player and their answers?')) return;
      try { state = await api(`/rounds/${id}/remove`, { method: 'POST', body: { memberId: b.dataset.rm }, token }); render(); } catch (e) { toast(e.message); }
    }));
  }
  pollTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const next = await api('/rounds/' + id, { token });
      const changed = JSON.stringify(next.members) !== JSON.stringify(state.members) || next.round.revealed !== state.round.revealed;
      state = next;
      if (changed) render(); else head();
    } catch {}
  }, 8000);
}

function computeResult() {
  const r = state.round, res = state.results;
  if (!res) return null;
  return res.anonymous ? analyseCounts(r.statements, res.counts, res.n) : analyse(r.statements, res.players, res.answers);
}

function renderReveal() {
  result = computeResult();
  if (!result) return renderWait();
  const seen = store.get('seen:' + id);
  if (slide === -1 && seen) slide = result.items.length;
  if (slide === -1) {
    app.innerHTML = `<div class="panel center pop"><div class="seal">📬</div><h2>The answers are in</h2>
      <p class="muted">${result.n} played${state.round.anonymous ? ' · anonymous round, counts only' : ''}. One statement at a time.</p>
      <button class="btn have block" id="go">Start the reveal</button>
      <button class="btn ghost" id="skip" style="margin-top:6px">Skip to the results</button></div>`;
    $('#go').onclick = () => { slide = 0; renderReveal(); };
    $('#skip').onclick = () => { slide = result.items.length; store.set('seen:' + id, '1'); renderReveal(); };
    return;
  }
  if (slide < result.items.length) return renderSlide();
  store.set('seen:' + id, '1');
  renderEnd();
}

function counts(it) {
  return it.have ? { h: it.have.length, n: it.never.length, p: it.pass.length } : { h: it.haveN, n: it.neverN, p: it.passN };
}

function renderSlide() {
  const it = result.items[slide];
  const c = counts(it);
  const named = !!it.have;
  const total = c.h + c.n + c.p || 1;
  app.innerHTML = `<div class="panel slide pop">
    <div class="count">${slide + 1} of ${result.items.length}</div>
    <div class="stmt" style="min-height:0;margin-bottom:8px"><span class="lead">Never have I ever…</span>${esc(it.text)}</div>
    <div class="bar" role="img" aria-label="${c.h} have, ${c.n} never, ${c.p} passed">
      <span class="h" style="flex-grow:0"></span><span class="n" style="flex-grow:0"></span><span class="p" style="flex-grow:0"></span></div>
    <div class="legend"><span><i style="background:var(--have)"></i>${c.h} have</span><span><i style="background:var(--never)"></i>${c.n} never</span>${c.p ? `<span><i style="background:var(--pass)"></i>${c.p} passed</span>` : ''}</div>
    <p class="line ${it.line.kind}">${esc(it.line.text)}</p>
    ${named ? `<div class="chips">${it.have.map((n) => `<span class="chip h">✋ ${esc(n)}</span>`).join('')}${it.never.map((n) => `<span class="chip n">${esc(n)}</span>`).join('')}${it.pass.map((n) => `<span class="chip p">${esc(n)} · pass</span>`).join('')}</div>` : ''}
    <div class="slide-nav"><button class="btn secondary" id="prev"${slide ? '' : ' disabled'}>←</button><button class="btn have" id="next">${slide === result.items.length - 1 ? 'See the end card' : 'Next'}</button></div>
  </div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const spans = app.querySelectorAll('.bar span');
    [c.h, c.n, c.p].forEach((v, i) => { spans[i].style.flexGrow = String(v / total); spans[i].textContent = v ? v : ''; });
  }));
  $('#prev').onclick = () => { slide--; renderReveal(); };
  $('#next').onclick = () => { slide++; renderReveal(); window.scrollTo({ top: 0 }); };
}

function renderEnd() {
  const r = state.round;
  const sp = surprises(result, 3);
  const notYet = state.members.filter((m) => !m.answered);
  app.innerHTML = `
    <div class="panel pop"><h2>${esc(r.title)}: the results</h2>
      <p class="muted">${result.n} played · as a group you have done ${result.groupPct}% of these.</p>
      ${result.awards.length ? `<div class="awards">${result.awards.map((a) => `<div class="award"><div class="e">${a.emoji}</div><div class="t">${esc(a.title)}</div><div class="n">${esc(shortNames(a.names))}</div><div class="d">${esc(a.detail)}</div></div>`).join('')}</div>` : ''}
      ${sp.length ? `<h3 style="margin-top:18px">The surprises</h3>${sp.map((s) => `<div class="surprise">${esc(s.text)}</div>`).join('')}` : ''}
    </div>
    <div class="panel"><h3>The card for the chat</h3>
      <img class="card-preview" id="card-img" alt="Results card for ${esc(r.title)}">
      <div class="btn-row"><button class="btn have" id="share-card" style="flex:1">Share the card</button><button class="btn secondary" id="replay">Replay</button></div>
    </div>
    <div class="cta-next"><h2>Now try it on another group</h2>
      <p>Your family, your work chat, your old school friends: who would be the only one?</p>
      <div class="btn-row"><a class="btn" href="/?pack=${esc(r.packId)}">Play ${esc(r.packName)} with another group</a><a class="btn secondary" href="/#packs">Pick another pack</a></div>
    </div>
    <div class="panel"><h3>Everyone's answers</h3>${gridHtml()}
      ${notYet.length ? `<p class="muted small" style="margin-top:10px">Still to play: ${esc(notYet.map((m) => m.nickname).join(', '))}. Their answers are added when they play.</p>` : ''}
      <button class="btn ghost" id="share-link">Share the round link</button>
    </div>`;
  $('#replay').onclick = () => { slide = 0; renderReveal(); window.scrollTo({ top: 0 }); };
  $('#share-link').onclick = () => shareLink({ title: r.title, text: `The "${r.title}" results are in. Play to see them 👀`, url: roundUrl() });
  let blob = null;
  drawCard(r, result, sp, location.host).then((b) => { blob = b; $('#card-img').src = URL.createObjectURL(b); }).catch(() => $('#card-img').remove());
  $('#share-card').onclick = async () => {
    if (!blob) return;
    const file = new File([blob], 'fess-up-results.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: r.title, text: `Our "${r.title}" results 👀 ${roundUrl()}` }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'fess-up-results.png';
    document.body.append(a); a.click(); a.remove();
    toast('Card saved. Press and hold the image to save it on a phone.');
  };
  pollTimer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const next = await api('/rounds/' + id, { token });
      if (next.members.filter((m) => m.answered).length !== state.members.filter((m) => m.answered).length) { state = next; renderReveal(); }
    } catch {}
  }, 20000);
}

function gridHtml() {
  const st = state.round.statements;
  if (state.results.anonymous) {
    return `<div class="grid-wrap"><table class="grid"><thead><tr><th>Never have I ever…</th><th>Have</th><th>Never</th><th>Pass</th></tr></thead><tbody>${result.items.map((it) => `<tr><td>${esc(it.text)}</td><td class="h">${it.haveN}</td><td class="n">${it.neverN}</td><td class="p">${it.passN}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const ps = state.results.players;
  const sym = { h: '✋', n: '✕', p: '–' };
  return `<div class="grid-wrap"><table class="grid"><thead><tr><th>Never have I ever…</th>${ps.map((p) => `<th title="${esc(p.nickname)}">${esc(p.nickname)}</th>`).join('')}</tr></thead><tbody>${st.map((s, i) => `<tr><td>${esc(s)}</td>${ps.map((p) => { const a = state.results.answers[p.id][i]; return `<td class="${a}">${sym[a]}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
  <p class="muted small" style="margin-top:8px">✋ I have &nbsp; ✕ never &nbsp; – passed</p>`;
}

load();
