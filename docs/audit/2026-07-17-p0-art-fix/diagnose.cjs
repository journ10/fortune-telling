/* 诊断：进入起卦场景后 dump 所有网格材质参数，并现场调节参数做 A/B 截图 */
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

  const info = await page.evaluate(() => {
    const scene = window.__tabletop && window.__tabletop.parent;
    if (!scene) return { error: 'no scene' };
    const out = [];
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        out.push({
          mesh: obj.name || obj.type,
          geo: obj.geometry && obj.geometry.type,
          matType: m.type,
          color: m.color && m.color.getHexString(),
          metalness: m.metalness,
          roughness: m.roughness,
          clearcoat: m.clearcoat,
          envMapIntensity: m.envMapIntensity,
          emissive: m.emissive && m.emissive.getHexString(),
          emissiveIntensity: m.emissiveIntensity,
          hasMap: Boolean(m.map),
          hasMetalMap: Boolean(m.metalnessMap),
          hasRoughMap: Boolean(m.roughnessMap),
          hasNormalMap: Boolean(m.normalMap),
          toneMapped: m.toneMapped
        });
      });
    });
    return {
      envInt: scene.environmentIntensity,
      hasEnv: Boolean(scene.environment),
      bg: scene.background && scene.background.getHexString ? scene.background.getHexString() : String(scene.background),
      meshes: out
    };
  });
  console.log(JSON.stringify(info, null, 1));

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
