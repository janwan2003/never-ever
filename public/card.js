// Draws the 1080×1350 results card for the chat (a PNG Blob). Names appear only in named rounds.
const W = 1080, H = 1350;

function wrap(ctx, text, maxW) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function drawCard(round, result, surprises, host) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const font = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#1f1633'); g.addColorStop(1, '#3a2a6b');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#ff5a4e'; x.beginPath(); x.arc(W - 90, 90, 260, 0, Math.PI * 2); x.globalAlpha = .18; x.fill(); x.globalAlpha = 1;

  let y = 120;
  x.fillStyle = '#ffb4ad'; x.font = font(800, 34);
  x.fillText('NEVER HAVE I EVER', 80, y);
  y += 84;
  x.fillStyle = '#fff'; x.font = font(850, 72);
  for (const l of wrap(x, `${round.emoji} ${round.title}`, W - 160).slice(0, 2)) { x.fillText(l, 80, y); y += 84; }
  x.fillStyle = '#c9c1dd'; x.font = font(600, 34);
  x.fillText(`${result.n} played · ${result.groupPct}% done as a group`, 80, y);
  y += 80;

  x.font = font(800, 50);
  for (const s of surprises.slice(0, 3)) {
    const lines = wrap(x, s.text, W - 200).slice(0, 3);
    const h = lines.length * 62 + 56;
    x.fillStyle = 'rgba(255,255,255,.08)';
    roundRect(x, 80, y, W - 160, h, 28); x.fill();
    x.fillStyle = s.kind === 'nobody' ? '#b9b4ff' : '#ffb4ad';
    let ly = y + 78;
    for (const l of lines) { x.fillText(l, 110, ly); ly += 62; }
    y += h + 26;
    x.fillStyle = '#fff';
  }

  const aw = result.awards.filter((a) => ['experienced', 'innocent', 'twins'].includes(a.key)).slice(0, 3);
  if (aw.length) {
    y += 46;
    x.font = font(700, 42);
    for (const a of aw) {
      x.fillStyle = '#c9c1dd';
      x.fillText(`${a.emoji} ${a.title}:`, 80, y);
      const tw = x.measureText(`${a.emoji} ${a.title}: `).width;
      x.fillStyle = '#fff'; x.font = font(800, 42);
      x.fillText(a.names.join(' & ').slice(0, 34), 80 + tw, y);
      x.font = font(700, 42);
      y += 68;
    }
  }

  x.fillStyle = '#ff5a4e';
  roundRect(x, 80, H - 170, W - 160, 96, 48); x.fill();
  x.fillStyle = '#fff'; x.font = font(800, 38); x.textAlign = 'center';
  x.fillText('Play your group on Fess Up', W / 2, H - 108);
  x.fillStyle = '#c9c1dd'; x.font = font(600, 28);
  x.fillText(host, W / 2, H - 36);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('no blob'))), 'image/png'));
}

function roundRect(x, l, t, w, h, r) {
  x.beginPath();
  x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r);
  x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
}
