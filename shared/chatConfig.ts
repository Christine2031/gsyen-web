// 神机百炼配置 —— server.ts 与 api/chat.ts 共享的唯一真源。
// 日期助手、各领域 system 后缀、模型路由表、Gemini schema、注入过滤规则。

// ── 司辰 · 日期助手 ────────────────────────────────────────────────────────
// 优先读环境变量时区，兜底北京时间。Intl 在 Node 与 Edge 运行时均可用。
export function todayDateStr(): string {
  const tz = process.env.SICHEN_TZ || 'Asia/Shanghai';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()); // en-CA 即 YYYY-MM-DD
}

// 把 "今天" 按相对天数换算为具体日期 —— 小模型不擅长日期算术，
// 直接把"明天/后天"算好喂给它，避免它把"明天"算成"今天"或更离谱。
export function offsetDateStr(todayStr: string, days: number): string {
  const d = new Date(`${todayStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── 神机百炼 · Chronos 系统后缀（日程） ────────────────────────────────────
export function scheduleSystemSuffix(
  today: string,
  events: Array<{ id: string; title: string; date: string; time: string }> = []
): string {
  const eventsCtx = events.length > 0
    ? `\n当前已有日程（update/delete 时按 title 匹配）：\n${events.map(e => `  [${e.date} ${e.time}] ${e.title}`).join('\n')}`
    : '';
  const yesterday = offsetDateStr(today, -1);
  const tomorrow  = offsetDateStr(today, 1);
  const dayAfter  = offsetDateStr(today, 2);
  return `

【神机百炼 · Chronos — 必须输出 JSON】
每次回复必须是严格 JSON，格式：
{"reply":"回复内容","action":"<按下方枚举选择>","event":{"title":"","date":"","time":"","category":"","location":"","subtitle":""}}

action 字段必须按用户真实意图选择，绝不能无脑填默认值：
- "create"  → 意图明确的安排（开会/接人/吃饭/有具体时间的事）→ 必须用 create，禁止用 none
- "confirm" → 意图模糊或不确定（"我想想""要不要""可能"）→ reply 问"请问是否要建立行程？"，event 预填信息
- "update"  → 修改已有日程，event.title 填原标题
- "delete"  → 删除/取消日程，event.title 填要删除的标题
- "query"   → 查询安排，reply 里直接列出
- "none"    → 仅当闲聊、提问、与日程完全无关时才用；此时 event 全空
判定要点：只要用户说了"要做某事 + 时间"，就是 create；event.title 提炼核心事件名，不要复读用户原话整句。

【日期换算 — 直接照抄，不要自己计算】
今天 = ${today}
昨天 = ${yesterday}
明天 = ${tomorrow}
后天 = ${dayAfter}
用户说"今天"就填 ${today}，说"明天"就填 ${tomorrow}，说"后天"就填 ${dayAfter}，说"昨天"就填 ${yesterday}——直接照抄上面对应的日期字符串，禁止自行推算。

create/confirm 时 event 填完整字段：date 默认 ${today}，time 默认 09:00，category 默认 strategy。${eventsCtx}`;
}

// 未命中日程意图关键词时的极简后缀 —— 不附 action 枚举与日程列表，
// 避免小模型把"请输出 JSON"误读成"本条也要判定日程动作"而幻觉出 create。
export function noScheduleSystemSuffix(): string {
  return `

【输出格式】必须输出严格 JSON：{"reply":"回复内容","action":"none","event":null}
本条消息与日程/账务无关，action 必须固定为 "none"，event 固定为 null，只在 reply 中正常对话。`;
}

// ── 神机百炼 · Ledger 系统后缀（账务，含 currency） ─────────────────────────
export function ledgerSystemSuffix(today: string): string {
  return `

【神机百炼 · Ledger — 必须输出 JSON】
每次回复必须是严格 JSON，格式：
{"reply":"回复内容","action":"create","event":{"description":"记录描述","amount":100,"currency":"CNY","type":"expense","category":"material","date":"YYYY-MM-DD","notes":"备注"}}

action 枚举：
- "create" → 记录一笔账务（用户说了消费/收入金额）
- "none"   → 仅对话，不记账

currency 枚举（必须二选一，按用户原话的币种判断）：
- "CNY" → 用户说"元/块/¥/人民币"
- "USD" → 用户说"美元/美金/刀/$/USD"

type 枚举（必须二选一）：
- "income"  → 收入、到账、回款
- "expense" → 支出、消费、花费、付款

category 枚举（根据描述判断）：
- "royalty"      → 授权税收、版税
- "commission"   → 佣金、定制费、顾问费
- "material"     → 物料、采购、耗材
- "server"       → 服务器、云服务、订阅
- "marketing"    → 推广、营销、广告
- "consultancy"  → 咨询、顾问、培训

【日期】今天 = ${today}。用户不说日期则默认 ${today}。
amount 必须是纯数字（不含单位），"100美金" → 100，"500元" → 500。`;
}

// ── Gemini responseSchema（action 变体，与 Chronos 对齐） ───────────────────
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply:  { type: 'STRING' },
    action: { type: 'STRING', enum: ['none', 'create', 'update', 'delete', 'query'] },
    event: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        title:    { type: 'STRING' },
        date:     { type: 'STRING' },
        time:     { type: 'STRING' },
        category: { type: 'STRING' },
        location: { type: 'STRING' },
        subtitle: { type: 'STRING' },
      },
    },
  },
  required: ['reply', 'action'],
};

// ── 模型路由表（新增模型：加一条 + 配环境变量即可） ─────────────────────────
// 开发/内网：OLLAMA_BASE_URL=http://100.117.152.101:11434 (Tailscale)
// 生产/公网：OLLAMA_BASE_URL=https://llm.gsyen.com         (Cloudflare Tunnel)
// ⚠️ 基座兜底（2026-06-09）：微调模型 gsyen-ethan/gsyen-fast 训练数据有缺陷，
//   暂切回 Qwen2.5 基座 + 强 prompt 做字段抽取。详见 tasks/gsyen-model-training。
export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

export const MODEL_ROUTES: Record<string, { url: string; envKey: string; modelId: string }> = {
  kimi:     { url: 'https://api.moonshot.cn/v1/chat/completions',     envKey: 'MOONSHOT_API_KEY',  modelId: 'kimi-k2.5' },
  deepseek: { url: 'https://api.deepseek.com/v1/chat/completions',    envKey: 'DEEPSEEK_API_KEY',  modelId: 'deepseek-chat' },
  claude:   { url: 'https://api.anthropic.com/v1/messages',          envKey: 'ANTHROPIC_API_KEY', modelId: 'claude-sonnet-4-6' },
  chatgpt:  { url: 'https://api.openai.com/v1/chat/completions',      envKey: 'OPENAI_API_KEY',    modelId: 'gpt-4o' },
  gemini:   { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', envKey: 'GEMINI_API_KEY', modelId: 'gemini-2.0-flash' },
  ethan:    { url: `${OLLAMA_BASE_URL}/v1/chat/completions`,          envKey: 'OLLAMA_BASE_URL',   modelId: 'qwen2.5:7b' },
  fast:     { url: `${OLLAMA_BASE_URL}/v1/chat/completions`,          envKey: 'OLLAMA_BASE_URL',   modelId: 'qwen2.5:3b' },
};

// ── 服务端提示词注入过滤 ───────────────────────────────────────────────────
export const INJECTION_PATTERNS = [
  /忽略.*指令/,
  /ignore.*instruction/i,
  /从现在起.*叫/,
  /你现在是.*助手/,
  /your new name/i,
  /forget.*previous/i,
  /新的身份/,
];
