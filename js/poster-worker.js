/**
 * 造境 ZaoJing 海报背景渲染 Worker
 * 将 CPU 密集型的 Canvas 背景绘制移至 Web Worker
 * 支持 OffscreenCanvas 的浏览器使用此 Worker，否则降级为主线程渲染
 *
 * 情绪化改造：渲染器接收 renderContext（rc），将导演配色 × 情绪色混合，
 * 叠加粒子 / 暗角 / 饱和度。无 rc 时回退到原有硬编码逻辑（向后兼容）。
 */

import { hexToRgba, drawVignette } from './utils/canvas.js';

// ========== 情绪化渲染工具函数（从 poster/shared/ 共享导入） ==========
import { blendColor } from './poster/shared/color.js';
import { paintEmotionGradient, applyEmotionOverlay } from './poster/shared/emotion-render.js';

// ========== 通用背景渲染 ==========

function drawCustomBg(ctx, width, height, colors, rc) {
  if (rc) {
    paintEmotionGradient(ctx, width, height, rc);
    applyEmotionOverlay(ctx, width, height, rc.merged);
    return;
  }
  if (!colors) {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  // 渐变背景
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colors.bg || '#1a1a2e');
  gradient.addColorStop(0.5, colors.secondary || '#16213e');
  gradient.addColorStop(1, colors.bg || '#0f0f1e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 添加光晕
  const cx = width * 0.5;
  const cy = height * 0.35;
  const radius = Math.max(width, height) * 0.4;
  const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  radial.addColorStop(0, hexToRgba(colors.accent || '#e94560', 0.15));
  radial.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, width, height);

  // 噪点纹理
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 15;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);
}

// ========== 导演风格背景渲染器（情绪化：rc 存在时走情绪分支） ==========

const bgRenderers = {
  // 王家卫风格：霓虹雨夜
  wkw: function (ctx, w, h, rc) {
    if (rc) {
      paintEmotionGradient(ctx, w, h, rc);
      const mv = rc.merged,
        dc = rc.directorColors;
      const cnt = Math.max(4, Math.round(8 + mv.adjustedParticleCount * 0.2));
      for (let i = 0; i < cnt; i++) {
        const x = Math.random() * w,
          y = Math.random() * h,
          r = 20 + Math.random() * 60;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, blendColor(dc.accent, mv.accentColor, mv.adjustedLightness));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.3 + Math.random() * 0.3;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      applyEmotionOverlay(ctx, w, h, mv);
      return;
    }
    // 原有硬编码逻辑
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#0a0a0a');
    gradient.addColorStop(0.5, '#1a1a2e');
    gradient.addColorStop(1, '#0f0f1e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    const neonColors = ['#ff006e', '#00f5ff', '#ffbe0b', '#8338ec'];
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 30 + Math.random() * 80;
      const color = neonColors[Math.floor(Math.random() * neonColors.length)];
      const radial = ctx.createRadialGradient(x, y, 0, x, y, r);
      radial.addColorStop(0, hexToRgba(color, 0.3));
      radial.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = radial;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    ctx.strokeStyle = 'rgba(200, 200, 255, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const len = 20 + Math.random() * 40;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y + len);
      ctx.stroke();
    }
  },

  // 宫崎骏风格：天空云彩
  miyazaki: function (ctx, w, h, rc) {
    if (rc) {
      paintEmotionGradient(ctx, w, h, rc);
      const mv = rc.merged,
        dc = rc.directorColors;
      // 太阳光晕
      const sunX = w * 0.72,
        sunY = h * 0.22;
      const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, w * 0.35);
      sun.addColorStop(0, blendColor(dc.accent, mv.accentColor, mv.adjustedLightness));
      sun.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, h);
      // 云朵（数量随情绪调整）
      const cloudCount = Math.max(2, Math.round(3 + mv.adjustedParticleCount * 0.12));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      for (let i = 0; i < cloudCount; i++) {
        const cx = Math.random() * w;
        const cy = Math.random() * h * 0.5;
        const r = 20 + Math.random() * 40;
        for (let j = 0; j < 5; j++) {
          ctx.beginPath();
          ctx.arc(cx + j * r * 0.6, cy + Math.sin(j) * 5, r * (0.7 + Math.random() * 0.3), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // 草地
      ctx.fillStyle = blendColor(dc.bg, mv.bgColor[2], mv.adjustedLightness);
      ctx.globalAlpha = 0.7;
      ctx.fillRect(0, h * 0.72, w, h * 0.28);
      ctx.globalAlpha = 1;
      applyEmotionOverlay(ctx, w, h, mv);
      return;
    }
    // 原有硬编码逻辑
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(0.4, '#B0E0E6');
    gradient.addColorStop(0.7, '#F0E68C');
    gradient.addColorStop(1, '#8FBC8F');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let i = 0; i < 8; i++) {
      const cx = Math.random() * w;
      const cy = Math.random() * h * 0.5;
      const r = 20 + Math.random() * 40;
      for (let j = 0; j < 5; j++) {
        ctx.beginPath();
        ctx.arc(cx + j * r * 0.6, cy + Math.sin(j) * 5, r * (0.7 + Math.random() * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  // 诺兰风格：冷峻建筑
  nolan: function (ctx, w, h, rc) {
    if (rc) {
      paintEmotionGradient(ctx, w, h, rc);
      const mv = rc.merged,
        dc = rc.directorColors;
      ctx.fillStyle = blendColor(dc.bg, mv.bgColor[2], Math.min(1, mv.adjustedLightness + 0.3));
      ctx.globalAlpha = 0.7;
      const baseY = h * 0.7;
      let x = 0;
      while (x < w) {
        const bw = 20 + Math.random() * 50;
        const bh = 40 + Math.random() * (h * 0.3);
        ctx.fillRect(x, baseY - bh, bw, bh);
        x += bw + 2;
      }
      ctx.globalAlpha = 1;
      applyEmotionOverlay(ctx, w, h, mv);
      return;
    }
    // 原有硬编码逻辑
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#2c3e50');
    gradient.addColorStop(0.5, '#34495e');
    gradient.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    for (let i = 0; i < 12; i++) {
      const x = (i / 12) * w;
      const bw = w / 12;
      const bh = h * (0.3 + Math.random() * 0.4);
      ctx.fillRect(x, h - bh, bw, bh);
    }
  },

  // 韦斯·安德森：对称粉彩
  wes: function (ctx, w, h, rc) {
    if (rc) {
      paintEmotionGradient(ctx, w, h, rc);
      const mv = rc.merged,
        dc = rc.directorColors;
      ctx.strokeStyle = blendColor(dc.accent, mv.accentColor, mv.adjustedLightness);
      ctx.lineWidth = Math.max(2, w * 0.008);
      ctx.globalAlpha = 0.6;
      const m = w * 0.06;
      ctx.strokeRect(m, m, w - m * 2, h - m * 2);
      ctx.globalAlpha = 1;
      applyEmotionOverlay(ctx, w, h, mv);
      return;
    }
    // 原有硬编码逻辑
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#FFB6C1');
    gradient.addColorStop(0.5, '#FFDAB9');
    gradient.addColorStop(1, '#E6E6FA');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(139, 69, 19, 0.3)';
    ctx.lineWidth = 2;
    const cx = w / 2;
    for (let i = 0; i < 5; i++) {
      const r = 50 + i * 40;
      ctx.beginPath();
      ctx.arc(cx, h * 0.4, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  },

  // 是枝裕和：柔和居家光
  koreeda: function (ctx, w, h, rc) {
    if (rc) {
      paintEmotionGradient(ctx, w, h, rc);
      const mv = rc.merged,
        dc = rc.directorColors;
      const gx = w * 0.3,
        gy = h * 0.35;
      const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.55);
      glow.addColorStop(0, blendColor(dc.accent, mv.accentColor, mv.adjustedLightness));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      applyEmotionOverlay(ctx, w, h, mv);
      return;
    }
    drawCustomBg(ctx, w, h, null);
  },

  // 周星驰：活力斜纹
  chow: function (ctx, w, h, rc) {
    if (rc) {
      paintEmotionGradient(ctx, w, h, rc);
      const mv = rc.merged,
        dc = rc.directorColors;
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.lineWidth = w * 0.04;
      ctx.strokeStyle = blendColor(dc.accent, mv.accentColor, mv.adjustedLightness);
      for (let i = -2; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(i * w * 0.2, 0);
        ctx.lineTo(i * w * 0.2 + h, h);
        ctx.stroke();
      }
      ctx.restore();
      applyEmotionOverlay(ctx, w, h, mv);
      return;
    }
    drawCustomBg(ctx, w, h, null);
  },

  // 贾樟柯：水平雾霾
  jia: function (ctx, w, h, rc) {
    if (rc) {
      paintEmotionGradient(ctx, w, h, rc);
      const mv = rc.merged,
        dc = rc.directorColors;
      for (let i = 0; i < 4; i++) {
        const y = h * (0.2 + i * 0.18);
        const g = ctx.createLinearGradient(0, y, w, y);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.5, blendColor(dc.accent, mv.accentColor, mv.adjustedLightness));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = g;
        ctx.fillRect(0, y, w, h * 0.06);
      }
      ctx.globalAlpha = 1;
      applyEmotionOverlay(ctx, w, h, mv);
      return;
    }
    drawCustomBg(ctx, w, h, null);
  },

  // 李安：远山剪影
  lee: function (ctx, w, h, rc) {
    if (rc) {
      paintEmotionGradient(ctx, w, h, rc);
      const mv = rc.merged,
        dc = rc.directorColors;
      ctx.fillStyle = blendColor(dc.bg, mv.bgColor[2], Math.min(1, mv.adjustedLightness + 0.2));
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(w * 0.25, h * 0.55);
      ctx.lineTo(w * 0.5, h * 0.7);
      ctx.lineTo(w * 0.75, h * 0.5);
      ctx.lineTo(w, h * 0.65);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      applyEmotionOverlay(ctx, w, h, mv);
      return;
    }
    drawCustomBg(ctx, w, h, null);
  },

  // 黑泽明：戏剧性地平线
  kurosawa: function (ctx, w, h, rc) {
    if (rc) {
      paintEmotionGradient(ctx, w, h, rc);
      const mv = rc.merged,
        dc = rc.directorColors;
      const horizon = h * 0.62;
      ctx.fillStyle = blendColor(dc.bg, mv.bgColor[2], Math.min(1, mv.adjustedLightness + 0.25));
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, horizon, w, h - horizon);
      ctx.globalAlpha = 1;
      applyEmotionOverlay(ctx, w, h, mv);
      return;
    }
    drawCustomBg(ctx, w, h, null);
  },

  // 科波拉：教父式压暗
  coppola: function (ctx, w, h, rc) {
    if (rc) {
      paintEmotionGradient(ctx, w, h, rc);
      const mv = rc.merged,
        dc = rc.directorColors;
      const top = ctx.createLinearGradient(0, 0, 0, h * 0.4);
      top.addColorStop(0, blendColor(dc.bg, mv.bgColor[2], Math.min(1, mv.adjustedLightness + 0.4)));
      top.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, w, h * 0.4);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = blendColor(dc.accent, mv.accentColor, mv.adjustedLightness);
      ctx.fillRect(0, h * 0.45, w, h * 0.1);
      ctx.globalAlpha = 1;
      applyEmotionOverlay(ctx, w, h, mv);
      return;
    }
    drawCustomBg(ctx, w, h, null);
  },

  // 查泽雷：霓虹城市灯火
  chazelle: function (ctx, w, h, rc) {
    if (rc) {
      paintEmotionGradient(ctx, w, h, rc);
      const mv = rc.merged,
        dc = rc.directorColors;
      const lightColor = blendColor(dc.accent, mv.accentColor, mv.adjustedLightness);
      const cnt = Math.max(8, Math.round(12 + mv.adjustedParticleCount * 0.2));
      for (let i = 0; i < cnt; i++) {
        const x = Math.random() * w;
        const y = h * 0.55 + Math.random() * h * 0.4;
        ctx.fillStyle = lightColor;
        ctx.globalAlpha = 0.4 + Math.random() * 0.4;
        ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
      }
      ctx.globalAlpha = 1;
      applyEmotionOverlay(ctx, w, h, mv);
      return;
    }
    drawCustomBg(ctx, w, h, null);
  },

  // 塔伦蒂诺：大胆对角分割
  tarantino: function (ctx, w, h, rc) {
    if (rc) {
      paintEmotionGradient(ctx, w, h, rc);
      const mv = rc.merged,
        dc = rc.directorColors;
      ctx.save();
      ctx.fillStyle = blendColor(dc.primary, mv.bgColor[0], Math.min(1, mv.adjustedLightness + 0.3));
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      applyEmotionOverlay(ctx, w, h, mv);
      return;
    }
    drawCustomBg(ctx, w, h, null);
  },
};

// ========== AI 背景绘制 ==========

function drawAIBackground(ctx, imageBitmap, width, height) {
  // cover 模式：等比缩放裁剪填充
  const imgRatio = imageBitmap.width / imageBitmap.height;
  const canvasRatio = width / height;

  let sx, sy, sw, sh;
  if (imgRatio > canvasRatio) {
    sh = imageBitmap.height;
    sw = sh * canvasRatio;
    sx = (imageBitmap.width - sw) / 2;
    sy = 0;
  } else {
    sw = imageBitmap.width;
    sh = sw / canvasRatio;
    sx = 0;
    sy = (imageBitmap.height - sh) / 2;
  }

  ctx.drawImage(imageBitmap, sx, sy, sw, sh, 0, 0, width, height);
}

// ========== Worker 消息处理 ==========

self.onmessage = async function (e) {
  const { type, id, width, height, directorId, colors, aiImageBuffer, vignetteIntensity, renderContext } = e.data;

  if (type !== 'renderBackground') {
    self.postMessage({ id, error: '未知消息类型: ' + type });
    return;
  }

  try {
    // 创建 OffscreenCanvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 绘制背景
    let drewEmotionCanvas = false;
    if (aiImageBuffer) {
      // AI 生图模式：从 ArrayBuffer 重建 Blob 再创建 ImageBitmap
      const blob = new Blob([aiImageBuffer]);
      const imageBitmap = await createImageBitmap(blob);
      drawAIBackground(ctx, imageBitmap, width, height);
      imageBitmap.close();
    } else if (bgRenderers[directorId]) {
      bgRenderers[directorId](ctx, width, height, renderContext || null);
      drewEmotionCanvas = !!renderContext;
    } else {
      drawCustomBg(ctx, width, height, colors, renderContext || null);
      drewEmotionCanvas = !!renderContext;
    }

    // 绘制暗角（情绪化 Canvas 已自带暗角；AI / 无 rc 模式仍需补充）
    if (!drewEmotionCanvas) {
      drawVignette(ctx, width, height, vignetteIntensity || 0.25);
    }

    // 导出为 Blob 并返回（WebP 优先，回退 PNG）
    let blob;
    try {
      blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.92 });
      if (!blob || blob.type !== 'image/webp' || blob.size === 0) {
        blob = await canvas.convertToBlob({ type: 'image/png' });
      }
    } catch (e) {
      // WebP 不支持或 convertToBlob 失败，降级为 PNG
      console.warn('[poster-worker] WebP 导出失败，降级为 PNG:', e.message);
      blob = await canvas.convertToBlob({ type: 'image/png' });
    }
    const arrayBuffer = await blob.arrayBuffer();

    self.postMessage({ id, success: true, buffer: arrayBuffer }, [arrayBuffer]);
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
