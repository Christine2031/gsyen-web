import { CredentialRow, LOCAL_STORAGE_KEY } from '../components/passwordVault';

function load(): CredentialRow[] {
  const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (saved) { try { return JSON.parse(saved); } catch {} }
  return [];
}

function save(rows: CredentialRow[]) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event('vault-updated'));
}

export const vaultStore = {
  getAll: (): CredentialRow[] => load(),
  add(row: CredentialRow) { save([row, ...load()]); },
  remove(id: string) { save(load().filter(r => r.id !== id)); },
  update(id: string, patch: Partial<CredentialRow>) {
    save(load().map(r => r.id === id ? { ...r, ...patch } : r));
  },
};
