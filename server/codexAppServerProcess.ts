import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveCodexCliPath } from './codexBridge';
import { codexProcessEnv } from './codexProcessEnv';

type MessageHandler = (message: any) => void;

let child: ChildProcess | null = null;
let booting: Promise<void> | null = null;
let stdoutBuffer = '';
const messageHandlers = new Set<MessageHandler>();

function dispatchStdout(chunk: Buffer | string) {
  stdoutBuffer += String(chunk);
  const lines = stdoutBuffer.split(/\r?\n/);
  stdoutBuffer = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const message = JSON.parse(line);
      for (const handler of messageHandlers) handler(message);
    } catch (error) {
      console.error('Codex app-server JSONL parse failed:', error);
    }
  }
}

function waitForSpawn(process: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CODEX APP SERVER START TIMEOUT')), 5000);
    process.once('spawn', () => {
      clearTimeout(timer);
      resolve();
    });
    process.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export function subscribeCodexAppServerMessages(handler: MessageHandler): () => void {
  messageHandlers.add(handler);
  return () => messageHandlers.delete(handler);
}

export function sendCodexAppServerMessage(message: unknown): void {
  if (!child?.stdin?.writable) throw new Error('CODEX APP SERVER TRANSPORT CLOSED');
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

export async function ensureCodexAppServerProcess(
  forceRestart: boolean,
  onReset: () => void,
): Promise<void> {
  if (!forceRestart && child && child.exitCode === null && !child.killed) return;
  if (booting) {
    if (!forceRestart) return booting;
    await booting.catch(() => undefined);
    return ensureCodexAppServerProcess(true, onReset);
  }

  booting = (async () => {
    if (forceRestart && child) {
      onReset();
      child.kill();
      child = null;
      stdoutBuffer = '';
      await delay(250);
    }

    const codexPath = resolveCodexCliPath();
    if (!codexPath) throw new Error('CODEX CLI MISSING');

    const spawned = spawn(codexPath, [
      'app-server',
      '--listen', 'stdio://',
      '-c', 'service_tier="default"',
    ], {
      env: await codexProcessEnv(),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child = spawned;
    spawned.stdout?.on('data', dispatchStdout);
    spawned.stderr?.on('data', chunk => {
      const text = String(chunk);
      if (/ERROR|WARN/.test(text)) process.stderr.write(text);
    });
    spawned.on('exit', () => {
      if (child !== spawned) return;
      child = null;
      stdoutBuffer = '';
      onReset();
    });

    await waitForSpawn(spawned);
  })().finally(() => {
    booting = null;
  });

  return booting;
}
