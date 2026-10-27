/** 轻量图片处理：读取为 data URL，过大的图片用 canvas 等比压缩后再保存 */

const PASS_THROUGH_BYTES = 250 * 1024; // 小于 250KB 直接保留原图
const MAX_EDGE = 1400; // 压缩后最长边
const JPEG_QUALITY = 0.82;

/** 单条安排最多带几张图（服务端按同样上限校验） */
export const MAX_ITEM_IMAGES = 9;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解析失败'));
    image.src = src;
  });
}

/** 把任意值收敛成合法的图片数组：过滤空值与非 data URL，并限制张数 */
export function cleanImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((one): one is string => typeof one === 'string' && one.startsWith('data:image/'))
    .slice(0, MAX_ITEM_IMAGES);
}

export async function imageFileToDataUrl(file: File): Promise<string> {
  const original = await readAsDataUrl(file);
  if (file.size <= PASS_THROUGH_BYTES) return original;

  const image = await loadImage(original);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext('2d');
  if (!context) return original;

  // 透明背景转 JPEG 时补白底，避免出现黑块
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}
