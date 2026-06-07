export interface ModelConfig {
  id: string;
  label: string;
  disabled?: boolean;
}

export type ModelId = 'fast' | 'ethan' | 'kimi' | 'deepseek' | 'claude' | 'chatgpt' | 'gemini';

export const MODELS: ModelConfig[] = [
  { id: 'fast',     label: '疆域·轻' },
  { id: 'ethan',    label: '疆域·思' },
  { id: 'kimi',     label: 'KIMI-K2.5' },
  { id: 'deepseek', label: 'DEEPSEEK' },
  { id: 'claude',   label: 'CLAUDE',  disabled: true },
  { id: 'chatgpt',  label: 'CHATGPT', disabled: true },
  { id: 'gemini',   label: 'GEMINI',  disabled: true },
];

export const DEFAULT_MODEL: ModelId = 'ethan';
