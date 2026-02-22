/**
 * Supabase Service Layer for Quantum Rummy Dashboard
 * All CRUD operations against the live Supabase database.
 */

import supabase from './supabase';

// ─── Players ───
export async function fetchPlayers() {
    const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('name');
    if (error) throw error;
    return data;
}

export async function addPlayer(name, email = '') {
    const { data, error } = await supabase
        .from('players')
        .insert([{ name, email }])
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updatePlayer(id, updates) {
    const { data, error } = await supabase
        .from('players')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function togglePlayerActive(id, is_active) {
    return updatePlayer(id, { is_active });
}

// ─── Game Sessions ───
export async function fetchSessions() {
    const { data, error } = await supabase
        .from('game_sessions')
        .select('*')
        .order('session_date', { ascending: false });
    if (error) throw error;
    return data;
}

export async function fetchActiveSession() {
    const { data, error } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function createSession(sessionName, sessionDate, tableNumber = 1, gameConfig = {}) {
    const { data, error } = await supabase
        .from('game_sessions')
        .insert([{
            session_name: sessionName,
            session_date: sessionDate,
            table_number: tableNumber,
            game_type: gameConfig.gameType || 'strike',
            pool_limit: gameConfig.poolLimit || null,
            penalty_first_drop: gameConfig.penalties?.firstDrop ?? 20,
            penalty_middle_drop: gameConfig.penalties?.middleDrop ?? 40,
            penalty_full_count: gameConfig.penalties?.fullCount ?? 80,
            penalty_wrong_show: gameConfig.penalties?.wrongShow ?? 80,
        }])
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function completeSession(id) {
    const { data, error } = await supabase
        .from('game_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ─── Rounds ───
export async function fetchRounds(sessionId) {
    const { data, error } = await supabase
        .from('rounds')
        .select('*')
        .eq('session_id', sessionId)
        .order('round_number');
    if (error) throw error;
    return data;
}

export async function createRound(sessionId, roundNumber, roundLabel, expenses = 0) {
    const { data, error } = await supabase
        .from('rounds')
        .insert([{
            session_id: sessionId,
            round_number: roundNumber,
            round_label: roundLabel,
            expenses: expenses,
        }])
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ─── Round Scores ───
export async function fetchRoundScores(roundId) {
    const { data, error } = await supabase
        .from('round_scores')
        .select('*, players(name)')
        .eq('round_id', roundId);
    if (error) throw error;
    return data;
}

export async function fetchAllScoresForSession(sessionId) {
    // First get all rounds for this session
    const rounds = await fetchRounds(sessionId);
    if (!rounds || rounds.length === 0) return { rounds: [], scores: [] };

    const roundIds = rounds.map((r) => r.id);
    const { data, error } = await supabase
        .from('round_scores')
        .select('*, players(name)')
        .in('round_id', roundIds);
    if (error) throw error;

    return {
        rounds,
        scores: (data || []).map((s) => ({
            ...s,
            player_name: s.players?.name || 'Unknown',
        })),
    };
}

export async function saveRoundScores(roundId, playerScores) {
    // playerScores: array of { player_id, game1..game10 }
    const rows = playerScores.map((ps) => ({
        round_id: roundId,
        player_id: ps.player_id,
        game1: ps.game1 || 0,
        game2: ps.game2 || 0,
        game3: ps.game3 || 0,
        game4: ps.game4 || 0,
        game5: ps.game5 || 0,
        game6: ps.game6 || 0,
        game7: ps.game7 || 0,
        game8: ps.game8 || 0,
        game9: ps.game9 || 0,
        game10: ps.game10 || 0,
    }));

    const { data, error } = await supabase
        .from('round_scores')
        .insert(rows)
        .select();
    if (error) throw error;
    return data;
}

// ─── Final Totals ───
export async function fetchFinalTotals(sessionId) {
    const { data, error } = await supabase
        .from('final_totals')
        .select('*, players(name)')
        .eq('session_id', sessionId)
        .order('final_total');
    if (error) throw error;
    return (data || []).map((ft) => ({
        ...ft,
        player_name: ft.players?.name || 'Unknown',
    }));
}

export async function upsertFinalTotal(sessionId, playerId, updates) {
    // Check if record exists
    const { data: existing } = await supabase
        .from('final_totals')
        .select('id, total')
        .eq('session_id', sessionId)
        .eq('player_id', playerId)
        .maybeSingle();

    if (existing) {
        const newTotal = (existing.total || 0) + (updates.roundScore || 0);
        const { data, error } = await supabase
            .from('final_totals')
            .update({
                total: newTotal,
                sr_current: updates.roundScore || 0,
                updated_at: new Date().toISOString(),
                ...updates.adjustments,
            })
            .eq('id', existing.id)
            .select()
            .single();
        if (error) throw error;
        return data;
    } else {
        const { data, error } = await supabase
            .from('final_totals')
            .insert([{
                session_id: sessionId,
                player_id: playerId,
                total: updates.roundScore || 0,
                sr_current: updates.roundScore || 0,
            }])
            .select()
            .single();
        if (error) throw error;
        return data;
    }
}

// ─── Pool Scores ───
export async function fetchPoolScores(sessionId) {
    const { data, error } = await supabase
        .from('pool_scores')
        .select('*, players(name)')
        .eq('session_id', sessionId)
        .order('total_score');
    if (error) throw error;
    return (data || []).map((ps) => ({
        ...ps,
        player_name: ps.players?.name || 'Unknown',
    }));
}

export async function upsertPoolScore(sessionId, playerId, totalScore, fieldPoints, isEliminated = false) {
    const { data: existing } = await supabase
        .from('pool_scores')
        .select('id')
        .eq('session_id', sessionId)
        .eq('player_id', playerId)
        .maybeSingle();

    if (existing) {
        const { data, error } = await supabase
            .from('pool_scores')
            .update({
                total_score: totalScore,
                field_points: fieldPoints,
                is_eliminated: isEliminated,
                updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id)
            .select()
            .single();
        if (error) throw error;
        return data;
    } else {
        const { data, error } = await supabase
            .from('pool_scores')
            .insert([{
                session_id: sessionId,
                player_id: playerId,
                total_score: totalScore,
                field_points: fieldPoints,
                is_eliminated: isEliminated,
            }])
            .select()
            .single();
        if (error) throw error;
        return data;
    }
}

// ─── Backup & Next Round (replaces backUpandClear) ───
export async function backupAndNextRound(sessionId, roundNumber, playerScores, expenses = 0) {
    const roundLabel = `SR${roundNumber}`;

    // 1. Create the round (with expenses)
    const round = await createRound(sessionId, roundNumber, roundLabel, expenses);

    // 2. Save all player scores for this round
    const savedScores = await saveRoundScores(round.id, playerScores);

    // 3. Update final totals for each player
    const updatedTotals = [];
    for (const ps of playerScores) {
        const roundTotal = (ps.game1 || 0) + (ps.game2 || 0) + (ps.game3 || 0) +
            (ps.game4 || 0) + (ps.game5 || 0) + (ps.game6 || 0) + (ps.game7 || 0) +
            (ps.game8 || 0) + (ps.game9 || 0) + (ps.game10 || 0);
        const ft = await upsertFinalTotal(sessionId, ps.player_id, { roundScore: roundTotal });
        updatedTotals.push(ft);
    }

    return { round, savedScores, updatedTotals };
}

// ─── Realtime Subscriptions ───
export function subscribeToScores(sessionId, callback) {
    const channel = supabase
        .channel(`scores-${sessionId}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'round_scores' },
            (payload) => callback(payload)
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'final_totals' },
            (payload) => callback(payload)
        )
        .subscribe();

    return () => supabase.removeChannel(channel);
}

// ─── Dashboard Stats (aggregated) ───
export async function fetchDashboardStats() {
    const [sessions, players] = await Promise.all([
        fetchSessions(),
        fetchPlayers(),
    ]);

    const activeSessions = (sessions || []).filter((s) => s.status === 'active');
    let totalRounds = 0;

    // Count total rounds across all sessions
    for (const session of (sessions || [])) {
        const rounds = await fetchRounds(session.id);
        totalRounds += (rounds || []).length;
    }

    return {
        totalSessions: (sessions || []).length,
        totalRounds,
        totalPlayers: (players || []).filter((p) => p.is_active).length,
        activeSessions,
        sessions: sessions || [],
        players: players || [],
    };
}
