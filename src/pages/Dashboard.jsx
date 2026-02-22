import { useState, useEffect, useMemo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, BarElement, LineElement,
    PointElement, ArcElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import {
    fetchPlayers, fetchSessions, fetchActiveSession,
    fetchFinalTotals, fetchAllScoresForSession, fetchRounds,
} from '../lib/supabaseService';
import { getLeaderboard, getAvatarColor, getInitials } from '../utils/scoring';

ChartJS.register(
    CategoryScale, LinearScale, BarElement, LineElement,
    PointElement, ArcElement, Tooltip, Legend, Filler
);

const chartDefaults = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
        legend: { labels: { color: '#94A3B8', font: { family: 'Inter', size: 12 } } },
        tooltip: {
            backgroundColor: '#1E293B', titleColor: '#F1F5F9', bodyColor: '#94A3B8',
            borderColor: 'rgba(148,163,184,0.12)', borderWidth: 1, padding: 12, cornerRadius: 8,
            titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'Inter' },
        },
    },
    scales: {
        x: { ticks: { color: '#64748B', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(148,163,184,0.06)' } },
        y: { ticks: { color: '#64748B', font: { family: 'Inter', size: 11 } }, grid: { color: 'rgba(148,163,184,0.06)' } },
    },
};

export default function Dashboard() {
    const [loading, setLoading] = useState(true);
    const [activeSession, setActiveSession] = useState(null);
    const [allSessions, setAllSessions] = useState([]);
    const [players, setPlayers] = useState([]);
    const [leaderboard, setLeaderboard] = useState([]);
    const [rounds, setRounds] = useState([]);
    const [scores, setScores] = useState([]);
    const [totalRounds, setTotalRounds] = useState(0);
    const [allTimeStats, setAllTimeStats] = useState({ highestScore: 0, lowestAvg: 0, lowestAvgPlayer: '—', totalGamesWon: {} });

    useEffect(() => {
        async function loadData() {
            try {
                setLoading(true);
                const [playersData, sessionsData, active] = await Promise.all([
                    fetchPlayers(), fetchSessions(), fetchActiveSession(),
                ]);
                setPlayers(playersData || []);
                setAllSessions(sessionsData || []);
                setActiveSession(active);

                // Aggregate stats across all sessions
                let roundCount = 0;
                let highestScore = 0;
                const winCounts = {};
                const playerTotals = {};

                for (const session of (sessionsData || [])) {
                    const [r, finals] = await Promise.all([fetchRounds(session.id), fetchFinalTotals(session.id)]);
                    roundCount += (r || []).length;

                    (finals || []).forEach((ft) => {
                        if (ft.final_total > highestScore) highestScore = ft.final_total;
                        if (!playerTotals[ft.player_id]) playerTotals[ft.player_id] = { name: ft.player_name, total: 0, sessions: 0 };
                        playerTotals[ft.player_id].total += ft.final_total || 0;
                        playerTotals[ft.player_id].sessions += 1;
                    });

                    if ((finals || []).length > 0) {
                        const winner = finals.reduce((min, ft) => (ft.final_total < min.final_total ? ft : min));
                        winCounts[winner.player_name] = (winCounts[winner.player_name] || 0) + 1;
                    }
                }
                setTotalRounds(roundCount);

                // Find player with lowest average
                let lowestAvg = Infinity, lowestAvgPlayer = '—';
                Object.values(playerTotals).forEach((p) => {
                    const avg = p.sessions > 0 ? p.total / p.sessions : Infinity;
                    if (avg < lowestAvg) { lowestAvg = avg; lowestAvgPlayer = p.name; }
                });

                setAllTimeStats({
                    highestScore,
                    lowestAvg: lowestAvg === Infinity ? 0 : Math.round(lowestAvg),
                    lowestAvgPlayer,
                    totalGamesWon: winCounts,
                });

                // Active session leaderboard
                if (active) {
                    const [finals, sessionScores] = await Promise.all([
                        fetchFinalTotals(active.id), fetchAllScoresForSession(active.id),
                    ]);
                    setLeaderboard(getLeaderboard(finals || []));
                    setRounds(sessionScores.rounds || []);
                    setScores(sessionScores.scores || []);
                }
            } catch (err) {
                console.error('Dashboard load error:', err);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    // Charts
    const barData = useMemo(() => ({
        labels: leaderboard.map((p) => p.player_name),
        datasets: [{
            label: 'Total Score',
            data: leaderboard.map((p) => p.final_total),
            backgroundColor: leaderboard.map((_, i) =>
                i === 0 ? 'rgba(34, 197, 94, 0.7)' : i < 3 ? 'rgba(16, 185, 129, 0.5)' : 'rgba(245, 158, 11, 0.4)'
            ),
            borderColor: leaderboard.map((_, i) => i === 0 ? '#22C55E' : i < 3 ? '#10B981' : '#F59E0B'),
            borderWidth: 1, borderRadius: 6,
        }],
    }), [leaderboard]);

    const lineData = useMemo(() => {
        const top5 = leaderboard.slice(0, 5);
        const roundLabels = rounds.map((r) => r.round_label);
        const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6'];
        return {
            labels: roundLabels,
            datasets: top5.map((player, i) => {
                const playerScores = scores.filter((s) => s.player_id === player.player_id);
                const map = {};
                playerScores.forEach((s) => { map[s.round_id] = s.round_total; });
                let cum = 0;
                const data = rounds.map((r) => { cum += map[r.id] || 0; return cum; });
                return {
                    label: player.player_name, data, borderColor: colors[i],
                    backgroundColor: `${colors[i]}20`, tension: 0.4, fill: false,
                    pointRadius: 4, pointHoverRadius: 6,
                };
            }),
        };
    }, [leaderboard, rounds, scores]);

    const doughnutData = useMemo(() => ({
        labels: leaderboard.slice(0, 8).map((p) => p.player_name),
        datasets: [{
            data: leaderboard.slice(0, 8).map((p) => p.final_total),
            backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6', '#EF4444', '#6366F1'],
            borderColor: '#1E293B', borderWidth: 3,
        }],
    }), [leaderboard]);

    // Top winner across all sessions
    const topWinner = useMemo(() => {
        const wins = allTimeStats.totalGamesWon;
        const entries = Object.entries(wins);
        if (entries.length === 0) return { name: '—', wins: 0 };
        entries.sort((a, b) => b[1] - a[1]);
        return { name: entries[0][0], wins: entries[0][1] };
    }, [allTimeStats.totalGamesWon]);

    if (loading) {
        return (
            <div className="page-enter">
                <div className="empty-state">
                    <div className="card-spinner">♠️</div>
                    <h3>Shuffling the Deck...</h3>
                    <p>Loading dashboard data</p>
                </div>
            </div>
        );
    }

    const activePlayers = players.filter((p) => p.is_active);
    const completedSessions = allSessions.filter((s) => s.status === 'completed');

    return (
        <div className="page-enter">
            {/* Header */}
            <div className="page-header">
                <div className="page-header-row">
                    <div>
                        <h2><span className="header-icon">♠</span> Dashboard</h2>
                        <p>Real-time Quantum Rummy score monitoring</p>
                    </div>
                    {activeSession && (
                        <div className="active-banner-live">
                            <span className="pulse-dot" /> Live Session
                        </div>
                    )}
                </div>
            </div>

            {/* Active Session Banner */}
            {activeSession ? (
                <div className="active-banner">
                    <div className="active-banner-info">
                        <h3>🃏 {activeSession.session_name}</h3>
                        <p>
                            Table {activeSession.table_number} • {rounds.length} rounds played • {leaderboard.length} players
                        </p>
                    </div>
                    <a href="/game" className="btn btn-primary">🎴 Enter Game</a>
                </div>
            ) : (
                <div className="active-banner" style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)' }}>
                    <div className="active-banner-info">
                        <h3>🃏 No Active Session</h3>
                        <p>Start a new game to begin tracking scores</p>
                    </div>
                    <a href="/game" className="btn btn-accent">♠ New Game</a>
                </div>
            )}

            {/* Stats Grid — 6 cards */}
            <div className="stats-grid">
                <div className="stat-card" style={{ '--stat-accent': '#10B981' }}>
                    <div className="stat-icon primary">🃏</div>
                    <div>
                        <div className="stat-value">{allSessions.length}</div>
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
                    <div className="stat-icon accent">🔄</div>
                    <div>
                        <div className="stat-value">{totalRounds}</div>
                        <div className="stat-label">Rounds Dealt</div>
                    </div>
                </div>
                <div className="stat-card" style={{ '--stat-accent': '#3B82F6' }}>
                    <div className="stat-icon info">♣</div>
                    <div>
                        <div className="stat-value">{activePlayers.length}</div>
                        <div className="stat-label">Active Players</div>
                    </div>
                </div>
                <div className="stat-card" style={{ '--stat-accent': '#8B5CF6' }}>
                    <div className="stat-icon" style={{ background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>🏆</div>
                    <div>
                        <div className="stat-value">{topWinner.name}</div>
                        <div className="stat-label">Most Wins ({topWinner.wins})</div>
                    </div>
                </div>
                <div className="stat-card" style={{ '--stat-accent': '#EC4899' }}>
                    <div className="stat-icon" style={{ background: 'rgba(236,72,153,0.12)', color: '#F472B6' }}>♦</div>
                    <div>
                        <div className="stat-value">{allTimeStats.lowestAvg}</div>
                        <div className="stat-label">Best Avg ({allTimeStats.lowestAvgPlayer})</div>
                    </div>
                </div>
            </div>

            {/* Charts */}
            {leaderboard.length > 0 ? (
                <>
                    <div className="grid-2" style={{ marginBottom: 'var(--space-xl)' }}>
                        <div className="card">
                            <div className="card-header">
                                <div>
                                    <div className="card-title">♠ Current Session Scores</div>
                                    <div className="card-subtitle">All players ranked by total (lower = better)</div>
                                </div>
                            </div>
                            <div className="chart-container">
                                <Bar data={barData} options={{
                                    ...chartDefaults,
                                    plugins: { ...chartDefaults.plugins, legend: { display: false } },
                                    indexAxis: 'y',
                                }} />
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-header">
                                <div>
                                    <div className="card-title">♥ Round Progression</div>
                                    <div className="card-subtitle">Top 5 cumulative scores per round</div>
                                </div>
                            </div>
                            <div className="chart-container">
                                <Line data={lineData} options={chartDefaults} />
                            </div>
                        </div>
                    </div>

                    <div className="grid-2">
                        <div className="card">
                            <div className="card-header">
                                <div className="card-title">🏆 Leaderboard</div>
                                <span className="badge badge-accent">{leaderboard.length} players</span>
                            </div>
                            <div>
                                {leaderboard.map((player, i) => (
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

                        <div className="card">
                            <div className="card-header">
                                <div className="card-title">♦ Score Distribution</div>
                            </div>
                            <div className="chart-container" style={{ height: 360 }}>
                                <Doughnut data={doughnutData} options={{
                                    ...chartDefaults, scales: undefined, cutout: '55%',
                                    plugins: {
                                        ...chartDefaults.plugins,
                                        legend: { position: 'right', labels: { color: '#94A3B8', font: { family: 'Inter', size: 12 }, padding: 12 } },
                                    },
                                }} />
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">🃏</div>
                        <h3>No Active Game Data</h3>
                        <p>Start a game session and record rounds to see live charts and leaderboard.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
