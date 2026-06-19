export type CardType      = 'text' | 'entity' | 'connector';
export type EntityType    = 'contact' | 'order' | 'task' | 'schedule' | 'file' | 'custom';
export type StatusColor   = 'green' | 'amber' | 'red' | 'gray';
export type ConnectorType = 'calls' | 'imports' | 'routes' | 'references' | 'custom';
export type ModuleColor   = 'purple' | 'blue' | 'green' | 'amber' | 'red' | 'teal';

export interface CardData extends Record<string, unknown> {
  /* common */
  cardType?:        CardType;
  text:             string;
  color?:           string;          // Obsidian left-bar '1'–'6'
  defaultEditing?:  boolean;
  width?:           number;
  height?:          number;

  /* entity card */
  entityType?:      EntityType;
  entityName?:      string;
  entitySub?:       string;
  status?:          string;
  statusColor?:     StatusColor;
  lastMessage?:     string;
  connectionCount?: number;
  timestamp?:       string;

  /* connector card */
  connectorName?:   string;
  connectorType?:   ConnectorType;
  flowA?:           string;
  flowB?:           string;
  flowLabel?:       string;

  /* Obsidian round-trip preservation */
  _obs?:            unknown;
}

export interface BoxData extends Record<string, unknown> {
  label:       string;
  moduleColor: ModuleColor;
  childCount?: number;
  collapsed?:  boolean;
}

/* Status pill colour tokens */
export const STATUS_COLORS: Record<StatusColor, { bg: string; fg: string }> = {
  green: { bg: '#DCFCE7', fg: '#166534' },
  amber: { bg: '#FEF9C3', fg: '#854D0E' },
  red:   { bg: '#FEE2E2', fg: '#991B1B' },
  gray:  { bg: '#F3F4F6', fg: '#374151' },
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
