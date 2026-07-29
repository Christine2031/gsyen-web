import { getCodexBridgeHealth, type CodexBridgeInput } from './codexBridge';
import {
  ensureCodexAppServerProcess,
  sendCodexAppServerMessage,
  subscribeCodexAppServerMessages,
} from './codexAppServerProcess';
import { chatGptModelName } from './codexModelMap';
import { buildCodexTurnInput } from './codexTurnInput';

type PendingRpc = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
interface CodexSession {
  model: string;
  threadId: string;
  busy: boolean;
  stale: boolean;
  closeHandlers: Set<(error: Error) => void>;
}
interface StreamOptions { signal?: AbortSignal }

const TURN_TIMEOUT_MS = 90_000;
const sessions = new Map<string, CodexSession>();
const creating = new Map<string, Promise<CodexSession>>();
const pendingRpc = new Map<string, PendingRpc>();
const notificationHandlers = new Set<(message: any) => void>();
let initializePromise: Promise<void> | null = null;

subscribeCodexAppServerMessages(message => {
  if (message?.id && pendingRpc.has(String(message.id))) {
    const call = pendingRpc.get(String(message.id))!;
    pendingRpc.delete(String(message.id));
    clearTimeout(call.timer);
    if (message.error) call.reject(new Error(JSON.stringify(message.error)));
    else call.resolve(message.result);
    return;
  }
  for (const handler of notificationHandlers) handler(message);
});

function clearSession(session: CodexSession) {
  if (session.stale) return;
  session.stale = true;
  if (sessions.get(session.model) === session) sessions.delete(session.model);
  const error = new Error('CODEX SESSION CLOSED');
  for (const handler of session.closeHandlers) handler(error);
  session.closeHandlers.clear();
}

function clearAllSessions() {
  initializePromise = null;
  for (const session of sessions.values()) clearSession(session);
  sessions.clear();
  for (const call of pendingRpc.values()) {
    clearTimeout(call.timer);
    call.reject(new Error('CODEX APP SERVER TRANSPORT CLOSED'));
  }
  pendingRpc.clear();
}

export async function ensureCodexAppServer(forceRestart = false): Promise<void> {
  return ensureCodexAppServerProcess(forceRestart, clearAllSessions);
}

function rpc(method: string, params: any, timeoutMs = 20_000): Promise<any> {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRpc.delete(id);
      reject(new Error(`${method} timeout`));
    }, timeoutMs);
    pendingRpc.set(id, { resolve, reject, timer });
  });
  try {
    sendCodexAppServerMessage({ jsonrpc: '2.0', id, method, params });
  } catch (error) {
    const call = pendingRpc.get(id);
    if (call) clearTimeout(call.timer);
    pendingRpc.delete(id);
    return Promise.reject(error);
  }
  return promise;
}

async function ensureInitialized(): Promise<void> {
  await ensureCodexAppServer();
  if (!initializePromise) {
    initializePromise = rpc('initialize', {
      clientInfo: { name: 'gsyen-web', title: 'GSYEN', version: '1.0.0' },
      capabilities: null,
    }).then(() => undefined).catch(error => {
      initializePromise = null;
      throw error;
    });
  }
  return initializePromise;
}

async function createSession(model: string): Promise<CodexSession> {
  await ensureInitialized();
  const session: CodexSession = {
    model,
    threadId: '',
    busy: false,
    stale: false,
    closeHandlers: new Set(),
  };
  const thread = await rpc('thread/start', {
    model,
    serviceTier: 'default',
    cwd: process.cwd(),
    approvalPolicy: 'never',
    sandbox: 'read-only',
    baseInstructions: '你是 GSYEN 的本地 ChatGPT 桥。只回答用户问题，不使用工具，不修改文件。',
    developerInstructions: '中文默认简洁、稳、带一点审美判断。',
    personality: 'pragmatic',
    ephemeral: true,
    sessionStartSource: 'startup',
  });
  session.threadId = thread.thread.id;
  sessions.set(model, session);
  return session;
}

async function getSession(model: string): Promise<CodexSession> {
  const existing = sessions.get(model);
  if (existing && !existing.stale && !existing.busy) return existing;
  const pending = creating.get(model);
  if (pending) return pending;
  const task = createSession(model).finally(() => creating.delete(model));
  creating.set(model, task);
  return task;
}

export function warmCodexAppServer(modelHint = 'gpt-5-6-sol'): void {
  const model = chatGptModelName(modelHint);
  if (sessions.has(model) || creating.has(model)) return;
  getCodexBridgeHealth()
    .then(health => health.available ? getSession(model) : null)
    .catch(error => console.warn('Codex warm-up skipped:', error?.message || error));
}

async function interruptTurn(session: CodexSession, turnId: string | null) {
  if (!turnId || session.stale) return;
  await rpc('turn/interrupt', { threadId: session.threadId, turnId }, 3000).catch(() => {});
}

async function runTurn(
  session: CodexSession,
  input: CodexBridgeInput,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let fullText = '';
  let turnId: string | null = null;
  let lastError = '';
  let cleanupWait = () => {};

  const completed = new Promise<string>((resolve, reject) => {
    const finish = (callback: () => void) => {
      cleanupWait();
      callback();
    };
    const timeout = setTimeout(async () => {
      await interruptTurn(session, turnId);
      finish(() => reject(new Error('CODEX APP SERVER TIMEOUT')));
    }, input.timeoutMs ?? TURN_TIMEOUT_MS);
    const abort = async () => {
      await interruptTurn(session, turnId);
      const reason = signal?.reason;
      const message = reason instanceof Error ? reason.message
        : typeof reason === 'string' ? reason : 'CLIENT ABORTED';
      finish(() => reject(new Error(message)));
    };
    const onClose = (error: Error) => finish(() => reject(error));
    const onMessage = (message: any) => {
      if (message?.params?.threadId && message.params.threadId !== session.threadId) return;
      if (message.method === 'item/agentMessage/delta') {
        const delta = message.params?.delta || '';
        fullText += delta;
        if (delta) onDelta(delta);
      } else if (message.method === 'error') {
        lastError = message.params?.error?.message || 'CODEX APP SERVER ERROR';
      } else if (message.method === 'turn/completed') {
        const status = message.params?.turn?.status;
        if ((status === 'failed' || status === 'interrupted') && !fullText.trim()) {
          finish(() => reject(new Error(
            lastError || message.params?.turn?.error?.message || 'CODEX TURN FAILED',
          )));
        } else {
          finish(() => resolve(fullText.trim()));
        }
      }
    };
    cleanupWait = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      notificationHandlers.delete(onMessage);
      session.closeHandlers.delete(onClose);
    };
    signal?.addEventListener('abort', abort, { once: true });
    notificationHandlers.add(onMessage);
    session.closeHandlers.add(onClose);
    if (signal?.aborted) void abort();
  });

  const payload = buildCodexTurnInput(input);
  try {
    const turn = await rpc('turn/start', {
      threadId: session.threadId,
      input: payload.parts,
      approvalPolicy: 'never',
      model: session.model,
      serviceTier: 'default',
      effort: 'low',
      personality: 'pragmatic',
    });
    turnId = turn.turn.id;
    return await completed;
  } catch (error) {
    cleanupWait();
    throw error;
  } finally {
    payload.cleanup();
  }
}

export async function streamCodexAppServer(
  input: CodexBridgeInput,
  onDelta: (delta: string) => void,
  options: StreamOptions = {},
): Promise<string> {
  const health = await getCodexBridgeHealth();
  if (!health.available) throw new Error(health.error || 'CODEX LOGIN REQUIRED');

  const model = chatGptModelName(input.chatGptModel);
  for (let attempt = 0; attempt < 2; attempt++) {
    const session = await getSession(model);
    session.busy = true;
    try {
      const text = await runTurn(session, input, onDelta, options.signal);
      return text || '我在，但这次没有生成有效回复。';
    } catch (error) {
      clearSession(session);
      if (options.signal?.aborted || attempt === 1) throw error;
      await ensureCodexAppServer(true);
    } finally {
      session.busy = false;
    }
  }
  throw new Error('CODEX APP SERVER UNAVAILABLE');
}
