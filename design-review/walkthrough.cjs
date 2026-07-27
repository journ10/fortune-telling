/* eslint-disable no-console */
// 视觉重设计走查截图（一次性）：桌面 → 提问 → 蓄力 → 首爻判词 → 六爻完成 → 卦单
const { chromium } = require('playwright');

const BASE = process.env.APP_URL || 'http://localhost:5199/';
const OUT = process.env.OUT_DIR || 'design-review';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  // 等物理引擎就绪（不再显示加载文案）
  await page.waitForFunction(
    () => !document.body.textContent.includes('物理引擎加载中'),
    { timeout: 30000 }
  );
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/01-desktop.png` });

  // 提问
  await page.getByRole('button', { name: '问事（可选）' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/02-question.png` });
  await page.getByLabel(/所问何事/).fill('今年事业走向如何');
  await page.getByRole('button', { name: '记下' }).click();
  await page.waitForTimeout(300);

  // 六爻：按住空格蓄力 → 松手 → 等落定判词
  for (let i = 1; i <= 6; i++) {
    await page.keyboard.down(' ');
    await page.waitForTimeout(700);
    if (i === 1) {
      await page.screenshot({ path: `${OUT}/03-charging.png` });
    }
    await page.keyboard.up(' ');
    // 等待本爻判词出现（ready）或结果（第六爻）
    await page
      .waitForSelector('[data-testid="line-verdict"]', { timeout: 8000 })
      .catch(() => console.log(`[warn] line ${i} verdict timeout`));
    if (i === 1) {
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${OUT}/04-verdict.png` });
    }
    await page.waitForTimeout(400);
  }

  // 卦单
  await page.waitForSelector('.resultPanel', { timeout: 8000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/05-result.png` });

  // 卦单滚动到证据与 AI 区块
  await page.evaluate(() => {
    const body = document.querySelector('.resultBody');
    if (body) body.scrollTop = body.scrollHeight;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/06-result-evidence.png` });

  await browser.close();
  console.log('done');
})();
