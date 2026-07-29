export interface ModelConfig {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface ChatGptModelConfig {
  id: string;
  label: string;
}

export type ModelId = 'fast' | 'ethan' | 'kimi' | 'deepseek' | 'chatgpt' | 'chatgpt-pro';

export const MODELS: ModelConfig[] = [
  { id: 'fast',     label: '疆域·轻' },
  { id: 'ethan',    label: '疆域·思' },
  { id: 'kimi',     label: 'KIMI-K2.5' },
  { id: 'deepseek', label: 'DEEPSEEK' },
  { id: 'chatgpt-pro', label: 'CHATGPT' },
];

export const CHATGPT_MODELS: ChatGptModelConfig[] = [
  { id: 'gpt-5-6-sol', label: 'GPT-5.6-SOL' },
  { id: 'gpt-5-6-terra', label: 'GPT-5.6-TERRA' },
  { id: 'gpt-5-6-luna', label: 'GPT-5.6-LUNA' },
];

export const DEFAULT_CHATGPT_MODEL = CHATGPT_MODELS[0].id;
export const DEFAULT_MODEL: ModelId = 'kimi';

const enabledModelIds = new Set(MODELS.filter(m => !m.disabled).map(m => m.id));

export function isModelId(value: string | null | undefined): value is ModelId {
  return !!value && enabledModelIds.has(value);
}

export function firstEnabledModel(): ModelId {
  return (MODELS.find(m => !m.disabled)?.id ?? DEFAULT_MODEL) as ModelId;
}

export function normalizeChatGptModel(value: string | null | undefined): string {
  return CHATGPT_MODELS.some(model => model.id === value)
    ? value!
    : DEFAULT_CHATGPT_MODEL;
}
