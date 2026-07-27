"""
PBR Texture Pipeline — 从 AI 生成的原图生成完整 PBR 贴图组。

输入: public/textures/raw/*.png
输出: public/textures/pbr/*.png

每张原图生成:
- albedo: 基础颜色，去除背景杂色
- normal: 灰度高度图 → 法线贴图
- roughness: 铜锈/凹陷 = 粗糙，金属高光 = 光滑
- metalness: 青铜/黄铜 = 高金属度，铜锈/氧化 = 低金属度
- ao: 凹陷/孔洞 = 暗，凸起 = 亮
"""

import os
from PIL import Image, ImageFilter, ImageEnhance
import numpy as np

RAW_DIR = "public/textures/raw"
OUT_DIR = "public/textures/pbr"
os.makedirs(OUT_DIR, exist_ok=True)


def load_image(path: str) -> Image.Image:
    img = Image.open(path).convert("RGBA")
    # 统一缩放到 768x768（单张贴图 ≤500KB 预算）
    if img.size != (768, 768):
        img = img.resize((768, 768), Image.LANCZOS)
    return img


def save_image(img: Image.Image, path: str):
    if img.mode == "RGBA":
        img.save(path)
    else:
        img.convert("L").save(path)


def extract_rgb(img: Image.Image) -> np.ndarray:
    """提取 RGB 通道为 float32 numpy 数组，范围 [0,1]"""
    return np.array(img.convert("RGB"), dtype=np.float32) / 255.0


def extract_alpha(img: Image.Image) -> np.ndarray:
    """提取 alpha 通道"""
    return np.array(img.split()[3], dtype=np.float32) / 255.0


def array_to_image(arr: np.ndarray, mode="RGB") -> Image.Image:
    """numpy 数组转 PIL Image"""
    arr = np.clip(arr, 0, 1)
    if mode == "L" and arr.ndim > 2:
        arr = arr.squeeze()
    return Image.fromarray((arr * 255).astype(np.uint8), mode=mode)


def save_image(img_or_arr, path: str, max_size: int = None):
    if isinstance(img_or_arr, np.ndarray):
        img = array_to_image(img_or_arr, mode="RGB" if img_or_arr.ndim == 3 else "L")
    else:
        img = img_or_arr
    if max_size is not None and img.size[0] > max_size:
        img = img.resize((max_size, max_size), Image.LANCZOS)
    if img.mode in ("RGB", "RGBA"):
        img.save(path, optimize=True)
    else:
        img.convert("L").save(path, optimize=True)


# RGB 彩图（albedo/normal）PNG 压缩率差，768² 会突破 500KB/张预算；
# 降到 512² 输出——铜钱在屏幕上仅几百像素，肉眼无差。
COLOR_MAP_SIZE = 512


def sobel_height_map(rgb: np.ndarray) -> np.ndarray:
    """从 RGB 生成灰度高度图（亮度 + 饱和度混合）"""
    # 亮度
    lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    # 饱和度作为高度补充（铜锈区域通常饱和度较低，但纹理变化大）
    max_c = np.max(rgb, axis=2)
    min_c = np.min(rgb, axis=2)
    sat = max_c - min_c
    # 混合：亮度为主，饱和度变化为辅
    height = lum * 0.7 + sat * 0.3
    return height


def height_to_normal(height: np.ndarray, strength: float = 2.0) -> np.ndarray:
    """灰度高度图 → 切线空间法线贴图"""
    h, w = height.shape
    # Sobel 算子计算梯度
    gy, gx = np.gradient(height)
    # 缩放梯度强度
    gx *= strength
    gy *= strength
    # 切线空间法线: (-dx, -dy, 1)
    normal = np.zeros((h, w, 3), dtype=np.float32)
    normal[:, :, 0] = -gx
    normal[:, :, 1] = -gy
    normal[:, :, 2] = 1.0
    # 归一化
    norm = np.linalg.norm(normal, axis=2, keepdims=True)
    norm[norm == 0] = 1
    normal = normal / norm
    # 映射到 [0, 1] (RGB 中 0.5 是中性)
    normal = normal * 0.5 + 0.5
    return normal


def generate_roughness(rgb: np.ndarray, is_coin: bool = True) -> np.ndarray:
    """
    Roughness: 0 = 镜面光滑, 1 = 完全粗糙
    铜锈/氧化/凹陷 = 粗糙 (高值)
    金属高光/干净铜面 = 光滑 (低值)
    """
    lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    max_c = np.max(rgb, axis=2)
    min_c = np.min(rgb, axis=2)
    sat = max_c - min_c

    if is_coin:
        # 铜钱逻辑：
        # - 暗色/低饱和区域（铜锈）= 粗糙
        # - 亮色/高饱和区域（黄铜）= 光滑
        # - 越亮越光滑，越暗越粗糙
        # 基础粗糙度从亮度反推
        rough = 1.0 - lum * 0.6  # 暗处粗糙
        # 铜锈（偏绿青）区域增加粗糙度
        green_dominant = (rgb[:, :, 1] > rgb[:, :, 0]) & (rgb[:, :, 1] > rgb[:, :, 2])
        rough[green_dominant] += 0.15
        # 高光区域（亮度高且饱和中等）稍微光滑
        highlight = (lum > 0.5) & (sat < 0.3)
        rough[highlight] -= 0.1
        # 边缘磨损区域（亮度高且饱和低）中等粗糙
        edge_wear = (lum > 0.5) & (sat < 0.15)
        rough[edge_wear] += 0.05
    else:
        # 桌面逻辑：
        # - 深色漆 = 较光滑
        # - 划痕 = 粗糙
        # - 整体较光滑但有变化
        rough = 0.15 + (1.0 - lum) * 0.15  # 基础 0.15-0.3
        # 划痕检测：亮度突变区域
        gy, gx = np.gradient(lum)
        edge_mag = np.sqrt(gx**2 + gy**2)
        scratch = edge_mag > 0.05
        rough[scratch] += 0.15

    return np.clip(rough, 0, 1)


def generate_metalness(rgb: np.ndarray, is_coin: bool = True) -> np.ndarray:
    """
    Metalness: 0 = 非金属, 1 = 纯金属
    青铜/黄铜 = 高金属度
    铜锈/氧化/木头 = 低金属度
    """
    if not is_coin:
        # 桌面几乎无金属
        return np.full(rgb.shape[:2], 0.05, dtype=np.float32)

    lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    max_c = np.max(rgb, axis=2)
    min_c = np.min(rgb, axis=2)
    sat = max_c - min_c

    # 基础金属度：亮色高金属，暗色低金属
    metal = lum * 0.8
    # 暖色调（黄/橙/棕）= 铜/青铜 = 高金属
    warm = (rgb[:, :, 0] > 0.3) & (rgb[:, :, 0] > rgb[:, :, 2] * 1.2) & (rgb[:, :, 1] > 0.2)
    metal[warm] += 0.2
    # 绿色/青色（铜锈）= 低金属
    patina = (rgb[:, :, 1] > rgb[:, :, 0]) & (rgb[:, :, 1] > rgb[:, :, 2])
    metal[patina] *= 0.3
    # 暗色氧化层 = 低金属
    dark = lum < 0.25
    metal[dark] *= 0.5
    # 高光点（可能过曝）需要抑制金属度
    overexposed = (rgb[:, :, 0] > 0.9) & (rgb[:, :, 1] > 0.9) & (rgb[:, :, 2] > 0.9)
    metal[overexposed] = 0.1

    return np.clip(metal, 0, 1)


def generate_ao(rgb: np.ndarray, alpha: np.ndarray = None, is_coin: bool = True) -> np.ndarray:
    """
    AO: 0 = 完全遮蔽（暗），1 = 无遮蔽（亮）
    凹陷/孔洞 = 暗，凸起 = 亮
    """
    lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]

    # 基础 AO 从亮度推导：暗处 = 更多遮蔽
    ao = 0.6 + lum * 0.4

    # 方孔区域（alpha = 0）设为完全遮蔽（黑）
    if alpha is not None:
        ao[alpha < 0.1] = 0.0

    if is_coin:
        # 文字凹陷：字周围稍微暗一点（模拟字槽）
        # 通过边缘检测找到高对比度区域
        gy, gx = np.gradient(lum)
        edge_mag = np.sqrt(gx**2 + gy**2)
        # 高对比度边缘附近稍微压暗（模拟凹陷）
        ao -= edge_mag * 0.15
        # 内环区域（文字面）整体稍暗
        h, w = ao.shape
        cx, cy = w // 2, h // 2
        Y, X = np.ogrid[:h, :w]
        dist = np.sqrt((X - cx)**2 + (Y - cy)**2)
        inner_ring = (dist > w * 0.15) & (dist < w * 0.42)
        ao[inner_ring] -= 0.03

    return np.clip(ao, 0, 1)


def disc_alpha_mask(alpha: np.ndarray) -> np.ndarray:
    """
    圆形钱体 alpha 裁切：原图 alpha 只抠了方孔，钱体圆外是不透明白底。
    位移浮雕面片用 alphaTest 裁圆，需要圆外 alpha = 0。
    钱体图案半径 ~487px（0.951 × 512）；UV 收缩 0.94 后钱缘采样到 ~481px，
    因此在 482→494px 之间线性衰减，既保住钱缘图案又裁掉白边。
    """
    h, w = alpha.shape
    cx, cy = w / 2, h / 2
    Y, X = np.ogrid[:h, :w]
    dist = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
    inner, outer = 361.0, 370.0
    falloff = np.clip((outer - dist) / (outer - inner), 0.0, 1.0)
    return alpha * falloff


def generate_coin_height(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """
    高度图：字口/郭缘是亮黄铜（高），钱面铜锈凹陷是暗（低）。
    大半径高斯模糊压掉锈斑噪点，只留浮雕级结构；圆外与方孔归零。
    """
    lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    height_img = Image.fromarray((np.clip(lum, 0, 1) * 255).astype(np.uint8), mode="L")
    height_img = height_img.filter(ImageFilter.GaussianBlur(radius=5))
    height = np.array(height_img, dtype=np.float32) / 255.0
    # 钱体范围内做 2%~98% 归一化拉伸，充分利用位移量程
    valid = alpha > 0.5
    if valid.any():
        lo, hi = np.percentile(height[valid], [2, 98])
        height = (height - lo) / max(hi - lo, 1e-4)
    height = np.clip(height, 0, 1)
    height[alpha < 0.5] = 0.0
    return height


# 熟铜渐变映射：亮度 → 颜色。原图接近灰度，靠亮度上色：
# 凹陷处青绿锈（低亮度带绿，后续 patina 启发式会正确判为低金属），
# 中间古铜，高处熟铜，磨损亮部暖黄铜。
COLORIZE_RAMP = [
    (0.0, (0x12, 0x0d, 0x08)),
    (0.28, (0x3f, 0x4a, 0x2e)),
    (0.45, (0x5c, 0x45, 0x26)),
    (0.68, (0x8a, 0x62, 0x34)),
    (0.85, (0xc0, 0x95, 0x53)),
    (1.0, (0xef, 0xd4, 0x9a)),
]


def colorize_coin(rgb: np.ndarray) -> np.ndarray:
    """灰度铜钱 → 熟铜/锈绿双色映射（保留亮度结构，替换色相）。"""
    lum = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    out = np.zeros_like(rgb)
    stops_t = [stop[0] for stop in COLORIZE_RAMP]
    stops_c = np.array(
      [[channel / 255.0 for channel in stop[1]] for stop in COLORIZE_RAMP],
      dtype=np.float32,
    )
    for channel in range(3):
        out[:, :, channel] = np.interp(lum, stops_t, stops_c[:, channel])
    # 保留少量原始色相（约 18%），避免完全平色
    return np.clip(out * 0.82 + rgb * 0.18, 0, 1)


def process_coin(name: str, raw_path: str, out_prefix: str):
    """处理铜钱正/背面"""
    print(f"Processing coin: {name}")
    img = load_image(raw_path)
    rgb = colorize_coin(extract_rgb(img))
    alpha = disc_alpha_mask(extract_alpha(img))

    # Albedo: RGB 单独保存（压缩率）；alpha 独立为 mask（圆外与方孔 = 0），
    # 供材质 alphaMap + alphaTest 裁切钱体圆与方孔
    save_image(
        array_to_image(rgb, mode="RGB"),
        f"{OUT_DIR}/{out_prefix}-albedo.png",
        max_size=COLOR_MAP_SIZE,
    )
    save_image(
        array_to_image(alpha[:, :, np.newaxis], mode="L"),
        f"{OUT_DIR}/{out_prefix}-mask.png"
    )

    # Normal
    height = sobel_height_map(rgb)
    normal = height_to_normal(height, strength=3.0)
    # 方孔区域的法线应该指向 Z（中性）
    normal[alpha < 0.1] = [0.5, 0.5, 1.0]
    save_image(
        array_to_image(normal, mode="RGB"),
        f"{OUT_DIR}/{out_prefix}-normal.png",
        max_size=COLOR_MAP_SIZE,
    )

    # Height（位移浮雕用）
    coin_height = generate_coin_height(rgb, alpha)
    save_image(
        array_to_image(coin_height[:, :, np.newaxis], mode="L"),
        f"{OUT_DIR}/{out_prefix}-height.png"
    )

    # Roughness (grayscale)
    rough = generate_roughness(rgb, is_coin=True)
    rough[alpha < 0.1] = 0.5  # 方孔区域中性粗糙度
    save_image(array_to_image(rough[:, :, np.newaxis], mode="L"), f"{OUT_DIR}/{out_prefix}-roughness.png")

    # Metalness (grayscale)
    metal = generate_metalness(rgb, is_coin=True)
    metal[alpha < 0.1] = 0.0  # 方孔无金属
    save_image(array_to_image(metal[:, :, np.newaxis], mode="L"), f"{OUT_DIR}/{out_prefix}-metalness.png")

    # AO (grayscale)
    ao = generate_ao(rgb, alpha, is_coin=True)
    save_image(array_to_image(ao[:, :, np.newaxis], mode="L"), f"{OUT_DIR}/{out_prefix}-ao.png")

    print(f"  ✓ {out_prefix}-{{albedo,normal,roughness,metalness,ao}}.png")


def process_table(name: str, raw_path: str, out_prefix: str):
    """处理桌面纹理"""
    print(f"Processing table: {name}")
    img = load_image(raw_path)
    rgb = extract_rgb(img)

    # Albedo
    save_image(
        array_to_image(rgb, mode="RGB"),
        f"{OUT_DIR}/{out_prefix}-albedo.png",
        max_size=COLOR_MAP_SIZE,
    )

    # Normal
    height = sobel_height_map(rgb)
    # 桌面纹理较平，降低法线强度
    normal = height_to_normal(height, strength=1.5)
    save_image(
        array_to_image(normal, mode="RGB"),
        f"{OUT_DIR}/{out_prefix}-normal.png",
        max_size=COLOR_MAP_SIZE,
    )

    # Roughness
    rough = generate_roughness(rgb, is_coin=False)
    save_image(array_to_image(rough[:, :, np.newaxis], mode="L"), f"{OUT_DIR}/{out_prefix}-roughness.png")

    # Metalness
    metal = generate_metalness(rgb, is_coin=False)
    save_image(array_to_image(metal[:, :, np.newaxis], mode="L"), f"{OUT_DIR}/{out_prefix}-metalness.png")

    # AO
    ao = generate_ao(rgb, None, is_coin=False)
    save_image(array_to_image(ao[:, :, np.newaxis], mode="L"), f"{OUT_DIR}/{out_prefix}-ao.png")

    print(f"  ✓ {out_prefix}-{{albedo,normal,roughness,metalness,ao}}.png")


def main(ctx):
    print("=" * 50)
    print("PBR Texture Pipeline")
    print("=" * 50)

    process_coin("heads", f"{RAW_DIR}/coin-heads-raw.png", "coin-heads")
    process_coin("tails", f"{RAW_DIR}/coin-tails-raw.png", "coin-tails")
    process_table("table", f"{RAW_DIR}/table-raw.png", "table")

    print("=" * 50)
    print("All PBR textures generated successfully!")
    print(f"Output: {OUT_DIR}/")
    print("=" * 50)

    # List output files
    files = sorted(os.listdir(OUT_DIR))
    for f in files:
        size = os.path.getsize(os.path.join(OUT_DIR, f))
        print(f"  {f:40s} {size/1024:6.1f} KB")

    return {"output_dir": OUT_DIR, "files": files}


if __name__ == "__main__":
    main(None)
