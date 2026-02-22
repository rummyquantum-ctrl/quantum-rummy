import { useState, useEffect, useCallback } from 'react';
import {
    fetchPlayers,
    addPlayer,
    updatePlayer,
    togglePlayerActive,
} from '../lib/supabaseService';
import { getAvatarColor, getInitials } from '../utils/scoring';

export default function Players() {
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState(null);
    const [formData, setFormData] = useState({ name: '', email: '' });
    const [searchQuery, setSearchQuery] = useState('');
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'success') => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
    }, []);

    const loadPlayers = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchPlayers();
            setPlayers(data || []);
        } catch (err) {
            addToast('Failed to load players: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { loadPlayers(); }, [loadPlayers]);

    const filteredPlayers = players.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.email || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const activePlayers = filteredPlayers.filter((p) => p.is_active);
    const inactivePlayers = filteredPlayers.filter((p) => !p.is_active);

    const openAddModal = () => {
        setEditingPlayer(null);
        setFormData({ name: '', email: '' });
        setShowModal(true);
    };

    const openEditModal = (player) => {
        setEditingPlayer(player);
        setFormData({ name: player.name, email: player.email || '' });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formData.name.trim()) return;
        try {
            setSaving(true);
            if (editingPlayer) {
                await updatePlayer(editingPlayer.id, {
                    name: formData.name.trim(),
                    email: formData.email.trim(),
                });
                addToast(`✏️ Updated ${formData.name.trim()}`);
            } else {
                await addPlayer(formData.name.trim(), formData.email.trim());
                addToast(`✅ Added ${formData.name.trim()}`);
            }
            setShowModal(false);
            await loadPlayers();
        } catch (err) {
            addToast('Error: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (player) => {
        try {
            await togglePlayerActive(player.id, !player.is_active);
            addToast(
                player.is_active ? `🚫 ${player.name} deactivated` : `✅ ${player.name} re-activated`,
                player.is_active ? 'info' : 'success'
            );
            await loadPlayers();
        } catch (err) {
            addToast('Error: ' + err.message, 'error');
        }
    };

    if (loading) {
        return (
            <div className="page-enter">
                <div className="empty-state">
                    <div className="empty-state-icon">⏳</div>
                    <h3>Loading Players...</h3>
                </div>
            </div>
        );
    }

    return (
        <div className="page-enter">
            <div className="page-header">
                <div className="page-header-row">
                    <div>
                        <h2>Players</h2>
                        <p>Manage your Quantum Rummy player roster</p>
                    </div>
                    <button className="btn btn-primary" onClick={openAddModal}>
                        + Add Player
                    </button>
                </div>
            </div>

            {/* Search */}
            <div style={{ marginBottom: 'var(--space-lg)' }}>
                <input
                    type="text"
                    className="form-input"
                    placeholder="🔍 Search players by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ maxWidth: 400 }}
                />
            </div>

            {/* Stats */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                <div className="stat-card" style={{ '--stat-accent': '#10B981' }}>
                    <div className="stat-icon primary">👥</div>
                    <div>
                        <div className="stat-value">{players.length}</div>
                        <div className="stat-label">Total</div>
                    </div>
                </div>
                <div className="stat-card" style={{ '--stat-accent': '#22C55E' }}>
                    <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>✅</div>
                    <div>
                        <div className="stat-value">{players.filter((p) => p.is_active).length}</div>
                        <div className="stat-label">Active</div>
                    </div>
                </div>
                <div className="stat-card" style={{ '--stat-accent': '#64748B' }}>
                    <div className="stat-icon" style={{ background: 'rgba(100,116,139,0.12)', color: '#64748B' }}>⏸</div>
                    <div>
                        <div className="stat-value">{players.filter((p) => !p.is_active).length}</div>
                        <div className="stat-label">Inactive</div>
                    </div>
                </div>
            </div>

            {/* Active Players */}
            <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
                <div className="card-header">
                    <div className="card-title">Active Players</div>
                    <span className="badge badge-success">{activePlayers.length}</span>
                </div>
                {activePlayers.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-md)' }}>
                        {activePlayers.map((player) => (
                            <div key={player.id} className="player-card">
                                <div className="player-avatar" style={{ background: getAvatarColor(player.name) }}>
                                    {getInitials(player.name)}
                                </div>
                                <div className="player-details">
                                    <h4>{player.name}</h4>
                                    <p>{player.email || 'No email'}</p>
                                </div>
                                <div className="player-actions">
                                    <button className="btn btn-icon btn-ghost" onClick={() => openEditModal(player)} title="Edit">
                                        ✏️
                                    </button>
                                    <button className="btn btn-icon btn-ghost" onClick={() => handleToggleActive(player)} title="Deactivate">
                                        ⏸
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
                        <p>No active players found.</p>
                    </div>
                )}
            </div>

            {/* Inactive Players */}
            {inactivePlayers.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">Inactive Players</div>
                        <span className="badge badge-neutral">{inactivePlayers.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-md)' }}>
                        {inactivePlayers.map((player) => (
                            <div key={player.id} className="player-card" style={{ opacity: 0.6 }}>
                                <div className="player-avatar" style={{ background: '#475569' }}>
                                    {getInitials(player.name)}
                                </div>
                                <div className="player-details">
                                    <h4>{player.name}</h4>
                                    <p>{player.email || 'No email'}</p>
                                </div>
                                <div className="player-actions">
                                    <button className="btn btn-sm btn-ghost" onClick={() => handleToggleActive(player)}>
                                        Reactivate
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingPlayer ? 'Edit Player' : 'Add Player'}</h3>
                            <button className="btn btn-icon btn-ghost" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">Player Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g. Srikar"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Email Address</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    placeholder="e.g. srikar@example.com"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !formData.name.trim()}>
                                {saving ? 'Saving...' : editingPlayer ? 'Save Changes' : 'Add Player'}
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
