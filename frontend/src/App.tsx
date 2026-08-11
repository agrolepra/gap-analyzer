import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Settings, BarChart2, Database } from 'lucide-react';
import { DashboardPage, ConfigPage, HistoryPage } from './components/pages';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app-container">
        {/* Organism: Sidebar/Navigation */}
        <nav className="glass-panel sidebar">
          <div className="logo text-gradient">GapAnalyzer</div>
          <div className="nav-links">
            <Link to="/" className="nav-item">
              <BarChart2 size={20} />
              <span>Dashboard</span>
            </Link>
            <Link to="/history" className="nav-item">
              <Database size={20} />
              <span>Historial BD</span>
            </Link>
            <Link to="/config" className="nav-item">
              <Settings size={20} />
              <span>Configuración</span>
            </Link>
          </div>
        </nav>

        {/* Template: Main Content Area */}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/config" element={<ConfigPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
