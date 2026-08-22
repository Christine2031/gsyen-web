import { canvasStore } from '../stores/canvasStore';

const IWRITER_ORIGIN = 'https://iwriter.gyenbox.com';
const MIGRATION_MESSAGE = 'gsyen:iwriter-migrate';

function readJsonStorage(key: string): unknown {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function openGyenBoxIWriter(activeDocId?: string | null) {
  const token = crypto.randomUUID();
  const hash = new URLSearchParams({ migrate: token });
  if (activeDocId) hash.set('doc', activeDocId);

  const target = window.open(`${IWRITER_ORIGIN}/#${hash}`, '_blank');
  if (!target) return;

  const payload = {
    type: MIGRATION_MESSAGE,
    token,
    documents: canvasStore.getAll(),
    activeDocId: activeDocId ?? null,
    localState: {
      preferences: readJsonStorage('gsyen_canvas_prefs'),
      librarySort: readJsonStorage('gsyen_library_sort'),
      chatSessions: readJsonStorage('gsyen_sessions_cache'),
      currentChat: readJsonStorage('gsyen_current_chat'),
      currentSessionId: localStorage.getItem('gsyen_current_session_id'),
      lastClosedModel: localStorage.getItem('gsyen-last-closed-model'),
    },
  };
  const timers = [350, 1000, 2500].map(delay => window.setTimeout(() => {
    target.postMessage(payload, IWRITER_ORIGIN);
  }, delay));

  const receiveAck = (event: MessageEvent) => {
    if (
      event.origin !== IWRITER_ORIGIN
      || event.source !== target
      || event.data?.type !== 'gyenbox:iwriter-migrated'
      || event.data?.token !== token
    ) return;
    timers.forEach(timer => window.clearTimeout(timer));
    window.removeEventListener('message', receiveAck);
  };
  window.addEventListener('message', receiveAck);
  window.setTimeout(() => window.removeEventListener('message', receiveAck), 10_000);
}
