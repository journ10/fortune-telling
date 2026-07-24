/* eslint-disable no-console */
// P0 美术修复验证截图脚本（一次性使用）
// 流程：AI 配置（假值）→ 提问 → 开始起卦 → 空格投掷 → 等待铜钱落定 → 截图
const { chromium } = require('playwright');

const BASE = process.env.APP_URL || 'http://localhost:5199/fortune-telling/';
const OUT_DIR = process.env.OUT_DIR;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[PBR]') || msg.type() === 'error') {
      console.log(`[browser:${msg.type()}]`, text);
    }
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // 1. AI 配置（填假值仅为通过表单）
  await page.fill('#ai-api-url', 'https://example.invalid/v1');
  await page.fill('#ai-api-key', 'sk-test-screenshot');
  await page.fill('#ai-model', 'test-model');
  await page.click('button.primaryButton');
  await page.waitForTimeout(500);

  // 2. 提问对话框 → 选快捷问题 → 开始起卦
  await page.click('.quickButton');
  await page.click('text=开始起卦');
  await page.waitForTimeout(4000); // 等 PBR 贴图 + Rapier 初始化

  await page.screenshot({ path: `${OUT_DIR}/after-casting-hover.png` });
  console.log('saved hover shot');

  if (!process.env.SKIP_TOSS) {
    // 3. 空格触发一次键盘投掷
    await page.focus('.coinInteractionSurface');
    await page.keyboard.press('Space');

    // 4. 等待铜钱落定（审计记录单次落定约 8 秒，给足余量）
    await page.waitForTimeout(25000);
    await page.screenshot({ path: `${OUT_DIR}/final-settled.png` });
    console.log('saved final settled shot');
  }

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
