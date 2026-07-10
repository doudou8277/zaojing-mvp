/**
 * 造境 ZaoJing 图片存储模块
 * 将 AI 生成的图片保存为文件，返回 URL 路径
 * 替代 Base64 传输，减少网络负载和内存占用
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

// 生成的图片存储目录
const GENERATED_DIR = path.join(__dirname, 'generated');

// 确保目录存在（异步）
async function ensureDir() {
  try {
    await fsp.access(GENERATED_DIR);
  } catch (e) {
    // 目录不存在，创建它
    logger.debug({ err: e.message, dir: GENERATED_DIR }, '图片存储目录不存在，将创建');
    await fsp.mkdir(GENERATED_DIR, { recursive: true });
    logger.info({ dir: GENERATED_DIR }, '创建图片存储目录');
  }
}

// 确保目录存在（同步，仅用于模块初始化）
function ensureDirSync() {
  if (!fs.existsSync(GENERATED_DIR)) {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
    logger.info({ dir: GENERATED_DIR }, '创建图片存储目录');
  }
}
ensureDirSync();

/**
 * 从 base64 字符串检测图片格式（通过魔数/magic bytes）
 * @param {string} base64Data - 纯 base64 字符串（不含 data: 前缀）
 * @returns {string} 格式：'jpg'/'png'/'webp'/'gif'
 */
function detectImageFormatFromBase64(base64Data) {
  if (!base64Data) return 'png';
  try {
    // 解码前几个字节来检测魔数
    const header = Buffer.from(base64Data.substring(0, 30), 'base64');
    // JPEG: FF D8 FF
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
      return 'jpg';
    }
    // PNG: 89 50 4E 47
    if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) {
      return 'png';
    }
    // WEBP: RIFF....WEBP
    if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) {
      if (header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50) {
        return 'webp';
      }
    }
    // GIF: GIF8
    if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) {
      return 'gif';
    }
  } catch (e) {
    logger.warn({ err: e.message }, '图片格式检测失败');
  }
  return 'png';
}

/**
 * 将 Base64 图片保存为文件
 * 支持传入带 data:image 前缀的完整 dataURL，或纯 base64 字符串
 * @param {string} data - 不含 data:image 前缀的 base64 字符串，或完整 dataURL
 * @param {string} [format] - 图片格式，如 'png'/'webp'/'jpg'；若传入 dataURL 则自动检测
 * @returns {{ url: string, format: string }} 图片的 URL 路径和格式
 */
function saveBase64Image(data, format) {
  ensureDirSync();

  let base64Data = data;
  let detectedFormat = format || null;

  // 检测 data:image 前缀，自动判断格式
  const dataUrlMatch = data.match(/^data:image\/(webp|png|jpeg|jpg);base64,(.+)$/);
  if (dataUrlMatch) {
    detectedFormat = detectedFormat || (dataUrlMatch[1] === 'jpeg' ? 'jpg' : dataUrlMatch[1]);
    base64Data = dataUrlMatch[2];
  }

  // 如果没有指定格式，从 base64 内容检测
  if (!detectedFormat) {
    detectedFormat = detectImageFormatFromBase64(base64Data);
  }

  const finalFormat = detectedFormat || 'png';

  // 生成唯一文件名：基于内容 hash
  const hash = crypto.createHash('md5').update(base64Data).digest('hex').substring(0, 16);
  const filename = `${hash}.${finalFormat}`;
  const filepath = path.join(GENERATED_DIR, filename);

  // 如果文件已存在（相同内容），直接返回 URL
  if (fs.existsSync(filepath)) {
    return { url: `/generated/${filename}`, format: finalFormat };
  }

  // 写入文件
  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(filepath, buffer);

  logger.info({ filename, sizeKB: Math.round(buffer.length / 1024), format: finalFormat }, '图片已保存为文件');

  return { url: `/generated/${filename}`, format: finalFormat };
}

/**
 * 从 URL 下载图片并保存为文件
 * @param {string} imageUrl - 远程图片 URL
 * @returns {Promise<{url: string, format: string}>} 本地图片的 URL 路径和格式
 */
async function downloadAndSaveImage(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`下载图片失败: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 从 Content-Type 或 URL 推断格式
    const contentType = response.headers.get('content-type') || '';
    let format = 'jpg';
    if (contentType.includes('png')) format = 'png';
    else if (contentType.includes('webp')) format = 'webp';
    else if (contentType.includes('gif')) format = 'gif';
    else if (buffer[0] === 0xff && buffer[1] === 0xd8) format = 'jpg';
    else if (buffer[0] === 0x89 && buffer[1] === 0x50) format = 'png';

    ensureDirSync();

    // 生成唯一文件名
    const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 16);
    const filename = `${hash}.${format}`;
    const filepath = path.join(GENERATED_DIR, filename);

    // 如果文件已存在，直接返回
    if (fs.existsSync(filepath)) {
      return { url: `/generated/${filename}`, format };
    }

    fs.writeFileSync(filepath, buffer);

    logger.info({ filename, sizeKB: Math.round(buffer.length / 1024) }, '远程图片已下载保存');

    return { url: `/generated/${filename}`, format };
  } catch (error) {
    logger.error({ err: error.message, url: imageUrl }, '下载图片失败');
    throw error;
  }
}

/**
 * 清理过期的生成图片（超过指定天数的文件）
 * 异步实现，避免阻塞事件循环
 * @param {number} maxAgeDays - 最大保留天数
 */
async function cleanupOldImages(maxAgeDays) {
  maxAgeDays = maxAgeDays || 7;
  await ensureDir();

  const files = await fsp.readdir(GENERATED_DIR);
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  let deleted = 0;

  for (const file of files) {
    const filepath = path.join(GENERATED_DIR, file);
    const stats = await fsp.stat(filepath);
    if (now - stats.mtimeMs > maxAgeMs) {
      await fsp.unlink(filepath);
      deleted++;
    }
  }

  if (deleted > 0) {
    logger.info({ deleted, maxAgeDays }, '清理过期图片');
  }
}

module.exports = {
  saveBase64Image,
  downloadAndSaveImage,
  cleanupOldImages,
  detectImageFormatFromBase64,
  GENERATED_DIR,
};
