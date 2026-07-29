export type CardType      = 'text' | 'entity' | 'connector' | 'solid';
export type CardSize      = 'S' | 'M' | 'L';
export type ContentType   = 'note' | 'code' | 'image' | 'link' | 'task' | 'quote' | 'table' | 'math';
export type CardBorder    = 'solid' | 'dashed';
export type CardAccent    = '' | 'blue' | 'green' | 'amber' | 'yellow' | 'red' | 'purple' | 'cyan' | 'gray' | 'black';
export type CardElevation = 'flat' | 'float';
export type CardOpacity   = 'solid' | 'frosted';
export type CardCorner    = 'sm' | 'none';
export type CardDensity   = 'compact' | 'loose';
export type CardState     = 'normal' | 'highlight' | 'fade';
export type EntityType    = 'contact' | 'order' | 'task' | 'schedule' | 'file' | 'custom';
export type StatusColor   = 'green' | 'amber' | 'yellow' | 'red' | 'gray';
export type ConnectorType = 'calls' | 'imports' | 'routes' | 'references' | 'custom';
export type ModuleColor   = 'purple' | 'blue' | 'green' | 'amber' | 'red' | 'teal';

export interface CardData extends Record<string, unknown> {
  /* common */
  cardType?:        CardType;
  cardSize?:        CardSize;
  text:             string;
  color?:           string;          // Obsidian left-bar '1'–'6'
  defaultEditing?:  boolean;
  width?:           number;
  height?:          number;
  childIds?:        string[];
  parentPortalId?:  string;
  portalExpanded?:  boolean;
  sourcePath?:      string;

  /* visual properties (Card Panel) */
  contentType?:     ContentType;
  cardBorder?:      CardBorder;
  cardAccent?:      CardAccent;
  cardElevation?:   CardElevation;
  cardOpacity?:     CardOpacity;
  cardCorner?:      CardCorner;
  cardDensity?:     CardDensity;
  cardState?:       CardState;

  /* entity card */
  entityType?:      EntityType;
  entityName?:      string;
  entitySub?:       string;
  status?:          string;
  statusColor?:     StatusColor;
  lastMessage?:     string;
  connectionCount?: number;
  timestamp?:       string;

  /* entity card extra */
  statusNote?:      string;          // "3单 · ¥128,000" 等状态补充行

  /* connector card */
  connectorName?:   string;
  connectorType?:   ConnectorType;
  flowA?:           string;
  flowB?:           string;
  flowA2?:          string;          // 第二条 flow 起点
  flowB2?:          string;          // 第二条 flow 终点
  flowNote?:        string;          // "每次对话触发 · POST · stream"
  flowBidirectional?: boolean;       // 是否显示"双向可见"

  /* Obsidian round-trip preservation */
  _obs?:            unknown;
}

export interface BoxData extends Record<string, unknown> {
  label:       string;
  moduleColor: ModuleColor;
  childCount?: number;
  collapsed?:  boolean;
  collectionId?: string;
  width?:       number;
  height?:      number;
  absorbPreview?: boolean;
}

/* Status pill colour tokens */
export const STATUS_COLORS: Record<StatusColor, { bg: string; fg: string }> = {
  green: { bg: '#DCFCE7', fg: '#166534' },
  amber: { bg: '#FEF9C3', fg: '#854D0E' },
  yellow:{ bg: '#FEF9C3', fg: '#713F12' },
  red:   { bg: '#FEE2E2', fg: '#991B1B' },
  gray:  { bg: '#F3F4F6', fg: '#374151' },
};

/* Per-type status presets */
export const CT_STATUS: Record<ContentType, { label: string; color: StatusColor }[]> = {
  note:  [{ label:'草稿', color:'gray' }, { label:'发布', color:'green' }, { label:'归档', color:'gray' }],
  code:  [{ label:'开发中', color:'amber' }, { label:'审查', color:'amber' }, { label:'完成', color:'green' }, { label:'废弃', color:'gray' }],
  image: [{ label:'草稿', color:'gray' }, { label:'定稿', color:'amber' }, { label:'已批准', color:'green' }],
  link:  [{ label:'有效', color:'green' }, { label:'失效', color:'red' }, { label:'归档', color:'gray' }],
  task:  [{ label:'待办', color:'gray' }, { label:'进行中', color:'amber' }, { label:'完成', color:'green' }, { label:'阻塞', color:'red' }],
  table: [{ label:'草稿', color:'gray' }, { label:'发布', color:'green' }, { label:'过时', color:'red' }],
  math:  [{ label:'草稿', color:'gray' }, { label:'已验证', color:'green' }],
  quote: [{ label:'草稿', color:'gray' }, { label:'发布', color:'green' }, { label:'已引用', color:'amber' }],
};

/* Module colour tokens – used by CanvasBox and any module-aware chip */
export const MODULE_COLORS: Record<ModuleColor, {
  border: string; bg: string; header: string; fg: string; chipBg: string; countBg: string;
}> = {
  purple: { border: 'rgba(139,92,246,0.38)',  bg: 'rgba(139,92,246,0.04)',  header: 'rgba(139,92,246,0.10)',  fg: 'rgba(91,33,182,0.88)',   chipBg: 'rgba(139,92,246,0.07)',  countBg: 'rgba(139,92,246,0.14)'  },
  blue:   { border: 'rgba(59,130,246,0.38)',  bg: 'rgba(59,130,246,0.04)',  header: 'rgba(59,130,246,0.10)',  fg: 'rgba(29,78,216,0.88)',   chipBg: 'rgba(59,130,246,0.07)',  countBg: 'rgba(59,130,246,0.14)'  },
  green:  { border: 'rgba(34,197,94,0.38)',   bg: 'rgba(34,197,94,0.04)',   header: 'rgba(34,197,94,0.10)',   fg: 'rgba(21,128,61,0.88)',   chipBg: 'rgba(34,197,94,0.07)',   countBg: 'rgba(34,197,94,0.14)'   },
  amber:  { border: 'rgba(245,158,11,0.38)',  bg: 'rgba(245,158,11,0.04)',  header: 'rgba(245,158,11,0.10)',  fg: 'rgba(146,64,14,0.88)',   chipBg: 'rgba(245,158,11,0.07)',  countBg: 'rgba(245,158,11,0.14)'  },
  red:    { border: 'rgba(239,68,68,0.38)',   bg: 'rgba(239,68,68,0.04)',   header: 'rgba(239,68,68,0.10)',   fg: 'rgba(185,28,28,0.88)',   chipBg: 'rgba(239,68,68,0.07)',   countBg: 'rgba(239,68,68,0.14)'   },
  teal:   { border: 'rgba(20,184,166,0.38)',  bg: 'rgba(20,184,166,0.04)',  header: 'rgba(20,184,166,0.10)',  fg: 'rgba(15,118,110,0.88)',  chipBg: 'rgba(20,184,166,0.07)',  countBg: 'rgba(20,184,166,0.14)'  },
};
