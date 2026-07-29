export function chatGptModelName(model?: string | null): string {
  if (model === 'gpt-5-6-terra') return 'gpt-5.6-terra';
  if (model === 'gpt-5-6-luna') return 'gpt-5.6-luna';
  return 'gpt-5.6-sol';
}

export const CHATGPT_MODEL_SMOKE_IDS = [
  'gpt-5-6-sol',
  'gpt-5-6-terra',
  'gpt-5-6-luna',
];
