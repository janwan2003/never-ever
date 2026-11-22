// Renders public/og.png (1200x630) from tools/og.html and the PNG app icons from public/icon.svg.
// Usage: node tools/render-images.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root = path.join(os.homedir(), '.cache/ms-playwright');
const dir = fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()[0];
const browser = await chromium.launch({ executablePath: path.join(root, dir, 'chrome-linux64/chrome') });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto('file://' + path.resolve('tools/og.html'));
await page.screenshot({ path: 'public/og.png' });
const svg = fs.readFileSync('public/icon.svg', 'utf8');
for (const size of [180, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: `public/icon-${size}.png`, omitBackground: true });
}
await browser.close();
