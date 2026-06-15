import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';

export interface TeamItem {
  id:          string;
  name:        string;
  type?:       string;
  owner_id:    string;
  invite_code: string;
  seat_limit:  number;
  role:        string;
}

export interface TeamMember {
  user_id:   string;
  role:      string;
  joined_at: string;
}

// ── 模块级单例缓存，localStorage 持久化（stale-while-revalidate）────
const LS_KEY = 'gsyen_teams_cache';
function _lsRead(): TeamItem[] { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } }
function _lsWrite(d: TeamItem[]) { try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {} }

let _cache:   TeamItem[]  = _lsRead();  // 首次渲染即有上次数据，不等网络
let _userId:  string | null = null;
let _fetching = false;
let _subs:    (() => void)[] = [];

function _notify() { _subs.forEach(fn => fn()); }

// ── auth 就绪时立即预热（INITIAL_SESSION 触发时 token 已就绪，RLS 安全）──
supabase?.auth.onAuthStateChange((_event, session) => {
  if (session?.user?.id) _fetch(session.user.id);
  else _userId = null; // 登出时允许下次重新 fetch
});

async function _fetch(userId: string) {
  if (_fetching || _userId === userId) return;
  _fetching = true;
  _userId   = userId;
  if (!supabase) { _fetching = false; return; }
  const { data } = await supabase
    .from('gsyen_team_members')
    .select('role, gsyen_teams(*)')
    .eq('user_id', userId);
  if (data) {
    _cache = data
      .map((r: any) => r.gsyen_teams ? { ...r.gsyen_teams, role: r.role } : null)
      .filter(Boolean) as TeamItem[];
    _lsWrite(_cache);
    _notify();
  }
  _fetching = false;
}

export function _invalidateTeams() {
  _userId = null;
  // 保留 _cache 旧数据，refetch 前不显示空白
}

// ── 主 hook ───────────────────────────────────────────────────
export function useTeams() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<TeamItem[]>(_cache);

  useEffect(() => {
    const sync = () => setTeams([..._cache]);
    _subs.push(sync);
    if (user?.id) {
      sync();        // 立即显示缓存（_fetch early return 时不会再 notify）
      _fetch(user.id);
    } else {
      setTeams([]);
    }
    return () => { _subs = _subs.filter(fn => fn !== sync); };
  }, [user?.id]);

  const reload = useCallback(() => {
    if (!user?.id) return;
    _userId = null;
    _fetch(user.id);
  }, [user?.id]);

  return { teams, reload };
}

// ── 创建团队（写 Supabase，成功后刷新缓存）────────────────────────
export async function createTeam(userId: string, name: string, type: string): Promise<boolean> {
  if (!supabase) return false;
  const invite_code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const { data: team, error: e1 } = await supabase
    .from('gsyen_teams')
    .insert({ name, type, owner_id: userId, invite_code, seat_limit: 10 })
    .select()
    .single();
  if (e1 || !team) { console.error('createTeam:', e1); return false; }
  const { error: e2 } = await supabase
    .from('gsyen_team_members')
    .insert({ team_id: team.id, user_id: userId, role: 'owner' });
  if (e2) { console.error('createTeamMember:', e2); return false; }
  _invalidateTeams();
  await _fetch(userId);  // re-fetch → _notify() called inside
  return true;
}

// ── 成员加载（按需调用，不缓存）─────────────────────────────────
export async function loadTeamMembers(teamId: string): Promise<TeamMember[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('gsyen_team_members')
    .select('user_id, role, joined_at')
    .eq('team_id', teamId);
  return (data as TeamMember[]) ?? [];
}

// ── 通过邀请码加入团队 ────────────────────────────────────────
export async function joinTeam(userId: string, inviteCode: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: '未连接数据库' };
  const { data: team } = await supabase
    .from('gsyen_teams')
    .select('id')
    .eq('invite_code', inviteCode.toUpperCase().trim())
    .maybeSingle();
  if (!team) return { ok: false, error: '邀请码无效' };
  const { count } = await supabase
    .from('gsyen_team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', team.id)
    .eq('user_id', userId);
  if ((count ?? 0) > 0) return { ok: false, error: '已在该团队中' };
  const { error } = await supabase
    .from('gsyen_team_members')
    .insert({ team_id: team.id, user_id: userId, role: 'member' });
  if (error) return { ok: false, error: error.message };
  _invalidateTeams();
  await _fetch(userId);
  return { ok: true };
}
