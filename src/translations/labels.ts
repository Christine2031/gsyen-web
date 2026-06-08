// 品牌实验室各下拉/网格的中文标签字典（符号/预设/色板/分类/字体/几何/边框）。

export const SYMBOL_TRANSLATIONS: Record<string, string> = {
  // Core
  'Premium Layers': '至臻多层叠影',
  'Creative Sparkles': '创想闪耀星芒',
  'Vintage Carriage': '世纪老爷车/皇家御车',
  'Royal Crown': '皇室加冕王冠',
  'Luxury Jewel': '极光奢华美钻',
  'Trust Guard': '至信御盾卫士',
  'Energy Core': '源源炽热能量',

  // Tech
  'Neural Processor': '神经突触加速器',
  'Big Data': '海量多维数据',
  'Global Network': '环球经纬网络',
  'Velocity Bolt': '极速动能闪电',
  'Molecular Atom': '探索分子微观',
  'Shell Terminal': '交互极客终端',

  // Abstract
  'Structural Hex': '晶格架构六角',
  'Precision Guide': '精密极点罗盘',
  'Infinity Loom': '无极无限织网',
  'Isometric Cuboid': '等轴三维立方',
  'Absolute Center': '核心交织极点',
  'Focus Finder': '精密多重对焦',

  // Retail
  'Artisan Coffee': '典雅手冲咖啡',
  'Retail Atelier': '奢雅高定制剪',
  'Fine Sommelier': '勃艮第精选红酒',
  'Craft Logistics': '匠人手作木盒包装',
  'Design Tailor': '灵感金剪工坊',
  'Secret Custody': '秘阁圣殿之钥',

  // Nature
  'Organic Leaf': '生机自然绿叶',
  'Solar Energy': '万物向日暖阳',
  'Nocturnal Calm': '静谧深邃明月',
  'Seed Sprout': '破土萌发生机',
  'Aerodynamic draft': '流体风动风洞',
  'Wellness Center': '悦动身心之爱',
};

export const PRESET_TRANSLATIONS: Record<string, { name: string; desc: string }> = {
  'luxury-premium': {
    name: "经典璀璨奢华 (Classique)",
    desc: "优雅的经典首字母或图腾组合，精心搭配流金质感色谱与极高雅的衬线大写字族。"
  },
  'modern-saas': {
    name: "前沿高雅 SaaS (Clean)",
    desc: "极简现代云端与微电子制图风格，以简洁、纯粹的几何语言和动感科技深蓝表达。"
  },
  'atelier-craft': {
    name: "自然美学工坊 (Atelier)",
    desc: "将朴素温润的陶土、大地与森林配色融入隽永典雅的编辑衬线体中，自然原生态。"
  },
  'neon-terminal': {
    name: "硬核极客终端 (Terminal)",
    desc: "不加雕琢的大胆霓虹终端，硬邦邦的等宽代码字体与荧光绿色强对比，致敬早期黑客。"
  },
  'creative-vapor': {
    name: "梦幻蒸汽霓虹 (Vapor)",
    desc: "融合蒸汽波潮流的高饱和变幻紫粉色渐变，适用于前沿设计师事务所与数码科技厂牌。"
  }
};

export const PALETTE_TRANSLATIONS: Record<string, string> = {
  'midnight-gold': "午夜流金 (Midnight Gold)",
  'nord-blue': "北欧冷电 (Nordic Clean)",
  'rust-clay': "陶土鼠尾 (Clay & Sage)",
  'cyberpunk': "赛博绚烂 (Vapor Wave)",
  'classic-ink': "纯黑经典 (Classic Ink)",
  'forest-moss': "林冠苔藓 (Forest Canopy)",
  'neon-dark': "荧光矩阵 (Neon Grid)"
};

export const CATEGORY_TRANSLATIONS: Record<string, string> = {
  'all': "全部",
  'core': "经典",
  'tech': "科技",
  'abstract': "抽象",
  'retail': "零售",
  'nature': "自然"
};

export const TIMEPACE_TRANSLATIONS: Record<string, string> = {
  'sans': "Inter 极简",
  'display': "Outfit 现代",
  'space': "Space 前卫",
  'serif': "Playfair 经典",
  'cinzel': "Cinzel 奢雅",
  'mono': "JetBrains 密码"
};

export const GEOMETRY_TRANSLATIONS: Record<string, string> = {
  'horizontal': "横向组合",
  'vertical': "纵向组合",
  'icon-only': "仅主图标",
  'text-only': "仅纯文字",
  'badge': "徽章排布"
};

export const BORDER_TRANSLATIONS: Record<string, string> = {
  'none': "基础无边框",
  'circle': "古典圆形",
  'square': "圆角正方",
  'shield': "卫士之盾",
  'hexagon': "工整六边"
};
