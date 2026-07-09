/**
 * 多平台分享工具
 * 利用各平台的 Share Intent URL Scheme 实现一键跳转发布
 */

import { logger } from './logger.js';

/**
 * 生成微博分享链接
 * 微博 Share Intent: https://service.weibo.com/share/share.php
 */
export function shareToWeibo({ text, imageSrc, url }) {
  const params = new URLSearchParams({
    title: text || '',
    url: url || window.location.href,
    pic: '', // 微博不支持 data URL，需用户手动上传
  });
  window.open(`https://service.weibo.com/share/share.php?${params.toString()}`, '_blank', 'width=600,height=500');
}

/**
 * 生成小红书分享链接
 * 小红书无公开 Share Intent API，引导用户保存图片后打开 App
 */
export function shareToXiaohongshu({ text }) {
  // 小红书无 Web 端分享 API，提示用户保存图片后发布
  // 预填剪贴板文案
  if (navigator.clipboard && text) {
    navigator.clipboard.writeText(text).catch(err => logger.warn('[social-share] 剪贴板写入失败（小红书）:', err));
  }
  // 打开小红书网页版（用户需登录后手动发布）
  window.open('https://www.xiaohongshu.com/publish/publish', '_blank');
}

/**
 * 微信分享
 * 微信无 Web Share Intent，通过生成带二维码的分享页引导扫码
 */
export function shareToWeChat({ url }) {
  // 微信内可通过 WeixinJSBridge 调用原生分享
  if (typeof window.WeixinJSBridge !== 'undefined') {
    window.WeixinJSBridge.invoke(
      'shareTimeline',
      {
        img_url: '',
        link: url || window.location.href,
        desc: '用造境生成电影海报',
        title: '造境 ZaoJing',
      },
      () => {}
    );
  } else {
    // 非微信环境：提示用户截图或使用微信扫码
    // 已在分享弹窗中显示二维码，此处仅提示
    return false; // 返回 false 表示需要手动操作
  }
  return true;
}

/**
 * 抖音分享
 * 抖音无 Web Share Intent API，引导用户保存图片后打开 App 发布
 */
export function shareToDouyin({ text }) {
  if (navigator.clipboard && text) {
    navigator.clipboard.writeText(text).catch(err => logger.warn('[social-share] 剪贴板写入失败（抖音）:', err));
  }
  window.open('https://creator.douyin.com/', '_blank');
}

/**
 * 统一分享入口
 * @param {string} platform - 平台名称: weibo | xhs | wechat | douyin
 * @param {Object} payload - { text, imageSrc, url }
 * @returns {string|null} - 返回提示消息（需要用户手动操作时），null 表示已自动跳转
 */
export function shareToPlatform(platform, payload) {
  switch (platform) {
    case 'weibo':
      shareToWeibo(payload);
      return null;
    case 'xhs':
      shareToXiaohongshu(payload);
      return '已为你打开小红书，请上传刚保存的海报图片发布';
    case 'wechat': {
      const success = shareToWeChat(payload);
      return success ? null : '请截图后发送到微信，或用微信扫描上方二维码';
    }
    case 'douyin':
      shareToDouyin(payload);
      return '已为你打开抖音创作者中心，请上传刚保存的海报发布';
    default:
      return null;
  }
}

/**
 * 保存当前海报图片到本地
 * @param {string} dataUrl - 海报的 data URL
 * @param {string} filename - 文件名
 */
export function saveImageToLocal(dataUrl, filename = '造境_电影海报') {
  const link = document.createElement('a');
  link.download = `${filename}.png`;
  link.href = dataUrl;
  link.click();
}

/**
 * 生成多平台适配文案
 * 根据当前海报信息生成各平台的推荐文案
 * @param {Object} poster - 海报结果对象
 * @returns {Object} { weibo, xhs, douyin, wechat }
 */
export function generatePlatformCopy(poster) {
  const title = poster.title || '我的电影海报';
  const director = poster.director || '';
  const quote = poster.quote || '';

  return {
    weibo: `${title} #造境电影海报# #${director}风格# ${quote ? '「' + quote + '」' : ''} 用一句话让情绪变成电影海报 → ${window.location.origin}`,
    xhs: `${title}\n\n${director ? '导演风格：' + director + '\n' : ''}${quote ? '金句：「' + quote + '」\n' : ''}用造境 AI 生成电影级海报，你也来试试 →\n#AI海报 #电影感 #${director} #造境`,
    douyin: `${title} ${quote ? '「' + quote + '」' : ''} #造境 #AI海报 #${director}`,
    wechat: `${title}\n${director ? '—— ' + director + '风格' : ''}\n\n${quote ? '「' + quote + '」' : ''}\n\n用造境 AI 生成你的电影海报`,
  };
}
