import { describe, expect, it } from 'vitest';
import { chatGptModelName, CHATGPT_MODEL_SMOKE_IDS } from './codexModelMap';

describe('ChatGPT model mapping', () => {
  it.each([
    ['gpt-5-6-sol', 'gpt-5.6-sol'],
    ['gpt-5-6-terra', 'gpt-5.6-terra'],
    ['gpt-5-6-luna', 'gpt-5.6-luna'],
  ])('maps %s to %s', (configured, runtime) => {
    expect(chatGptModelName(configured)).toBe(runtime);
  });

  it('upgrades missing and legacy model ids to 5.6 Sol', () => {
    expect(chatGptModelName()).toBe('gpt-5.6-sol');
    expect(chatGptModelName('gpt-5-5')).toBe('gpt-5.6-sol');
  });

  it('smoke-tests only current 5.6 models', () => {
    expect(CHATGPT_MODEL_SMOKE_IDS).toEqual([
      'gpt-5-6-sol',
      'gpt-5-6-terra',
      'gpt-5-6-luna',
    ]);
  });
});
