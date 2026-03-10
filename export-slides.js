// Exports every slide in vsl-graphics.html as a PNG.
// Usage:
//   npm install        (installs puppeteer — downloads Chromium on first run)
//   node export-slides.js
//
// Output: exports/G01.png, exports/G02.png, exports/G03-1.png, etc.

import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE      = `file://${resolve(__dirname, 'vsl-graphics.html')}`;
const OUT_DIR   = resolve(__dirname, 'exports');

mkdirSync(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch();
const page    = await browser.newPage();

// Match the slide canvas dimensions exactly
await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 2 });

await page.goto(FILE, { waitUntil: 'networkidle0' });

// Collect each slide's bounding box + label
const slides = await page.evaluate(() =>
  [...document.querySelectorAll('.slide')].map(slide => {
    const idEl = slide.querySelector('.gm-id');
    const label = idEl ? idEl.textContent.trim().replace(/\s+/g, '-') : null;
    const rect  = slide.getBoundingClientRect();
    return { label, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })
);

// Count labels so we can append -1, -2… when the same id repeats (e.g. G03)
const seen = {};
for (const slide of slides) {
  const base = slide.label ?? 'slide';
  seen[base] = (seen[base] ?? 0) + 1;
}
const count = {};
for (const slide of slides) {
  const base = slide.label ?? 'slide';
  count[base] = (count[base] ?? 0) + 1;
  slide.filename = seen[base] > 1 ? `${base}-${count[base]}` : base;
}

for (const slide of slides) {
  // Scroll the slide into view so it's fully painted
  await page.evaluate(label => {
    const el = [...document.querySelectorAll('.gm-id')]
      .find(e => e.textContent.trim() === label)
      ?.closest('.slide');
    el?.scrollIntoView();
  }, slide.label);

  const rect = await page.evaluate(filename => {
    const idEls = [...document.querySelectorAll('.gm-id')];
    // Re-query by filename prefix to handle numbered variants
    const base  = filename.replace(/-\d+$/, '');
    const index = parseInt(filename.match(/-(\d+)$/)?.[1] ?? '1') - 1;
    const matches = idEls.filter(e => e.textContent.trim() === base);
    const target  = matches[index] ?? matches[0];
    const slide   = target?.closest('.slide');
    if (!slide) return null;
    const r = slide.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, slide.filename);

  if (!rect) {
    console.warn(`Could not locate slide for ${slide.filename}, skipping`);
    continue;
  }

  const path = `${OUT_DIR}/${slide.filename}.png`;
  await page.screenshot({
    path,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  });
  console.log(`✓  ${slide.filename}.png`);
}

await browser.close();
console.log(`\nDone — ${slides.length} PNGs saved to /exports`);
