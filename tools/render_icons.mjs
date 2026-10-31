// Renders icons/icon.svg to the PNG app icons.
// Dev-only: needs Playwright + Chromium (npm i -D playwright && npx playwright install chromium).
// PNGs are full-bleed (no rounded corners) because phones apply their own mask.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../icons/', import.meta.url));
const svg = readFileSync(dir + 'icon.svg', 'utf8').replace('rx="112"', 'rx="0"');

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `${dir}icon-${size}.png` });
  console.log('wrote', size);
}
await browser.close();
