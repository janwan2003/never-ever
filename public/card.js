// Draws the 1080×1350 results card for the chat (a PNG Blob). Names appear only in named rounds.
// Layout is measured, not fixed: the title, surprises and awards shrink or drop so nothing overlaps the footer,
// however long the statements (custom ones are up to 80 characters) or nicknames (up to 24) are.
import { shortNames } from './game.js';

const W = 1080, H = 1350, PAD = 80;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const font = (w, s) => `${w} ${s}px ${FONT}`;

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fit(ctx, kept[maxLines - 1] + ' ' + lines[maxLines], maxW);
    return kept;
  }
  return lines.map((l) => fit(ctx, l, maxW));
}

// Cut a single line with an ellipsis so it fits maxW.
function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

export async function drawCard(round, result, surprises, host) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#1f1633'); g.addColorStop(1, '#3a2a6b');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#ff5a4e'; x.beginPath(); x.arc(W - 90, 90, 260, 0, Math.PI * 2); x.globalAlpha = .18; x.fill(); x.globalAlpha = 1;

  // Header
  let y = 120;
  x.fillStyle = '#ffb4ad'; x.font = font(800, 34);
  x.fillText('NEVER HAVE I EVER', PAD, y);
  y += 84;
  x.fillStyle = '#fff'; x.font = font(850, 72);
  for (const l of wrap(x, `${round.emoji} ${round.title}`, W - 2 * PAD, 2)) { x.fillText(l, PAD, y); y += 84; }
  x.fillStyle = '#c9c1dd'; x.font = font(600, 34);
  x.fillText(fit(x, `${result.n} played · ${result.groupPct}% done as a group`, W - 2 * PAD), PAD, y);
  y += 70;

  // Footer (fixed) and awards (anchored above the footer)
  const footerTop = H - 170;
  const aw = result.awards.filter((a) => ['experienced', 'innocent', 'twins'].includes(a.key)).slice(0, 3);
  const awardRow = 62;
  const awardsTop = footerTop - 50 - aw.length * awardRow;
  if (aw.length) {
    let ay = awardsTop + 44;
    for (const a of aw) {
      x.font = font(700, 40);
      x.fillStyle = '#c9c1dd';
      const label = `${a.emoji} ${a.title}: `;
      x.fillText(label, PAD, ay);
      const tw = x.measureText(label).width;
      x.fillStyle = '#fff'; x.font = font(800, 40);
      x.fillText(fit(x, shortNames(a.names), W - 2 * PAD - tw), PAD + tw, ay);
      ay += awardRow;
    }
  }

  // Surprises fill the space between header and awards: try smaller sizes, then fewer boxes.
  const room = (aw.length ? awardsTop : footerTop - 30) - y;
  const boxW = W - 2 * PAD, inner = boxW - 60, gap = 22;
  let plan = null;
  for (let count = Math.min(3, surprises.length); count > 0 && !plan; count--) {
    for (const size of [50, 44, 38]) {
      x.font = font(800, size);
      const lh = Math.round(size * 1.24);
      const boxes = surprises.slice(0, count).map((s) => {
        const lines = wrap(x, s.text, inner, 3);
        return { s, lines, h: lines.length * lh + Math.round(size * 1.1) };
      });
      const total = boxes.reduce((t, b) => t + b.h, 0) + gap * (boxes.length - 1);
      if (total <= room) { plan = { size, lh, boxes }; break; }
    }
  }
  if (plan) {
    x.font = font(800, plan.size);
    for (const b of plan.boxes) {
      x.fillStyle = 'rgba(255,255,255,.08)';
      roundRect(x, PAD, y, boxW, b.h, 28); x.fill();
      x.fillStyle = b.s.kind === 'nobody' ? '#b9b4ff' : '#ffb4ad';
      let ly = y + Math.round(plan.size * 0.55) + plan.lh * 0.8;
      for (const l of b.lines) { x.fillText(l, PAD + 30, ly); ly += plan.lh; }
      y += b.h + gap;
    }
  }

  x.fillStyle = '#ff5a4e';
  roundRect(x, PAD, footerTop, W - 2 * PAD, 96, 48); x.fill();
  x.fillStyle = '#fff'; x.font = font(800, 38); x.textAlign = 'center';
  x.fillText('Play your group on Fess Up', W / 2, footerTop + 62);
  x.fillStyle = '#c9c1dd'; x.font = font(600, 28);
  x.fillText(host, W / 2, H - 36);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no blob'))), 'image/png'));
}

function roundRect(x, l, t, w, h, r) {
  x.beginPath();
  x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r);
  x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
}
