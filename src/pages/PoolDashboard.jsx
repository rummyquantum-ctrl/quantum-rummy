import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    Tooltip,
    Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
    fetchActiveSession,
    fetchPoolScores,
    fetchSessions,
    upsertPoolScore,
    fetchPlayers,
} from '../lib/supabaseService';
import { getAvatarColor, getInitials } from '../utils/scoring';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

export default function PoolDashboard() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [poolScores, setPoolScores] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [players, setPlayers] = useState([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addForm, setAddForm] = useState({ player_id: '', total_score: 0, field_points: 0 });
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'success') => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
    }, []);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [active, allPlayers] = await Promise.all([
                fetchActiveSession(),
                fetchPlayers(),
            ]);
            setActiveSession(active);
            setPlayers(allPlayers || []);

            if (active) {
                const scores = await fetchPoolScores(active.id);
                setPoolScores(scores || []);
            }
        } catch (err) {
            console.error('Pool load error:', err);
            addToast('Failed to load pool data: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    const activePlayers = poolScores.filter((p) => !p.is_eliminated);
    const eliminatedPlayers = poolScores.filter((p) => p.is_eliminated);
    const sorted = [...poolScores].sort((a, b) => a.total_score - b.total_score);

    const handleAddScore = async () => {
        if (!addForm.player_id || !activeSession) return;
        try {
            setSaving(true);
            await upsertPoolScore(
                activeSession.id,
                addForm.player_id,
                Number(addForm.total_score) || 0,
                Number(addForm.field_points) || 0,
                false
            );
            addToast('✅ Pool score saved!');
            setShowAddModal(false);
            setAddForm({ player_id: '', total_score: 0, field_points: 0 });
            await loadData();
        } catch (err) {
            addToast('Error: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleEliminate = async (score) => {
        try {
            await upsertPoolScore(
                activeSession.id,
                score.player_id,
                score.total_score,
                score.field_points,
                true
            );
            addToast(`❌ ${score.player_name} eliminated`);
            await loadData();
        } catch (err) {
            addToast('Error: ' + err.message, 'error');
        }
    };

    const barData = useMemo(() => ({
        labels: sorted.map((p) => p.player_name),
        datasets: [
            {
                label: 'Total Score',
                data: sorted.map((p) => p.total_score),
                backgroundColor: sorted.map((p) =>
                    p.is_eliminated ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.5)'
                ),
                borderColor: sorted.map((p) =>
                    p.is_eliminated ? '#EF4444' : '#10B981'
                ),
                borderWidth: 1,
                borderRadius: 6,
            },
            {
                label: 'Field Points',
                data: sorted.map((p) => p.field_points),
                backgroundColor: 'rgba(245,158,11,0.4)',
                borderColor: '#F59E0B',
                borderWidth: 1,
                borderRadius: 6,
            },
        ],
    }), [sorted]);

    const doughnutData = useMemo(() => ({
        labels: ['Active', 'Eliminated'],
        datasets: [{
            data: [activePlayers.length, eliminatedPlayers.length],
            backgroundColor: ['#10B981', '#EF4444'],
            borderColor: '#1E293B',
            borderWidth: 4,
        }],
    }), [activePlayers.length, eliminatedPlayers.length]);

    if (loading) {
        return (
            <div className="page-enter">
                <div className="empty-state">
                    <div className="card-spinner">♠️</div>
                    <h3>Loading Pool Dashboard...</h3>
                </div>
            </div>
        );
    }

    return (
        <div className="page-enter">
            <div className="page-header">
                <div className="page-header-row">
                    <div>
                        <h2>Pool Rummy Dashboard</h2>
                        <p>Track pool scores, field points, and eliminations</p>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        {activeSession && (
                            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                                + Add Pool Score
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {!activeSession && (
                <div className="card">
                    <div className="empty-state">
                        <div className="empty-state-icon">🪙</div>
                        <h3>No Active Session</h3>
                        <p>Start a game session first to track pool scores.</p>
                    </div>
                </div>
            )}

            {/* Stats */}
            {activeSession && (
                <>
                    <div className="stats-grid">
                        <div className="stat-card" style={{ '--stat-accent': '#10B981' }}>
                            <div className="stat-icon primary">🏊</div>
                            <div>
                                <div className="stat-value">{poolScores.length}</div>
                                <div className="stat-label">Total Players</div>
                            </div>
                        </div>
                        <div className="stat-card" style={{ '--stat-accent': '#22C55E' }}>
                            <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>✅</div>
                            <div>
                                <div className="stat-value">{activePlayers.length}</div>
                                <div className="stat-label">Still Active</div>
                            </div>
                        </div>
                        <div className="stat-card" style={{ '--stat-accent': '#EF4444' }}>
                            <div className="stat-icon danger">❌</div>
                            <div>
                                <div className="stat-value">{eliminatedPlayers.length}</div>
                                <div className="stat-label">Eliminated</div>
                            </div>
                        </div>
                        <div className="stat-card" style={{ '--stat-accent': '#F59E0B' }}>
                            <div className="stat-icon accent">🏆</div>
                            <div>
                                <div className="stat-value">{sorted.length > 0 ? sorted[0].player_name : '—'}</div>
                                <div className="stat-label">Leading Player</div>
                            </div>
                        </div>
                    </div>

                    {poolScores.length > 0 ? (
                        <>
                            <div className="grid-2" style={{ marginBottom: 'var(--space-xl)' }}>
                                <div className="card">
                                    <div className="card-header">
                                        <div className="card-title">Pool Standings</div>
                                    </div>
                                    <div className="chart-container">
                                        <Bar data={barData} options={{
                                            responsive: true,
                                            maintainAspectRatio: false,
                                            plugins: {
                                                legend: { labels: { color: '#94A3B8', font: { family: 'Inter', size: 12 } } },
                                                tooltip: { backgroundColor: '#1E293B', titleColor: '#F1F5F9', bodyColor: '#94A3B8', borderColor: 'rgba(148,163,184,0.12)', borderWidth: 1, padding: 12, cornerRadius: 8 },
                                            },
                                            scales: {
                                                x: { ticks: { color: '#64748B' }, grid: { color: 'rgba(148,163,184,0.06)' } },
                                                y: { ticks: { color: '#64748B' }, grid: { color: 'rgba(148,163,184,0.06)' } },
                                            },
                                        }} />
                                    </div>
                                </div>

                                <div className="card">
                                    <div className="card-header">
                                        <div className="card-title">Player Status</div>
                                    </div>
                                    <div className="chart-container" style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Doughnut data={doughnutData} options={{
                                            responsive: true, maintainAspectRatio: false, cutout: '60%',
                                            plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', font: { family: 'Inter', size: 12 }, padding: 16 } } },
                                        }} />
                                    </div>
                                </div>
                            </div>

                            {/* Player Cards */}
                            <div className="card">
                                <div className="card-header">
                                    <div className="card-title">Pool Scoreboard</div>
                                    <span className="badge badge-neutral">{poolScores.length} players</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-md)' }}>
                                    {sorted.map((player) => (
                                        <div key={player.id} className={`pool-card ${player.is_eliminated ? 'eliminated' : ''}`}>
                                            <div className="pool-avatar" style={{ background: getAvatarColor(player.player_name) }}>
                                                {getInitials(player.player_name)}
                                            </div>
                                            <div className="pool-info">
                                                <div className="pool-name">
                                                    {player.player_name}
                                                    {player.is_eliminated && (
                                                        <span className="badge badge-danger" style={{ marginLeft: 8 }}>OUT</span>
                                                    )}
                                                </div>
                                                <div className="pool-field">Field Points: {player.field_points}</div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                                                <div className="pool-score">{player.total_score}</div>
                                                {!player.is_eliminated && (
                                                    <button
                                                        className="btn btn-icon btn-ghost"
                                                        onClick={() => handleEliminate(player)}
                                                        title="Eliminate"
                                                        style={{ fontSize: 14 }}
                                                    >
                                                        ❌
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="card">
                            <div className="empty-state">
                                <div className="empty-state-icon">🪙</div>
                                <h3>No Pool Scores Yet</h3>
                                <p>Click "Add Pool Score" to start tracking pool rummy results.</p>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Add Pool Score Modal */}
            {showAddModal && (
                <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Add Pool Score</h3>
                            <button className="btn btn-icon btn-ghost" onClick={() => setShowAddModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Player</label>
                                <select
                                    className="form-input"
                                    value={addForm.player_id}
                                    onChange={(e) => setAddForm({ ...addForm, player_id: e.target.value })}
                                >
                                    <option value="">Select a player</option>
                                    {players.filter((p) => p.is_active).map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Total Score</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={addForm.total_score}
                                    onChange={(e) => setAddForm({ ...addForm, total_score: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Field Points</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={addForm.field_points}
                                    onChange={(e) => setAddForm({ ...addForm, field_points: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleAddScore} disabled={saving || !addForm.player_id}>
                                {saving ? 'Saving...' : 'Save Score'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toasts.length > 0 && (
                <div className="toast-container">
                    {toasts.map((t) => (
                        <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
                    ))}
                </div>
            )}
        </div>
    );
}
