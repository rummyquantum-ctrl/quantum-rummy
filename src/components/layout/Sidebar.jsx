import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const navItems = [
    { path: '/', icon: '📊', label: 'Dashboard' },
    { path: '/game', icon: '🂡', label: 'Score Board' },
];

const manageItems = [
    { path: '/players', icon: '👥', label: 'Players' },
    { path: '/history', icon: '📜', label: 'History' },
    { path: '/analytics', icon: '📈', label: 'Analytics' },
];

export default function Sidebar() {
    const [mobileOpen, setMobileOpen] = useState(false);
    const location = useLocation();

    const toggleMobile = () => setMobileOpen((prev) => !prev);
    const closeMobile = () => setMobileOpen(false);

    return (
        <>
            {/* Mobile Header */}
            <div className="mobile-header">
                <button className="mobile-header-toggle" onClick={toggleMobile}>
                    ☰
                </button>
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>
                    ♠♥ Quantum Rummy ♦♣
                </span>
                <div style={{ width: 40 }} />
            </div>

            {/* Sidebar Overlay (mobile) */}
            <div
                className={`sidebar-overlay ${mobileOpen ? 'open' : ''}`}
                onClick={closeMobile}
            />

            {/* Sidebar */}
            <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
                <div className="sidebar-brand">
                    <div className="sidebar-brand-icon">♠</div>
                    <div>
                        <h1>Quantum Rummy</h1>
                        <span>♠♥ Score Dashboard ♦♣</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <div className="sidebar-nav-label">Main</div>
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                `sidebar-nav-item ${isActive ? 'active' : ''}`
                            }
                            onClick={closeMobile}
                            end={item.path === '/'}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            {item.label}
                        </NavLink>
                    ))}

                    <div className="sidebar-nav-label">Manage</div>
                    {manageItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                `sidebar-nav-item ${isActive ? 'active' : ''}`
                            }
                            onClick={closeMobile}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    v01.24 • Created by Srinivas Tadapaneni
                </div>
            </aside>
        </>
    );
}
