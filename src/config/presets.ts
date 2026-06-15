export interface PresetQuery {
  zh: string;
  en: string;
}

export const PRESET_QUERIES: PresetQuery[] = [
  {
    zh: '明天下午三点有个产品会议，大概两小时',
    en: 'Product meeting tomorrow at 3 PM, about 2 hours'
  },
  {
    zh: '帮我保存：Citibank Online，用户名 ethan@gsyen.com，密码 MyBank@2024',
    en: 'Save to vault: Citibank Online — user: ethan@gsyen.com / MyBank@2024'
  },
  {
    zh: '我刚买了 iPhone 16 Pro Max 钛金色 256G，花了 ¥9499',
    en: 'Just bought iPhone 16 Pro Max Titanium 256GB for ¥9,499'
  }
];

export const PRESET_SHORT_LABELS: { zh: string; en: string }[] = [
  { zh: '明天3点开会', en: 'Tomorrow 3PM'  },
  { zh: '保存密码',   en: 'Save Password' },
  { zh: '买了iPhone', en: 'New Purchase'  },
];
