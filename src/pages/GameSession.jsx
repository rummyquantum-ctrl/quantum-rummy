import { useState, useEffect, useCallback } from 'react';
import {
    fetchPlayers,
    fetchActiveSession,
    fetchRounds,
    fetchFinalTotals,
    fetchAllScoresForSession,
    createSession,
    backupAndNextRound,
    completeSession,
    addPlayer,
} from '../lib/supabaseService';
import { calculateRoundTotal } from '../utils/scoring';

const GAME_COLUMNS = ['game1', 'game2', 'game3', 'game4', 'game5', 'game6', 'game7', 'game8', 'game9', 'game10'];

// Default penalty rules for Indian 13-card Rummy
const DEFAULT_PENALTIES = {
    firstDrop: 20,
    middleDrop: 40,
    fullCount: 80,
    wrongShow: 80,
};

const POOL_PRESETS = [101, 201, 251];

export default function GameSession() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeSession, setActiveSession] = useState(null);
    const [allPlayers, setAllPlayers] = useState([]);
    const [sessionPlayers, setSessionPlayers] = useState([]);
    const [rounds, setRounds] = useState([]);
    const [finalTotals, setFinalTotals] = useState([]);
    const [allScores, setAllScores] = useState([]);
    const [currentRound, setCurrentRound] = useState(1);
    const [scores, setScores] = useState({});
    const [toasts, setToasts] = useState([]);

    // Wizard state — 3 steps: 1=Game Type, 2=Details, 3=Players
    const [wizardStep, setWizardStep] = useState(1);

    // Step 1: Game Type & Rules
    const [gameType, setGameType] = useState('strike'); // 'strike' | 'pool'
    const [poolLimit, setPoolLimit] = useState(201);
    const [customPoolLimit, setCustomPoolLimit] = useState('');
    const [useCustomPool, setUseCustomPool] = useState(false);
    const [penalties, setPenalties] = useState({ ...DEFAULT_PENALTIES });

    // Session name helper — auto-generates from game type
    const buildSessionName = useCallback((type, limit, isCustom, customVal) => {
        const d = new Date();
        const dateStr = `${d.getDate()}${d.toLocaleString('en-US', { month: 'short' })}${d.getFullYear()}`;
        if (type === 'pool') {
            const poolVal = isCustom ? (Number(customVal) || '?') : limit;
            return `Pool ${poolVal} - ${dateStr}`;
        }
        return `Strike - ${dateStr}`;
    }, []);

    // Step 2: Session Details
    const [newSessionName, setNewSessionName] = useState(() => buildSessionName('strike', 201, false, ''));
    const [newSessionTable, setNewSessionTable] = useState(1);
    const [nameManuallyEdited, setNameManuallyEdited] = useState(false);

    // Auto-update session name when game type / pool limit changes (unless user edited it)
    const updateGameType = useCallback((type) => {
        setGameType(type);
        if (!nameManuallyEdited) setNewSessionName(buildSessionName(type, poolLimit, useCustomPool, customPoolLimit));
    }, [nameManuallyEdited, buildSessionName, poolLimit, useCustomPool, customPoolLimit]);

    const handlePoolPreset = useCallback((val) => {
        setPoolLimit(val);
        setUseCustomPool(false);
        if (!nameManuallyEdited) setNewSessionName(buildSessionName('pool', val, false, ''));
    }, [nameManuallyEdited, buildSessionName]);

    const handleCustomPool = useCallback(() => {
        setUseCustomPool(true);
        setCustomPoolLimit('');
        if (!nameManuallyEdited) setNewSessionName(buildSessionName('pool', poolLimit, true, ''));
    }, [nameManuallyEdited, buildSessionName, poolLimit]);

    const handleCustomPoolChange = useCallback((val) => {
        setCustomPoolLimit(val);
        if (!nameManuallyEdited) setNewSessionName(buildSessionName('pool', poolLimit, true, val));
    }, [nameManuallyEdited, buildSessionName, poolLimit]);

    const handleNameChange = useCallback((val) => {
        setNewSessionName(val);
        setNameManuallyEdited(true);
    }, []);

    // Step 3: Player Picker
    const [selectedPlayerIds, setSelectedPlayerIds] = useState(new Set());
    const [newPlayerName, setNewPlayerName] = useState('');
    const MAX_PLAYERS = 10;

    // Modal
    const [showEndSessionModal, setShowEndSessionModal] = useState(false);

    const addToast = useCallback((message, type = 'success') => {
        const id = Date.now();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    }, []);

    const initScores = useCallback((playerList) => {
        const initial = {};
        playerList.forEach((player) => {
            initial[player.id] = {};
            GAME_COLUMNS.forEach((col) => { initial[player.id][col] = 0; });
        });
        initial['expenses'] = {};
        GAME_COLUMNS.forEach((col) => { initial['expenses'][col] = 0; });
        return initial;
    }, []);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [playersData, active] = await Promise.all([
                fetchPlayers(),
                fetchActiveSession(),
            ]);

            setAllPlayers(playersData || []);
            setActiveSession(active);

            const activeIds = new Set((playersData || []).filter((p) => p.is_active).map((p) => p.id));
            setSelectedPlayerIds(activeIds);

            if (active) {
                const [roundsData, finals, sessionScores] = await Promise.all([
                    fetchRounds(active.id),
                    fetchFinalTotals(active.id),
                    fetchAllScoresForSession(active.id),
                ]);
                setRounds(roundsData || []);
                setFinalTotals(finals || []);
                setAllScores(sessionScores.scores || []);
                setCurrentRound((roundsData || []).length + 1);

                const playerIds = finals.length > 0
                    ? finals.map((f) => f.player_id)
                    : (playersData || []).filter((p) => p.is_active).map((p) => p.id);
                const activePlayers = (playersData || []).filter((p) => playerIds.includes(p.id));
                setSessionPlayers(activePlayers);
                setScores(initScores(activePlayers));
            }
        } catch (err) {
            console.error('Load error:', err);
            addToast('Failed to load data: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [initScores, addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    // ───── Player picker ─────
    const togglePlayer = useCallback((playerId) => {
        setSelectedPlayerIds((prev) => {
            const next = new Set(prev);
            if (next.has(playerId)) {
                next.delete(playerId);
            } else {
                if (next.size >= MAX_PLAYERS) {
                    addToast(`Maximum ${MAX_PLAYERS} players per game.`, 'error');
                    return prev;
                }
                next.add(playerId);
            }
            return next;
        });
    }, [addToast]);

    const selectAll = useCallback(() => {
        const active = allPlayers.filter((p) => p.is_active).slice(0, MAX_PLAYERS);
        setSelectedPlayerIds(new Set(active.map((p) => p.id)));
        if (allPlayers.filter((p) => p.is_active).length > MAX_PLAYERS)
            addToast(`Selected first ${MAX_PLAYERS} players (max limit).`, 'info');
    }, [allPlayers, addToast]);

    const deselectAll = useCallback(() => setSelectedPlayerIds(new Set()), []);

    const handleAddNewPlayer = useCallback(async () => {
        if (!newPlayerName.trim()) return;
        try {
            const player = await addPlayer(newPlayerName.trim());
            setAllPlayers((prev) => [...prev, player]);
            if (selectedPlayerIds.size < MAX_PLAYERS) {
                setSelectedPlayerIds((prev) => new Set([...prev, player.id]));
            }
            setNewPlayerName('');
            addToast(`✅ ${player.name} added!`);
        } catch (err) {
            addToast('Error: ' + err.message, 'error');
        }
    }, [newPlayerName, addToast, selectedPlayerIds.size]);

    // ───── Score handling ─────
    const handleScoreChange = useCallback((playerId, gameCol, value) => {
        setScores((prev) => ({
            ...prev,
            [playerId]: { ...prev[playerId], [gameCol]: Number(value) || 0 },
        }));
    }, []);

    const getRowTotal = useCallback((playerId) => {
        if (!scores[playerId]) return 0;
        return calculateRoundTotal(scores[playerId]);
    }, [scores]);

    const getColumnTotal = useCallback((gameCol) => {
        return Object.entries(scores)
            .reduce((sum, [, ps]) => sum + (Number(ps[gameCol]) || 0), 0);
    }, [scores]);

    // ───── Session actions ─────
    const handleCreateSession = useCallback(async () => {
        if (!newSessionName.trim() || selectedPlayerIds.size === 0) return;
        try {
            setSaving(true);
            const todayStr = new Date().toISOString().split('T')[0];
            const effectivePoolLimit = gameType === 'pool'
                ? (useCustomPool ? Number(customPoolLimit) || 201 : poolLimit)
                : null;

            const gameConfig = {
                gameType,
                poolLimit: effectivePoolLimit,
                penalties,
            };

            const session = await createSession(newSessionName.trim(), todayStr, newSessionTable, gameConfig);
            const selected = allPlayers.filter((p) => selectedPlayerIds.has(p.id));
            setActiveSession(session);
            setSessionPlayers(selected);
            setRounds([]);
            setFinalTotals([]);
            setAllScores([]);
            setCurrentRound(1);
            setScores(initScores(selected));
            setWizardStep(1);
            addToast(`🃏 ${gameType === 'pool' ? `Pool ${effectivePoolLimit}` : 'Strike'} game started with ${selected.length} players!`);
        } catch (err) {
            addToast('Failed to create session: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    }, [newSessionName, newSessionTable, selectedPlayerIds, allPlayers, initScores, addToast, gameType, poolLimit, useCustomPool, customPoolLimit, penalties]);

    const handleBackupAndClear = useCallback(async () => {
        if (!activeSession) return;
        try {
            setSaving(true);
            const playerScores = sessionPlayers
                .filter((p) => scores[p.id] && getRowTotal(p.id) > 0)
                .map((p) => ({ player_id: p.id, ...scores[p.id] }));

            if (playerScores.length === 0) {
                addToast('No scores to save — enter some scores first.', 'error');
                setSaving(false);
                return;
            }

            await backupAndNextRound(activeSession.id, currentRound, playerScores);
            addToast(`✅ Round SR${currentRound} saved! Ready for SR${currentRound + 1}.`);
            await loadData();
        } catch (err) {
            addToast('Backup failed: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    }, [activeSession, sessionPlayers, scores, currentRound, getRowTotal, addToast, loadData]);

    const handleEndSession = useCallback(async () => {
        if (!activeSession) return;
        try {
            await completeSession(activeSession.id);
            addToast('🏁 Session completed successfully!');
            setActiveSession(null);
            setShowEndSessionModal(false);
            setWizardStep(1);
            await loadData();
        } catch (err) {
            addToast('Failed to end session: ' + err.message, 'error');
        }
    }, [activeSession, addToast, loadData]);

    // ───── Penalty change helper ─────
    const handlePenaltyChange = useCallback((key, value) => {
        setPenalties((prev) => ({ ...prev, [key]: Number(value) || 0 }));
    }, []);

    if (loading) {
        return (
            <div className="page-enter">
                <div className="empty-state">
                    <div className="empty-state-icon">⏳</div>
                    <h3>Loading Game Session...</h3>
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════
    //  NO ACTIVE SESSION — 3-STEP WIZARD
    // ══════════════════════════════════════
    if (!activeSession) {
        const activePlayers = allPlayers.filter((p) => p.is_active);
        const effectivePool = useCustomPool ? (Number(customPoolLimit) || '?') : poolLimit;

        const stepLabels = ['Game Type', 'Details', 'Players'];
        const canAdvanceStep1 = !!gameType;
        const canAdvanceStep2 = !!newSessionName.trim();
        const canFinish = selectedPlayerIds.size >= 2;

        return (
            <div className="page-enter">
                {/* Header */}
                <div className="page-header">
                    <h2><span className="header-icon">🎴</span> New Game Session</h2>
                    <p>Configure your 13-card Indian Rummy game</p>
                </div>

                {/* 3-Step Stepper */}
                <div className="stepper">
                    {stepLabels.map((label, i) => {
                        const step = i + 1;
                        const isDone = wizardStep > step;
                        const isActive = wizardStep === step;
                        return (
                            <div key={step} className="stepper-step">
                                {i > 0 && <div className={`stepper-line ${isDone ? 'done' : ''}`} />}
                                <div className={`stepper-dot ${isActive ? 'active' : isDone ? 'done' : ''}`}>
                                    {isDone ? '✓' : step}
                                </div>
                                <span className={`stepper-label ${isActive ? 'active' : ''}`}>{label}</span>
                            </div>
                        );
                    })}
                </div>

                {/* ═══ STEP 1: Game Type & Rules ═══ */}
                {wizardStep === 1 && (
                    <div className="card" style={{ maxWidth: 640, margin: '0 auto' }}>
                        <div className="card-header">
                            <div className="card-title">🃏 Choose Game Type</div>
                        </div>

                        {/* Game Type Cards */}
                        <div className="game-type-grid">
                            <div
                                className={`game-type-card ${gameType === 'strike' ? 'selected' : ''}`}
                                onClick={() => updateGameType('strike')}
                            >
                                <div className="type-check">{gameType === 'strike' ? '✓' : ''}</div>
                                <span className="type-icon">⚡</span>
                                <div className="type-name">Strike Rummy</div>
                                <div className="type-desc">
                                    Points-based game. Lowest score at the end wins. No elimination.
                                </div>
                            </div>
                            <div
                                className={`game-type-card ${gameType === 'pool' ? 'selected' : ''}`}
                                onClick={() => updateGameType('pool')}
                            >
                                <div className="type-check">{gameType === 'pool' ? '✓' : ''}</div>
                                <span className="type-icon">🏊</span>
                                <div className="type-name">Pool Rummy</div>
                                <div className="type-desc">
                                    Players eliminated when score exceeds pool limit. Last player standing wins.
                                </div>
                            </div>
                        </div>

                        {/* Pool Limit — only for Pool */}
                        {gameType === 'pool' && (
                            <div style={{ marginBottom: 'var(--space-lg)' }}>
                                <div className="section-label">🎯 Pool Score Limit</div>
                                <div className="pool-limit-row">
                                    {POOL_PRESETS.map((val) => (
                                        <button
                                            key={val}
                                            className={`pool-pill ${!useCustomPool && poolLimit === val ? 'selected' : ''}`}
                                            onClick={() => handlePoolPreset(val)}
                                        >
                                            {val}
                                        </button>
                                    ))}
                                    <button
                                        className={`pool-pill ${useCustomPool ? 'selected' : ''}`}
                                        onClick={handleCustomPool}
                                    >
                                        Custom
                                    </button>
                                    {useCustomPool && (
                                        <input
                                            type="number"
                                            className="pool-pill-custom"
                                            placeholder="e.g. 301"
                                            value={customPoolLimit}
                                            onChange={(e) => handleCustomPoolChange(e.target.value)}
                                            autoFocus
                                        />
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Penalty Rules */}
                        <div style={{ marginBottom: 'var(--space-lg)' }}>
                            <div className="section-label">📜 Penalty Rules (13 Card Rummy)</div>
                            <div className="penalty-grid">
                                <div className="penalty-rule">
                                    <div>
                                        <div className="penalty-label">🚪 First Drop</div>
                                        <div className="penalty-sub">Drop before picking first card</div>
                                    </div>
                                    <div className="penalty-value">
                                        <input
                                            type="number"
                                            className="penalty-input"
                                            value={penalties.firstDrop}
                                            onChange={(e) => handlePenaltyChange('firstDrop', e.target.value)}
                                        />
                                        <span className="penalty-unit">pts</span>
                                    </div>
                                </div>
                                <div className="penalty-rule">
                                    <div>
                                        <div className="penalty-label">⏸️ Middle Drop</div>
                                        <div className="penalty-sub">Drop after picking card(s)</div>
                                    </div>
                                    <div className="penalty-value">
                                        <input
                                            type="number"
                                            className="penalty-input"
                                            value={penalties.middleDrop}
                                            onChange={(e) => handlePenaltyChange('middleDrop', e.target.value)}
                                        />
                                        <span className="penalty-unit">pts</span>
                                    </div>
                                </div>
                                <div className="penalty-rule">
                                    <div>
                                        <div className="penalty-label">💀 Full Count</div>
                                        <div className="penalty-sub">Maximum penalty for losing</div>
                                    </div>
                                    <div className="penalty-value">
                                        <input
                                            type="number"
                                            className="penalty-input"
                                            value={penalties.fullCount}
                                            onChange={(e) => handlePenaltyChange('fullCount', e.target.value)}
                                        />
                                        <span className="penalty-unit">pts</span>
                                    </div>
                                </div>
                                <div className="penalty-rule">
                                    <div>
                                        <div className="penalty-label">❌ Wrong Show</div>
                                        <div className="penalty-sub">Invalid declaration penalty</div>
                                    </div>
                                    <div className="penalty-value">
                                        <input
                                            type="number"
                                            className="penalty-input"
                                            value={penalties.wrongShow}
                                            onChange={(e) => handlePenaltyChange('wrongShow', e.target.value)}
                                        />
                                        <span className="penalty-unit">pts</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            className="btn btn-primary"
                            disabled={!canAdvanceStep1}
                            onClick={() => setWizardStep(2)}
                            style={{ width: '100%', justifyContent: 'center' }}
                        >
                            Next → Session Details
                        </button>
                    </div>
                )}

                {/* ═══ STEP 2: Session Details ═══ */}
                {wizardStep === 2 && (
                    <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
                        <div className="card-header">
                            <div className="card-title">📝 Session Details</div>
                            <span className="badge badge-accent">
                                {gameType === 'pool' ? `Pool ${effectivePool}` : '⚡ Strike'}
                            </span>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Session Name</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="e.g. Game - 21Feb2026"
                                value={newSessionName}
                                onChange={(e) => handleNameChange(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Table Number</label>
                            <select
                                className="form-input"
                                value={newSessionTable}
                                onChange={(e) => setNewSessionTable(Number(e.target.value))}
                            >
                                <option value={1}>Table 1</option>
                                <option value={2}>Table 2</option>
                                <option value={3}>Table 3</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                            <button className="btn btn-ghost" onClick={() => setWizardStep(1)} style={{ flex: 1, justifyContent: 'center' }}>
                                ← Game Type
                            </button>
                            <button
                                className="btn btn-primary"
                                disabled={!canAdvanceStep2}
                                onClick={() => setWizardStep(3)}
                                style={{ flex: 2, justifyContent: 'center' }}
                            >
                                Next → Select Players
                            </button>
                        </div>
                    </div>
                )}

                {/* ═══ STEP 3: Player Picker ═══ */}
                {wizardStep === 3 && (
                    <div className="card" style={{ maxWidth: 700, margin: '0 auto' }}>
                        <div className="card-header">
                            <div className="card-title">👥 Select Players</div>
                            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                                <button className="btn btn-sm btn-ghost" onClick={selectAll}>Select All</button>
                                <button className="btn btn-sm btn-ghost" onClick={deselectAll}>Clear</button>
                            </div>
                        </div>

                        <div className="player-picker-grid">
                            {activePlayers.map((player) => (
                                <div
                                    key={player.id}
                                    className={`player-pick-chip ${selectedPlayerIds.has(player.id) ? 'selected' : ''}`}
                                    onClick={() => togglePlayer(player.id)}
                                >
                                    <div className="pick-check">
                                        {selectedPlayerIds.has(player.id) ? '✓' : ''}
                                    </div>
                                    <span>{player.name}</span>
                                </div>
                            ))}
                        </div>

                        {/* Add new player inline */}
                        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="Add a new player..."
                                value={newPlayerName}
                                onChange={(e) => setNewPlayerName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddNewPlayer()}
                                style={{ flex: 1 }}
                            />
                            <button
                                className="btn btn-ghost"
                                onClick={handleAddNewPlayer}
                                disabled={!newPlayerName.trim()}
                            >
                                + Add
                            </button>
                        </div>

                        <div className="picker-summary">
                            <span>{selectedPlayerIds.size}/{MAX_PLAYERS} player{selectedPlayerIds.size !== 1 ? 's' : ''} selected</span>
                            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                                <button className="btn btn-ghost" onClick={() => setWizardStep(2)}>
                                    ← Back
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleCreateSession}
                                    disabled={saving || !canFinish}
                                >
                                    {saving ? 'Starting...' : `🎮 Start Game (${selectedPlayerIds.size} players)`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ══════════════════════════════════════
    //  ACTIVE SESSION — SCORE ENTRY
    // ══════════════════════════════════════
    return (
        <div className="page-enter">
            {/* Enhanced Header */}
            <div className="page-header">
                <div className="page-header-row">
                    <div>
                        <h2><span className="header-icon">🃏</span> {activeSession.session_name}</h2>
                        <div className="header-meta">
                            <span className="header-meta-chip">
                                {activeSession.game_type === 'pool' ? `🏊 Pool ${activeSession.pool_limit || ''}` : '⚡ Strike'}
                            </span>
                            <span className="header-divider">•</span>
                            <span className="header-meta-chip">🎴 Table {activeSession.table_number}</span>
                            <span className="header-divider">•</span>
                            <span className="header-meta-chip">🔄 Round SR{currentRound}</span>
                            <span className="header-divider">•</span>
                            <span className="header-meta-chip">👥 {sessionPlayers.length} players</span>
                            {rounds.length > 0 && (
                                <>
                                    <span className="header-divider">•</span>
                                    <span className="header-meta-chip">📊 {rounds.length} rounds saved</span>
                                </>
                            )}
                            <span className="header-meta-chip live">
                                <span className="pulse-dot" style={{ width: 6, height: 6 }} /> Live
                            </span>
                        </div>
                    </div>
                    <div className="page-header-actions">
                        <button className="btn btn-primary" onClick={handleBackupAndClear} disabled={saving}>
                            {saving ? '⏳ Saving...' : '💾 Save Round'}
                        </button>
                        <button className="btn btn-ghost" onClick={() => setShowEndSessionModal(true)} style={{ color: 'var(--color-danger)' }}>
                            🏁 End
                        </button>
                    </div>
                </div>
            </div>

            {/* Round Banner */}
            <div className="active-banner" style={{ marginBottom: 'var(--space-lg)' }}>
                <div className="active-banner-info">
                    <h3>📝 Scoring — Round SR{currentRound}</h3>
                    <p>Enter scores for each game. Round totals auto-calculate.</p>
                </div>
            </div>

            {/* Score Entry Table */}
            <div className="card" style={{ padding: 0 }}>
                <div className="table-container score-table">
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: 50 }}>#</th>
                                <th>Player</th>
                                {GAME_COLUMNS.map((col, i) => (
                                    <th key={col} style={{ textAlign: 'center' }}>G{i + 1}</th>
                                ))}
                                <th style={{ background: 'rgba(16,185,129,0.1)', textAlign: 'center' }}>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sessionPlayers.map((player, idx) => (
                                <tr key={player.id}>
                                    <td style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>{idx + 1}</td>
                                    <td className="player-name">{player.name}</td>
                                    {GAME_COLUMNS.map((col) => (
                                        <td key={col}>
                                            <input
                                                type="number"
                                                value={scores[player.id]?.[col] || ''}
                                                onChange={(e) => handleScoreChange(player.id, col, e.target.value)}
                                                min="0"
                                                placeholder="0"
                                            />
                                        </td>
                                    ))}
                                    <td className="round-total">{getRowTotal(player.id)}</td>
                                </tr>
                            ))}

                            {/* Expenses */}
                            <tr className="expenses-row">
                                <td></td>
                                <td className="player-name" style={{ color: 'var(--color-danger)' }}>💰 Expenses</td>
                                {GAME_COLUMNS.map((col) => (
                                    <td key={col}>
                                        <input
                                            type="number"
                                            value={scores['expenses']?.[col] || ''}
                                            onChange={(e) => handleScoreChange('expenses', col, e.target.value)}
                                            placeholder="0"
                                            style={{ borderColor: 'rgba(239,68,68,0.2)' }}
                                        />
                                    </td>
                                ))}
                                <td className="round-total" style={{ color: 'var(--color-danger)' }}>
                                    {getRowTotal('expenses')}
                                </td>
                            </tr>

                            {/* Totals */}
                            <tr className="total-row">
                                <td></td>
                                <td style={{ color: 'var(--color-primary-light)', fontWeight: 700 }}>♠ Net</td>
                                {GAME_COLUMNS.map((col) => (
                                    <td key={col} className="font-mono" style={{ textAlign: 'center' }}>{getColumnTotal(col)}</td>
                                ))}
                                <td className="round-total" style={{ color: 'var(--color-primary-light)', fontSize: '1.1rem' }}>
                                    {GAME_COLUMNS.reduce((sum, col) => sum + getColumnTotal(col), 0)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Final Totals */}
            {rounds.length > 0 && (
                <div className="card" style={{ marginTop: 'var(--space-xl)' }}>
                    <div className="card-header">
                        <div className="card-title">📊 Final Totals</div>
                        <span className="badge badge-info">{rounds.length} rounds</span>
                    </div>
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Player</th>
                                    {rounds.map((r) => (
                                        <th key={r.id}>{r.round_label}</th>
                                    ))}
                                    <th>Latest</th>
                                    <th style={{ background: 'rgba(16,185,129,0.1)' }}>Total</th>
                                    <th style={{ background: 'rgba(245,158,11,0.1)' }}>Final</th>
                                </tr>
                            </thead>
                            <tbody>
                                {finalTotals.map((player) => {
                                    const roundScoreMap = {};
                                    allScores
                                        .filter((s) => s.player_id === player.player_id)
                                        .forEach((s) => { roundScoreMap[s.round_id] = s.round_total; });
                                    return (
                                        <tr key={player.player_id}>
                                            <td className="player-name">{player.player_name}</td>
                                            {rounds.map((r) => (
                                                <td key={r.id} className="font-mono" style={{ textAlign: 'center' }}>
                                                    {roundScoreMap[r.id] || 0}
                                                </td>
                                            ))}
                                            <td className="font-mono text-accent" style={{ textAlign: 'center' }}>{player.sr_current}</td>
                                            <td className="font-mono" style={{ fontWeight: 600, textAlign: 'center' }}>{player.total}</td>
                                            <td className="font-mono" style={{ fontWeight: 700, color: 'var(--color-primary-light)', textAlign: 'center' }}>
                                                {player.final_total}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* End Session Modal */}
            {showEndSessionModal && (
                <div className="modal-overlay" onClick={() => setShowEndSessionModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>🏁 End Session</h3>
                            <button className="btn btn-icon btn-ghost" onClick={() => setShowEndSessionModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div className="confirm-icon danger">⚠️</div>
                            <div className="confirm-text">
                                <h4>End "{activeSession.session_name}"?</h4>
                                <p>
                                    This will mark the session as completed.
                                    All saved round data will be preserved in history.
                                    You won't be able to add more rounds.
                                </p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowEndSessionModal(false)}>Cancel</button>
                            <button className="btn btn-danger" onClick={handleEndSession}>
                                🏁 End Session
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toasts */}
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
