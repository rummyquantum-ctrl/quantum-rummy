import { useState, useEffect, useCallback, useRef } from 'react';
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
import { getAvatarColor, getInitials } from '../utils/scoring';

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
    const [toasts, setToasts] = useState([]);

    // Current round scores: { playerId: number|null, expenses: number|null }
    const [roundScores, setRoundScores] = useState({});
    const autoSaveTriggered = useRef(false);

    // Wizard state — 3 steps: 1=Game Type, 2=Details, 3=Players
    const [wizardStep, setWizardStep] = useState(1);

    // Step 1: Game Type & Rules
    const [gameType, setGameType] = useState('strike');
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

    // Auto-update session name when game type / pool limit changes
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

    // Initialize round scores for current round
    const initRoundScores = useCallback((playerList, sessionGameType) => {
        const initial = {};
        playerList.forEach((player) => { initial[player.id] = null; });
        if (sessionGameType === 'strike') {
            initial['expenses'] = null;
        }
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
                const nextRound = (roundsData || []).length + 1;
                setCurrentRound(nextRound);

                const playerIds = finals.length > 0
                    ? finals.map((f) => f.player_id)
                    : (playersData || []).filter((p) => p.is_active).map((p) => p.id);
                const activePlayers = (playersData || []).filter((p) => playerIds.includes(p.id));
                setSessionPlayers(activePlayers);
                setRoundScores(initRoundScores(activePlayers, active.game_type || 'strike'));
                autoSaveTriggered.current = false;
            }
        } catch (err) {
            console.error('Load error:', err);
            addToast('Failed to load data: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [initRoundScores, addToast]);

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

    // ───── Score handling (new single-score model) ─────
    const handleScoreChange = useCallback((key, value) => {
        // Allow empty string → null (not yet entered), '0' → 0 (valid zero)
        const parsed = value === '' ? null : Number(value);
        setRoundScores((prev) => ({ ...prev, [key]: parsed }));
        autoSaveTriggered.current = false;
    }, []);

    // ───── Auto-save: when all scores filled (including 0) ─────
    const isRoundComplete = useCallback(() => {
        if (saving || autoSaveTriggered.current) return false;
        const playerIds = sessionPlayers.map((p) => p.id);
        if (playerIds.length === 0) return false;

        for (const pid of playerIds) {
            if (roundScores[pid] === null || roundScores[pid] === undefined) return false;
        }
        // For strike games, expenses must also be filled
        const sessionType = activeSession?.game_type || 'strike';
        if (sessionType === 'strike' && (roundScores['expenses'] === null || roundScores['expenses'] === undefined)) {
            return false;
        }
        return true;
    }, [sessionPlayers, roundScores, saving, activeSession]);

    const doAutoSave = useCallback(async () => {
        if (!activeSession || !isRoundComplete()) return;
        autoSaveTriggered.current = true;
        try {
            setSaving(true);
            // Convert roundScores to the format expected by backupAndNextRound
            const playerScores = sessionPlayers.map((p) => ({
                player_id: p.id,
                game1: roundScores[p.id] || 0,
                game2: 0, game3: 0, game4: 0, game5: 0,
                game6: 0, game7: 0, game8: 0, game9: 0, game10: 0,
            }));

            await backupAndNextRound(activeSession.id, currentRound, playerScores);
            addToast(`✅ Round SR${currentRound} saved!`);
            await loadData();
        } catch (err) {
            addToast('Auto-save failed: ' + err.message, 'error');
            autoSaveTriggered.current = false;
        } finally {
            setSaving(false);
        }
    }, [activeSession, isRoundComplete, sessionPlayers, roundScores, currentRound, addToast, loadData]);

    // Watch for round completion and trigger auto-save
    useEffect(() => {
        if (isRoundComplete() && !autoSaveTriggered.current) {
            const timer = setTimeout(() => doAutoSave(), 600); // Small delay for UX
            return () => clearTimeout(timer);
        }
    }, [roundScores, isRoundComplete, doAutoSave]);

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
            setRoundScores(initRoundScores(selected, gameType));
            autoSaveTriggered.current = false;
            setWizardStep(1);
            addToast(`🃏 ${gameType === 'pool' ? `Pool ${effectivePoolLimit}` : 'Strike'} game started with ${selected.length} players!`);
        } catch (err) {
            addToast('Failed to create session: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    }, [newSessionName, newSessionTable, selectedPlayerIds, allPlayers, initRoundScores, addToast, gameType, poolLimit, useCustomPool, customPoolLimit, penalties]);

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

    // Penalty handler
    const handlePenaltyChange = useCallback((key, value) => {
        setPenalties((prev) => ({ ...prev, [key]: Number(value) || 0 }));
    }, []);

    // ───── Computed values ─────
    const sessionType = activeSession?.game_type || 'strike';
    const isStrike = sessionType === 'strike';
    const effectivePoolLimit = activeSession?.pool_limit || 201;

    // Build past round score map: { roundId: { playerId: score } }
    const pastRoundScoreMap = {};
    allScores.forEach((s) => {
        if (!pastRoundScoreMap[s.round_id]) pastRoundScoreMap[s.round_id] = {};
        pastRoundScoreMap[s.round_id][s.player_id] = s.round_total;
    });

    // Cumulative totals per player (from finalTotals)
    const cumulativeTotals = {};
    finalTotals.forEach((ft) => { cumulativeTotals[ft.player_id] = ft.total || 0; });

    // Current round net (for Strike)
    const currentRoundNet = (() => {
        if (!isStrike) return null;
        let sum = 0;
        sessionPlayers.forEach((p) => { sum += roundScores[p.id] || 0; });
        sum += roundScores['expenses'] || 0;
        return sum;
    })();

    // ───── LOADING STATE ─────
    if (loading) {
        return (
            <div className="page-enter">
                <div className="empty-state">
                    <div className="empty-state-icon">🃏</div>
                    <h3>Shuffling the Deck...</h3>
                    <p>Loading game data</p>
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════
    //  WIZARD — No active session
    // ══════════════════════════════════════
    if (!activeSession) {
        return (
            <div className="page-enter">
                <div className="page-header">
                    <h2><span className="header-icon">🃏</span> New Game Session</h2>
                    <p>Configure your 13-card Indian Rummy game</p>
                </div>

                {/* Stepper */}
                <div className="stepper">
                    {[
                        { num: 1, label: 'Game Type' },
                        { num: 2, label: 'Details' },
                        { num: 3, label: 'Players' },
                    ].map((step) => (
                        <div key={step.num} className={`stepper-step ${wizardStep >= step.num ? 'active' : ''} ${wizardStep > step.num ? 'completed' : ''}`}>
                            <div className="stepper-circle">{wizardStep > step.num ? '✓' : step.num}</div>
                            <span className={`stepper-label ${wizardStep === step.num ? 'active' : ''}`}>{step.label}</span>
                        </div>
                    ))}
                </div>

                <div className="card" style={{ padding: 'var(--space-xl)' }}>
                    {/* ─── Step 1: Game Type ─── */}
                    {wizardStep === 1 && (
                        <>
                            <div className="section-label">🎴 Choose Game Type</div>
                            <div className="game-type-grid">
                                <div
                                    className={`game-type-card ${gameType === 'strike' ? 'selected' : ''}`}
                                    onClick={() => updateGameType('strike')}
                                >
                                    <div className="type-check">{gameType === 'strike' ? '✓' : ''}</div>
                                    <span className="type-icon">⚡</span>
                                    <div className="type-name">Strike Rummy</div>
                                    <div className="type-desc">Points-based game. Lowest score at the end wins. No elimination.</div>
                                </div>
                                <div
                                    className={`game-type-card ${gameType === 'pool' ? 'selected' : ''}`}
                                    onClick={() => updateGameType('pool')}
                                >
                                    <div className="type-check">{gameType === 'pool' ? '✓' : ''}</div>
                                    <span className="type-icon">🏊</span>
                                    <div className="type-name">Pool Rummy</div>
                                    <div className="type-desc">Players eliminated when score exceeds pool limit. Last player standing wins.</div>
                                </div>
                            </div>

                            {/* Pool Limit */}
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
                                <div className="section-label">📋 Penalty Rules (13 Card Rummy)</div>
                                <div className="penalty-grid">
                                    {[
                                        { key: 'firstDrop', label: 'First Drop', sub: 'Drop before picking first card', icon: '🟥' },
                                        { key: 'middleDrop', label: 'Middle Drop', sub: 'Drop after picking card(s)', icon: '🟧' },
                                        { key: 'fullCount', label: 'Full Count', sub: 'Maximum penalty for losing', icon: '🟪' },
                                        { key: 'wrongShow', label: 'Wrong Show', sub: 'Invalid declaration penalty', icon: '❌' },
                                    ].map((rule) => (
                                        <div key={rule.key} className="penalty-rule">
                                            <div>
                                                <div className="penalty-label">{rule.icon} {rule.label}</div>
                                                <div className="penalty-sub">{rule.sub}</div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <input
                                                    type="number"
                                                    className="penalty-input"
                                                    value={penalties[rule.key]}
                                                    onChange={(e) => handlePenaltyChange(rule.key, e.target.value)}
                                                />
                                                <span className="penalty-unit">pts</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button className="btn btn-primary btn-full" onClick={() => setWizardStep(2)}>
                                Next → Session Details
                            </button>
                        </>
                    )}

                    {/* ─── Step 2: Session Details ─── */}
                    {wizardStep === 2 && (
                        <>
                            <div className="section-label">📝 Session Details</div>
                            <div style={{ marginBottom: 'var(--space-lg)' }}>
                                <label className="form-label">Session Name</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g. Strike - 21Feb2026"
                                    value={newSessionName}
                                    onChange={(e) => handleNameChange(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div style={{ marginBottom: 'var(--space-xl)' }}>
                                <label className="form-label">Table Number</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={newSessionTable}
                                    onChange={(e) => setNewSessionTable(Number(e.target.value) || 1)}
                                    min="1"
                                    max="20"
                                />
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                                <button className="btn btn-ghost" onClick={() => setWizardStep(1)}>← Back</button>
                                <button className="btn btn-primary btn-full" onClick={() => setWizardStep(3)}>
                                    Next → Select Players
                                </button>
                            </div>
                        </>
                    )}

                    {/* ─── Step 3: Player Selection ─── */}
                    {wizardStep === 3 && (
                        <>
                            <div className="section-label" style={{ marginBottom: 'var(--space-sm)' }}>
                                👥 Select Players ({selectedPlayerIds.size}/{MAX_PLAYERS})
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                                <button className="btn btn-ghost btn-sm" onClick={selectAll}>Select All</button>
                                <button className="btn btn-ghost btn-sm" onClick={deselectAll}>Clear</button>
                            </div>

                            <div className="player-picker-grid">
                                {allPlayers.filter((p) => p.is_active).map((player) => (
                                    <div
                                        key={player.id}
                                        className={`player-picker-card ${selectedPlayerIds.has(player.id) ? 'selected' : ''}`}
                                        onClick={() => togglePlayer(player.id)}
                                    >
                                        <div className="pool-avatar" style={{
                                            background: getAvatarColor(player.name),
                                            width: 32, height: 32, fontSize: 12,
                                        }}>
                                            {getInitials(player.name)}
                                        </div>
                                        <span>{player.name}</span>
                                        <span className="picker-check">{selectedPlayerIds.has(player.id) ? '✓' : ''}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Inline Add Player */}
                            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Add new player..."
                                    value={newPlayerName}
                                    onChange={(e) => setNewPlayerName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddNewPlayer()}
                                />
                                <button className="btn btn-accent" onClick={handleAddNewPlayer} disabled={!newPlayerName.trim()}>
                                    + Add
                                </button>
                            </div>

                            <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                                <button className="btn btn-ghost" onClick={() => setWizardStep(2)}>← Back</button>
                                <button
                                    className="btn btn-primary btn-full"
                                    onClick={handleCreateSession}
                                    disabled={selectedPlayerIds.size === 0 || saving}
                                >
                                    {saving ? '⏳ Creating...' : `🃏 Start ${gameType === 'pool' ? 'Pool' : 'Strike'} Game (${selectedPlayerIds.size} players)`}
                                </button>
                            </div>
                        </>
                    )}
                </div>

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

    // ══════════════════════════════════════
    //  ACTIVE SESSION — Transposed score table
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
                                {isStrike ? '⚡ Strike' : `🏊 Pool ${effectivePoolLimit}`}
                            </span>
                            <span className="header-divider">•</span>
                            <span className="header-meta-chip">🎴 Table {activeSession.table_number}</span>
                            <span className="header-divider">•</span>
                            <span className="header-meta-chip">🔄 Round SR{currentRound}</span>
                            <span className="header-divider">•</span>
                            <span className="header-meta-chip">♣ {sessionPlayers.length} players</span>
                            {rounds.length > 0 && (
                                <>
                                    <span className="header-divider">•</span>
                                    <span className="header-meta-chip">📊 {rounds.length} saved</span>
                                </>
                            )}
                            <span className="header-meta-chip live">
                                <span className="pulse-dot" style={{ width: 6, height: 6 }} /> Live
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                        <button className="btn btn-ghost" onClick={() => setShowEndSessionModal(true)} style={{ color: 'var(--color-danger)' }}>
                            🏁 End Session
                        </button>
                    </div>
                </div>
            </div>

            {/* Scoring Banner */}
            <div className="active-banner" style={{ marginBottom: 'var(--space-lg)' }}>
                <div className="active-banner-info">
                    <h3>📝 Scoring — Round SR{currentRound}</h3>
                    <p>
                        Enter scores for each player. {isStrike ? 'Fill all scores + expenses to auto-save.' : 'Fill all scores to auto-save.'}
                        {' '}Use <strong>Tab</strong> to navigate across players.
                    </p>
                </div>
                {saving && <span className="badge badge-accent">⏳ Saving...</span>}
            </div>

            {/* ═══ Transposed Score Table ═══ */}
            <div className="card" style={{ padding: 0 }}>
                <div className="table-container score-table">
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: 100, textAlign: 'left' }}>Round</th>
                                {sessionPlayers.map((p) => (
                                    <th key={p.id} style={{ textAlign: 'center', minWidth: 80 }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                            <div className="pool-avatar" style={{
                                                background: getAvatarColor(p.name),
                                                width: 26, height: 26, fontSize: 10,
                                            }}>
                                                {getInitials(p.name)}
                                            </div>
                                            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>{p.name}</span>
                                        </div>
                                    </th>
                                ))}
                                {isStrike && (
                                    <>
                                        <th style={{ textAlign: 'center', minWidth: 80, color: 'var(--color-danger)' }}>💰 Exp</th>
                                        <th style={{ textAlign: 'center', minWidth: 70, background: 'rgba(16,185,129,0.08)' }}>♠ Net</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {/* Past rounds — read-only */}
                            {rounds.map((round) => {
                                const roundData = pastRoundScoreMap[round.id] || {};
                                let roundNet = 0;
                                sessionPlayers.forEach((p) => { roundNet += roundData[p.player_id] || 0; });

                                return (
                                    <tr key={round.id}>
                                        <td style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                                            {round.round_label}
                                        </td>
                                        {sessionPlayers.map((p) => {
                                            const val = roundData[p.player_id] || 0;
                                            return (
                                                <td key={p.id} className="font-mono" style={{
                                                    textAlign: 'center',
                                                    color: val === 0 ? 'var(--color-success)' : val >= 80 ? 'var(--color-danger)' : 'var(--text-primary)',
                                                    fontWeight: val === 0 ? 700 : 400,
                                                }}>
                                                    {val}
                                                </td>
                                            );
                                        })}
                                        {isStrike && (
                                            <>
                                                <td className="font-mono" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>—</td>
                                                <td className="font-mono" style={{ textAlign: 'center', color: 'var(--text-tertiary)' }}>—</td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })}

                            {/* Current round — editable */}
                            <tr className="current-round-row" style={{ background: 'rgba(16,185,129,0.04)', borderTop: '2px solid var(--color-primary)' }}>
                                <td style={{ fontWeight: 700, color: 'var(--color-primary-light)' }}>
                                    SR{currentRound} ✏️
                                </td>
                                {sessionPlayers.map((p, idx) => (
                                    <td key={p.id}>
                                        <input
                                            type="number"
                                            value={roundScores[p.id] === null || roundScores[p.id] === undefined ? '' : roundScores[p.id]}
                                            onChange={(e) => handleScoreChange(p.id, e.target.value)}
                                            placeholder="—"
                                            tabIndex={idx + 1}
                                            style={{ textAlign: 'center' }}
                                            autoFocus={idx === 0}
                                        />
                                    </td>
                                ))}
                                {isStrike && (
                                    <>
                                        <td>
                                            <input
                                                type="number"
                                                value={roundScores['expenses'] === null || roundScores['expenses'] === undefined ? '' : roundScores['expenses']}
                                                onChange={(e) => handleScoreChange('expenses', e.target.value)}
                                                placeholder="—"
                                                tabIndex={sessionPlayers.length + 1}
                                                style={{ textAlign: 'center', borderColor: 'rgba(239,68,68,0.2)' }}
                                            />
                                        </td>
                                        <td className="font-mono" style={{
                                            textAlign: 'center',
                                            fontWeight: 700,
                                            color: currentRoundNet === 0 ? 'var(--color-success)' : 'var(--color-danger)',
                                        }}>
                                            {currentRoundNet}
                                        </td>
                                    </>
                                )}
                            </tr>

                            {/* Cumulative totals row */}
                            <tr className="total-row" style={{ borderTop: '2px solid var(--border-color)' }}>
                                <td style={{ fontWeight: 700, color: 'var(--color-primary-light)' }}>
                                    {isStrike ? '♠ Total' : '🏊 Total'}
                                </td>
                                {sessionPlayers.map((p) => {
                                    const cumTotal = (cumulativeTotals[p.id] || 0) + (roundScores[p.id] || 0);
                                    const isEliminated = !isStrike && cumTotal >= effectivePoolLimit;
                                    const isNearLimit = !isStrike && cumTotal >= effectivePoolLimit * 0.8;

                                    return (
                                        <td key={p.id} className="font-mono" style={{
                                            textAlign: 'center',
                                            fontWeight: 700,
                                            color: isEliminated ? 'var(--color-danger)' :
                                                isNearLimit ? 'var(--color-accent)' :
                                                    'var(--color-primary-light)',
                                            textDecoration: isEliminated ? 'line-through' : 'none',
                                        }}>
                                            {cumTotal}
                                            {isEliminated && ' ❌'}
                                        </td>
                                    );
                                })}
                                {isStrike && (
                                    <>
                                        <td></td>
                                        <td></td>
                                    </>
                                )}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pool Limit Indicator */}
            {!isStrike && (
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginTop: 'var(--space-md)' }}>
                    {sessionPlayers.map((p) => {
                        const total = (cumulativeTotals[p.id] || 0) + (roundScores[p.id] || 0);
                        const pct = Math.min(100, Math.round((total / effectivePoolLimit) * 100));
                        const isOut = total >= effectivePoolLimit;
                        return (
                            <div key={p.id} style={{
                                flex: '1 1 140px', padding: 'var(--space-sm) var(--space-md)',
                                background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
                                border: `1px solid ${isOut ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'}`,
                                opacity: isOut ? 0.6 : 1,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', marginBottom: 4 }}>
                                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                                    <span className="font-mono" style={{ color: isOut ? 'var(--color-danger)' : 'var(--text-secondary)' }}>
                                        {total}/{effectivePoolLimit}
                                    </span>
                                </div>
                                <div style={{ height: 4, borderRadius: 2, background: 'var(--border-color)', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%', width: `${pct}%`, borderRadius: 2,
                                        background: isOut ? 'var(--color-danger)' : pct >= 80 ? 'var(--color-accent)' : 'var(--color-primary)',
                                        transition: 'width 0.3s ease',
                                    }} />
                                </div>
                                {isOut && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)', fontWeight: 600, marginTop: 2 }}>❌ Eliminated</div>}
                            </div>
                        );
                    })}
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
