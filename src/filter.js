// Text cleanup and a small PG-13 word filter for nicknames, titles and custom statements.
// Deliberately short: it catches the obvious words; the creator sees and controls everything in their round.
const SUB = ['fuck', 'nigg', 'porn', 'blowjob', 'handjob', 'orgasm', 'vagina', 'whore', 'killyourself'];
const WORD = ['cunt', 'shit', 'shitty', 'dick', 'cock', 'pussy', 'sex', 'sexy', 'sexting', 'nude', 'naked', 'boob', 'tit', 'tits', 'penis',
  'cum', 'jizz', 'slut', 'rape', 'raped', 'fag', 'faggot', 'retard', 'retarded', 'cocaine', 'heroin', 'meth', 'weed', 'mdma',
  'ecstasy', 'kys', 'suicide', 'nazi', 'hitler', 'bitch', 'bitches', 'horny', 'stoned', 'wank', 'wanker', 'twat', 'bastard'];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };

export function cleanText(raw, max) {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function isBlocked(s) {
  const t = String(s).toLowerCase().replace(/[013457@$]/g, (c) => LEET[c] || c);
  const squashed = t.replace(/[^a-z]/g, '');
  if (SUB.some((w) => squashed.includes(w))) return true;
  const words = t.split(/[^a-z]+/).filter(Boolean).map((w) => w.replace(/(es|s)$/, (m) => (w.length > 4 ? '' : m)));
  return words.some((w) => WORD.includes(w));
}
