/**
 * 造境 ZaoJing — 数据层 v0.5
 * 包含：6 导演信息（全部解锁）、10 心情标签、60 导演金句、4 种海报版式、6 种字体、Prompt 模板
 */

import type { Director, MoodTag, StyleDNA, PosterFormat, PosterTemplate } from './types.d.ts';

// ========== 局部接口定义 ==========

interface PosterFormatDef {
  id: PosterFormat;
  label: string;
  desc: string;
  width: number;
  height: number;
  group?: 'classic' | 'social';
}

interface LoadingStep {
  text: string;
  duration: number;
}

interface EmotionSpectrumEntry {
  color: string;
  gradient: string;
  keywords: string[];
}

interface StyleDNADimension {
  label: string;
  values: Record<string, string>;
}

interface AssembledPrompt {
  director: string;
  promptCore: string;
  moodKeywords: string[];
  userText: string;
  fullPrompt: string;
  negativePrompt: string;
}

interface MovieInfo {
  title: string;
  director: string;
  releaseDate: string;
  rating: string;
  boxOffice: string;
  genres: string[];
}

interface StyleRecommendation {
  director: Director;
  matchScore: number;
  reason: string;
}

// ========== 6 位导演美学体系（全部解锁） ==========
export const DIRECTORS: Director[] = [
  {
    id: 'miyazaki',
    name: '宫崎骏',
    enName: 'Miyazaki Hayao',
    avatar:
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 20c0-4 4-8 10-8s10 4 10 8c0 2-1 4-3 5l3 11H10l3-11c-3-1-5-3-5-5z" fill="currentColor" opacity=".25"/><ellipse cx="18" cy="18" rx="10" ry="5" fill="currentColor"/><path d="M30 22l12-6-2 8-10 4z" fill="currentColor" opacity=".7"/></svg>',
    tagline: '天空、绿野、少女、治愈',
    styleDesc: '手绘动画质感，广阔天空与 lush 自然，金色光线下的少女剪影',
    keywords: ['天空', '云朵', '绿野', '少女', '治愈'],
    colors: {
      primary: '#87ceeb',
      secondary: '#98d8a1',
      accent: '#ffd54f',
      bg: '#a8d8ea',
      text: '#1b5e20',
      textLight: '#2e7d32',
    },
    emotions: ['治愈', '梦想', '自由', '童心'],
    available: true,
    fontFamily: '"Noto Serif SC", serif',
    titleWeight: 700,
    promptCore:
      'Miyazaki style, dreamy sky, lush nature, young girl, healing, Studio Ghibli, hand-drawn aesthetic, watercolor textures, golden hour',
    negativePrompt: 'realistic photo, dark mood, modern city, harsh shadows, 3d render, photorealistic',
    quotes: [
      '不管前方的路有多苦，只要走的方向正确，都比站在原地更接近幸福。',
      '生命是黑暗中闪烁的光。',
      '只要内心不乱，外界就很难改变你什么。',
      '曾经发生过的事情不可能忘记，只是想不起来而已。',
      '人总在记忆中徘徊，迷失了方向。',
      '我们大笑看看，可怕的东西它就跑掉了。',
      '不要吃太胖哦，会被杀掉的。',
      '我只能送你到这里了，剩下的路你要自己走。',
      '世界这么大，人生这么长，总会有这么一个人，让你想要温柔地对待。',
      '生活坏到一定程度就会好起来，因为它无法更坏。',
    ],
    styleDNA: {
      colorTemperature: 'warm',
      saturation: 'high',
      contrast: 'medium',
      compositionType: 'symmetric',
      lightingType: 'natural',
      scale: 'monumental',
      pace: 'dynamic',
      texture: 'smooth',
    },
  },
  {
    id: 'wkw',
    name: '王家卫',
    enName: 'Wong Kar-wai',
    avatar:
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="10" stroke="currentColor" stroke-width="2" opacity=".3"/><circle cx="24" cy="24" r="6" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="2" fill="currentColor"/><path d="M8 18h6M8 24h8M8 30h6M34 18h6M34 24h6M34 30h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".5"/></svg>',
    tagline: '暧昧光影、霓虹绿、城市独白',
    styleDesc: '低照度霓虹光影，抽帧运动模糊，城市夜色中的孤独身影',
    keywords: ['暧昧', '光影', '霓虹', '独白', '城市'],
    colors: {
      primary: '#3d7a5a',
      secondary: '#c9a36b',
      accent: '#ff6b6b',
      bg: '#1a2e1f',
      text: '#e8d5b7',
      textLight: '#c9a36b',
    },
    emotions: ['暧昧', '孤独', '回忆', '未说出口的话'],
    available: true,
    fontFamily: '"Noto Serif SC", serif',
    titleWeight: 600,
    promptCore:
      'Wong Kar-wai style, neon green, intimate lighting, lonely urban night, single line monologue, motion blur, rain-soaked streets',
    negativePrompt: 'bright daylight, vibrant colors, multiple subjects, cartoon style, flat lighting',
    quotes: [
      '其实了解一个人并不代表什么，今天是明天的回忆。',
      '一个人可以假装开心，但声音就装不了，仔细一听便知。',
      '我曾经试过做自己的主人，才发现有些事根本由不得自己。',
      '念念不忘，必有回响。',
      '不知道从什么时候开始，在什么东西上面都有个日期。',
      '如果记忆是一个罐头，我希望它永远不会过期。',
      '那些消逝了的岁月，仿佛隔着一块积着灰尘的玻璃。',
      '不如我们从头来过。',
      '我一直以为是我自己赢了，直到有一天看着镜子，才知道自己输了。',
      '有时候，耳朵比眼睛更重要。',
    ],
    styleDNA: {
      colorTemperature: 'cool',
      saturation: 'medium',
      contrast: 'high',
      compositionType: 'asymmetric',
      lightingType: 'low-key',
      scale: 'intimate',
      pace: 'static',
      texture: 'grainy',
    },
  },
  {
    id: 'koreeda',
    name: '是枝裕和',
    enName: 'Koreeda Hirokazu',
    avatar:
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="8" width="28" height="32" rx="1" stroke="currentColor" stroke-width="1.5" opacity=".4"/><rect x="14" y="12" width="20" height="14" rx="1" fill="currentColor" opacity=".15"/><path d="M14 32h20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".3"/><path d="M14 36h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".2"/><circle cx="34" cy="19" r="3" fill="currentColor" opacity=".35"/></svg>',
    tagline: '夏日午后、生活流、家庭温度',
    styleDesc: '柔和自然光，淡色调生活场景，家庭日常中的细微情感',
    keywords: ['夏日', '午后', '家庭', '生活', '自然光'],
    colors: {
      primary: '#f0e7d3',
      secondary: '#a8c8b5',
      accent: '#e6c89c',
      bg: '#f5ede0',
      text: '#5d4e37',
      textLight: '#8b7355',
    },
    emotions: ['温暖', '亲情', '回忆', '岁月静好'],
    available: true,
    fontFamily: '"Noto Serif SC", serif',
    titleWeight: 600,
    promptCore:
      'Koreeda style, soft daylight, family life, gentle moments, subtle emotions, warm tones, natural setting',
    negativePrompt: 'dark mood, dramatic lighting, fantasy, sci-fi, harsh contrast',
    quotes: [
      '人生路上总会有不期而遇的温暖和生生不息的希望。',
      '幸福这种东西啊，要是不放弃什么的话就得不到了。',
      '任何事情都有可能发生在任何人身上，没什么大不了的。',
      '当你真正在乎一个人的时候，他就会变成你的弱点。',
      '生活就是这样，一边失去，一边拥有。',
      '不是每个人都能成为自己想要的样子，但每个人都可以努力接近。',
      '时间会带走一切，但也会留下最真实的。',
      '我们都在用各自的方式，努力活下去。',
      '有些路，只能一个人走。',
      '世界并不完美，但值得我们温柔以待。',
    ],
    styleDNA: {
      colorTemperature: 'warm',
      saturation: 'medium',
      contrast: 'low',
      compositionType: 'centered',
      lightingType: 'natural',
      scale: 'intimate',
      pace: 'static',
      texture: 'smooth',
    },
  },
  {
    id: 'wes',
    name: '韦斯·安德森',
    enName: 'Wes Anderson',
    avatar:
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="32" height="32" rx="2" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="20" height="20" rx="1" fill="currentColor" opacity=".2"/><line x1="24" y1="8" x2="24" y2="40" stroke="currentColor" stroke-width="1" opacity=".3"/><line x1="8" y1="24" x2="40" y2="24" stroke="currentColor" stroke-width="1" opacity=".3"/><circle cx="24" cy="24" r="3" fill="currentColor"/></svg>',
    tagline: '对称构图、糖果色、怪趣仪式',
    styleDesc: '完美对称构图，粉彩糖果色调，平面感怪趣美学',
    keywords: ['对称', '糖果色', '平面', '怪趣', '仪式感'],
    colors: {
      primary: '#f4c2c2',
      secondary: '#a4d4ae',
      accent: '#f9d56e',
      bg: '#fce4ec',
      text: '#4a4a4a',
      textLight: '#6d6d6d',
    },
    emotions: ['幽默', '怪趣', '小确幸', '仪式感'],
    available: true,
    fontFamily: '"Noto Sans SC", sans-serif',
    titleWeight: 700,
    promptCore:
      'Wes Anderson style, perfect symmetry, pastel palette, quirky composition, flat plane, centered framing',
    negativePrompt: 'asymmetric, dark colors, realistic, gritty, documentary style',
    quotes: [
      '生活就像一盒巧克力，你永远不知道下一颗是什么味道。',
      '我们之所以疯狂，是因为我们太清醒了。',
      '真正的冒险，是回到出发的地方，重新认识它。',
      '有时候，最荒诞的事情才是最真实的。',
      '生活需要一点仪式感，哪怕只是泡一杯茶。',
      '完美是不存在的，但追求完美的过程是完美的。',
      '每个人心中都有一座布达佩斯大饭店。',
      '色彩是情感的另一种语言。',
      '对称不是目的，而是一种生活态度。',
      '在这个不对称的世界里，我们努力创造属于自己的平衡。',
    ],
    styleDNA: {
      colorTemperature: 'warm',
      saturation: 'high',
      contrast: 'medium',
      compositionType: 'symmetric',
      lightingType: 'natural',
      scale: 'medium',
      pace: 'static',
      texture: 'smooth',
    },
  },
  {
    id: 'nolan',
    name: '诺兰',
    enName: 'Christopher Nolan',
    avatar:
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="24" r="10" stroke="currentColor" stroke-width="2" opacity=".7"/><path d="M24 8a16 16 0 0 1 0 32" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="24" cy="8" r="3" fill="currentColor"/><line x1="24" y1="24" x2="24" y2="8" stroke="currentColor" stroke-width="1.5" opacity=".5"/></svg>',
    tagline: '冷峻、巨物、时间扭曲',
    styleDesc: '冷色调巨物感，纪实风格，时间与空间的哲学叙事',
    keywords: ['冷峻', '巨物', '纪实', '宏大', '时间'],
    colors: {
      primary: '#0a1929',
      secondary: '#c0c0c0',
      accent: '#4fc3f7',
      bg: '#0d1b2a',
      text: '#e0e0e0',
      textLight: '#b0bec5',
    },
    emotions: ['沉思', '震撼', '宿命', '宏大叙事'],
    available: true,
    fontFamily: '"Noto Sans SC", sans-serif',
    titleWeight: 700,
    promptCore:
      'Christopher Nolan style, cold palette, monumental, philosophical, time distortion, IMAX aesthetic, epic scale',
    negativePrompt: 'warm colors, cartoon, small scale, cheerful, pastel',
    quotes: [
      '时间是我们最无法掌控的东西，也是最公平的东西。',
      '不要试图理解它，去感受它。',
      '恐惧会让你变得渺小，但也会让你更加警觉。',
      '有些真理，超越了时间。',
      '我们以为自己在选择，其实只是被选择推动着前进。',
      '在无限的时间里，一切都有可能。',
      '最深的恐惧，来自未知。',
      '引力可以穿越维度，爱也是。',
      '我们都在时间的洪流中，努力留下自己的痕迹。',
      '真正的勇气，不是不害怕，而是害怕了依然前行。',
    ],
    styleDNA: {
      colorTemperature: 'cool',
      saturation: 'low',
      contrast: 'high',
      compositionType: 'symmetric',
      lightingType: 'dramatic',
      scale: 'monumental',
      pace: 'dynamic',
      texture: 'smooth',
    },
  },
  {
    id: 'chow',
    name: '周星驰',
    enName: 'Stephen Chow',
    avatar:
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 8l4 8h8l-6 6 2 10-8-4-8 4 2-10-6-6h8z" fill="currentColor" opacity=".25" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="24" cy="24" r="4" fill="currentColor"/><path d="M14 38l4-4M34 38l-4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".5"/></svg>',
    tagline: '无厘头、港风、丧中带燃',
    styleDesc: '夸张漫画感，港式霓虹，无厘头反转中的热血',
    keywords: ['夸张', '无厘头', '港风', '漫画', '反转'],
    colors: {
      primary: '#ffcc00',
      secondary: '#ff3333',
      accent: '#ff9800',
      bg: '#fff3cd',
      text: '#b71c1c',
      textLight: '#d32f2f',
    },
    emotions: ['戏谑', '自嘲', '反转', '丧中带燃'],
    available: true,
    fontFamily: '"Noto Sans SC", sans-serif',
    titleWeight: 900,
    promptCore:
      'Stephen Chow style, exaggerated comic, Hong Kong neon, dramatic, humorous, vibrant colors, mo lei tau comedy',
    negativePrompt: 'subtle, minimalist, muted colors, realistic, serious drama',
    quotes: [
      '人没有梦想，和咸鱼有什么分别。',
      '曾经有一份真挚的爱情放在我面前，我没有珍惜。',
      '我只是一个演员。',
      '做人如果没有梦想，跟咸鱼有什么区别。',
      '你看那个人，好奇怪哟，像一条狗。',
      '力拔山兮气盖世，时不利兮骓不逝。',
      '只要用心，人人都是食神。',
      '你以为躲起来就找不到你了吗？没有用的。',
      '我命由我不由天。',
      '一万年太久，只争朝夕。',
    ],
    styleDNA: {
      colorTemperature: 'warm',
      saturation: 'high',
      contrast: 'high',
      compositionType: 'asymmetric',
      lightingType: 'dramatic',
      scale: 'medium',
      pace: 'dynamic',
      texture: 'grainy',
    },
  },
  {
    id: 'jia',
    name: '贾樟柯',
    enName: 'Jia Zhangke',
    avatar:
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="24" width="12" height="16" fill="currentColor" opacity=".3"/><rect x="22" y="16" width="10" height="24" fill="currentColor" opacity=".5"/><rect x="34" y="28" width="6" height="12" fill="currentColor" opacity=".2"/><path d="M6 40h36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M26 20h2M26 24h2" stroke="currentColor" stroke-width="1" opacity=".6" stroke-linecap="round"/></svg>',
    tagline: '土黄、纪实、变迁、小城',
    styleDesc: '去饱和大地色，长镜头固定机位，拆迁工地与过渡空间，纪实质感',
    keywords: ['写实', '怀旧', '变迁', '小城', '底层'],
    colors: {
      primary: '#a89060',
      secondary: '#7a7a6e',
      accent: '#9c5c4a',
      bg: '#3d3528',
      text: '#d5c8a8',
      textLight: '#a89878',
    },
    emotions: ['怀旧', '漂泊', '想家', '无奈'],
    available: true,
    fontFamily: '"Noto Serif SC", serif',
    titleWeight: 600,
    promptCore:
      'Jia Zhangke style, muted earth tones, faded desaturated colors, long take static wide shots, observational distance, natural available light, demolition sites and transitional spaces, documentary realism, social transformation landscape',
    negativePrompt: 'glamorous, high saturation, fast cutting, dramatic lighting, fantasy, polished, studio lighting',
    quotes: [
      '我们都是时代的过客，能留下的只有影像。',
      '在变迁中，每个人都是自己故乡的陌生人。',
      '生活不像电影，生活比电影难多了。',
      '有些东西消失了，就像从未存在过一样。',
      '我们都在流浪，只是有些人不知道而已。',
      '时间会带走一切，但记忆会留下痕迹。',
      '每个小城都有自己的故事，只是没人愿意听。',
      '在废墟上，我们依然要好好生活。',
      '故乡不是一个地方，而是一段回不去的时光。',
      '现实比虚构更荒诞，只是我们习以为常。',
    ],
    styleDNA: {
      colorTemperature: 'warm',
      saturation: 'low',
      contrast: 'medium',
      compositionType: 'asymmetric',
      lightingType: 'natural',
      scale: 'medium',
      pace: 'static',
      texture: 'grainy',
    },
  },
  {
    id: 'lee',
    name: '李安',
    enName: 'Ang Lee',
    avatar:
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 40c4-8 12-20 16-32 4 12 12 24 16 32" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".6"/><path d="M12 40c3-5 8-13 12-22 4 9 9 17 12 22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".4"/><line x1="24" y1="8" x2="24" y2="40" stroke="currentColor" stroke-width="1" opacity=".3"/></svg>',
    tagline: '东方、克制、画意、哲思',
    styleDesc: '古典平衡构图，水墨意境，翠绿与金色交织，情感克制的东方美学',
    keywords: ['东方', '克制', '优雅', '哲思', '画意'],
    colors: {
      primary: '#2d6a4f',
      secondary: '#d4a843',
      accent: '#1a3a5c',
      bg: '#0f1a12',
      text: '#e8e0c8',
      textLight: '#b8a878',
    },
    emotions: ['克制', '思念', '哲思', '释然', '温情'],
    available: true,
    fontFamily: '"Noto Serif SC", serif',
    titleWeight: 700,
    promptCore:
      'Ang Lee style, classical balanced composition, fluid camera movement, painterly naturalistic lighting, Eastern aesthetic ink-wash atmosphere, lush greens and golds, emotional restraint, cinematic elegance',
    negativePrompt: 'chaotic composition, harsh lighting, garish colors, fast cuts, modern urban, crude',
    quotes: [
      '每个人心中都有一座断背山。',
      '理性是冰山一角，感性才是水下的大部分。',
      '我拍电影，是为了理解那些我不懂的事。',
      '东方的含蓄，是一种更深的表达。',
      '人生就是不断地放下，但最遗憾的是我们来不及好好告别。',
      '文化的碰撞，往往在沉默中最为激烈。',
      '克制不是压抑，而是一种更高级的自由。',
      '在刀光剑影中，我看到的是人心的江湖。',
      '每个人都在自己的故事里，做着自己的英雄。',
      '理解一个人，需要跨越的不仅是语言，还有整个文化。',
    ],
    styleDNA: {
      colorTemperature: 'warm',
      saturation: 'medium',
      contrast: 'medium',
      compositionType: 'symmetric',
      lightingType: 'natural',
      scale: 'medium',
      pace: 'static',
      texture: 'smooth',
    },
  },
  {
    id: 'kurosawa',
    name: '黑泽明',
    enName: 'Akira Kurosawa',
    avatar:
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 8a16 16 0 0 1 14 8l-28 0a16 16 0 0 1 14-8z" fill="currentColor" opacity=".3"/><path d="M10 16l28 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 22l2 14M20 22l2 18M28 22l-2 18M34 22l-2 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".5"/><circle cx="24" cy="12" r="3" fill="currentColor"/></svg>',
    tagline: '朱红、靛蓝、史诗、悲壮',
    styleDesc: '大胆原色对比，动态群体几何排列，天气作为角色，史诗级人性戏剧',
    keywords: ['史诗', '悲壮', '英雄', '宿命', '人性'],
    colors: {
      primary: '#c0392b',
      secondary: '#2c3e7b',
      accent: '#f1c40f',
      bg: '#1a1a1a',
      text: '#f0f0f0',
      textLight: '#bdc3c7',
    },
    emotions: ['悲壮', '英雄', '宿命', '震撼', '人性'],
    available: true,
    fontFamily: '"Noto Serif SC", serif',
    titleWeight: 900,
    promptCore:
      'Akira Kurosawa style, bold primary colors, dynamic geometric blocking of multiple figures, telephoto compression, weather as character rain wind fog snow, dramatic natural lighting, epic humanistic scale, movement-based composition',
    negativePrompt: 'static composition, pastel colors, modern setting, minimal, soft lighting, single subject',
    quotes: [
      '人的命运，就像天上的云，不知何时会飘向何方。',
      'Samurai 的剑，不是用来杀人的，而是用来保护人的。',
      '在混乱中，才能看清一个人的本性。',
      '雨会停，风会止，但人的欲望永不停息。',
      '每个人都是自己人生的武士。',
      '历史会重复，因为人性从未改变。',
      '在暴风雨中，才能看到真正的强者。',
      '死亡不是终点，遗忘才是。',
      '梦是灵魂的另一种语言。',
      '真正的剑客，从不轻易拔剑。',
    ],
    styleDNA: {
      colorTemperature: 'warm',
      saturation: 'high',
      contrast: 'high',
      compositionType: 'symmetric',
      lightingType: 'dramatic',
      scale: 'monumental',
      pace: 'dynamic',
      texture: 'grainy',
    },
  },
  {
    id: 'coppola',
    name: '索菲亚·科波拉',
    enName: 'Sofia Coppola',
    avatar:
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="36" height="36" rx="2" fill="currentColor" opacity=".08"/><ellipse cx="24" cy="24" rx="8" ry="10" fill="currentColor" opacity=".2"/><ellipse cx="24" cy="24" rx="4" ry="5" fill="currentColor" opacity=".4"/><circle cx="24" cy="24" r="1.5" fill="currentColor"/></svg>',
    tagline: '柔粉、淡蓝、疏离、梦幻',
    styleDesc: '低饱和粉彩，大量留白，柔和窗光，孤立身影在空旷空间中的亲密孤独',
    keywords: ['梦幻', '忧郁', '疏离', '亲密', '漂泊'],
    colors: {
      primary: '#e8c5c5',
      secondary: '#b8cfe0',
      accent: '#c4b8d0',
      bg: '#f5ede0',
      text: '#5d4e57',
      textLight: '#8a7a8a',
    },
    emotions: ['孤独', '忧郁', '漂泊', '心动', '迷茫'],
    available: true,
    fontFamily: '"Noto Serif SC", serif',
    titleWeight: 400,
    promptCore:
      'Sofia Coppola style, soft pastel palette, muted pinks and blues, abundant negative space, natural window light, golden hour glow, isolated figures in vast spaces, hotel liminal spaces, dreamy overexposed highlights, intimate loneliness',
    negativePrompt:
      'high contrast, dramatic lighting, action, crowded scenes, sharp edges, saturated colors, dark mood',
    quotes: [
      '在陌生的城市里，孤独是一种奢侈。',
      '有些话，只有在黑暗中才说得出口。',
      '我们都在寻找连接，却总是擦肩而过。',
      '最深的孤独，是在人群中感到的。',
      '迷失，有时候是找到自己的唯一方式。',
      '窗外的风景，是内心世界的映射。',
      '在过渡性空间里，人最容易面对真实的自己。',
      '有些关系，不需要语言就已经完整。',
      '粉色不是软弱，是另一种坚强。',
      '当你停止寻找，你想要的东西反而会出现。',
    ],
    styleDNA: {
      colorTemperature: 'cool',
      saturation: 'low',
      contrast: 'low',
      compositionType: 'asymmetric',
      lightingType: 'natural',
      scale: 'intimate',
      pace: 'static',
      texture: 'smooth',
    },
  },
  {
    id: 'chazelle',
    name: '查泽雷',
    enName: 'Damien Chazelle',
    avatar:
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M24 6L8 42h32z" fill="currentColor" opacity=".15"/><path d="M24 6l-10 28h20z" fill="currentColor" opacity=".3"/><circle cx="24" cy="14" r="4" fill="currentColor"/><path d="M20 30l8-6M28 30l-8-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".6"/></svg>',
    tagline: '梦幻紫、日落橙、梦想、爵士',
    styleDesc: '高饱和原色，动态运镜，戏剧性舞台光，歌舞片梦幻感与苦甜交织',
    keywords: ['梦想', '激情', '苦甜', '野心', '浪漫'],
    colors: {
      primary: '#6a4c93',
      secondary: '#ff6b35',
      accent: '#ffd23f',
      bg: '#1a1230',
      text: '#e8d5f0',
      textLight: '#b8a0c8',
    },
    emotions: ['梦想', '心动', '苦甜', '激情', '释然'],
    available: true,
    fontFamily: '"Noto Sans SC", sans-serif',
    titleWeight: 700,
    promptCore:
      'Damien Chazelle style, vibrant primary colors, dreamy purple and sunset orange, dynamic whip pans and long takes, theatrical stage lighting, colored gel lighting, golden hour backlight, musical staging composition, jazz imagery',
    negativePrompt: 'static camera, muted colors, documentary style, naturalistic lighting, minimalist, dull',
    quotes: [
      '献给那些追梦的人，哪怕心碎也值得。',
      '城市之星，只为勇敢者闪耀。',
      '如果你再努力一点，也许就能触碰到星星。',
      '梦想和现实之间，只差一个不放弃的理由。',
      '音乐是灵魂最后的栖息地。',
      '每一次排练，都是在跟未来的自己对话。',
      '苦涩是甜蜜必须付出的代价。',
      '在节拍之间，藏着所有未说出口的话。',
      '不是所有的爱情都有完美结局，但每一段都值得歌唱。',
      '当你全力以赴时，整个宇宙都会为你伴奏。',
    ],
    styleDNA: {
      colorTemperature: 'cool',
      saturation: 'high',
      contrast: 'high',
      compositionType: 'symmetric',
      lightingType: 'dramatic',
      scale: 'medium',
      pace: 'dynamic',
      texture: 'smooth',
    },
  },
  {
    id: 'tarantino',
    name: '昆汀',
    enName: 'Quentin Tarantino',
    avatar:
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="14" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="24" r="6" stroke="currentColor" stroke-width="1.5"/><circle cx="24" cy="24" r="2" fill="currentColor"/><rect x="10" y="10" width="4" height="4" fill="currentColor" opacity=".6"/><rect x="34" y="10" width="4" height="4" fill="currentColor" opacity=".6"/><rect x="10" y="34" width="4" height="4" fill="currentColor" opacity=".6"/><rect x="34" y="34" width="4" height="4" fill="currentColor" opacity=".6"/><path d="M14 18l4 12M20 16l2 16M28 16l-2 16M34 18l-4 12" stroke="currentColor" stroke-width="1" opacity=".4" stroke-linecap="round"/></svg>',
    tagline: '血红、暖黄、复古、黑色幽默',
    styleDesc: '高饱和复古色调，低角度动态构图，grindhouse质感，风格化暴力美学',
    keywords: ['酷', '暴力', '复古', '黑色幽默', '致敬'],
    colors: {
      primary: '#8b0000',
      secondary: '#e8b830',
      accent: '#ff6b9d',
      bg: '#1a0a0a',
      text: '#f0e0c0',
      textLight: '#c9a36b',
    },
    emotions: ['戏谑', '愤怒', '酷', '反转', '黑色幽默'],
    available: true,
    fontFamily: '"Noto Sans SC", sans-serif',
    titleWeight: 900,
    promptCore:
      'Quentin Tarantino style, bold saturated colors, blood red and warm yellow, dynamic low-angle shots, trunk shot perspective, extreme close-ups, retro grindhouse aesthetic, 70mm wide frame, stylized violence, pop culture references',
    negativePrompt: 'subtle, muted, minimalist, modern clean, soft pastel, naturalistic, gentle',
    quotes: [
      '你看着我，让我觉得我在看一部电影。',
      '正义是一种态度，不是一种制度。',
      '在暴力中，才能看到人性的真面目。',
      '每个人都是自己故事里的主角。',
      '复仇是一道最好凉了再吃的菜。',
      '对话是最高级的暴力。',
      '风格就是一切，内容只是借口。',
      '在荒诞中，才能看到真实。',
      '每个人心里都住着一个疯子，只是有些人放他出来了。',
      '致敬不是模仿，是用自己的方式说同样的故事。',
    ],
    styleDNA: {
      colorTemperature: 'warm',
      saturation: 'high',
      contrast: 'high',
      compositionType: 'asymmetric',
      lightingType: 'dramatic',
      scale: 'medium',
      pace: 'dynamic',
      texture: 'grainy',
    },
  },
];

// ========== 10 个心情标签 ==========
export const MOOD_TAGS = [
  { id: 'emo', label: 'emo', icon: 'cloud' },
  { id: 'rich', label: '暴富', icon: 'disc' },
  { id: 'homesick', label: '想家', icon: 'home' },
  { id: 'ex', label: '前任', icon: 'heart' },
  { id: 'free', label: '自由', icon: 'feather' },
  { id: 'overtime', label: '加班', icon: 'moon' },
  { id: 'lonely', label: '孤独', icon: 'cloud' },
  { id: 'healing', label: '治愈', icon: 'feather' },
  { id: 'relief', label: '释然', icon: 'sun' },
  { id: 'crush', label: '暗恋', icon: 'mail' },
] as MoodTag[];

// ========== 4 种海报版式 + 社交平台尺寸预设 ==========
export const POSTER_FORMATS: PosterFormatDef[] = [
  { id: 'vertical', label: '竖版', desc: '经典竖版', width: 720, height: 1080, group: 'classic' },
  { id: 'horizontal', label: '横版', desc: '经典横版', width: 1080, height: 720, group: 'classic' },
  { id: 'square', label: '方形', desc: '方形海报', width: 1080, height: 1080, group: 'classic' },
  { id: 'grid9', label: '九宫格', desc: '系列合集', width: 2160, height: 2160, group: 'classic' },
  // 社交平台尺寸预设
  { id: 'weibo', label: '微博配图', desc: '1080×608', width: 1080, height: 608, group: 'social' },
  { id: 'xhs', label: '小红书封面', desc: '1080×1440', width: 1080, height: 1440, group: 'social' },
  { id: 'wechat', label: '公众号封面', desc: '900×383', width: 900, height: 383, group: 'social' },
  { id: 'douyin', label: '抖音视频封面', desc: '1080×1920', width: 1080, height: 1920, group: 'social' },
];

// ========== 海报模板库（20+ 预设模板） ==========
export const POSTER_TEMPLATES: PosterTemplate[] = [
  // --- 电影场景 ---
  {
    id: 'tpl-cinema-01',
    name: '深夜独行',
    icon: 'moon',
    text: '深夜加班后走出写字楼，抬头看见月亮',
    directorId: 'wkw',
    format: 'vertical',
    moodTagId: 'overtime',
    category: 'cinema',
    source: 'preset',
  },
  {
    id: 'tpl-cinema-02',
    name: '雨中漫步',
    icon: 'cloud',
    text: '在异乡的公交车上，窗外下着雨，耳机里是老歌',
    directorId: 'wkw',
    format: 'vertical',
    moodTagId: 'lonely',
    category: 'cinema',
    source: 'preset',
  },
  {
    id: 'tpl-cinema-03',
    name: '夏日告别',
    icon: 'sun',
    text: '毕业最后一晚的宿舍，空荡荡的床铺和关不掉的灯',
    directorId: 'miyazaki',
    format: 'vertical',
    moodTagId: 'relief',
    category: 'cinema',
    source: 'preset',
  },
  {
    id: 'tpl-cinema-04',
    name: '星际远航',
    icon: 'zap',
    text: '在浩瀚星空中漂流，地球只是一颗蓝色的弹珠',
    directorId: 'nolan',
    format: 'horizontal',
    category: 'cinema',
    source: 'preset',
  },
  {
    id: 'tpl-cinema-05',
    name: '暗夜追踪',
    icon: 'search',
    text: '霓虹灯下的追逐，每一步都在与时间赛跑',
    directorId: 'nolan',
    format: 'vertical',
    category: 'cinema',
    source: 'preset',
  },
  // --- 情绪表达 ---
  {
    id: 'tpl-emo-01',
    name: '未说出口的话',
    icon: 'chat',
    text: '和好朋友大吵一架后的后悔，想道歉又开不了口',
    directorId: 'koreeda',
    format: 'vertical',
    moodTagId: 'ex',
    category: 'emotion',
    source: 'preset',
  },
  {
    id: 'tpl-emo-02',
    name: '暗恋心事',
    icon: 'mail',
    text: '每次遇见你，心跳都会漏一拍，但假装若无其事',
    directorId: 'wkw',
    format: 'square',
    moodTagId: 'crush',
    category: 'emotion',
    source: 'preset',
  },
  {
    id: 'tpl-emo-03',
    name: '想家的夜',
    icon: 'home',
    text: '电话那头妈妈说天冷加衣，这头我已泪流满面',
    directorId: 'miyazaki',
    format: 'vertical',
    moodTagId: 'homesick',
    category: 'emotion',
    source: 'preset',
  },
  {
    id: 'tpl-emo-04',
    name: '释然时刻',
    icon: 'sun',
    text: '终于放下了那段执念，阳光照进窗台，一切重新开始',
    directorId: 'chazelle',
    format: 'vertical',
    moodTagId: 'relief',
    category: 'emotion',
    source: 'preset',
  },
  {
    id: 'tpl-emo-05',
    name: '暴富梦',
    icon: 'disc',
    text: '梦想有一天不用看闹钟，阳光和自由都是我的',
    directorId: 'wes',
    format: 'square',
    moodTagId: 'rich',
    category: 'emotion',
    source: 'preset',
  },
  {
    id: 'tpl-emo-06',
    name: '自由飞翔',
    icon: 'feather',
    text: '站在山顶，风穿过指尖，全世界都在脚下',
    directorId: 'miyazaki',
    format: 'horizontal',
    moodTagId: 'free',
    category: 'emotion',
    source: 'preset',
  },
  // --- 节日场景 ---
  {
    id: 'tpl-fest-01',
    name: '新年愿望',
    icon: 'sparkles',
    text: '新年的第一束烟花，许下关于你的愿望',
    directorId: 'chazelle',
    format: 'vertical',
    category: 'festival',
    source: 'preset',
  },
  {
    id: 'tpl-fest-02',
    name: '中秋月圆',
    icon: 'moon',
    text: '月圆之夜，千里之外的你也在这片月光下吧',
    directorId: 'lee',
    format: 'square',
    moodTagId: 'homesick',
    category: 'festival',
    source: 'preset',
  },
  {
    id: 'tpl-fest-03',
    name: '圣诞夜',
    icon: 'star',
    text: '街角的圣诞树亮了，一个人走过也觉得温暖',
    directorId: 'wes',
    format: 'vertical',
    category: 'festival',
    source: 'preset',
  },
  {
    id: 'tpl-fest-04',
    name: '毕业季',
    icon: 'award',
    text: '散伙饭上没人哭，出了门才发现真的散了',
    directorId: 'koreeda',
    format: 'vertical',
    moodTagId: 'relief',
    category: 'festival',
    source: 'preset',
  },
  // --- 社交场景 ---
  {
    id: 'tpl-soc-01',
    name: '微博金句',
    icon: 'phone',
    text: '生活不会因为你软弱而对你温柔',
    directorId: 'wkw',
    format: 'weibo',
    category: 'social',
    source: 'preset',
  },
  {
    id: 'tpl-soc-02',
    name: '小红书种草',
    icon: 'book',
    text: '周末去了一家藏在巷子里的咖啡馆，治愈了一整周',
    directorId: 'wes',
    format: 'xhs',
    category: 'social',
    source: 'preset',
  },
  {
    id: 'tpl-soc-03',
    name: '公众号封面',
    icon: 'edit',
    text: '当 AI 遇见电影：一场关于情绪的视觉实验',
    directorId: 'nolan',
    format: 'wechat',
    category: 'social',
    source: 'preset',
  },
  {
    id: 'tpl-soc-04',
    name: '抖音封面',
    icon: 'clapper',
    text: '这条视频太治愈了，看完整个人都好了',
    directorId: 'miyazaki',
    format: 'douyin',
    moodTagId: 'healing',
    category: 'social',
    source: 'preset',
  },
  {
    id: 'tpl-soc-05',
    name: '九宫格日记',
    icon: 'grid',
    text: '这一周的九个瞬间，记录生活的小确幸',
    directorId: 'wes',
    format: 'grid9',
    category: 'social',
    source: 'preset',
  },
  // --- 治愈系列 ---
  {
    id: 'tpl-heal-01',
    name: '晨光微暖',
    icon: 'sun',
    text: '早起看到的第一个日出，感觉一切都会好起来',
    directorId: 'miyazaki',
    format: 'vertical',
    moodTagId: 'healing',
    category: 'emotion',
    source: 'preset',
  },
  {
    id: 'tpl-heal-02',
    name: '雨后初晴',
    icon: 'cloud',
    text: '暴雨后的彩虹，是大自然给勇敢者的奖赏',
    directorId: 'chazelle',
    format: 'horizontal',
    moodTagId: 'healing',
    category: 'emotion',
    source: 'preset',
  },
];

// 模板分类标签
export const TEMPLATE_CATEGORIES: { id: string; label: string; icon: string }[] = [
  { id: 'all', label: '全部', icon: 'sparkles' },
  { id: 'cinema', label: '电影场景', icon: 'clapper' },
  { id: 'emotion', label: '情绪表达', icon: 'chat' },
  { id: 'festival', label: '节日场景', icon: 'gift' },
  { id: 'social', label: '社交场景', icon: 'phone' },
];

// ========== 生成中进度文案序列 ==========
// 电影感进度文案，覆盖真实 AI 生图 10-30 秒等待
export const LOADING_STEPS: LoadingStep[] = [
  { text: '导演正在研读你的情绪…', duration: 1200 },
  { text: '剧本成型，正在选景…', duration: 1200 },
  { text: '摄影师就位，开始布光…', duration: 1200 },
  { text: '构图完成，胶片正在转动…', duration: 1200 },
  { text: '调色师赋予画面灵魂…', duration: 1200 },
  { text: '最后冲洗，即将上映…', duration: 1000 },
];

// ========== 情绪关键词提取（模拟 LLM 理解） ==========
export const EMOTION_KEYWORDS: Record<string, string[]> = {
  emo: ['孤独', '深夜', '雨', '失落', '沉默'],
  rich: ['金光', '闪耀', '丰盛', '自由', '光芒'],
  homesick: ['远方', '故乡', '温暖', '回忆', '灯火'],
  ex: ['回忆', '遗憾', '曾经', '转身', '释然'],
  free: ['天空', '风', '远方', '翅膀', '辽阔'],
  overtime: ['夜色', '灯光', '坚持', '城市', '寂静'],
  lonely: ['空旷', '独白', '影子', '寂静', '深处'],
  healing: ['阳光', '绿意', '微风', '温柔', '新生'],
  relief: ['晨光', '释然', '开阔', '平静', '远方'],
  crush: ['心跳', '秘密', '温柔', '期待', '小心翼翼'],
};

// ========== 模拟 Prompt 组装 ==========
export function assemblePrompt(userText: string, directorId: string, moodTagId: string | null): AssembledPrompt | null {
  const director = DIRECTORS.find((d) => d.id === directorId);
  if (!director) return null;

  const moodKeywords = moodTagId ? EMOTION_KEYWORDS[moodTagId] || [] : [];

  return {
    director: director.name,
    promptCore: director.promptCore,
    moodKeywords: moodKeywords,
    userText: userText,
    fullPrompt: `${director.promptCore}, ${moodKeywords.join(', ')}, emotional atmosphere: "${userText.substring(0, 50)}"`,
    negativePrompt: director.negativePrompt,
  };
}

// ========== 获取随机金句 ==========
export function getRandomQuote(directorId: string, excludeQuote?: string): string {
  const director = DIRECTORS.find((d) => d.id === directorId);
  if (!director || !director.quotes || !director.quotes.length) return '';
  let available = director.quotes;
  if (excludeQuote) {
    available = director.quotes.filter((q) => q !== excludeQuote);
  }
  if (!available.length) available = director.quotes;
  return available[Math.floor(Math.random() * available.length)];
}

// ========== 获取指定索引金句 ==========
export function getQuoteByIndex(directorId: string, index: number): string {
  const director = DIRECTORS.find((d) => d.id === directorId);
  if (!director || !director.quotes || !director.quotes.length) return '';
  return director.quotes[index % director.quotes.length];
}

// ========== 从文本提取标题（模拟 LLM 情绪理解） ==========
export function extractTitle(text: string | null | undefined, moodTagId: string | null): string {
  if (!text || text.trim().length === 0) {
    const mood = MOOD_TAGS.find((m) => m.id === moodTagId);
    return mood ? `${mood.label}的故事` : '无题';
  }

  let title = text.trim();
  if (title.length > 12) {
    const punctIndex = title.substring(0, 12).search(/[，。！？、；：]/);
    if (punctIndex > 4) {
      title = title.substring(0, punctIndex);
    } else {
      title = title.substring(0, 12) + '…';
    }
  }
  return title;
}

// ========== 生成备选标题（二次创作） ==========
export function generateAltTitles(text: string | null | undefined, moodTagId: string | null): string[] {
  const mainTitle = extractTitle(text, moodTagId);
  const alts = [mainTitle];

  if (!text || text.trim().length === 0) {
    return alts;
  }

  // 备选 1：取后半段
  const trimmed = text.trim();
  if (trimmed.length > 8) {
    const mid = Math.floor(trimmed.length / 2);
    let alt = trimmed.substring(mid).trim();
    if (alt.length > 12) alt = alt.substring(0, 12) + '…';
    if (alt.length >= 2) alts.push(alt);
  }

  // 备选 2：取关键词组合
  if (moodTagId) {
    const mood = MOOD_TAGS.find((m) => m.id === moodTagId);
    if (mood) {
      const firstPart = mainTitle.length > 4 ? mainTitle.substring(0, 4) : mainTitle;
      alts.push(`${firstPart}·${mood.label}`);
    }
  }

  // 备选 3：诗意化
  if (trimmed.length > 4) {
    const last4 = trimmed.substring(trimmed.length - 4).replace(/[，。！？、；：]/g, '');
    if (last4.length >= 2) alts.push(last4 + '…');
  }

  return alts;
}

// ========== 导演影评模板（豆瓣短评风格，50-80字） ==========
export const DIRECTOR_REVIEW_TEMPLATES: Record<string, string[]> = {
  miyazaki: [
    '画面里藏着风的形状，{emotion}在云层间缓缓流淌。少女的剪影与金色光线交织，每一帧都在轻声说没关系。看完想哭，是好的那种哭。',
    '宫崎骏式的温柔从未失手。{emotion}被绘成一片无边的绿野，手绘的笔触里藏着对世界最深的善意。治愈得让人想立刻出门跑一圈。',
    '风、云、少女、{emotion}——宫崎骏把所有柔软的东西放进了一帧画面里。配乐响起的瞬间，眼眶就湿了。这是今年最治愈的电影。',
    '看的时候一直在笑，看完却想哭。{emotion}被装进手绘的天空里，每一朵云都有名字。宫崎骏的世界，永远值得回去。',
  ],
  wkw: [
    '霓虹绿的光晕里，{emotion}被切成碎片。独白比画面更重，城市夜色是最好的滤镜。王家卫拍的不是故事，是时间本身的质地。',
    '王家卫式的暧昧，让{emotion}有了重量。抽帧的雨夜里，每一帧都在说那些没说出口的话。看完想抽根烟，虽然我不会抽。',
    '如果记忆是个罐头，这部片子永远不会过期。{emotion}在低照度光影里慢慢发酵，隔着积灰的玻璃，看不清却忘不掉。',
    '那些消逝的岁月，{emotion}隔着一块积灰的玻璃看不清。王家卫拍的是遗憾本身，配乐一响，所有前任脸都浮上来了。',
  ],
  koreeda: [
    '是枝裕和式的克制，让{emotion}有了温度。夏日午后的光线里，生活本身就成了诗。没有冲突，只有一顿饭、一次散步、一个眼神。',
    '没有戏剧性的反转，只有{emotion}在家庭餐桌上慢慢流淌。是枝裕和知道，真实的生活比任何剧本都更动人。看完想给家里打电话。',
    '柔和的自然光下，{emotion}被拍得像一首散文诗。是枝裕和的镜头不动声色，却把人心最柔软的地方翻了出来。后劲很大。',
    '是枝裕和知道，{emotion}从来不需要大声说出来。一个眼神、一顿饭、一次沉默，就够了。看完走出影院，阳光刚好。',
  ],
  wes: [
    '对称构图强迫症患者的福音。{emotion}被装进糖果色画框里，荒诞得恰到好处。每一帧都可以截图当壁纸，韦斯·安德森是色彩暴君。',
    '韦斯·安德森把{emotion}变成了粉色和黄色的色块。严格对称的画面里，怪趣与温柔并存。这不是电影，是一本会动的绘本。',
    '仪式感拉满的怪趣美学，{emotion}在对称的画面里找到了属于自己的平衡。韦斯·安德森的世界，连遗憾都是粉色的。',
    '糖果色调下的{emotion}，荒诞中带着温柔。韦斯·安德森用最工整的构图，讲最不羁的故事。看完想给房间重新刷漆。',
  ],
  nolan: [
    '冷峻的巨物感扑面而来，{emotion}在时间的褶皱里被重新定义。诺兰式的宏大叙事，让人在影院座椅上缩成了一粒尘埃。',
    'IMAX画幅下，{emotion}有了哲学的重量。这不是一部电影，是一次时空实验。诺兰的镜头冷峻，但内核滚烫得吓人。',
    '诺兰把{emotion}拍成了引力——穿越维度，无法逃脱。冷色调下藏着最深的情感，配乐压得人喘不过气，却舍不得移开眼。',
    '时间扭曲中，{emotion}成为唯一的锚点。诺兰的叙事像精密钟表，每一个齿轮都咬合得恰到好处。看完脑子嗡嗡的。',
  ],
  chow: [
    '无厘头的外壳下，{emotion}藏得比谁都深。笑着笑着就哭了，这才是周星驰。小人物的悲欢离合，拍得比谁都真实动人。',
    '港式霓虹里，{emotion}被夸张成漫画感。丧到极致反而燃起来了。周星驰的电影，永远在笑和泪之间反复横跳，后劲十足。',
    '周星驰式的反转，让{emotion}有了烟火气。看似无厘头，实则字字扎心。看完想对着天空大喊一声：我命由我不由天！',
    '夸张的表演下，{emotion}的底色是悲凉的。周星驰拍的是小人物的尊严与梦想，笑着看完，回头想想却想哭。港片不死。',
  ],
  jia: [
    '贾樟柯的镜头不动声色，{emotion}在拆迁的废墟间静静流淌。每个人都是时代的注脚，每条街都在消失。',
    '没有英雄，只有小人物在{emotion}中沉默。这才是真实的中国，不美化，不批判，只是记录。',
    '长镜头里藏着{emotion}的全部重量。不需要台词，生活本身已经足够戏剧化。',
    '贾樟柯知道，{emotion}从来不是大声喊出来的，而是在某个午后，看着窗外发呆时涌上来的。',
  ],
  lee: [
    '李安的镜头如水墨，{emotion}在翠竹与金光间缓缓晕开。东方的含蓄，是更深的深情。',
    '克制不是压抑，是李安对{emotion}最精准的丈量。每一帧都是留白的艺术。',
    '在李安的世界里，{emotion}不需要言语。一个眼神，一顿饭，一次沉默，就够了。',
    '跨文化的碰撞在李安手中化为{emotion}的诗。东西方之间，他找到了最柔软的平衡。',
  ],
  kurosawa: [
    '黑泽明的画面如版画般有力，{emotion}在朱红与靛蓝间爆发。这是史诗的尺度，也是人性的显微镜。',
    '风雨中的人物群像，是黑泽明对{emotion}最壮烈的表达。每个身影都是一座丰碑。',
    '在黑泽明的镜头下，{emotion}有了重量，有了温度，有了不可推卸的宿命感。',
    '大胆的原色，几何的调度，黑泽明让{emotion}变成了一种视觉的震撼。',
  ],
  coppola: [
    '索菲亚·科波拉的镜头如水彩，{emotion}在柔粉与淡蓝间轻轻晕染。孤独原来可以这么美。',
    '大量留白里，{emotion}有了呼吸的空间。空旷的酒店房间，是最好的心理剧场。',
    '窗光下的少女剪影，是科波拉对{emotion}最温柔的注解。不需要戏剧性，存在本身已是故事。',
    '在科波拉的世界里，{emotion}是一种粉色的忧郁，轻盈却深入骨髓。',
  ],
  chazelle: [
    '查泽雷的镜头如爵士乐，{emotion}在紫色与橙色间跳跃。每一帧都在歌唱。',
    '梦想的代价是苦甜交织，查泽雷让{emotion}有了音乐的节奏。光影即旋律。',
    '在查泽雷的世界里，{emotion}不是静止的，它在旋转、在飞奔、在燃烧。',
    '黄金时刻的逆光下，{emotion}被镀上了一层金。这是献给追梦人的情书。',
  ],
  tarantino: [
    '昆汀的镜头如漫画，{emotion}在血红与暖黄间爆裂。暴力在他的手中变成了一种舞蹈。',
    '复古的grindhouse质感，让{emotion}有了一种cult式的酷。不正经，但致命。',
    '在昆汀的世界里，{emotion}总是伴随着黑色幽默到来。你先笑，然后被击中。',
    '低角度仰拍，极端特写，昆汀让{emotion}变得风格化到了极致。这是电影的电影。',
  ],
};

// ========== 导演手记模板（30-50字） ==========
export const DIRECTOR_NOTES_TEMPLATES: Record<string, string[]> = {
  miyazaki: [
    '这次选了金色光线下的少女剪影，{emotion}需要柔软的绿意来承载。手绘质感让画面呼吸，天空留足空间。',
    '构图留了大量天空，{emotion}才能飘起来。色调偏暖绿，治愈不该有阴影。云朵画得像棉花糖。',
    '光线从右上方斜照下来，{emotion}在这个角度最温柔。手绘笔触保留了粗糙感，太光滑就不像活的了。',
  ],
  wkw: [
    '低照度霓虹绿是基调，{emotion}在暗处才看得清。抽帧让时间变得粘稠，雨夜的反射光是灵魂。',
    '构图偏右，留白给独白。{emotion}不需要正面光，侧光更有故事感。色调压得很低，情绪才能浮上来。',
    '手持镜头微微晃动，{emotion}需要这种不稳定感。霓虹灯管做主光源，绿色偏暖，像旧照片的色温。',
  ],
  koreeda: [
    '自然光，不补光。{emotion}在真实的光影里最动人。构图居中，留白给生活本身。',
    '色调偏暖白，{emotion}需要这种日常的温度。镜头不动，让时间流过。午后三点的光线最柔软。',
    '选了厨房做主场景，{emotion}在烟火气里才真实。景深很浅，只聚焦在手上的动作。',
  ],
  wes: [
    '严格对称，{emotion}在居中构图里最稳定。糖果色调是预设，不是后期。每个道具位置都量过。',
    '色板锁定粉黄绿三色，{emotion}被限制在色彩规则里反而更自由。平面感，俯拍为主。',
    '道具全部手工定制，{emotion}需要这种仪式感才能成立。镜头横移，像翻一本画册。',
  ],
  nolan: [
    '冷色调，巨物感。{emotion}在尺度对比中产生震撼。IMAX画幅，横向构图，光线从顶部打下。',
    '色调去饱和，只留蓝灰。{emotion}被压在阴影里才有重量。广角低角度，让空间产生压迫。',
    '时间线打乱剪辑，{emotion}在非线性叙事里更有重量。配乐用管风琴，低频压住整个影院。',
  ],
  chow: [
    '霓虹灯管做主光源，{emotion}需要这种港式的热闹。色调饱和度拉满，暖黄配红。',
    '构图夸张，漫画感。{emotion}在反转里才有味道。快剪辑，不给喘息的机会。',
    '广角怼脸拍，{emotion}的荒诞感才出得来。表演刻意过火，那是周星驰式的真诚。',
  ],
  jia: [
    '色调偏土黄去饱和，{emotion}需要这种褪色的纪实感。固定机位，让时间自己说话。',
    '选择拆迁工地作为背景，{emotion}在废墟中更有力量。不加滤镜，生活本身已经足够。',
    '长镜头是给观众的尊重，{emotion}需要时间去发酵。不剪辑，不引导，只是观察。',
  ],
  lee: [
    '翠绿与金色的搭配，是东方{emotion}的视觉化。构图追求古典平衡，如山水画。',
    '光影柔和过渡，{emotion}需要这种水墨意境。不加硬光，让画面自己呼吸。',
    '克制是核心，{emotion}不通过台词表达，而是通过沉默和眼神。少即是多。',
  ],
  kurosawa: [
    '大胆使用朱红、靛蓝、明黄三原色，{emotion}需要这种视觉冲击力。天气是另一个角色。',
    '群体几何排列的构图，让{emotion}有了史诗的尺度。长焦压缩空间，增强张力。',
    '动态blocking配合天气元素，{emotion}在风雨中更加壮烈。这是人性的舞台。',
  ],
  coppola: [
    '柔粉与淡蓝的低饱和粉彩，{emotion}需要这种梦幻质感。大量留白让孤独有空间。',
    '自然窗光为主，{emotion}在柔和光线中更显亲密。过曝高光增加梦幻感。',
    '主体偏小偏角构图，空间隔离感是{emotion}的视觉表达。空旷即是情绪。',
  ],
  chazelle: [
    '梦幻紫与日落橙的高饱和，{emotion}需要这种歌舞片的华丽感。彩色滤光片增强氛围。',
    '动态运镜配合舞台光，{emotion}有了音乐的节奏。whip pan制造能量感。',
    '黄金时刻逆光拍摄，{emotion}被镀上金色。这是献给梦想的视觉情书。',
  ],
  tarantino: [
    '血红与暖黄的高饱和复古色，{emotion}需要这种grindhouse质感。70mm宽画幅增加史诗感。',
    '低角度仰拍和极端特写，让{emotion}风格化到极致。不追求真实，追求酷。',
    '复古色调配合非线性叙事，{emotion}在时间跳跃中更有冲击力。这是电影的电影。',
  ],
};

// ========== 情绪光谱配置 ==========
export const EMOTION_SPECTRUM: Record<string, EmotionSpectrumEntry> = {
  孤独: {
    color: '#6b7c93',
    gradient: 'linear-gradient(90deg, #2c3e50, #6b7c93, #95a5a6)',
    keywords: ['空旷', '独白', '寂静'],
  },
  忧伤: {
    color: '#5d6d7e',
    gradient: 'linear-gradient(90deg, #34495e, #5d6d7e, #85929e)',
    keywords: ['雨夜', '失落', '沉默'],
  },
  思念: {
    color: '#d4b88a',
    gradient: 'linear-gradient(90deg, #b8860b, #d4b88a, #e8c89c)',
    keywords: ['远方', '故乡', '灯火'],
  },
  温暖: {
    color: '#e8a87c',
    gradient: 'linear-gradient(90deg, #d68a5c, #e8a87c, #f4c4a0)',
    keywords: ['阳光', '温柔', '回忆'],
  },
  治愈: {
    color: '#7fc4ab',
    gradient: 'linear-gradient(90deg, #5a9e8a, #7fc4ab, #a8d8c8)',
    keywords: ['新生', '微风', '绿意'],
  },
  暧昧: {
    color: '#c39bd3',
    gradient: 'linear-gradient(90deg, #8e44ad, #c39bd3, #d7bde2)',
    keywords: ['霓虹', '独白', '城市'],
  },
  心动: {
    color: '#e89bb0',
    gradient: 'linear-gradient(90deg, #d4738a, #e89bb0, #f4c2c2)',
    keywords: ['心跳', '秘密', '期待'],
  },
  渴望: {
    color: '#f4d03f',
    gradient: 'linear-gradient(90deg, #d4ac0d, #f4d03f, #f7dc6f)',
    keywords: ['光芒', '闪耀', '丰盛'],
  },
  梦想: {
    color: '#f4d03f',
    gradient: 'linear-gradient(90deg, #d4ac0d, #f4d03f, #f7dc6f)',
    keywords: ['天空', '远方', '光芒'],
  },
  自由: {
    color: '#5dade2',
    gradient: 'linear-gradient(90deg, #2e86c1, #5dade2, #85c1e9)',
    keywords: ['风', '翅膀', '辽阔'],
  },
  沉思: {
    color: '#5a8aac',
    gradient: 'linear-gradient(90deg, #2c3e50, #5a8aac, #7fb3d5)',
    keywords: ['巨物', '时间', '哲学'],
  },
  戏谑: {
    color: '#e8b830',
    gradient: 'linear-gradient(90deg, #d68910, #e8b830, #f4d03f)',
    keywords: ['反转', '港风', '漫画'],
  },
  遗憾: {
    color: '#a8c8b5',
    gradient: 'linear-gradient(90deg, #7fb09a, #a8c8b5, #c8dcc8)',
    keywords: ['曾经', '转身', '释怀'],
  },
  疲惫: {
    color: '#6b7c93',
    gradient: 'linear-gradient(90deg, #4a5568, #6b7c93, #95a5a6)',
    keywords: ['夜色', '灯光', '坚持'],
  },
  亲情: {
    color: '#d4b88a',
    gradient: 'linear-gradient(90deg, #b8860b, #d4b88a, #e8c89c)',
    keywords: ['夏日', '家庭', '午后'],
  },
  幽默: {
    color: '#e89bb0',
    gradient: 'linear-gradient(90deg, #d4738a, #e89bb0, #f4c2c2)',
    keywords: ['对称', '糖果色', '怪趣'],
  },
  回忆: {
    color: '#a8c8b5',
    gradient: 'linear-gradient(90deg, #7fb09a, #a8c8b5, #c8dcc8)',
    keywords: ['岁月', '光影', '温度'],
  },
  震撼: {
    color: '#4fc3f7',
    gradient: 'linear-gradient(90deg, #0d47a1, #4fc3f7, #81d4fa)',
    keywords: ['巨物', '冷峻', '史诗'],
  },
  童心: {
    color: '#ffd54f',
    gradient: 'linear-gradient(90deg, #ffa726, #ffd54f, #fff176)',
    keywords: ['云朵', '冒险', '纯真'],
  },
  释然: {
    color: '#81c784',
    gradient: 'linear-gradient(90deg, #66bb6a, #81c784, #a5d6a7)',
    keywords: ['晨光', '开阔', '平静'],
  },
};

// ========== 心情标签到情绪的映射 ==========
export const MOOD_TO_EMOTION: Record<string, string> = {
  emo: '忧伤',
  rich: '渴望',
  homesick: '思念',
  ex: '遗憾',
  free: '自由',
  overtime: '疲惫',
  lonely: '孤独',
  healing: '治愈',
  relief: '释然',
  crush: '心动',
};

// ========== 风格DNA八维度配置 ==========
export const STYLE_DNA_DIMENSIONS: Record<string, StyleDNADimension> = {
  colorTemperature: { label: '色温', values: { warm: '暖', cool: '冷', neutral: '中性' } },
  saturation: { label: '饱和度', values: { low: '低', medium: '中', high: '高' } },
  contrast: { label: '对比度', values: { low: '低', medium: '中', high: '高' } },
  compositionType: { label: '构图', values: { symmetric: '对称', asymmetric: '不对称', centered: '居中' } },
  lightingType: { label: '光影', values: { 'high-key': '高调', 'low-key': '低调', natural: '自然', dramatic: '戏剧' } },
  scale: { label: '尺度', values: { intimate: '亲密', medium: '中等', monumental: '巨物' } },
  pace: { label: '节奏', values: { static: '静态', dynamic: '动态' } },
  texture: { label: '质感', values: { smooth: '光滑', grainy: '颗粒', handdrawn: '手绘', digital: '数字' } },
};

// ========== 情绪→风格DNA映射（已移至风格DNA工具函数区域） ==========

// ========== 生成 AI 影评（豆瓣短评风格） ==========
export function generateReview(
  _text: string,
  directorId: string,
  emotion: string | null
): { score: string; review: string } {
  const director = DIRECTORS.find((d) => d.id === directorId);
  if (!director) return { score: '8.0', review: '一部值得反复品味的电影，画面与情绪都恰到好处。' };

  // 如果没有情绪，使用导演的第一个情绪
  const emotionText = emotion || director.emotions[0];

  const templates = DIRECTOR_REVIEW_TEMPLATES[directorId] || DIRECTOR_REVIEW_TEMPLATES.miyazaki;
  const template = templates[Math.floor(Math.random() * templates.length)];
  const review = template.replace(/{emotion}/g, emotionText);

  // 生成评分 7.8-9.6
  const score = (7.8 + Math.random() * 1.8).toFixed(1);

  return { score, review };
}

// ========== 生成电影上映信息 ==========
export function generateMovieInfo(text: string, directorId: string, emotion: string | null): MovieInfo | null {
  const director = DIRECTORS.find((d) => d.id === directorId);
  if (!director) return null;

  // 使用当前标题（如果传入的文字为空，使用导演默认标题）
  const title = extractTitle(text, null) || `${director.emotions[0]}的故事`;

  // 上映日期：当前日期 + 30-365 天
  const releaseDate = new Date();
  releaseDate.setDate(releaseDate.getDate() + Math.floor(Math.random() * 335) + 30);
  const dateStr = `${releaseDate.getFullYear()}年${releaseDate.getMonth() + 1}月${releaseDate.getDate()}日`;

  // 豆瓣评分 7.5-9.5
  const rating = (7.5 + Math.random() * 2).toFixed(1);

  // 票房 100万-5亿
  const boxOfficeNum = Math.random() * 49800 + 100; // 100-49900 万
  let boxOffice;
  if (boxOfficeNum >= 10000) {
    boxOffice = (boxOfficeNum / 10000).toFixed(2) + '亿';
  } else {
    boxOffice = Math.floor(boxOfficeNum) + '万';
  }

  // 类型标签：基于情绪和导演风格
  const emotionText = emotion || director.emotions[0];
  const genres = generateGenres(directorId, emotionText);

  return {
    title,
    director: director.name,
    releaseDate: dateStr,
    rating,
    boxOffice,
    genres,
  };
}

// ========== 生成类型标签（内部辅助函数） ==========
export function generateGenres(directorId: string, emotion: string): string[] {
  // 导演基础类型
  const baseGenres: Record<string, string[]> = {
    miyazaki: ['动画', '奇幻', '冒险'],
    wkw: ['剧情', '爱情', '文艺'],
    koreeda: ['剧情', '家庭', '生活'],
    wes: ['喜剧', '冒险', '怪趣'],
    nolan: ['科幻', '悬疑', '史诗'],
    chow: ['喜剧', '动作', '港片'],
    jia: ['剧情', '纪实', '文艺'],
    lee: ['剧情', '武侠', '文艺'],
    kurosawa: ['动作', '史诗', '武士'],
    coppola: ['剧情', '文艺', '独立'],
    chazelle: ['歌舞', '剧情', '梦想'],
    tarantino: ['犯罪', '黑色幽默', '复古'],
  };

  // 情绪对应类型
  const emotionGenres: Record<string, string> = {
    孤独: '孤独',
    温暖: '治愈',
    治愈: '治愈',
    暧昧: '爱情',
    梦想: '奇幻',
    自由: '冒险',
    沉思: '哲学',
    戏谑: '喜剧',
    亲情: '家庭',
    幽默: '喜剧',
    回忆: '怀旧',
    震撼: '史诗',
    童心: '童话',
    释然: '治愈',
  };

  const base = baseGenres[directorId] || ['剧情'];
  const emotionGenre = emotionGenres[emotion] || '剧情';

  // 组合，去重，取前3个
  const genres = [...new Set([emotionGenre, ...base])].slice(0, 3);
  return genres;
}

// ========== 生成导演手记 ==========
export function generateDirectorNotes(directorId: string, emotion: string | null): string {
  const director = DIRECTORS.find((d) => d.id === directorId);
  if (!director) return '关于这部作品的创作笔记：构图、色调与氛围的取舍。';

  const emotionText = emotion || director.emotions[0];
  const templates = DIRECTOR_NOTES_TEMPLATES[directorId] || DIRECTOR_NOTES_TEMPLATES.miyazaki;
  const template = templates[Math.floor(Math.random() * templates.length)];
  return template.replace(/{emotion}/g, emotionText);
}

// ========== 根据心情标签获取情绪（内部辅助函数） ==========
export function getEmotionFromMood(moodTagId: string | null | undefined): string | null {
  if (!moodTagId) return null;
  return MOOD_TO_EMOTION[moodTagId] || null;
}

// ========== 风格DNA工具函数 ==========

// DNA维度中文标签
export const DNA_LABELS: Record<string, Record<string, string>> = {
  colorTemperature: { warm: '暖色', cool: '冷色', neutral: '中性' },
  saturation: { low: '低饱和', medium: '中饱和', high: '高饱和' },
  contrast: { low: '低对比', medium: '中对比', high: '高对比' },
  compositionType: { symmetric: '对称', asymmetric: '不对称', centered: '居中' },
  lightingType: { 'high-key': '高调', 'low-key': '低调', natural: '自然光', dramatic: '戏剧光' },
  scale: { intimate: '亲密', medium: '中等', monumental: '巨物' },
  pace: { static: '静态', dynamic: '动态' },
  texture: { smooth: '光滑', grainy: '颗粒', handdrawn: '手绘', digital: '数字' },
};

// DNA维度数值映射（用于雷达图）
export const DNA_VALUES: Record<string, Record<string, number>> = {
  colorTemperature: { warm: 0.2, cool: 0.8, neutral: 0.5 },
  saturation: { low: 0.3, medium: 0.5, high: 0.9 },
  contrast: { low: 0.3, medium: 0.5, high: 0.9 },
  compositionType: { symmetric: 0.8, asymmetric: 0.3, centered: 0.6 },
  lightingType: { 'high-key': 0.8, 'low-key': 0.2, natural: 0.5, dramatic: 0.9 },
  scale: { intimate: 0.2, medium: 0.5, monumental: 0.9 },
  pace: { static: 0.2, dynamic: 0.8 },
  texture: { smooth: 0.3, grainy: 0.7, handdrawn: 0.5, digital: 0.4 },
};

// 获取风格的DNA数值数组（用于雷达图）
export function getStyleDNAValues(styleDNA: StyleDNA): number[] {
  return [
    DNA_VALUES.colorTemperature[styleDNA.colorTemperature] || 0.5,
    DNA_VALUES.saturation[styleDNA.saturation] || 0.5,
    DNA_VALUES.contrast[styleDNA.contrast] || 0.5,
    DNA_VALUES.compositionType[styleDNA.compositionType] || 0.5,
    DNA_VALUES.lightingType[styleDNA.lightingType] || 0.5,
    DNA_VALUES.scale[styleDNA.scale] || 0.5,
    DNA_VALUES.pace[styleDNA.pace] || 0.5,
    DNA_VALUES.texture[styleDNA.texture] || 0.5,
  ];
}

// 计算两个风格的DNA相似度（0-1）
export function calculateDNASimilarity(dnaA: StyleDNA, dnaB: StyleDNA): number {
  const valsA = getStyleDNAValues(dnaA);
  const valsB = getStyleDNAValues(dnaB);
  let sumDiff = 0;
  for (let i = 0; i < valsA.length; i++) {
    sumDiff += Math.abs(valsA[i] - valsB[i]);
  }
  return 1 - sumDiff / valsA.length;
}

// 情绪到DNA的映射
export const EMOTION_TO_DNA: Record<string, StyleDNA> = {
  孤独: {
    colorTemperature: 'cool',
    saturation: 'low',
    contrast: 'medium',
    compositionType: 'asymmetric',
    lightingType: 'low-key',
    scale: 'intimate',
    pace: 'static',
    texture: 'grainy',
  },
  忧伤: {
    colorTemperature: 'cool',
    saturation: 'low',
    contrast: 'medium',
    compositionType: 'asymmetric',
    lightingType: 'low-key',
    scale: 'intimate',
    pace: 'static',
    texture: 'smooth',
  },
  思念: {
    colorTemperature: 'warm',
    saturation: 'low',
    contrast: 'medium',
    compositionType: 'centered',
    lightingType: 'natural',
    scale: 'intimate',
    pace: 'static',
    texture: 'smooth',
  },
  温暖: {
    colorTemperature: 'warm',
    saturation: 'medium',
    contrast: 'low',
    lightingType: 'natural',
    scale: 'intimate',
    pace: 'static',
    texture: 'smooth',
    compositionType: 'symmetric',
  },
  治愈: {
    colorTemperature: 'warm',
    saturation: 'medium',
    contrast: 'low',
    compositionType: 'symmetric',
    lightingType: 'natural',
    scale: 'medium',
    pace: 'static',
    texture: 'smooth',
  },
  震撼: {
    colorTemperature: 'cool',
    saturation: 'medium',
    contrast: 'high',
    compositionType: 'symmetric',
    lightingType: 'dramatic',
    scale: 'monumental',
    pace: 'dynamic',
    texture: 'grainy',
  },
  戏谑: {
    colorTemperature: 'warm',
    saturation: 'high',
    contrast: 'high',
    compositionType: 'asymmetric',
    lightingType: 'dramatic',
    scale: 'medium',
    pace: 'dynamic',
    texture: 'grainy',
  },
  梦想: {
    colorTemperature: 'cool',
    saturation: 'high',
    contrast: 'high',
    compositionType: 'symmetric',
    lightingType: 'dramatic',
    scale: 'medium',
    pace: 'dynamic',
    texture: 'smooth',
  },
  自由: {
    colorTemperature: 'cool',
    saturation: 'medium',
    contrast: 'medium',
    compositionType: 'asymmetric',
    lightingType: 'natural',
    scale: 'monumental',
    pace: 'dynamic',
    texture: 'smooth',
  },
  疲惫: {
    colorTemperature: 'cool',
    saturation: 'low',
    contrast: 'medium',
    compositionType: 'asymmetric',
    lightingType: 'low-key',
    scale: 'intimate',
    pace: 'static',
    texture: 'grainy',
  },
  遗憾: {
    colorTemperature: 'warm',
    saturation: 'low',
    contrast: 'medium',
    compositionType: 'centered',
    lightingType: 'natural',
    scale: 'medium',
    pace: 'static',
    texture: 'smooth',
  },
  心动: {
    colorTemperature: 'warm',
    saturation: 'medium',
    contrast: 'medium',
    compositionType: 'asymmetric',
    lightingType: 'natural',
    scale: 'intimate',
    pace: 'dynamic',
    texture: 'smooth',
  },
  渴望: {
    colorTemperature: 'warm',
    saturation: 'high',
    contrast: 'high',
    compositionType: 'centered',
    lightingType: 'dramatic',
    scale: 'medium',
    pace: 'dynamic',
    texture: 'smooth',
  },
  释然: {
    colorTemperature: 'warm',
    saturation: 'medium',
    contrast: 'low',
    compositionType: 'symmetric',
    lightingType: 'natural',
    scale: 'medium',
    pace: 'static',
    texture: 'smooth',
  },
  悲壮: {
    colorTemperature: 'warm',
    saturation: 'high',
    contrast: 'high',
    compositionType: 'symmetric',
    lightingType: 'dramatic',
    scale: 'monumental',
    pace: 'dynamic',
    texture: 'grainy',
  },
  漂泊: {
    colorTemperature: 'cool',
    saturation: 'low',
    contrast: 'medium',
    compositionType: 'asymmetric',
    lightingType: 'natural',
    scale: 'medium',
    pace: 'dynamic',
    texture: 'grainy',
  },
  怀旧: {
    colorTemperature: 'warm',
    saturation: 'low',
    contrast: 'medium',
    compositionType: 'asymmetric',
    lightingType: 'natural',
    scale: 'medium',
    pace: 'static',
    texture: 'grainy',
  },
  迷茫: {
    colorTemperature: 'cool',
    saturation: 'low',
    contrast: 'low',
    compositionType: 'asymmetric',
    lightingType: 'natural',
    scale: 'medium',
    pace: 'static',
    texture: 'smooth',
  },
  执念: {
    colorTemperature: 'cool',
    saturation: 'high',
    contrast: 'high',
    compositionType: 'symmetric',
    lightingType: 'low-key',
    scale: 'intimate',
    pace: 'static',
    texture: 'grainy',
  },
  苦甜: {
    colorTemperature: 'cool',
    saturation: 'high',
    contrast: 'high',
    compositionType: 'symmetric',
    lightingType: 'dramatic',
    scale: 'medium',
    pace: 'dynamic',
    texture: 'smooth',
  },
  // 以下情绪合并自 ai-service.js，保持两端情绪集合一致
  暧昧: {
    colorTemperature: 'cool',
    saturation: 'medium',
    contrast: 'high',
    compositionType: 'asymmetric',
    lightingType: 'low-key',
    scale: 'intimate',
    pace: 'static',
    texture: 'grainy',
  },
  亲情: {
    colorTemperature: 'warm',
    saturation: 'medium',
    contrast: 'low',
    compositionType: 'centered',
    lightingType: 'natural',
    scale: 'intimate',
    pace: 'static',
    texture: 'smooth',
  },
  幽默: {
    colorTemperature: 'warm',
    saturation: 'high',
    contrast: 'medium',
    compositionType: 'symmetric',
    lightingType: 'high-key',
    scale: 'medium',
    pace: 'dynamic',
    texture: 'digital',
  },
  回忆: {
    colorTemperature: 'warm',
    saturation: 'low',
    contrast: 'low',
    compositionType: 'centered',
    lightingType: 'natural',
    scale: 'intimate',
    pace: 'static',
    texture: 'grainy',
  },
  童心: {
    colorTemperature: 'warm',
    saturation: 'high',
    contrast: 'medium',
    compositionType: 'symmetric',
    lightingType: 'high-key',
    scale: 'medium',
    pace: 'dynamic',
    texture: 'handdrawn',
  },
  沉思: {
    colorTemperature: 'cool',
    saturation: 'low',
    contrast: 'high',
    compositionType: 'symmetric',
    lightingType: 'dramatic',
    scale: 'monumental',
    pace: 'static',
    texture: 'digital',
  },
};

// 根据情绪推荐风格（Top 3）
export function recommendStylesByEmotion(emotion: string, allDirectors: Director[]): StyleRecommendation[] {
  const targetDNA = EMOTION_TO_DNA[emotion];
  if (!targetDNA) return [];

  const scored = allDirectors.map((d) => ({
    director: d,
    matchScore: calculateDNASimilarity(targetDNA, d.styleDNA),
    reason: getMatchReason(targetDNA, d.styleDNA, emotion),
  }));

  scored.sort((a, b) => b.matchScore - a.matchScore);
  return scored.slice(0, 3);
}

// 生成匹配原因
export function getMatchReason(targetDNA: StyleDNA, styleDNA: StyleDNA, emotion: string): string {
  const matches: string[] = [];
  if (targetDNA.colorTemperature === styleDNA.colorTemperature) matches.push('色温');
  if (targetDNA.saturation === styleDNA.saturation) matches.push('饱和度');
  if (targetDNA.contrast === styleDNA.contrast) matches.push('对比度');
  if (targetDNA.lightingType === styleDNA.lightingType) matches.push('光影');
  if (targetDNA.scale === styleDNA.scale) matches.push('尺度');
  if (matches.length === 0) matches.push('整体氛围');
  return `${emotion}的情绪与该导演的${matches.join('、')}高度匹配`;
}

// 混合两个hex颜色
export function blendHexColors(hexA: string, hexB: string, ratio: number): string {
  const rA = parseInt(hexA.slice(1, 3), 16);
  const gA = parseInt(hexA.slice(3, 5), 16);
  const bA = parseInt(hexA.slice(5, 7), 16);
  const rB = parseInt(hexB.slice(1, 3), 16);
  const gB = parseInt(hexB.slice(3, 5), 16);
  const bB = parseInt(hexB.slice(5, 7), 16);
  const r = Math.round(rA * ratio + rB * (1 - ratio));
  const g = Math.round(gA * ratio + gB * (1 - ratio));
  const b = Math.round(bA * ratio + bB * (1 - ratio));
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// ========== 情绪化渲染：情绪 → 视觉参数映射 ==========

/** 粒子类型（Canvas 背景粒子效果） */
export type ParticleType = 'leaf' | 'sparkle' | 'rain' | 'fog' | 'star' | 'none';

/** 情绪视觉参数 */
export interface EmotionVisual {
  /** 三段渐变背景色（hex），用于与导演配色混合 */
  bgColor: [string, string, string];
  /** 强调色（粒子 / 高光，hex） */
  accentColor: string;
  /** 亮度 0-1，作为情绪色混合占比 */
  lightness: number;
  /** 饱和度 0-1，低于阈值时整体去饱和 */
  saturation: number;
  /** 模糊半径（px），影响柔焦光斑 */
  blurRadius: number;
  /** 粒子数量 */
  particleCount: number;
  /** 粒子类型 */
  particleType: ParticleType;
  /** 渐变角度（度） */
  gradientAngle: number;
  /** 暗角强度 0-1 */
  vignetteIntensity: number;
}

/** 文字语义情绪分析结果 */
export interface TextMood {
  /** 温暖度 0-1 */
  warmth: number;
  /** 能量感 0-1 */
  energy: number;
  /** 阴暗度 0-1 */
  darkness: number;
  /** 复杂度 0-1 */
  complexity: number;
}

/** 合并后的视觉参数（情绪 × 文字），继承 EmotionVisual 并附加调整值 */
export interface MergedVisual extends EmotionVisual {
  adjustedLightness: number;
  adjustedParticleCount: number;
  adjustedBlurRadius: number;
  adjustedVignette: number;
  textMood: TextMood;
}

function _clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// 情绪 → 视觉参数映射表
export const EMOTION_VISUAL: Record<string, EmotionVisual> = {
  neutral: {
    bgColor: ['#d4d4d4', '#c4c4c4', '#b0b0b0'],
    accentColor: '#9e9e9e',
    lightness: 0.5,
    saturation: 0.4,
    blurRadius: 8,
    particleCount: 0,
    particleType: 'none',
    gradientAngle: 180,
    vignetteIntensity: 0.25,
  },
  孤独: {
    bgColor: ['#2c3e50', '#3a4a5a', '#4a5568'],
    accentColor: '#6b7c93',
    lightness: 0.3,
    saturation: 0.25,
    blurRadius: 14,
    particleCount: 6,
    particleType: 'fog',
    gradientAngle: 200,
    vignetteIntensity: 0.5,
  },
  忧伤: {
    bgColor: ['#34495e', '#465869', '#5d6d7e'],
    accentColor: '#5d6d7e',
    lightness: 0.32,
    saturation: 0.28,
    blurRadius: 14,
    particleCount: 40,
    particleType: 'rain',
    gradientAngle: 195,
    vignetteIntensity: 0.5,
  },
  思念: {
    bgColor: ['#b8860b', '#c9a36b', '#d4b88a'],
    accentColor: '#d4b88a',
    lightness: 0.5,
    saturation: 0.45,
    blurRadius: 10,
    particleCount: 5,
    particleType: 'fog',
    gradientAngle: 180,
    vignetteIntensity: 0.35,
  },
  温暖: {
    bgColor: ['#d68a5c', '#e8a87c', '#f4c4a0'],
    accentColor: '#e8a87c',
    lightness: 0.65,
    saturation: 0.6,
    blurRadius: 8,
    particleCount: 14,
    particleType: 'sparkle',
    gradientAngle: 175,
    vignetteIntensity: 0.2,
  },
  治愈: {
    bgColor: ['#5a9e8a', '#7fc4ab', '#a8d8c8'],
    accentColor: '#7fc4ab',
    lightness: 0.6,
    saturation: 0.5,
    blurRadius: 9,
    particleCount: 16,
    particleType: 'leaf',
    gradientAngle: 180,
    vignetteIntensity: 0.22,
  },
  暧昧: {
    bgColor: ['#5b3a6e', '#8e44ad', '#c39bd3'],
    accentColor: '#c39bd3',
    lightness: 0.45,
    saturation: 0.5,
    blurRadius: 12,
    particleCount: 8,
    particleType: 'fog',
    gradientAngle: 190,
    vignetteIntensity: 0.4,
  },
  心动: {
    bgColor: ['#d4738a', '#e89bb0', '#f4c2c2'],
    accentColor: '#e89bb0',
    lightness: 0.62,
    saturation: 0.6,
    blurRadius: 8,
    particleCount: 18,
    particleType: 'sparkle',
    gradientAngle: 180,
    vignetteIntensity: 0.22,
  },
  渴望: {
    bgColor: ['#d4ac0d', '#f4d03f', '#f7dc6f'],
    accentColor: '#f4d03f',
    lightness: 0.6,
    saturation: 0.7,
    blurRadius: 7,
    particleCount: 20,
    particleType: 'sparkle',
    gradientAngle: 180,
    vignetteIntensity: 0.2,
  },
  梦想: {
    bgColor: ['#6a4c93', '#9b7fd4', '#f4d03f'],
    accentColor: '#f4d03f',
    lightness: 0.6,
    saturation: 0.6,
    blurRadius: 8,
    particleCount: 22,
    particleType: 'star',
    gradientAngle: 180,
    vignetteIntensity: 0.25,
  },
  自由: {
    bgColor: ['#2e86c1', '#5dade2', '#85c1e9'],
    accentColor: '#5dade2',
    lightness: 0.65,
    saturation: 0.55,
    blurRadius: 7,
    particleCount: 16,
    particleType: 'sparkle',
    gradientAngle: 180,
    vignetteIntensity: 0.2,
  },
  沉思: {
    bgColor: ['#2c3e50', '#5a8aac', '#7fb3d5'],
    accentColor: '#5a8aac',
    lightness: 0.4,
    saturation: 0.4,
    blurRadius: 11,
    particleCount: 18,
    particleType: 'star',
    gradientAngle: 185,
    vignetteIntensity: 0.4,
  },
  戏谑: {
    bgColor: ['#d68910', '#e8b830', '#f4d03f'],
    accentColor: '#e8b830',
    lightness: 0.65,
    saturation: 0.7,
    blurRadius: 6,
    particleCount: 18,
    particleType: 'sparkle',
    gradientAngle: 180,
    vignetteIntensity: 0.2,
  },
  遗憾: {
    bgColor: ['#7fb09a', '#a8c8b5', '#c8dcc8'],
    accentColor: '#a8c8b5',
    lightness: 0.48,
    saturation: 0.35,
    blurRadius: 12,
    particleCount: 6,
    particleType: 'fog',
    gradientAngle: 180,
    vignetteIntensity: 0.35,
  },
  疲惫: {
    bgColor: ['#4a5568', '#6b7c93', '#95a5a6'],
    accentColor: '#6b7c93',
    lightness: 0.35,
    saturation: 0.25,
    blurRadius: 13,
    particleCount: 24,
    particleType: 'rain',
    gradientAngle: 195,
    vignetteIntensity: 0.45,
  },
  亲情: {
    bgColor: ['#b8860b', '#d4b88a', '#e8c89c'],
    accentColor: '#d4b88a',
    lightness: 0.6,
    saturation: 0.5,
    blurRadius: 9,
    particleCount: 14,
    particleType: 'leaf',
    gradientAngle: 180,
    vignetteIntensity: 0.22,
  },
  幽默: {
    bgColor: ['#d4738a', '#e89bb0', '#f4c2c2'],
    accentColor: '#e89bb0',
    lightness: 0.65,
    saturation: 0.6,
    blurRadius: 7,
    particleCount: 18,
    particleType: 'sparkle',
    gradientAngle: 180,
    vignetteIntensity: 0.2,
  },
  回忆: {
    bgColor: ['#7fb09a', '#a8c8b5', '#c8dcc8'],
    accentColor: '#a8c8b5',
    lightness: 0.5,
    saturation: 0.35,
    blurRadius: 12,
    particleCount: 8,
    particleType: 'fog',
    gradientAngle: 180,
    vignetteIntensity: 0.32,
  },
  震撼: {
    bgColor: ['#0d47a1', '#4fc3f7', '#81d4fa'],
    accentColor: '#4fc3f7',
    lightness: 0.45,
    saturation: 0.5,
    blurRadius: 10,
    particleCount: 24,
    particleType: 'star',
    gradientAngle: 180,
    vignetteIntensity: 0.4,
  },
  童心: {
    bgColor: ['#ffa726', '#ffd54f', '#fff176'],
    accentColor: '#ffd54f',
    lightness: 0.7,
    saturation: 0.7,
    blurRadius: 6,
    particleCount: 22,
    particleType: 'sparkle',
    gradientAngle: 180,
    vignetteIntensity: 0.18,
  },
  释然: {
    bgColor: ['#66bb6a', '#81c784', '#a5d6a7'],
    accentColor: '#81c784',
    lightness: 0.62,
    saturation: 0.5,
    blurRadius: 8,
    particleCount: 16,
    particleType: 'sparkle',
    gradientAngle: 180,
    vignetteIntensity: 0.2,
  },
  悲壮: {
    bgColor: ['#641e16', '#c0392b', '#1a1a1a'],
    accentColor: '#f1c40f',
    lightness: 0.35,
    saturation: 0.6,
    blurRadius: 11,
    particleCount: 30,
    particleType: 'rain',
    gradientAngle: 200,
    vignetteIntensity: 0.5,
  },
  漂泊: {
    bgColor: ['#4a5568', '#7a7a6e', '#95a5a6'],
    accentColor: '#a89060',
    lightness: 0.4,
    saturation: 0.3,
    blurRadius: 13,
    particleCount: 8,
    particleType: 'fog',
    gradientAngle: 190,
    vignetteIntensity: 0.4,
  },
  怀旧: {
    bgColor: ['#7a6a48', '#a89060', '#d5c8a8'],
    accentColor: '#a89060',
    lightness: 0.45,
    saturation: 0.35,
    blurRadius: 12,
    particleCount: 10,
    particleType: 'fog',
    gradientAngle: 180,
    vignetteIntensity: 0.35,
  },
  迷茫: {
    bgColor: ['#5a5a6a', '#7a7a8a', '#9aa0aa'],
    accentColor: '#7a7a8a',
    lightness: 0.4,
    saturation: 0.25,
    blurRadius: 14,
    particleCount: 8,
    particleType: 'fog',
    gradientAngle: 185,
    vignetteIntensity: 0.42,
  },
  执念: {
    bgColor: ['#1a1a2e', '#2c2c4e', '#4a3060'],
    accentColor: '#8e44ad',
    lightness: 0.3,
    saturation: 0.5,
    blurRadius: 12,
    particleCount: 16,
    particleType: 'star',
    gradientAngle: 200,
    vignetteIntensity: 0.5,
  },
  苦甜: {
    bgColor: ['#3d2a5a', '#6a4c93', '#ff6b35'],
    accentColor: '#ffd23f',
    lightness: 0.5,
    saturation: 0.6,
    blurRadius: 9,
    particleCount: 18,
    particleType: 'sparkle',
    gradientAngle: 180,
    vignetteIntensity: 0.35,
  },
};

// 文字语义情绪分析关键词
const _WARM_KEYWORDS = ['阳光', '温暖', '暖', '光', '热', '笑', '爱', '春', '夏', '花', '金', '希望', '拥抱'];
const _COLD_KEYWORDS = ['冷', '寒', '冰', '冬', '雪', '凉', '暗', '黑', '夜', '霜'];
const _ENERGY_KEYWORDS = ['跑', '飞', '冲', '燃', '激情', '心跳', '快', '奔', '舞', '唱', '梦', '勇', '追', '爆'];
const _CALM_KEYWORDS = ['静', '慢', '沉', '睡', '停', '缓', '淡', '轻', '柔', '默', '安', '宁'];
const _DARK_KEYWORDS = [
  '黑',
  '暗',
  '夜',
  '阴影',
  '死',
  '哭',
  '痛',
  '孤独',
  '悲',
  '伤',
  '泪',
  '离',
  '失',
  '空',
  '碎',
  '寒',
];
const _LIGHT_KEYWORDS = ['光', '明', '阳', '晴', '晨', '暖', '笑', '希望', '亮', '辉'];

/** 分析文字语义，返回四维情绪倾向 */
export function analyzeTextMood(text: string): TextMood {
  if (!text || text.trim().length === 0) {
    return { warmth: 0.5, energy: 0.5, darkness: 0.3, complexity: 0.3 };
  }
  let warm = 0,
    cold = 0,
    energy = 0,
    calm = 0,
    dark = 0,
    light = 0;
  _WARM_KEYWORDS.forEach((k) => {
    if (text.includes(k)) warm++;
  });
  _COLD_KEYWORDS.forEach((k) => {
    if (text.includes(k)) cold++;
  });
  _ENERGY_KEYWORDS.forEach((k) => {
    if (text.includes(k)) energy++;
  });
  _CALM_KEYWORDS.forEach((k) => {
    if (text.includes(k)) calm++;
  });
  _DARK_KEYWORDS.forEach((k) => {
    if (text.includes(k)) dark++;
  });
  _LIGHT_KEYWORDS.forEach((k) => {
    if (text.includes(k)) light++;
  });

  const warmth = _clamp01(0.5 + (warm - cold) * 0.12);
  const energyVal = _clamp01(0.5 + (energy - calm) * 0.12);
  const darkness = _clamp01(0.3 + (dark - light) * 0.12);
  const complexity = _clamp01(Math.min(1, text.length / 60));
  return { warmth, energy: energyVal, darkness, complexity };
}

/** 合并情绪视觉参数与文字语义，输出最终渲染参数 */
export function mergeEmotionAndText(emotion: string, text: string): MergedVisual {
  const base = EMOTION_VISUAL[emotion] || EMOTION_VISUAL['neutral'];
  const textMood = analyzeTextMood(text);

  const adjustedLightness = _clamp01(base.lightness + (textMood.warmth - 0.5) * 0.2 - textMood.darkness * 0.15);
  const adjustedParticleCount = Math.max(0, Math.round(base.particleCount * (1 + (textMood.energy - 0.5) * 0.4)));
  const adjustedBlurRadius = Math.max(0, base.blurRadius * (1 + textMood.complexity * 0.2));
  const adjustedVignette = _clamp01(base.vignetteIntensity + textMood.darkness * 0.15);

  return {
    ...base,
    adjustedLightness,
    adjustedParticleCount,
    adjustedBlurRadius,
    adjustedVignette,
    textMood,
  };
}
