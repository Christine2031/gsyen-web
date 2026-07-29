import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, X } from 'lucide-react';
import { CHATGPT_MODELS, MODELS, ModelId, normalizeChatGptModel } from '../config/models';
import { useModelHealth } from '../hooks/useModelHealth';
import { startLocalChatGptBind } from '../services/localBridge';
import { ModelStatusSelect } from './ModelStatusSelect';

interface ModelStatusPanelProps {
  lang: 'zh' | 'en';
  selectedModel: ModelId;
  onSelectModel: (model: ModelId) => void;
  onClose: () => void;
  contextLabel?: string;
}

export function ModelStatusPanel({ lang, selectedModel, onSelectModel, onClose, contextLabel }: ModelStatusPanelProps) {
  const zh = lang === 'zh';
  const [refreshKey, setRefreshKey] = useState(0);
  const [binding, setBinding] = useState<'idle' | 'opening' | 'opened'>('idle');
  const [loginCode, setLoginCode] = useState<{ url: string; code: string; expiresInMinutes?: number } | null>(null);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [chatGptModel, setChatGptModel] = useState(() => {
    const saved = localStorage.getItem('gsyen-chatgpt-model') ?? localStorage.getItem('gsyen-chatgpt-tier');
    return normalizeChatGptModel(saved);
  });
  const health = useModelHealth(selectedModel, binding === 'opened' ? 5_000 : 30_000, refreshKey);
  const selected = MODELS.find(m => m.id === selectedModel) ?? { id: selectedModel, label: selectedModel };
  const isChatGptPro = selectedModel === 'chatgpt-pro';
  const isBound = isChatGptPro && health.status === 'online' && health.authMode === 'chatgpt';
  const selectedChatGptModel = CHATGPT_MODELS.find(m => m.id === chatGptModel) ?? CHATGPT_MODELS[0];
  const modelOptions = MODELS.map(m => ({ value: m.id as ModelId, label: m.label, disabled: m.disabled }));
  const chatGptOptions = CHATGPT_MODELS.map(m => ({ value: m.id, label: m.label }));
  const displayLabel = isChatGptPro ? 'CHATGPT' : selected.label;
  const statusLabel = health.status === 'online'
    ? (zh ? '在线' : 'ONLINE')
    : health.status === 'checking'
    ? (zh ? '检查中' : 'CHECKING')
    : (zh ? '离线' : 'OFFLINE');
  const authLabel = isChatGptPro
    ? isBound
      ? (zh ? 'ChatGPT 已绑定' : 'CHATGPT BOUND')
      : (zh ? '未绑定' : 'NOT BOUND')
    : statusLabel;
  const panelKicker = zh ? 'SYSTEM STATUS / 模型与状态' : 'SYSTEM STATUS / MODEL STATE';
  const panelMeta = isChatGptPro
    ? isBound
      ? `PRO / ${selectedChatGptModel.label}`
      : (zh ? '需要本地 Bridge' : 'LOCAL BRIDGE REQUIRED')
    : (contextLabel || (zh ? '灵阁' : 'MUSE'));

  const rows: { label: string; value: string; dot?: boolean }[] = [
    { label: zh ? '模型ID' : 'MODEL ID', value: isChatGptPro ? 'CHATGPT-DEF' : `${selected.label}-DEF` },
    ...(isChatGptPro ? [{ label: zh ? '认证' : 'AUTH', value: isBound ? 'ChatGPT' : (health.error ?? 'LOCAL ONLY') }] : []),
    { label: zh ? '上下文' : 'CONTEXT', value: contextLabel || (zh ? '灵阁' : 'MUSE') },
    { label: zh ? '记忆' : 'MEMORY', value: zh ? '已启用' : 'ENABLED' },
    { label: zh ? '工具' : 'TOOLS', value: isChatGptPro ? (isBound ? (zh ? '本地桥接' : 'LOCAL BRIDGE') : (zh ? '待接入' : 'PENDING')) : (zh ? '云端路由' : 'CLOUD ROUTE') },
  ];
  const actionLabel = isChatGptPro
    ? isBound
      ? (zh ? '重新绑定 ChatGPT' : 'RELINK CHATGPT')
      : binding === 'opening'
      ? (zh ? '正在打开官方登录...' : 'OPENING LOGIN...')
      : (zh ? '绑定 ChatGPT' : 'BIND CHATGPT')
    : (zh ? '查看模型详情' : 'MODEL DETAILS');

  useEffect(() => {
    if (!isBound) return;
    setBinding('idle');
    setLoginCode(null);
    setLoginNotice(null);
  }, [isBound]);

  useEffect(() => {
    localStorage.setItem('gsyen-chatgpt-model', chatGptModel);
  }, [chatGptModel]);

  const handleAction = async () => {
    if (!isChatGptPro) return;
    setBinding('opening');
    const loginWindow = window.open('about:blank', '_blank');
    try {
      const r = await startLocalChatGptBind();
      if (!r) {
        loginWindow?.close();
        setLoginCode(null);
        setLoginNotice(zh
          ? '未检测到本机 GSYEN Bridge。请先打开 Windows 桌面版，再回到网页绑定 ChatGPT。'
          : 'Local GSYEN Bridge was not detected. Open the Windows app first, then bind ChatGPT from the web app.');
        setBinding('idle');
        return;
      }
      const data = await r.json();
      if (data.localOnly && data.url) {
        loginWindow?.close();
        setLoginCode(null);
        setLoginNotice(zh
          ? '网页端不能直接启动 ChatGPT 订阅桥。请打开 Windows 桌面版完成本机绑定。'
          : 'Web cannot start the ChatGPT subscription bridge directly. Complete binding in the Windows app.');
        setBinding('idle');
        return;
      }
      if (!r.ok || !data.url || !data.code) throw new Error(data.error || 'LOGIN_START_FAILED');
      if (loginWindow) loginWindow.location.href = data.url;
      else window.open(data.url, '_blank');
      setLoginCode({ url: data.url, code: data.code, expiresInMinutes: data.expiresInMinutes });
      setLoginNotice(null);
      setBinding('opened');
      setRefreshKey(k => k + 1);
      window.setTimeout(() => setRefreshKey(k => k + 1), 5000);
      window.setTimeout(() => setRefreshKey(k => k + 1), 12000);
    } catch {
      loginWindow?.close();
      setLoginNotice(zh ? '绑定启动失败，请使用桌面版或本地版重试。' : 'Bind failed. Try the desktop or local app.');
      setBinding('idle');
    }
  };

  return (
    <motion.aside
      className={`gsyen-system-panel is-${health.status}`}
      initial={{ opacity: 0, x: 20, scaleX: 0.965, clipPath: 'inset(0 0 0 100%)' }}
      animate={{ opacity: 1, x: 0, scaleX: 1, clipPath: 'inset(0 0 0 0%)' }}
      exit={{
        opacity: 0,
        x: 18,
        scaleX: 0.975,
        clipPath: 'inset(0 0 0 100%)',
        transition: {
          opacity: { duration: 0.38, ease: [0.42, 0, 0.58, 1] },
          x: { duration: 0.58, ease: [0.22, 1, 0.36, 1] },
          scaleX: { duration: 0.58, ease: [0.22, 1, 0.36, 1] },
          clipPath: { duration: 0.58, ease: [0.22, 1, 0.36, 1] },
        },
      }}
      transition={{
        opacity: { duration: 0.28, ease: [0.42, 0, 0.58, 1] },
        x: { duration: 0.44, ease: [0.22, 1, 0.36, 1] },
        scaleX: { duration: 0.44, ease: [0.22, 1, 0.36, 1] },
        clipPath: { duration: 0.44, ease: [0.22, 1, 0.36, 1] },
      }}
      style={{ transformOrigin: 'right center', willChange: 'opacity, transform, clip-path', backfaceVisibility: 'hidden' }}
    >
      <div className="gsyen-system-panel-head">
        <div className="gsyen-system-panel-title min-w-0">
          <p>{panelKicker}</p>
          <h3>{displayLabel}</h3>
          <div className="gsyen-system-panel-head-status">
            <span className={`gsyen-system-panel-dot is-${health.status}`} />
            <strong>{isChatGptPro ? authLabel : statusLabel}</strong>
            <em>{panelMeta}</em>
          </div>
        </div>
        <button onClick={onClose} aria-label={zh ? '关闭模型状态' : 'Close model status'}>
          <X className="w-3 h-3" strokeWidth={1.5} />
        </button>
      </div>

      <ModelStatusSelect<ModelId>
        label={zh ? '当前模型' : 'CURRENT MODEL'}
        value={selectedModel}
        options={modelOptions}
        onChange={onSelectModel}
      />
      {isChatGptPro && (
        <ModelStatusSelect
          label={zh ? 'ChatGPT 模型' : 'CHATGPT MODEL'}
          value={chatGptModel}
          options={chatGptOptions}
          onChange={setChatGptModel}
          disabled={!isBound}
        />
      )}

      <div className="gsyen-system-panel-table">
        {rows.map(row => (
          <div key={row.label} className="gsyen-system-panel-row">
            <span>{row.label}</span>
            <strong>
              {row.dot && <i className={`gsyen-system-panel-mini-dot is-${health.status}`} />}
              {row.value}
            </strong>
          </div>
        ))}
      </div>
      {isChatGptPro && loginCode && (
        <div className="gsyen-system-panel-bind-code">
          <span>{zh ? '官方登录验证码' : 'OFFICIAL LOGIN CODE'}</span>
          <strong>{loginCode.code}</strong>
          <a href={loginCode.url} target="_blank" rel="noreferrer">
            {zh ? '打开 OpenAI 登录页' : 'OPEN OPENAI LOGIN'}
          </a>
        </div>
      )}
      {isChatGptPro && loginNotice && (
        <div className="gsyen-system-panel-bind-code">
          <span>{zh ? '绑定提示' : 'BINDING NOTE'}</span>
          <strong>{zh ? 'LOCAL ONLY' : 'LOCAL ONLY'}</strong>
          <a href="https://chatgpt.com" target="_blank" rel="noreferrer">{loginNotice}</a>
        </div>
      )}

      <button className="gsyen-system-panel-action" onClick={handleAction} disabled={isChatGptPro && binding === 'opening'}>
        <span>{actionLabel}</span>
        <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
      </button>
    </motion.aside>
  );
}

