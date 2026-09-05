import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { useTeams } from './useTeams';

export interface Friend {
  user_id:  string;
  role:     string;
  teamName: string;
}

export function useFriends() {
  const { user, session } = useAuth();
  const { teams } = useTeams();
  const [friends, setFriends] = useState<Friend[]>([]);

  const load = useCallback(async () => {
    if (!supabase || !user || !session?.access_token || session.user.id !== user.id || teams.length === 0) {
      setFriends([]);
      return;
    }

    const { data } = await supabase
      .from('gsyen_team_members')
      .select('user_id, role, team_id')
      .in('team_id', teams.map(t => t.id))
      .neq('user_id', user.id);

    if (!data) return;

    // deduplicate by user_id, keep first occurrence
    const seen = new Set<string>();
    const result: Friend[] = [];
    for (const row of data as any[]) {
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      const team = teams.find(t => t.id === row.team_id);
      result.push({ user_id: row.user_id, role: row.role, teamName: team?.name ?? '' });
    }
    setFriends(result);
  }, [user, session?.access_token, session?.user.id, teams]);

  useEffect(() => { load(); }, [load]);

  return { friends };
}
