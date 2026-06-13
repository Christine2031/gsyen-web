import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface TeamItem {
  id:          string;
  name:        string;
  type?:       string;
  owner_id:    string;
  invite_code: string;
  seat_limit:  number;
  role:        string;
}

export function useBrandTeams(user: any) {
  const [teams, setTeams] = useState<TeamItem[]>([]);

  const loadTeams = useCallback(async () => {
    if (!supabase || !user) return;
    const { data, error } = await supabase
      .from('gsyen_team_members')
      .select('role, gsyen_teams(*)')
      .eq('user_id', user.id);
    if (error || !data) {
      console.error('loadTeams error:', error);
      return;
    }
    const list = data
      .map((r: any) => r.gsyen_teams ? { ...r.gsyen_teams, role: r.role } : null)
      .filter(Boolean) as TeamItem[];
    setTeams(list);
  }, [user]);

  useEffect(() => { if (user) loadTeams(); }, [user, loadTeams]);

  const disband = async (teamId: string, zh: boolean) => {
    if (!supabase || !window.confirm(zh ? '确定解散这个团队吗？' : 'Disband this team?')) return;
    const { error } = await supabase
      .from('gsyen_teams')
      .delete()
      .eq('id', teamId);
    if (error) {
      console.error('disband error:', error);
      return;
    }
    await loadTeams();
  };

  return { teams, disband, loadTeams };
}
