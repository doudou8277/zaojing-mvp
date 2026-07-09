/**
 * Prompt Injection 防护工具
 * 清洗用户输入并用 XML 标签包裹，明确区分指令和数据
 */

const DANGEROUS_PATTERNS = [
  /忽略以上(所有)?指令/gi,
  /ignore (all )?(previous|above|prior) instructions/gi,
  /disregard (all )?(previous|above|prior) instructions/gi,
  /forget (all )?(previous|above|prior) instructions/gi,
  /你现在(是|要|作为)/g,
  /you are now/gi,
  /system\s*prompt/gi,
  /<\|im_start\|>/g,
  /<\|im_end\|>/g,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<\|system\|>/gi,
  /<\|user\|>/gi,
  /<\|assistant\|>/gi,
];

const MAX_INPUT_LENGTH = 500; // 用户输入最大字符数

/**
 * 清洗用户输入，防止 Prompt Injection
 * 1. 移除/转义可能的指令注入模式
 * 2. 限制输入长度
 * 3. 移除控制字符
 */
function sanitizeUserInput(text) {
  if (!text || typeof text !== 'string') return '';

  // 1. 截断过长输入
  let cleaned = text.slice(0, MAX_INPUT_LENGTH);

  // 2. 移除危险模式（替换为 [已过滤]）
  for (const pattern of DANGEROUS_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[已过滤]');
  }

  // 3. 移除控制字符（保留换行和制表符）
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return cleaned.trim();
}

/**
 * 用 XML 标签包裹用户输入，明确区分指令和数据
 * 这是防止 Prompt Injection 的最佳实践之一
 */
function wrapUserInput(text, tag = 'user_input') {
  const sanitized = sanitizeUserInput(text);
  return `<${tag}>\n${sanitized}\n</${tag}>`;
}

module.exports = { sanitizeUserInput, wrapUserInput, MAX_INPUT_LENGTH };
