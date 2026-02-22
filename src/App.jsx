import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import GameSession from './pages/GameSession';
import Players from './pages/Players';
import History from './pages/History';
import Analytics from './pages/Analytics';

function App() {
    return (
        <BrowserRouter>
            <div className="app-layout">
                <Sidebar />
                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/game" element={<GameSession />} />
                        <Route path="/pool" element={<Navigate to="/game" replace />} />
                        <Route path="/players" element={<Players />} />
                        <Route path="/history" element={<History />} />
                        <Route path="/analytics" element={<Analytics />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}

export default App;

