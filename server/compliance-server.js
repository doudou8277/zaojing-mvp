/**
 * 造境 ZaoJing — 服务端内容合规检测模块（CommonJS）
 * 与前端 js/utils/compliance.js 保持一致的风控词库
 */

const RISK_LEVEL = {
  BLOCK: 'block',
  WARNING: 'warning',
  INFO: 'info',
};

const RISK_CATEGORIES = {
  extreme: { id: 'extreme', label: '广告法极限用语', severity: RISK_LEVEL.BLOCK },
  false: { id: 'false', label: '虚假宣传', severity: RISK_LEVEL.BLOCK },
  sensitive: { id: 'sensitive', label: '敏感词', severity: RISK_LEVEL.BLOCK },
  vulgar: { id: 'vulgar', label: '低俗内容', severity: RISK_LEVEL.WARNING },
  medical: { id: 'medical', label: '医疗违规', severity: RISK_LEVEL.WARNING },
  financial: { id: 'financial', label: '金融违规', severity: RISK_LEVEL.WARNING },
};

const RISK_WORDS = [
  // 广告法极限用语
  { word: '国家级', category: 'extreme', suggestion: '改为"高品质"或"优质"' },
  { word: '世界级', category: 'extreme', suggestion: '改为"国际水准"' },
  { word: '最高级', category: 'extreme', suggestion: '改为"高品质"' },
  { word: '最佳', category: 'extreme', suggestion: '改为"优质"或"好"' },
  { word: '最大', category: 'extreme', suggestion: '改为"大"或"较大"' },
  { word: '第一', category: 'extreme', suggestion: '改为"领先"或"优秀"' },
  { word: '唯一', category: 'extreme', suggestion: '改为"独特"或"稀有"' },
  { word: '首个', category: 'extreme', suggestion: '改为"早期"或"先行"' },
  { word: '首选', category: 'extreme', suggestion: '改为"优选"' },
  { word: '顶级', category: 'extreme', suggestion: '改为"高端"或"精品"' },
  { word: '极品', category: 'extreme', suggestion: '改为"精品"' },
  { word: '最先进', category: 'extreme', suggestion: '改为"先进"' },
  { word: '最新', category: 'extreme', suggestion: '改为"新"或"近期"' },
  { word: '最快', category: 'extreme', suggestion: '改为"快速"或"高效"' },
  { word: '最好', category: 'extreme', suggestion: '改为"好"或"优质"' },
  { word: '最便宜', category: 'extreme', suggestion: '改为"实惠"或"高性价比"' },
  { word: '最优惠', category: 'extreme', suggestion: '改为"优惠"' },
  { word: '最强大', category: 'extreme', suggestion: '改为"强大"' },
  { word: '最优秀', category: 'extreme', suggestion: '改为"优秀"' },
  { word: '最低价', category: 'extreme', suggestion: '改为"实惠"或"优惠价"' },
  { word: '全网最低', category: 'extreme', suggestion: '改为"实惠"' },
  { word: '万能', category: 'extreme', suggestion: '改为"多功能"或"实用"' },
  { word: '永久', category: 'extreme', suggestion: '改为"长期"或"持久"' },
  { word: '绝对', category: 'extreme', suggestion: '改为"确实"或"真正"' },
  { word: '极致', category: 'extreme', suggestion: '改为"出色"或"优秀"' },
  { word: '巅峰', category: 'extreme', suggestion: '改为"高水平"' },
  { word: '王牌', category: 'extreme', suggestion: '改为"核心"或"主打"' },
  { word: '遥遥领先', category: 'extreme', suggestion: '改为"领先"' },
  { word: 'No.1', category: 'extreme', suggestion: '改为"领先"或"优秀"' },
  { word: 'TOP1', category: 'extreme', suggestion: '改为"领先"' },
  // 虚假宣传
  { word: '100%有效', category: 'false', suggestion: '避免绝对化效果承诺' },
  { word: '100%成功', category: 'false', suggestion: '避免绝对化效果承诺' },
  { word: '包治百病', category: 'false', suggestion: '医疗效果承诺违规' },
  { word: '药到病除', category: 'false', suggestion: '医疗效果承诺违规' },
  { word: '零风险', category: 'false', suggestion: '改为"低风险"' },
  { word: '稳赚不赔', category: 'false', suggestion: '金融收益承诺违规' },
  { word: '免费领', category: 'false', suggestion: '注意是否符合免费承诺条件' },
  // 医疗违规
  { word: '祖传秘方', category: 'medical', suggestion: '未经审批的医疗宣传' },
  { word: '特效药', category: 'medical', suggestion: '避免药品效果宣传' },
  { word: '减肥药', category: 'medical', suggestion: '避免未经审批的药品宣传' },
  // 金融违规
  { word: '保本保息', category: 'financial', suggestion: '金融产品不得承诺保本保息' },
  { word: '稳赚', category: 'financial', suggestion: '不得承诺投资收益' },
  { word: '日入过万', category: 'financial', suggestion: '涉嫌夸大收益宣传' },
];

function checkCompliance(text) {
  if (!text || typeof text !== 'string') {
    return { passed: true, risks: [], maxLevel: null };
  }

  const risks = [];
  const seen = new Set();

  for (const riskWord of RISK_WORDS) {
    if (seen.has(riskWord.word + riskWord.category)) continue;

    const idx = text.indexOf(riskWord.word);
    if (idx === -1) continue;

    const category = RISK_CATEGORIES[riskWord.category];
    risks.push({
      word: riskWord.word,
      category: riskWord.category,
      categoryLabel: category ? category.label : riskWord.category,
      severity: category ? category.severity : RISK_LEVEL.WARNING,
      suggestion: riskWord.suggestion || '建议修改此表述',
      position: idx,
      context: text.substring(Math.max(0, idx - 5), idx + riskWord.word.length + 5),
    });

    seen.add(riskWord.word + riskWord.category);
  }

  let maxLevel = null;
  if (risks.some((r) => r.severity === RISK_LEVEL.BLOCK)) {
    maxLevel = RISK_LEVEL.BLOCK;
  } else if (risks.some((r) => r.severity === RISK_LEVEL.WARNING)) {
    maxLevel = RISK_LEVEL.WARNING;
  } else if (risks.some((r) => r.severity === RISK_LEVEL.INFO)) {
    maxLevel = RISK_LEVEL.INFO;
  }

  return {
    passed: maxLevel !== RISK_LEVEL.BLOCK,
    risks,
    maxLevel,
  };
}

module.exports = { checkCompliance, RISK_LEVEL, RISK_CATEGORIES, RISK_WORDS };
