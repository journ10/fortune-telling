/* A/B 实验：定位铜钱过曝来源（环境贴图 / bloom / SSAO） */
const { chromium } = require('playwright');

const BASE = process.env.APP_URL || 'http://localhost:5199/fortune-telling/';
const OUT_DIR = process.env.OUT_DIR;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.fill('#ai-api-url', 'https://example.invalid/v1');
  await page.fill('#ai-api-key', 'sk-test-screenshot');
  await page.fill('#ai-model', 'test-model');
  await page.click('button.primaryButton');
  await page.waitForTimeout(500);
  await page.click('.quickButton');
  await page.click('text=开始起卦');
  await page.waitForTimeout(4000);

  // 实验 1：关闭环境贴图
  await page.evaluate(() => {
    const scene = window.__tabletop.parent;
    window.__savedEnv = scene.environment;
    scene.environment = null;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT_DIR}/exp-no-env.png` });
  console.log('shot: no env');

  // 实验 2：恢复环境，硬币材质 envMapIntensity = 0
  await page.evaluate(() => {
    const scene = window.__tabletop.parent;
    scene.environment = window.__savedEnv;
    scene.traverse((obj) => {
      if (!obj.isMesh || obj === window.__tabletop) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => { m.envMapIntensity = 0; m.needsUpdate = true; });
    });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT_DIR}/exp-zero-coin-env.png` });
  console.log('shot: coin env 0');

  // 实验 3：硬币 metalness 归零（纯介质 + albedo）
  await page.evaluate(() => {
    const scene = window.__tabletop.parent;
    scene.traverse((obj) => {
      if (!obj.isMesh || obj === window.__tabletop) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => { m.metalness = 0; m.metalnessMap = null; m.needsUpdate = true; });
    });
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT_DIR}/exp-no-metal.png` });
  console.log('shot: no metal');

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
