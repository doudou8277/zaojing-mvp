/**
 * 海报动效化工具
 * 将静态海报图片转为 5 秒短视频，支持三种动效模板
 * 使用 Canvas 逐帧渲染 + MediaRecorder API 录制 WebM
 */

import { logger } from './logger.js';
import { safeRevokeUrl } from './sanitize.js';

// 动效模板定义
export const ANIMATION_PRESETS = [
  { id: 'zoom', label: '镜头推进', desc: '缓慢放大，电影感推进' },
  { id: 'light', label: '光影流动', desc: '光影扫过画面，质感变化' },
  { id: 'text', label: '文字浮现', desc: '标题和金句逐渐显现' },
];

/**
 * 检查浏览器是否支持 MediaRecorder
 * @returns {boolean}
 */
export function isAnimationSupported() {
  if (typeof MediaRecorder === 'undefined') return false;
  try {
    return (
      MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ||
      MediaRecorder.isTypeSupported('video/webm')
    );
  } catch (e) {
    // 某些浏览器可能不支持 isTypeSupported 或在特定 codec 下抛出异常，视为不支持
    logger.debug('[poster-animator] MediaRecorder.isTypeSupported 检测异常，视为不支持:', e.message);
    return false;
  }
}

/**
 * 将静态海报转为动效视频
 * @param {Object} options
 * @param {string} options.dataUrl - 海报的 data URL
 * @param {string} options.effect - 动效类型: zoom | light | text
 * @param {number} options.duration - 视频时长（毫秒），默认 5000
 * @param {Function} options.onProgress - 进度回调 (0-1)
 * @returns {Promise<Blob>} - WebM 视频Blob
 */
export async function animatePoster({ dataUrl, effect = 'zoom', duration = 5000, onProgress }) {
  if (!isAnimationSupported()) {
    throw new Error('当前浏览器不支持视频录制，请使用 Chrome 或 Firefox');
  }

  // 加载海报图片
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');

  // 设置 MediaRecorder
  const stream = canvas.captureStream(30); // 30 FPS
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 });

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      resolve(blob);
    };
    recorder.onerror = (e) => reject(e.error || new Error('录制失败'));

    recorder.start();

    const fps = 30;
    const totalFrames = Math.ceil((duration / 1000) * fps);
    let currentFrame = 0;
    let rafId = null;
    let lastFrameTime = 0;
    const frameInterval = 1000 / fps;

    function renderFrame(timestamp) {
      if (currentFrame >= totalFrames) {
        recorder.stop();
        return;
      }

      // 使用 requestAnimationFrame + 时间差控制帧率，避免不必要的绘制
      if (!lastFrameTime) lastFrameTime = timestamp;
      const delta = timestamp - lastFrameTime;

      if (delta >= frameInterval) {
        lastFrameTime = timestamp - (delta % frameInterval);

        const progress = currentFrame / totalFrames;
        const t = progress; // 0 → 1

        // 清空画布
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        switch (effect) {
          case 'zoom':
            renderZoomFrame(ctx, img, canvas, t);
            break;
          case 'light':
            renderLightFrame(ctx, img, canvas, t);
            break;
          case 'text':
            renderTextFrame(ctx, img, canvas, t);
            break;
          default:
            renderZoomFrame(ctx, img, canvas, t);
        }

        if (onProgress) onProgress(progress);
        currentFrame++;
      }

      rafId = requestAnimationFrame(renderFrame);
    }

    rafId = requestAnimationFrame(renderFrame);
  });
}

/**
 * 镜头推进效果：从全画面缓慢放大到 110%
 */
function renderZoomFrame(ctx, img, canvas, t) {
  // 缓动函数：ease-out
  const eased = 1 - Math.pow(1 - t, 3);
  const easedScale = 1 + eased * 0.1;
  const ew = canvas.width * easedScale;
  const eh = canvas.height * easedScale;
  const ex = (canvas.width - ew) / 2;
  const ey = (canvas.height - eh) / 2;

  ctx.drawImage(img, ex, ey, ew, eh);

  // 渐晕效果（暗角）
  const gradient = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    canvas.width * 0.3,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width * 0.7
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${0.3 * t})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * 光影流动效果：光带从左到右扫过画面
 */
function renderLightFrame(ctx, img, canvas, t) {
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // 光带位置：从左到右
  const lightX = -canvas.width * 0.3 + t * canvas.width * 1.6;
  const lightWidth = canvas.width * 0.3;

  // 光带渐变
  const gradient = ctx.createLinearGradient(
    lightX - lightWidth / 2,
    0,
    lightX + lightWidth / 2,
    0
  );
  gradient.addColorStop(0, 'rgba(255,240,200,0)');
  gradient.addColorStop(0.5, `rgba(255,240,200,${0.15 * Math.sin(t * Math.PI)})`);
  gradient.addColorStop(1, 'rgba(255,240,200,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 整体亮度变化：先暗后亮再恢复正常
  const brightness = 0.85 + 0.15 * Math.sin(t * Math.PI);
  ctx.fillStyle = `rgba(0,0,0,${1 - brightness})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * 文字浮现效果：画面先模糊后清晰，文字逐渐显现
 */
function renderTextFrame(ctx, img, canvas, t) {
  if (t < 0.3) {
    // 前 30%：模糊渐清晰
    ctx.filter = `blur(${20 * (1 - t / 0.3)}px) brightness(${0.5 + 0.5 * (t / 0.3)})`;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
  } else {
    // 后 70%：清晰画面 + 顶部和底部光效
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // 顶部渐入光效
    const topGrad = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.2);
    const textT = (t - 0.3) / 0.7; // 0 → 1
    topGrad.addColorStop(0, `rgba(0,0,0,${0.4 * textT})`);
    topGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height * 0.2);

    // 底部渐入光效
    const bottomGrad = ctx.createLinearGradient(0, canvas.height * 0.8, 0, canvas.height);
    bottomGrad.addColorStop(0, 'rgba(0,0,0,0)');
    bottomGrad.addColorStop(1, `rgba(0,0,0,${0.4 * textT})`);
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, canvas.height * 0.8, canvas.width, canvas.height * 0.2);
  }
}

/**
 * 加载图片
 */
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('海报图片加载失败'));
    img.src = dataUrl;
  });
}

/**
 * 下载视频 Blob
 */
export function downloadVideoBlob(blob, filename = '造境_动效海报') {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `${filename}.webm`;
  link.href = url;
  link.click();
  setTimeout(() => safeRevokeUrl(url), 1000);
}
