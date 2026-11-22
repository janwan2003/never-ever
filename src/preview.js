// Link-preview text for /r/<id>: round name and live state, never anyone's answers.
function untilText(ms) {
  const h = Math.round(ms / 3600e3);
  if (ms < 3600e3) return 'within the hour';
  if (h < 24) return `in ${h} h`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? '' : 's'}`;
}

export function previewText(p, now = Date.now()) {
  if (!p) return { title: 'Fess Up · Never have I ever, for group chats', desc: 'This round was deleted. Start your own: pick a pack, share one link, answers stay sealed until everyone has played.' };
  const title = `${p.emoji} ${p.title} · Fess Up`;
  if (p.revealed) {
    return { title, desc: `Revealed · ${p.answered} played. Tap I have / Never / Pass on ${p.count} statements to see who has done what.` };
  }
  const left = p.size - p.answered;
  if (p.deadline <= now) {
    return { title, desc: `${p.answered} of ${p.size} have answered · the reveal opens with the next answer. ${p.count} quick taps each, answers sealed until the reveal.` };
  }
  return {
    title,
    desc: `${p.answered} of ${p.size} have answered · reveal ${left > 0 ? `when ${left} more ${left === 1 ? 'does' : 'do'} or ` : ''}${untilText(p.deadline - now)}. ${p.count} quick taps each, answers sealed until the reveal.`,
  };
}

