// Fess Up reveal logic. Pure functions shared by the browser (reveal + end card) and the Worker (link previews).
// A statement is a past-participle phrase ("cried at a work party") that reads after "Never have I ever",
// "Only Maya has" and "Nobody has ever". Answers are strings with one letter per statement:
// h = I have, n = never, p = pass.

export const PREFIX = 'Never have I ever';

export function sentence(s) {
  return `${PREFIX} ${s}.`;
}

function listNames(names) {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Named mode: per-statement breakdown with names. players = [{id, nickname}], answers = {id: 'hnp…'}.
export function analyse(statements, players, answers) {
  const ps = players.filter((p) => typeof answers[p.id] === 'string');
  const items = statements.map((s, i) => {
    const have = [], never = [], pass = [];
    for (const p of ps) {
      const a = answers[p.id][i];
      (a === 'h' ? have : a === 'n' ? never : pass).push(p.nickname);
    }
    return { text: s, have, never, pass, line: lineFor(s, have.length, never.length, pass.length, { have, never }) };
  });
  return { n: ps.length, items, awards: awards(statements, ps, answers, items), groupPct: groupPct(items) };
}

// Anonymous mode: counts only. counts = [{have, never, pass}] per statement.
export function analyseCounts(statements, counts, n) {
  const items = statements.map((s, i) => {
    const c = counts[i] || { have: 0, never: 0, pass: 0 };
    return { text: s, haveN: c.have, neverN: c.never, passN: c.pass, line: lineFor(s, c.have, c.never, c.pass, null) };
  });
  return { n, items, awards: [], groupPct: groupPct(items) };
}

function groupPct(items) {
  let h = 0, a = 0;
  for (const it of items) {
    const hv = it.have ? it.have.length : it.haveN;
    const nv = it.never ? it.never.length : it.neverN;
    h += hv; a += hv + nv;
  }
  return a ? Math.round((h * 100) / a) : 0;
}

// names = {have, never} in named mode, null in anonymous mode.
export function lineFor(s, h, nv, p, names) {
  const answered = h + nv;
  const passNote = p ? ` (${p} passed)` : '';
  if (answered === 0) return { kind: 'pass', rank: 0, text: 'Everyone passed on this one.' };
  if (h === 0) return { kind: 'nobody', rank: answered >= 3 ? 3 : 1, text: `Nobody has ever ${s}${passNote}.` };
  if (h === 1 && answered >= 3) {
    return { kind: 'only', rank: 5, text: names ? `Only ${names.have[0]} has ${s}!` : `Only one of you has ${s}!` };
  }
  if (nv === 0 && h >= 2) {
    return { kind: 'everyone', rank: 2, text: p ? `Everyone who answered has ${s}${passNote}.` : `Everyone has ${s}.` };
  }
  if (nv === 1 && h >= 2 && p === 0) {
    return { kind: 'allbut', rank: 4, text: names ? `Everyone but ${names.never[0]} has ${s}.` : `All but one of you have ${s}.` };
  }
  return { kind: 'split', rank: 1, text: `${h} of ${answered} ${h === 1 ? 'has' : 'have'} ${s}${passNote}.` };
}

function awards(statements, ps, answers, items) {
  if (ps.length < 2) return [];
  const out = [];
  const stats = ps.map((p) => {
    const a = answers[p.id];
    let h = 0, n = 0, x = 0;
    for (let i = 0; i < statements.length; i++) {
      if (a[i] === 'h') h++; else if (a[i] === 'n') n++; else x++;
    }
    return { p, h, n, x };
  });
  const total = statements.length;
  const maxH = Math.max(...stats.map((s) => s.h));
  const minH = Math.min(...stats.map((s) => s.h));
  if (maxH > minH) {
    const top = stats.filter((s) => s.h === maxH).map((s) => s.p.nickname);
    const low = stats.filter((s) => s.h === minH).map((s) => s.p.nickname);
    out.push({ key: 'experienced', emoji: '🏆', title: 'Most experienced', names: top, detail: `${maxH}/${total} I have`,
      text: `Most experienced: ${listNames(top)} (${maxH}/${total})` });
    out.push({ key: 'innocent', emoji: '😇', title: 'Most innocent', names: low, detail: `${minH}/${total} I have`,
      text: `Most innocent: ${listNames(low)} (${minH}/${total})` });
  }
  const maxX = Math.max(...stats.map((s) => s.x));
  if (maxX >= 2) {
    const m = stats.filter((s) => s.x === maxX).map((s) => s.p.nickname);
    if (m.length <= 2) out.push({ key: 'mystery', emoji: '🕵️', title: 'Biggest mystery', names: m, detail: `passed ${maxX} times`,
      text: `Biggest mystery: ${listNames(m)} (passed ${maxX})` });
  }
  // Lone wolf: most "Only X has…" moments.
  const only = new Map();
  for (const it of items) if (it.line.kind === 'only') only.set(it.have[0], (only.get(it.have[0]) || 0) + 1);
  if (only.size) {
    const best = Math.max(...only.values());
    const names = [...only].filter(([, v]) => v === best).map(([k]) => k);
    if (names.length <= 2) out.push({ key: 'lone', emoji: '🐺', title: 'Lone wolf', names, detail: `the only one ${best}×`,
      text: `Lone wolf: ${listNames(names)} (the only one ${best}×)` });
  }
  // Answer twins: the pair with the most identical non-pass answers.
  if (ps.length >= 3) {
    let best = null;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = answers[ps[i].id], b = answers[ps[j].id];
      let same = 0;
      for (let k = 0; k < total; k++) if (a[k] !== 'p' && a[k] === b[k]) same++;
      if (!best || same > best.same) best = { same, names: [ps[i].nickname, ps[j].nickname] };
    }
    if (best && best.same >= Math.ceil(total * 0.6)) out.push({ key: 'twins', emoji: '👯', title: 'Answer twins', names: best.names,
      detail: `${best.same}/${total} the same`, text: `Answer twins: ${best.names[0]} & ${best.names[1]} (${best.same}/${total} the same)` });
  }
  return out;
}

// The most surprising lines, for the end card and link preview.
export function surprises(result, max = 3) {
  return result.items
    .map((it, i) => ({ ...it.line, i }))
    .filter((l) => l.rank >= 2)
    .sort((a, b) => b.rank - a.rank || a.i - b.i)
    .slice(0, max);
}
