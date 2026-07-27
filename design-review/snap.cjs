/* eslint-disable no-console */
// 快速单帧截图：桌面首帧观感迭代用
const { chromium } = require('playwright');

const BASE = process.env.APP_URL || 'http://localhost:5199/';
const OUT = process.env.OUT || 'design-review/scene-iter.png';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => !document.body.textContent.includes('物理引擎加载中'),
    { timeout: 30000 }
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT });
  await browser.close();
  console.log('done');
})();
