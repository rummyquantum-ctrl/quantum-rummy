import { useState, useEffect, useMemo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, BarElement, LineElement,
    PointElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
    fetchPlayers, fetchSessions, fetchFinalTotals, fetchRounds,
} from '../lib/supabaseService';
import { getAvatarColor, getInitials } from '../utils/scoring';

ChartJS.register(
    CategoryScale, LinearScale, BarElement, LineElement,
    PointElement, ArcElement, Tooltip, Legend, Filler
);

const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
        legend: { labels: { color: '#94A3B8', font: { family: 'Inter', size: 12 } } },
        tooltip: {
            backgroundColor: '#1E293B', titleColor: '#F1F5F9', bodyColor: '#94A3B8',
            borderColor: 'rgba(148,163,184,0.12)', borderWidth: 1, padding: 12, cornerRadius: 8,
        },
    },
    scales: {
        x: { ticks: { color: '#64748B', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(148,163,184,0.06)' } },
        y: { ticks: { color: '#64748B', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(148,163,184,0.06)' } },
    },
};

export default function Analytics() {
    const [loading, setLoading] = useState(true);
    const [sessions, setSessions] = useState([]);
    const [players, setPlayers] = useState([]);
    const [sessionData, setSessionData] = useState([]);
    const [totalRounds, setTotalRounds] = useState(0);

    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true);
                const [sessionsData, playersData] = await Promise.all([
                    fetchSessions(), fetchPlayers(),
                ]);
                setSessions(sessionsData || []);
                setPlayers(playersData || []);

                const allSessionData = [];
                let roundCount = 0;

                for (const session of (sessionsData || [])) {
                    const [finals, rounds] = await Promise.all([
                        fetchFinalTotals(session.id), fetchRounds(session.id),
                    ]);
                    allSessionData.push({ session, finalTotals: finals || [], rounds: rounds || [] });
                    roundCount += (rounds || []).length;
                }

                setSessionData(allSessionData);
                setTotalRounds(roundCount);
            } catch (err) {
                console.error('Analytics load error:', err);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    // Aggregate per-player stats across all sessions
    const playerStats = useMemo(() => {
        const agg = {};
        sessionData.forEach(({ session, finalTotals }) => {
            finalTotals.forEach((ft) => {
                if (!agg[ft.player_id]) {
                    agg[ft.player_id] = {
                        id: ft.player_id, name: ft.player_name,
                        totalScore: 0, sessions: 0, wins: 0,
                        bestScore: Infinity, worstScore: 0,
                        roundsPlayed: 0,
                    };
                }
                agg[ft.player_id].totalScore += ft.final_total || 0;
                agg[ft.player_id].sessions += 1;
                if (ft.final_total < agg[ft.player_id].bestScore) agg[ft.player_id].bestScore = ft.final_total;
                if (ft.final_total > agg[ft.player_id].worstScore) agg[ft.player_id].worstScore = ft.final_total;
            });

            // Winner = lowest score
            if (finalTotals.length > 0) {
                const winner = finalTotals.reduce((min, ft) => (ft.final_total < min.final_total ? ft : min));
                if (agg[winner.player_id]) agg[winner.player_id].wins += 1;
            }
        });

        // Add round counts
        sessionData.forEach(({ rounds }) => {
            // Each round has players — we'll approximate rounds played per player
            Object.values(agg).forEach((p) => {
                p.roundsPlayed = sessionData
                    .filter((sd) => sd.finalTotals.some((ft) => ft.player_id === p.id))
                    .reduce((sum, sd) => sum + sd.rounds.length, 0);
            });
        });

        return Object.values(agg)
            .map((stats) => ({
                ...stats,
                avgScore: stats.sessions > 0 ? Math.round(stats.totalScore / stats.sessions) : 0,
                bestScore: stats.bestScore === Infinity ? 0 : stats.bestScore,
                winRate: stats.sessions > 0 ? Math.round((stats.wins / stats.sessions) * 100) : 0,
            }))
            .sort((a, b) => a.avgScore - b.avgScore);
    }, [sessionData]);

    // Charts
    const playersWithWins = playerStats.filter((p) => p.wins > 0);

    const winData = useMemo(() => ({
        labels: playersWithWins.map((p) => p.name),
        datasets: [{
            data: playersWithWins.map((p) => p.wins),
            backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6', '#EF4444', '#6366F1'],
            borderColor: '#1E293B', borderWidth: 4,
        }],
    }), [playersWithWins]);

    const top10 = playerStats.slice(0, 10);
    const avgData = useMemo(() => ({
        labels: top10.map((p) => p.name),
        datasets: [{
            label: 'Average Score',
            data: top10.map((p) => p.avgScore),
            backgroundColor: top10.map((_, i) => i < 3 ? 'rgba(34,197,94,0.6)' : 'rgba(59,130,246,0.4)'),
            borderColor: top10.map((_, i) => i < 3 ? '#22C55E' : '#3B82F6'),
            borderWidth: 1, borderRadius: 6,
        }],
    }), [top10]);

    const trendData = useMemo(() => {
        const sessionLabels = sessionData.map((sd) => sd.session.session_name.replace(/^(Game|Strike|Pool \d+) - /i, ''));
        const trendPlayers = playerStats.slice(0, 5);
        const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6'];
        return {
            labels: sessionLabels,
            datasets: trendPlayers.map((player, idx) => ({
                label: player.name,
                data: sessionData.map((sd) => {
                    const ft = sd.finalTotals.find((f) => f.player_id === player.id);
                    return ft ? ft.final_total : null;
                }),
                borderColor: colors[idx], backgroundColor: `${colors[idx]}20`,
                tension: 0.4, fill: false, pointRadius: 5, pointHoverRadius: 7, spanGaps: true,
            })),
        };
    }, [sessionData, playerStats]);

    const activityData = useMemo(() => ({
        labels: sessionData.map((sd) => sd.session.session_name.replace(/^(Game|Strike|Pool \d+) - /i, '')),
        datasets: [
            {
                label: 'Rounds', data: sessionData.map((sd) => sd.rounds.length),
                backgroundColor: 'rgba(16,185,129,0.5)', borderColor: '#10B981', borderWidth: 1, borderRadius: 6,
            },
            {
                label: 'Players', data: sessionData.map((sd) => sd.finalTotals.length),
                backgroundColor: 'rgba(245,158,11,0.5)', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 6,
            },
        ],
    }), [sessionData]);

    // Top winner
    const topWinner = useMemo(() => {
        if (playersWithWins.length === 0) return null;
        return [...playersWithWins].sort((a, b) => b.wins - a.wins)[0];
    }, [playersWithWins]);

    // Total points across all sessions
    const totalPoints = useMemo(() => playerStats.reduce((s, p) => s + p.totalScore, 0), [playerStats]);

    if (loading) {
        return (
            <div className="page-enter">
                <div className="empty-state">
                    <div className="card-spinner">♠️</div>
                    <h3>Analyzing the Deck...</h3>
                    <p>Crunching your game data</p>
                </div>
            </div>
        );
    }

    if (sessions.length === 0) {
        return (
            <div className="page-enter">
                <div className="page-header">
                    <h2><span className="header-icon">♠</span> Analytics</h2>
                    <p>Deep insights into player performance and game trends</p>
                </div>
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">🃏</div>
                        <h3>No Data Yet</h3>
                        <p>Play some games to see analytics and trends here.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-enter">
            <div className="page-header">
                <h2><span className="header-icon">♠</span> Analytics</h2>
                <p>Cross-session insights into player performance and game trends</p>
            </div>

            {/* Overview Stats — 6 cards */}
            <div className="stats-grid">
                <div className="stat-card" style={{ '--stat-accent': '#10B981' }}>
                    <div className="stat-icon primary">🃏</div>
                    <div>
                        <div className="stat-value">{sessions.length}</div>
                        <div className="stat-label">Games Played</div>
                    </div>
                </div>
                <div className="stat-card" style={{ '--stat-accent': '#F59E0B' }}>
                    <div className="stat-icon accent">🔄</div>
                    <div>
                        <div className="stat-value">{totalRounds}</div>
                        <div className="stat-label">Rounds Dealt</div>
                    </div>
                </div>
                <div className="stat-card" style={{ '--stat-accent': '#3B82F6' }}>
                    <div className="stat-icon info">♣</div>
                    <div>
                        <div className="stat-value">{playerStats.length}</div>
                        <div className="stat-label">Players Tracked</div>
                    </div>
                </div>
                <div className="stat-card" style={{ '--stat-accent': '#EC4899' }}>
                    <div className="stat-icon" style={{ background: 'rgba(236,72,153,0.12)', color: '#F472B6' }}>♦</div>
                    <div>
                        <div className="stat-value">{totalPoints.toLocaleString()}</div>
                        <div className="stat-label">Total Points</div>
                    </div>
                </div>
                <div className="stat-card" style={{ '--stat-accent': '#8B5CF6' }}>
                    <div className="stat-icon" style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>🏆</div>
                    <div>
                        <div className="stat-value">{topWinner ? topWinner.name : '—'}</div>
                        <div className="stat-label">Most Wins ({topWinner ? topWinner.wins : 0})</div>
                    </div>
                </div>
                <div className="stat-card" style={{ '--stat-accent': '#22C55E' }}>
                    <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>♠</div>
                    <div>
                        <div className="stat-value">
                            {playerStats.length > 0 ? playerStats[0].avgScore : 0}
                        </div>
                        <div className="stat-label">Best Avg ({playerStats.length > 0 ? playerStats[0].name : '—'})</div>
                    </div>
                </div>
            </div>

            {/* Charts Row 1 */}
            {playerStats.length > 0 && (
                <div className="grid-2" style={{ marginBottom: 'var(--space-xl)' }}>
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <div className="card-title">♠ Average Score per Player</div>
                                <div className="card-subtitle">Lower is better — top 10 players</div>
                            </div>
                        </div>
                        <div className="chart-container">
                            <Bar data={avgData} options={{
                                ...chartOptions,
                                plugins: { ...chartOptions.plugins, legend: { display: false } },
                                indexAxis: 'y',
                            }} />
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <div>
                                <div className="card-title">🏆 Win Distribution</div>
                                <div className="card-subtitle">Session victories per player</div>
                            </div>
                        </div>
                        <div className="chart-container" style={{ height: 300 }}>
                            {playersWithWins.length > 0 ? (
                                <Doughnut data={winData} options={{
                                    responsive: true, maintainAspectRatio: false, cutout: '55%',
                                    plugins: { legend: { position: 'right', labels: { color: '#94A3B8', font: { family: 'Inter', size: 12 }, padding: 12 } } },
                                }} />
                            ) : (
                                <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
                                    <p className="text-muted">No completed sessions with winners yet.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Charts Row 2 */}
            {sessionData.length > 1 && (
                <div className="grid-2" style={{ marginBottom: 'var(--space-xl)' }}>
                    <div className="card">
                        <div className="card-header">
                            <div>
                                <div className="card-title">♥ Score Trends</div>
                                <div className="card-subtitle">Top 5 players across sessions (lower = better)</div>
                            </div>
                        </div>
                        <div className="chart-container">
                            <Line data={trendData} options={chartOptions} />
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <div>
                                <div className="card-title">♦ Game Activity</div>
                                <div className="card-subtitle">Rounds and players per session</div>
                            </div>
                        </div>
                        <div className="chart-container">
                            <Bar data={activityData} options={chartOptions} />
                        </div>
                    </div>
                </div>
            )}

            {/* All-Time Player Rankings */}
            {playerStats.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">♠ All-Time Player Rankings</div>
                        <span className="badge badge-accent">{playerStats.length} players</span>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: 50 }}>#</th>
                                    <th>Player</th>
                                    <th style={{ textAlign: 'center' }}>Games</th>
                                    <th style={{ textAlign: 'center' }}>Wins</th>
                                    <th style={{ textAlign: 'center' }}>Win %</th>
                                    <th style={{ textAlign: 'center' }}>Rounds</th>
                                    <th style={{ textAlign: 'center' }}>Best</th>
                                    <th style={{ textAlign: 'center' }}>Worst</th>
                                    <th style={{ textAlign: 'center' }}>Total</th>
                                    <th style={{ textAlign: 'center' }}>Avg</th>
                                </tr>
                            </thead>
                            <tbody>
                                {playerStats.map((player, i) => (
                                    <tr key={player.id}>
                                        <td>
                                            <span className={`rank-badge ${i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-default'}`}>
                                                {i + 1}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                                <div className="pool-avatar" style={{
                                                    background: getAvatarColor(player.name),
                                                    width: 28, height: 28, fontSize: 11,
                                                }}>
                                                    {getInitials(player.name)}
                                                </div>
                                                <span style={{ fontWeight: 500 }}>{player.name}</span>
                                            </div>
                                        </td>
                                        <td className="font-mono" style={{ textAlign: 'center' }}>{player.sessions}</td>
                                        <td className="font-mono" style={{ textAlign: 'center' }}>{player.wins}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <span className={`badge ${player.winRate > 0 ? 'badge-success' : 'badge-neutral'}`}>
                                                {player.winRate}%
                                            </span>
                                        </td>
                                        <td className="font-mono" style={{ textAlign: 'center' }}>{player.roundsPlayed}</td>
                                        <td className="font-mono" style={{ textAlign: 'center', color: 'var(--color-success)' }}>{player.bestScore}</td>
                                        <td className="font-mono" style={{ textAlign: 'center', color: 'var(--color-danger)' }}>{player.worstScore}</td>
                                        <td className="font-mono text-accent" style={{ textAlign: 'center' }}>{player.totalScore}</td>
                                        <td className="font-mono" style={{ textAlign: 'center', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                                            {player.avgScore}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
