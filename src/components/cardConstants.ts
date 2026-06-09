// ActionCardView 的常量与两色配色（个人/团队身份 → 两种颜色，详见记忆 design-card-core）。
import { Transaction } from '../stores/ledgerStore';

// 记账分类的简短中/英文标签——与「复式财务账簿」命名体系一致。
export const LEDGER_CATEGORY_LABEL: Record<Transaction['category'], { zh: string; en: string }> = {
  royalty:     { zh: '版税授权', en: 'Royalty' },
  commission:  { zh: '高定佣金', en: 'Commission' },
  material:    { zh: '物料介质', en: 'Material' },
  server:      { zh: '云端节点', en: 'Server' },
  marketing:   { zh: '推广公关', en: 'Marketing' },
  consultancy: { zh: '顾问咨询', en: 'Consultancy' },
};

export const ACTION_LABEL_ZH: Record<string, string> = {
  create: '已建立', update: '已更新', delete: '已删除', query: '今日日程',
};
export const ACTION_LABEL_EN: Record<string, string> = {
  create: 'CREATED', update: 'UPDATED', delete: 'DELETED', query: 'TODAY',
};

// 卡片宽度按模块固定，左侧聚焦栏恒 148px，保证左右比例一致、不随内容伸缩。
export const CARD_WIDTH: Record<string, string> = {
  LEDGER:  'w-[420px]',
  PAYMENT: 'w-[420px]',
  CHRONOS: 'w-[360px]',
  MAIL:    'w-[400px]',
  VAULT:   'w-[400px]',
  CANVAS:  'w-[420px]',
  ORDER:   'w-[420px]',
};
// 展开态宽度随高度等比舒展（auto 宽度无法动画，必须给具体值配合 transition-[width]）。
export const CARD_WIDTH_EXPANDED: Record<string, string> = {
  CHRONOS: 'w-[420px]',
  LEDGER:  'w-[420px]',
  MAIL:    'w-[520px]',   // Level 2 展开态
  VAULT:   'w-[460px]',
  ORDER:   'w-[460px]',  // Level 2 展开态
  CANVAS:  'w-[520px]',  // Level 2 展开态
};
export const CARD_WIDTH_COMPOSE: Record<string, string> = {
  MAIL:   'w-[900px]',    // Level 3 撰写态（max-w-full 兜底，确保不超出容器）
  CANVAS: 'w-[900px]',   // Level 3 编辑器态
};

// 两种身份 → 两套配色。对内(self)=PANTONE 10101 C 冷灰深字；对外(shared)=Regatta 蓝白字。
// 展开面板沿用同一色相——「原地原色」，不另起配色体系。
export function getCardColor(isShared: boolean) {
  return isShared
    ? {
        focus:      'bg-[#3C5D88]',
        body:       'bg-[#4F77AC]',
        border:     'border-white/[0.05]',
        focusSub:   'text-white/30',
        label:      'text-white/30',
        title:      'text-white/90',
        titleDel:   'text-white/40',
        tag:        'text-white/35 bg-white/[0.04]',
        panelBorder: 'border-white/[0.12]',
        panelLabel:  'text-white/40',
        panelText:   'text-white/85',
        panelInput:  'bg-white/10 border-white/20 text-white placeholder:text-white/30 focus:border-white/45',
        btnGhost:    'bg-white/10 hover:bg-white/[0.18] text-white/70',
        btnPrimary:  'bg-white text-[#3C5D88] hover:bg-white/90',
        btnDanger:   'bg-white/10 hover:bg-white/[0.16] text-rose-200/75 hover:text-rose-100',
      }
    : {
        focus:      'bg-[#B8B9B7]',
        body:       'bg-[#C8C9C7]',
        border:     'border-[#1A1A1A]/[0.08]',
        focusSub:   'text-[#1A1A1A]/40',
        label:      'text-[#1A1A1A]/35',
        title:      'text-[#1A1A1A]/85',
        titleDel:   'text-[#1A1A1A]/30',
        tag:        'text-[#1A1A1A]/50 bg-[#1A1A1A]/[0.07]',
        panelBorder: 'border-[#1A1A1A]/[0.10]',
        panelLabel:  'text-[#1A1A1A]/40',
        panelText:   'text-[#1A1A1A]/80',
        panelInput:  'bg-[#1A1A1A]/[0.05] border-[#1A1A1A]/15 text-[#1A1A1A]/85 placeholder:text-[#1A1A1A]/30 focus:border-[#1A1A1A]/35',
        btnGhost:    'bg-[#1A1A1A]/[0.06] hover:bg-[#1A1A1A]/[0.10] text-[#1A1A1A]/60',
        btnPrimary:  'bg-[#1A1A1A] text-[#F4F2EE] hover:bg-[#1A1A1A]/85',
        btnDanger:   'bg-[#1A1A1A]/[0.06] hover:bg-[#1A1A1A]/[0.10] text-rose-700/55 hover:text-rose-700/80',
      };
}

export type CardColor = ReturnType<typeof getCardColor>;
