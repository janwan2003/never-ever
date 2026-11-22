import test from 'node:test';
import assert from 'node:assert/strict';
import { analyse, analyseCounts, lineFor, surprises } from '../../public/game.js';
import { PACKS } from '../../public/packs.js';
import { isBlocked, cleanText } from '../../src/filter.js';
import { previewText } from '../../src/preview.js';

const S = ['cried at a work party', 'fallen asleep in a cinema', 'broken a bone', 'met a celebrity'];
const P = [{ id: 'a', nickname: 'Maya' }, { id: 'b', nickname: 'Tom' }, { id: 'c', nickname: 'Priya' }, { id: 'd', nickname: 'Sam' }];

test('lines: only, nobody, everyone, all-but, split', () => {
  const r = analyse(S, P, { a: 'hnhn', b: 'nnhh', c: 'nnhp', d: 'nnnh' });
  assert.equal(r.items[0].line.text, 'Only Maya has cried at a work party!');
  assert.equal(r.items[1].line.text, 'Nobody has ever fallen asleep in a cinema.');
  assert.equal(r.items[2].line.text, 'Everyone but Sam has broken a bone.');
  assert.equal(r.items[3].line.kind, 'split');
  assert.equal(r.items[3].line.text, '2 of 3 have met a celebrity (1 passed).');
  assert.equal(r.n, 4);
});

test('players without answers are ignored', () => {
  const r = analyse(S, P, { a: 'hhhh', b: 'hhhh' });
  assert.equal(r.n, 2);
  assert.equal(r.items[0].line.text, 'Everyone has cried at a work party.');
});

test('awards: experienced, innocent, twins, lone wolf', () => {
  const r = analyse(S, P, { a: 'hhhh', b: 'nnnn', c: 'nnnn', d: 'nnhn' });
  const k = Object.fromEntries(r.awards.map((a) => [a.key, a]));
  assert.deepEqual(k.experienced.names, ['Maya']);
  assert.deepEqual(k.innocent.names, ['Tom', 'Priya']);
  assert.deepEqual(k.twins.names, ['Tom', 'Priya']);
  assert.deepEqual(k.lone.names, ['Maya']);
});

test('anonymous counts never carry names', () => {
  const r = analyseCounts(S, [{ have: 1, never: 4, pass: 0 }, { have: 0, never: 5, pass: 0 }, { have: 4, never: 1, pass: 0 }, { have: 5, never: 0, pass: 0 }], 5);
  assert.equal(r.items[0].line.text, 'Only one of you has cried at a work party!');
  assert.equal(r.items[2].line.text, 'All but one of you have broken a bone.');
  assert.equal(r.awards.length, 0);
  assert.equal(r.groupPct, 50);
});

test('surprises rank only-lines first', () => {
  const r = analyse(S, P, { a: 'hnhn', b: 'nnhh', c: 'nnhp', d: 'nnnh' });
  assert.equal(surprises(r)[0].kind, 'only');
});

test('every pack statement reads after all four lead-ins', () => {
  assert.equal(PACKS.length, 12);
  for (const p of PACKS) {
    assert.equal(p.statements.length, 10, p.id);
    for (const s of p.statements) {
      assert.match(s, /^[a-z]/, s);
      assert.doesNotMatch(s, /[.!?]$/, s);
      assert.doesNotMatch(s, /\b(my|your|I|me)\b/, s);
      assert.ok(!isBlocked(s), 'pack statement blocked by filter: ' + s);
      assert.ok(lineFor(s, 1, 3, 0, { have: ['Maya'], never: [] }).text.startsWith('Only Maya has '));
    }
  }
});

test('filter catches obvious words, allows ordinary ones', () => {
  for (const bad of ['fuck it', 'sh1t', 'sexy time', 'weed']) assert.ok(isBlocked(bad), bad);
  for (const ok of ['Dickens fan', 'Sussex', 'Essex trip', 'Scunthorpe', 'cocktail', 'Maya', 'shitake']) assert.ok(!isBlocked(ok), ok);
  assert.equal(cleanText('  a <b>  c  ', 20), 'a b c');
});

test('preview text shows live state, never answers', () => {
  const now = Date.now();
  const t = previewText({ title: 'Xmas', emoji: '🎄', size: 7, answered: 4, joined: 5, deadline: now + 5 * 3600e3, revealed: false, count: 10 }, now);
  assert.equal(t.title, '🎄 Xmas · Fess Up');
  assert.match(t.desc, /^4 of 7 have answered · reveal when 3 more do or in 5 h\./);
  assert.match(previewText({ title: 'X', emoji: '🎄', answered: 6, revealed: true, count: 10 }).desc, /^Revealed · 6 played/);
});

test('shortNames keeps big ties short', async () => {
  const { shortNames } = await import('../../public/game.js');
  assert.equal(shortNames(['Ben']), 'Ben');
  assert.equal(shortNames(['Ben', 'Cat', 'Dan']), 'Ben, Cat and Dan');
  assert.equal(shortNames(['A', 'B', 'C', 'D', 'E']), 'A, B and 3 more');
});

test('preview after a missed deadline does not promise a time in the past', () => {
  const now = Date.UTC(2026, 11, 1, 12);
  const t = previewText({ title: 'X', emoji: '🎄', size: 5, answered: 0, joined: 2, deadline: now - 60e3, revealed: false, count: 10 }, now);
  assert.match(t.desc, /^0 of 5 have answered · the reveal opens with the next answer/);
});
