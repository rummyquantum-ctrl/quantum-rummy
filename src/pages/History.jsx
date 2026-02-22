import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    fetchSessions, fetchRounds, fetchFinalTotals, fetchAllScoresForSession,
} from '../lib/supabaseService';
import { getAvatarColor, getInitials } from '../utils/scoring';

export default function History() {
    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState([]);
    const [selectedSession, setSelectedSession] = useState(null);
    const [detailData, setDetailData] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    useEffect(() => {
        async function loadSessions() {
            try {
                setLoading(true);
                const data = await fetchSessions();
                setSessions(data || []);
            } catch (err) {
                console.error('History load error:', err);
            } finally {
                setLoading(false);
            }
        }
        loadSessions();
    }, []);

    // Navigate into a session detail
    const openDetail = useCallback(async (session) => {
        try {
            setDetailLoading(true);
            setSelectedSession(session);
            const [finals, sessionScores] = await Promise.all([
                fetchFinalTotals(session.id),
                fetchAllScoresForSession(session.id),
            ]);
            setDetailData({
                finalTotals: (finals || []).sort((a, b) => a.final_total - b.final_total),
                rounds: sessionScores.rounds || [],
                scores: sessionScores.scores || [],
            });
        } catch (err) {
            console.error('Error loading session details:', err);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    const goBack = useCallback(() => {
        setSelectedSession(null);
        setDetailData(null);
    }, []);

    const completedSessions = sessions.filter((s) => s.status === 'completed');
    const activeSessions = sessions.filter((s) => s.status === 'active');

    // Compute total rounds across all sessions for the overview stat
    const totalRounds = useMemo(() => {
        // We'll show it in detail view; for overview just show session counts
        return sessions.length;
    }, [sessions]);

    if (loading) {
        return (
            <div className="page-enter">
                <div className="empty-state">
                    <div className="card-spinner">🂡</div>
                    <h3>Loading History...</h3>
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════
    //  DETAIL VIEW — Full game breakdown
    // ══════════════════════════════════════
    if (selectedSession) {
        const date = new Date(selectedSession.session_date);
        const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        const winner = detailData?.finalTotals?.[0];

        return (
            <div className="page-enter">
                {/* Back Navigation */}
                <div style={{ marginBottom: 'var(--space-md)' }}>
                    <button className="btn btn-ghost" onClick={goBack} style={{ gap: '6px' }}>
                        ← Back to History
                    </button>
                </div>

                {/* Session Header */}
                <div className="page-header">
                    <h2><span className="header-icon">🃏</span> {selectedSession.session_name}</h2>
                    <div className="header-meta">
                        <span className="header-meta-chip">📅 {dateStr}</span>
                        <span className="header-divider">•</span>
                        <span className="header-meta-chip">🎴 Table {selectedSession.table_number}</span>
                        <span className="header-divider">•</span>
                        <span className={`header-meta-chip ${selectedSession.status === 'active' ? 'live' : ''}`}>
                            {selectedSession.status === 'active' ? '● Live' : '✅ Completed'}
                        </span>
                        {detailData && (
                            <>
                                <span className="header-divider">•</span>
                                <span className="header-meta-chip">🔄 {detailData.rounds.length} Rounds</span>
                                <span className="header-divider">•</span>
                                <span className="header-meta-chip">♣ {detailData.finalTotals.length} Players</span>
                            </>
                        )}
                    </div>
                </div>

                {detailLoading ? (
                    <div className="card">
                        <div className="empty-state"><p>Loading game details...</p></div>
                    </div>
                ) : detailData ? (
                    <>
                        {/* Winner Banner */}
                        {winner && detailData.finalTotals.length > 1 && (
                            <div className="active-banner" style={{ marginBottom: 'var(--space-lg)' }}>
                                <div className="active-banner-info">
                                    <h3>🏆 Winner: {winner.player_name}</h3>
                                    <p>Final Score: {winner.final_total} pts — Lowest score wins!</p>
                                </div>
                                <span className="badge badge-success" style={{ fontSize: 'var(--font-size-lg)', padding: '8px 16px' }}>
                                    🥇 Champion
                                </span>
                            </div>
                        )}

                        {/* Quick Stats */}
                        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 'var(--space-lg)' }}>
                            <div className="stat-card" style={{ '--stat-accent': '#10B981' }}>
                                <div className="stat-icon primary">🔄</div>
                                <div>
                                    <div className="stat-value">{detailData.rounds.length}</div>
                                    <div className="stat-label">Rounds</div>
                                </div>
                            </div>
                            <div className="stat-card" style={{ '--stat-accent': '#3B82F6' }}>
                                <div className="stat-icon info">♣</div>
                                <div>
                                    <div className="stat-value">{detailData.finalTotals.length}</div>
                                    <div className="stat-label">Players</div>
                                </div>
                            </div>
                            <div className="stat-card" style={{ '--stat-accent': '#F59E0B' }}>
                                <div className="stat-icon accent">♦</div>
                                <div>
                                    <div className="stat-value">
                                        {detailData.finalTotals.length > 0
                                            ? Math.max(...detailData.finalTotals.map((f) => f.final_total))
                                            : 0}
                                    </div>
                                    <div className="stat-label">Highest Score</div>
                                </div>
                            </div>
                            <div className="stat-card" style={{ '--stat-accent': '#22C55E' }}>
                                <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>♠</div>
                                <div>
                                    <div className="stat-value">
                                        {detailData.finalTotals.length > 0 ? detailData.finalTotals[0].final_total : 0}
                                    </div>
                                    <div className="stat-label">Lowest Score</div>
                                </div>
                            </div>
                        </div>

                        {/* Final Standings */}
                        <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
                            <div className="card-header">
                                <div className="card-title">🏆 Final Standings</div>
                                <span className="badge badge-accent">{detailData.finalTotals.length} players</span>
                            </div>
                            <div>
                                {detailData.finalTotals.map((player, i) => (
                                    <div key={player.player_id} className="leaderboard-item">
                                        <span className={`rank-badge ${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-default'}`}>
                                            {i + 1}
                                        </span>
                                        <div className="pool-avatar" style={{ background: getAvatarColor(player.player_name), width: 32, height: 32, fontSize: 12 }}>
                                            {getInitials(player.player_name)}
                                        </div>
                                        <span className="leaderboard-name">{player.player_name}</span>
                                        <span className="leaderboard-score font-mono">{player.final_total}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Round-by-Round Score Table */}
                        {detailData.rounds.length > 0 ? (
                            <div className="card">
                                <div className="card-header">
                                    <div className="card-title">📊 Round-by-Round Scores</div>
                                    <span className="badge badge-info">{detailData.rounds.length} rounds</span>
                                </div>
                                <div className="table-container">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th style={{ width: 40 }}>#</th>
                                                <th>Player</th>
                                                {detailData.rounds.map((r) => (
                                                    <th key={r.id} style={{ textAlign: 'center' }}>{r.round_label}</th>
                                                ))}
                                                <th style={{ background: 'rgba(16,185,129,0.1)', textAlign: 'center' }}>Total</th>
                                                <th style={{ background: 'rgba(245,158,11,0.1)', textAlign: 'center' }}>Final</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {detailData.finalTotals.map((player, idx) => {
                                                const roundScoreMap = {};
                                                detailData.scores
                                                    .filter((s) => s.player_id === player.player_id)
                                                    .forEach((s) => { roundScoreMap[s.round_id] = s.round_total; });

                                                return (
                                                    <tr key={player.player_id}>
                                                        <td style={{ fontWeight: 600, color: 'var(--text-tertiary)' }}>{idx + 1}</td>
                                                        <td className="player-name">
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                                                <div className="pool-avatar" style={{
                                                                    background: getAvatarColor(player.player_name),
                                                                    width: 26, height: 26, fontSize: 10,
                                                                }}>
                                                                    {getInitials(player.player_name)}
                                                                </div>
                                                                {idx === 0 && '🥇 '}
                                                                {idx === 1 && '🥈 '}
                                                                {idx === 2 && '🥉 '}
                                                                {player.player_name}
                                                            </div>
                                                        </td>
                                                        {detailData.rounds.map((r) => (
                                                            <td key={r.id} className="font-mono" style={{ textAlign: 'center' }}>
                                                                {roundScoreMap[r.id] || 0}
                                                            </td>
                                                        ))}
                                                        <td className="font-mono text-accent" style={{ fontWeight: 600, textAlign: 'center' }}>
                                                            {player.total}
                                                        </td>
                                                        <td className="font-mono" style={{
                                                            fontWeight: 700, textAlign: 'center',
                                                            color: idx === 0 ? 'var(--color-success)' : 'var(--color-primary-light)',
                                                        }}>
                                                            {player.final_total}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="card">
                                <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
                                    <div className="empty-state-icon">📋</div>
                                    <h3>No Rounds Recorded</h3>
                                    <p>This session has no round data yet.</p>
                                </div>
                            </div>
                        )}
                    </>
                ) : null}
            </div>
        );
    }

    // ══════════════════════════════════════
    //  SESSION LIST VIEW
    // ══════════════════════════════════════
    return (
        <div className="page-enter">
            <div className="page-header">
                <div className="page-header-row">
                    <div>
                        <h2><span className="header-icon">📜</span> Session History</h2>
                        <p>Browse past games — click any session for full round details</p>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <div className="stat-card" style={{ '--stat-accent': '#10B981' }}>
                    <div className="stat-icon primary">🃏</div>
                    <div>
                        <div className="stat-value">{sessions.length}</div>
                        <div className="stat-label">Total Games</div>
                    </div>
                </div>
                <div className="stat-card" style={{ '--stat-accent': '#22C55E' }}>
                    <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>✅</div>
                    <div>
                        <div className="stat-value">{completedSessions.length}</div>
                        <div className="stat-label">Completed</div>
                    </div>
                </div>
                <div className="stat-card" style={{ '--stat-accent': '#F59E0B' }}>
                    <div className="stat-icon accent">⏳</div>
                    <div>
                        <div className="stat-value">{activeSessions.length}</div>
                        <div className="stat-label">In Progress</div>
                    </div>
                </div>
            </div>

            {/* Session List */}
            {sessions.length === 0 ? (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">🃏</div>
                        <h3>No Games Played Yet</h3>
                        <p>Start a game from the Score Board to create history.</p>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                    {sessions.map((session) => {
                        const date = new Date(session.session_date);

                        return (
                            <div
                                key={session.id}
                                className="session-card"
                                onClick={() => openDetail(session)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="session-date-badge">
                                    <span className="day">{date.getDate()}</span>
                                    <span className="month">{date.toLocaleDateString('en-US', { month: 'short' })}</span>
                                </div>
                                <div className="session-info">
                                    <h4>{session.session_name}</h4>
                                    <p>🎴 Table {session.table_number} • Click to view full game details</p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                    <span className={`badge ${session.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                                        {session.status === 'active' ? '● Live' : 'Completed'}
                                    </span>
                                    <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-size-lg)' }}>→</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
