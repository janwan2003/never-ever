// End-to-end test in real Chromium. Ann starts a Christmas round on desktop (with one statement of her own),
// Ben, Cat and Dan join from the link on phones. Answers stay sealed until the 4th answer reveals the round.
// Then: slideshow, end card, results grid, a late joiner (Eve), an anonymous round (no names in results),
// "Play this pack with another group", and deleting the round.
// Usage: BASE=http://127.0.0.1:8987 node tests/e2e/run.mjs   (screenshots go to shots/)
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8987';
const SHOTS = process.env.SHOTS || 'shots';
fs.mkdirSync(SHOTS, { recursive: true });

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = path.join(os.homedir(), '.cache/ms-playwright');
  for (const d of fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/2.24' };
const DESKTOP = { viewport: { width: 1280, height: 860 }, acceptDownloads: true };
const errors = [];
const browser = await chromium.launch({ executablePath: findChrome() });
const step = (s) => console.log('·', s);

async function person(label, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  return { label, ctx, page };
}
const shot = async (p, name, full = true) => { await p.page.waitForTimeout(450); return p.page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full }); };
const apiState = (p, rid) => p.page.evaluate(async (rid) => {
  const t = localStorage.getItem('fessup:t:' + rid);
  return (await fetch('/api/rounds/' + rid, { headers: t ? { 'x-token': t } : {} })).json();
}, rid);

async function play(p, pattern) {
  for (let i = 0; i < pattern.length; i++) {
    await p.page.locator('.play-foot .small', { hasText: `${i + 1} / ${pattern.length}` }).waitFor();
    await p.page.click(`[data-a="${pattern[i]}"]`);
  }
}
// Answer with the keyboard (H / N / P), the desktop shortcut.
async function playKeys(p, pattern) {
  for (let i = 0; i < pattern.length; i++) {
    await p.page.locator('.play-foot .small', { hasText: `${i + 1} / ${pattern.length}` }).waitFor();
    await p.page.keyboard.press(pattern[i]);
  }
}
// Phone layouts must never scroll sideways (wide tables scroll inside their own box).
async function noSideScroll(p, where) {
  const w = await p.page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(w[0] <= w[1], `${p.label} ${where}: page is ${w[0]}px wide in a ${w[1]}px viewport`);
}
async function join(p, url, nick) {
  await p.page.goto(url);
  await p.page.locator('#join').waitFor();
  await p.page.fill('#nick', nick);
  await p.page.click('#join button[type=submit]');
  await p.page.locator('#play').waitFor();
}

const A = { Ann: 'hnhnhnhnhnh', Ben: 'nnhnnnhnnnp', Cat: 'nnhhnnnnnnn', Dan: 'nnhnnnhnnnn' };
let ann, url, rid;
try {
  step('landing + create (desktop)');
  ann = await person('Ann', DESKTOP);
  await ann.page.goto(BASE + '/');
  await ann.page.locator('.pack.featured').waitFor();
  await shot(ann, 'landing-desktop');
  assert.equal(await ann.page.locator('.pack').count(), 12);
  await ann.page.click('.pack[data-id="christmas"]');
  await ann.page.locator('#setup[open]').waitFor();
  await ann.page.click('#s-go');
  assert.equal(await ann.page.locator('#s-err').innerText(), 'Type your nickname.');
  await ann.page.fill('#s-nick', 'Ann');
  await ann.page.click('#s-minus');
  await ann.page.click('details.list summary >> nth=0');
  await ann.page.fill('#s-c1', 'Never have I ever eaten snow.');
  await shot(ann, 'setup-desktop', false);
  await ann.page.click('#s-go');
  await ann.page.waitForURL(/\/r\/[a-z0-9]+$/);
  url = ann.page.url();
  rid = url.split('/').pop();
  step('Ann answers first (11 statements incl. her own)');
  await ann.page.locator('#play').waitFor();
  await shot(ann, 'play-desktop', false);
  const last = await ann.page.evaluate(async (rid) => (await (await fetch('/api/rounds/' + rid)).json()).round.statements.at(-1), rid);
  assert.equal(last, 'eaten snow');
  await playKeys(ann, A.Ann);
  await ann.page.locator('text=Your answers are sealed').waitFor();
  assert.match(await ann.page.locator('#h-sub').innerText(), /1 of 4 answered/);

  step('link preview shows live state');
  const html = await (await fetch(url)).text();
  assert.match(html, /<meta property="og:title" content="🎄 Christmas edition · Fess Up">/);
  assert.match(html, /og:description" content="1 of 4 have answered · reveal when 3 more do or/);

  step('Ben and Cat join on phones; sealing holds');
  const ben = await person('Ben', PHONE);
  await ben.page.goto(url);
  await ben.page.locator('#join').waitFor();
  await shot(ben, 'join-phone');
  await noSideScroll(ben, 'join');
  await ben.page.fill('#nick', 'Ben');
  await ben.page.click('#join button[type=submit]');
  await ben.page.locator('#play').waitFor();
  await ben.page.click('[data-a="h"]');
  await ben.page.click('#back');
  await shot(ben, 'play-phone');
  await play(ben, A.Ben);
  await ben.page.locator('text=Your answers are sealed').waitFor();
  let s = await apiState(ben, rid);
  assert.equal(s.results, null, 'no results before the reveal');
  assert.ok(!JSON.stringify(s.members).includes('hnhn'), 'no answers of others leak');
  assert.equal(s.me.answers, A.Ben);
  const cat = await person('Cat', PHONE);
  await cat.page.goto(url);
  await cat.page.fill('#nick', 'ben');
  await cat.page.click('#join button[type=submit]');
  await cat.page.locator('#j-err', { hasText: 'already called' }).waitFor();
  await cat.page.fill('#nick', 'Cat');
  await cat.page.click('#join button[type=submit]');
  await cat.page.locator('#play').waitFor();
  await play(cat, A.Cat);
  await cat.page.locator('text=Your answers are sealed').waitFor();
  await shot(cat, 'waiting-phone');
  await noSideScroll(cat, 'waiting');

  step('creator sees Reveal now enabled; Dan answers and the round reveals itself');
  await ann.page.reload();
  await ann.page.locator('#reveal:not([disabled])').waitFor();
  await shot(ann, 'waiting-creator-desktop');
  const dan = await person('Dan', PHONE);
  await join(dan, url, 'Dan');
  await play(dan, A.Dan);
  await dan.page.locator('text=The answers are in').waitFor();
  await dan.page.click('#go');
  const lines = [];
  for (let i = 0; i < 11; i++) {
    await dan.page.locator('.slide .count', { hasText: `${i + 1} of 11` }).waitFor();
    lines.push(await dan.page.locator('.slide .line').innerText());
    if (i === 0) { await dan.page.waitForTimeout(700); await shot(dan, 'reveal-slide-phone'); }
    await dan.page.click('#next');
  }
  assert.equal(lines[0], 'Only Ann has re-gifted a present!');
  assert.match(lines[1], /^Nobody has ever /);
  assert.match(lines[2], /^Everyone has /);
  await dan.page.locator('text=the results').first().waitFor();
  await dan.page.locator('#card-img[src^="blob:"]').waitFor();
  await dan.page.waitForTimeout(300);
  await shot(dan, 'results-phone');
  await noSideScroll(dan, 'results');
  const awardNames = await dan.page.locator('.award').allInnerTexts();
  assert.ok(awardNames.some((t) => /Most experienced[\s\S]*Ann/i.test(t)), 'Ann most experienced');
  assert.equal(await dan.page.locator('table.grid tbody tr').count(), 11);

  step('Ann sees results on desktop, saves the card');
  await ann.page.reload();
  await ann.page.locator('text=The answers are in').waitFor();
  await ann.page.click('#skip');
  await ann.page.locator('#card-img[src^="blob:"]').waitFor();
  await shot(ann, 'results-desktop');
  const [dl] = await Promise.all([ann.page.waitForEvent('download'), ann.page.click('#share-card')]);
  const cardPath = path.join(SHOTS, 'card.png');
  await dl.saveAs(cardPath);
  assert.ok(fs.statSync(cardPath).size > 20000, 'card PNG has content');
  const prev = await (await fetch(url)).text();
  assert.match(prev, /og:description" content="Revealed · 4 played/);

  step('late joiner Eve plays after the reveal and sees results');
  const eve = await person('Eve', PHONE);
  await eve.page.goto(url);
  await eve.page.locator('text=The results are in').waitFor();
  s = await apiState(eve, rid);
  assert.equal(s.results, null, 'results hidden until you answer');
  await eve.page.fill('#nick', 'Eve');
  await eve.page.click('#join button[type=submit]');
  await play(eve, 'nnnnnnnnnnn');
  await eve.page.click('#skip');
  await eve.page.locator('#h-sub', { hasText: '5 played' }).waitFor();

  step('anonymous round returns counts only');
  const anon = await ann.page.evaluate(async () => {
    const post = (p, b, t) => fetch('/api' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b) }).then((r) => r.json());
    const r = await post('/rounds', { packId: 'work', nickname: 'Ann', size: 2, anonymous: true });
    const j = await post(`/rounds/${r.id}/join`, { nickname: 'Zed' });
    await post(`/rounds/${r.id}/answers`, { answers: 'hhhhhhhhhh' }, r.token);
    const out = await post(`/rounds/${r.id}/answers`, { answers: 'nnnnnnnnnn' }, j.token);
    await fetch('/api/rounds/' + r.id, { method: 'DELETE', headers: { 'x-token': r.token } });
    return out;
  });
  assert.equal(anon.round.revealed, true);
  assert.equal(anon.results.anonymous, true);
  assert.equal(anon.results.players, undefined);
  assert.deepEqual(anon.results.counts[0], { have: 1, never: 1, pass: 0 });

  step('"Play this pack with another group" opens the setup sheet');
  await dan.page.click('text=Play Christmas with another group');
  await dan.page.locator('#setup[open] #s-name', { hasText: 'Christmas' }).waitFor();
  await shot(dan, 'replay-setup-phone', false);

  step('creator deletes the round');
  await ann.page.evaluate(async (rid) => {
    const t = localStorage.getItem('fessup:t:' + rid);
    await fetch('/api/rounds/' + rid, { method: 'DELETE', headers: { 'x-token': t } });
  }, rid);
  assert.equal((await fetch(BASE + '/api/rounds/' + rid)).status, 404);
  await ben.page.reload();
  await ben.page.locator('text=Round not found').waitFor();

  step('stress: 80-character statements and 24-character nicknames fit the card and the phone layout');
  const long = await ann.page.evaluate(async () => {
    const post = (p, b, t) => fetch('/api' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { 'x-token': t } : {}) }, body: JSON.stringify(b) }).then((r) => r.json());
    const custom = ['sent a five-minute voice note meant for my best friend to the whole family chat',
      'pretended to know every word of a carol for three verses at the office party'];
    const r = await post('/rounds', { packId: 'christmas', nickname: 'Bartholomew-Fitzgerald', size: 5, custom, title: 'The extremely long round name for the cousins chat 2026' });
    const names = ['Alexandrina Montgomery', 'Christopher Wellington', 'Maximiliana Rosenberg', 'Konstantinos Papadakis'];
    const toks = [r.token];
    for (const n of names) toks.push((await post(`/rounds/${r.id}/join`, { nickname: n })).token);
    const pats = ['hnnnnnnnnnhn', 'nhnnnnnnnnnh', 'nnhnnnnnnnnn', 'nnnhnnnnnnnn', 'nnnnhnnnnnnn'];
    for (let i = 0; i < toks.length; i++) await post(`/rounds/${r.id}/answers`, { answers: pats[i] }, toks[i]);
    return { id: r.id, token: toks[1], owner: r.token };
  });
  const lp = await person('Long', PHONE);
  await lp.page.goto(BASE + '/r/' + long.id + '#k=' + long.token);
  await lp.page.click('#skip');
  await lp.page.locator('#card-img[src^="blob:"]').waitFor();
  await noSideScroll(lp, 'long results');
  await shot(lp, 'results-long-phone');
  const longCard = await lp.page.evaluate(() => {
    const img = document.querySelector('#card-img');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(SHOTS, 'card-long.png'), Buffer.from(longCard, 'base64'));

  step('network failure shows a retry, not "not found"');
  await lp.page.route('**/api/rounds/**', (r) => r.abort());
  await lp.page.reload();
  await lp.page.locator('text=Couldn\'t load the round').waitFor();
  await lp.page.unroute('**/api/rounds/**');
  await lp.page.click('#retry-load');
  await lp.page.locator('text=the results').first().waitFor();

  step('home lists your rounds; every same-origin link works');
  await ann.page.goto(BASE + '/r/' + long.id + '#k=' + long.owner);
  await ann.page.locator('text=The answers are in').waitFor();
  await ann.page.goto(BASE + '/');
  await ann.page.locator('#mine:not(.hidden)').waitFor();
  const mineRows = await ann.page.locator('#mine-list li').allInnerTexts();
  assert.equal(mineRows.length, 1, 'the deleted Christmas round dropped off the list: ' + mineRows.join(' | '));
  assert.match(mineRows[0], /extremely long[\s\S]*Revealed/);
  await shot(ann, 'landing-mine-desktop', false);
  const hrefs = new Set();
  for (const pg of ['/', '/privacy', '/nope', '/r/' + long.id]) {
    await ann.page.goto(BASE + pg);
    await ann.page.waitForLoadState('networkidle');
    for (const h of await ann.page.$$eval('a[href], link[href], img[src], script[src]', (els) => els.map((e) => e.href || e.src))) hrefs.add(h.split('#')[0]);
  }
  for (const h of hrefs) {
    if (!h.startsWith(BASE)) continue;
    const st = (await fetch(h)).status;
    assert.ok(st === 200 || h.endsWith('/nope'), `${h} → ${st}`);
  }
  console.log(`  checked ${[...hrefs].filter((h) => h.startsWith(BASE)).length} same-origin links`);
  await ann.page.evaluate(async (l) => fetch('/api/rounds/' + l.id, { method: 'DELETE', headers: { 'x-token': l.owner } }), long);

  step('privacy + 404 pages');
  await ann.page.goto(BASE + '/privacy');
  await ann.page.locator('h1', { hasText: 'Privacy' }).waitFor();
  assert.equal((await fetch(BASE + '/nope')).status, 404);
  const landingPhone = await person('Phone', PHONE);
  await landingPhone.page.goto(BASE + '/');
  await landingPhone.page.locator('.pack.featured').waitFor();
  await shot(landingPhone, 'landing-phone');
  await noSideScroll(landingPhone, 'landing');
  await landingPhone.page.click('.pack.featured');
  await landingPhone.page.locator('#setup[open]').waitFor();
  await shot(landingPhone, 'setup-phone', false);

  const ignore = errors.filter((e) => !/status of (404|409)/.test(e) && !/^Long: .*ERR_FAILED/.test(e));
  assert.deepEqual(ignore, [], 'no console errors');
  console.log('E2E PASS', BASE);
} catch (e) {
  console.error('E2E FAIL', e);
  console.error('console errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
