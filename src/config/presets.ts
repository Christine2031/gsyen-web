export interface PresetQuery {
  zh: string;
  en: string;
}

export const PRESET_QUERIES: PresetQuery[] = [
  {
    zh: '帮我设计一个香氛品牌，想五个高雅脱俗的名字及奢华口号',
    en: 'Design a high-end fragrance brand with 5 poetic names & luxury taglines'
  },
  {
    zh: '能帮我规划一份奢雅艺术画廊首展的整周日程看板安排吗？',
    en: 'Schedule a week-long kanban calendar itinerary for a luxury gallery opening'
  },
  {
    zh: '作为一个经典瑞士手工腕表工坊，其品牌核心视觉符号设计有何建议？',
    en: 'What iconic symbol and font parameters suit an elite artisan watchmaker?'
  },
  {
    zh: '如何用复式记账法优雅地记录我的品牌初创资金与流转？',
    en: 'Explain double-entry bookkeeping flow for our creative design workspace'
  }
];

export const PRESET_SHORT_LABELS: { zh: string; en: string }[] = [
  { zh: '品牌命名', en: 'Brand Name' },
  { zh: '日程规划', en: 'Schedule'   },
  { zh: '符号设计', en: 'Symbol'     },
  { zh: '财务记账', en: 'Finance'    },
];
