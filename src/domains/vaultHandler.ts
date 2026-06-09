import { ActionCard } from '../types/chat';
import { DomainHandler, DomainActionResult } from './types';
import { CredentialRow, CredentialCategory } from '../components/passwordVault';
import { vaultStore } from '../stores/vaultStore';

const CATEGORY_LABEL: Record<CredentialCategory, string> = {
  api:      'API',
  server:   'SRV',
  database: 'DB',
  personal: 'USER',
};

function extractService(text: string): string {
  const m =
    text.match(/(?:存|保存|记录|存储|记一下|存一下)\s*([\w一-龥.-]{1,24})\s*(?:的|[:：])/) ||
    text.match(/([\w一-龥.-]{1,24})\s*(?:的\s*)?(?:密码|password|密钥|key|令牌|token|secret)\b/i) ||
    text.match(/(?:password|key|token|secret|密码|密钥)\s+(?:of\s+|for\s+)?([\w.-]{1,24})/i);
  return m?.[1]?.trim() ?? '';
}

function extractUsername(text: string): string {
  const m =
    text.match(/用户名\s*[:：]?\s*([\w@._-]{1,40})/) ||
    text.match(/账号\s*[:：]?\s*([\w@._-]{1,40})/) ||
    text.match(/username\s*[:：]?\s*([\w@._-]{1,40})/i) ||
    text.match(/用户\s*[:：]\s*([\w@._-]{1,40})/);
  return m?.[1]?.trim() ?? '';
}

function extractSecret(text: string): string {
  const m =
    text.match(/(?:密码|password|密钥|key|令牌|token|secret)\s*(?:是|[:：])\s*([^\s，,。.]{4,64})/i) ||
    text.match(/[:：]\s*([^\s，,。.]{4,64})(?:\s|$)/);
  return m?.[1]?.trim() ?? '';
}

function inferCategory(text: string): CredentialCategory {
  if (/api\s*key|令牌|token|接口/i.test(text))              return 'api';
  if (/server|ssh|服务器|证书|vps/i.test(text))             return 'server';
  if (/database|db|mysql|postgres|数据库|sql/i.test(text))  return 'database';
  return 'personal';
}

let _lastService = '';
let _lastEagerId = '';

export const vaultHandler: DomainHandler = {
  module: 'VAULT',

  detectIntent(text) {
    if (
      /(?:帮我|请)?(?:存|保存|记录|存储|记一下|存一下).{0,30}(?:密码|密钥|key|token|secret|凭证|账号)/i.test(text) ||
      /(?:密码|密钥|api\s*key|token|secret)\s*(?:是|[:：])/i.test(text)
    ) {
      _lastService = extractService(text);
      _lastEagerId = '';
      return 'save';
    }
    return null;
  },

  eagerCard(text, lang): ActionCard | null {
    const service = extractService(text);
    if (!service) return null;
    const secret   = extractSecret(text);
    const username = extractUsername(text);
    const category = inferCategory(text);
    const row: CredentialRow = {
      id:          `vault-${Date.now()}`,
      serviceName: service,
      username,
      secretVal:   secret,
      category,
      lastUpdated: new Date().toISOString().split('T')[0],
    };
    vaultStore.add(row);
    _lastEagerId = row.id;
    return buildCard(row, lang);
  },

  enrichMessage(text, _intent, lang) {
    const hint = _lastService ? `服务名：${_lastService}。` : '';
    return lang === 'zh'
      ? `${text}\n[密钥任务：${hint}请回复确认，并附上 JSON {"service":"${_lastService}","secret":"提取的密钥值"}]`
      : `${text}\n[Vault task: ${hint}Reply to confirm and append JSON {"service":"${_lastService}","secret":"extracted value"}]`;
  },

  buildContext() {
    return undefined;
  },

  handleAction(action, ev, lang): DomainActionResult | null {
    if (action !== 'create') return null;
    if (_lastEagerId) {
      const row = vaultStore.getAll().find(r => r.id === _lastEagerId);
      if (row) return { card: buildCard(row, lang) };
    }
    const service = ev?.service || ev?.serviceName || _lastService || '';
    if (!service) return null;
    const validCategories: CredentialCategory[] = ['api', 'server', 'database', 'personal'];
    const row: CredentialRow = {
      id:          `vault-${Date.now()}`,
      serviceName: service,
      username:    ev?.username || '',
      secretVal:   ev?.secret  || ev?.secretVal || '',
      category:    validCategories.includes(ev?.category) ? ev.category : 'personal',
      lastUpdated: new Date().toISOString().split('T')[0],
    };
    vaultStore.add(row);
    return { card: buildCard(row, lang) };
  },

  resolveConfirmation(_pending, _lang) {
    return null;
  },

  handleStreamResult(_intent, fullText): DomainActionResult | null {
    if (_lastEagerId) {
      const row = vaultStore.getAll().find(r => r.id === _lastEagerId);
      if (row) return { card: buildCard(row, 'zh') };
    }
    let service = _lastService;
    let secret  = '';
    const jsonMatch = fullText.match(/\{\s*"service"\s*:[^}]{0,200}\}/);
    if (jsonMatch) {
      try {
        const p = JSON.parse(jsonMatch[0]);
        service = p.service || service;
        secret  = p.secret  || '';
      } catch { /* ignore */ }
    }
    if (!service && !secret) return null;
    const row: CredentialRow = {
      id:          `vault-${Date.now()}`,
      serviceName: service,
      username:    '',
      secretVal:   secret,
      category:    'personal',
      lastUpdated: new Date().toISOString().split('T')[0],
    };
    vaultStore.add(row);
    return { card: buildCard(row, 'zh') };
  },
};

function buildCard(row: CredentialRow, _lang: 'zh' | 'en'): ActionCard {
  return {
    module: 'VAULT',
    action: 'create',
    title:  row.serviceName,                  // 右侧标题
    meta:   [
      row.username || '—',                    // meta[0] → focusText 左侧大字（用户名）
      CATEGORY_LABEL[row.category],           // meta[1] → focusSub 左侧小字（分类）
      row.lastUpdated,                        // meta[2] → tag
    ],
    id: row.id,
  };
}
