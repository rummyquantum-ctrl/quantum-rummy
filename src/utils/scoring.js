/**
 * Scoring utility functions for Quantum Rummy
 * Ports logic from the original Google Apps Script
 */

/**
 * Calculate round total from individual game scores
 */
export function calculateRoundTotal(scores) {
    return Object.values(scores).reduce((sum, val) => sum + (Number(val) || 0), 0);
}

/**
 * Calculate final total including adjustments
 */
export function calculateFinalTotal(total, adjustments = {}) {
    const adjSum = Object.values(adjustments).reduce((sum, val) => sum + (Number(val) || 0), 0);
    return total + adjSum;
}

/**
 * Get leaderboard sorted by score (lowest is best in Rummy)
 */
export function getLeaderboard(finalTotals, ascending = true) {
    return [...finalTotals]
        .filter((p) => p.player_name !== 'Expenses' && p.player_name !== 'Total')
        .sort((a, b) => ascending ? a.final_total - b.final_total : b.final_total - a.final_total);
}

/**
 * Get consolidated scores (like consolidateDashboard in Apps Script)
 */
export function consolidateScores(allTotals) {
    const consolidated = {};
    allTotals.forEach(({ player_name, total }) => {
        if (player_name === 'Expenses' || player_name === 'Total') return;
        consolidated[player_name] = (consolidated[player_name] || 0) + total;
    });
    return Object.entries(consolidated)
        .map(([name, score]) => ({ name, score }))
        .sort((a, b) => a.score - b.score);
}

/**
 * Format date for display
 */
export function formatDate(dateStr, format = 'short') {
    const date = new Date(dateStr);
    if (format === 'short') {
        return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return date.toLocaleDateString('en-US', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });
}

/**
 * Format timestamp
 */
export function formatTimestamp(dateStr) {
    return new Date(dateStr).toLocaleString('en-US', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

/**
 * Generate player avatar color from name
 */
export function getAvatarColor(name) {
    const colors = [
        '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
        '#14B8A6', '#6366F1', '#EF4444', '#84CC16', '#06B6D4',
        '#F97316', '#A855F7', '#22D3EE', '#FB7185', '#34D399',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
}

/**
 * Get initials from player name
 */
export function getInitials(name) {
    return name.slice(0, 2).toUpperCase();
}

/**
 * Generate a rank emoji
 */
export function getRankEmoji(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
}
