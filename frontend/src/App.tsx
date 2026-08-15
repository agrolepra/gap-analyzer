import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Settings, BarChart2, Database, TrendingUp, LogOut, GitCommitHorizontal } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { LoginPage } from './components/pages/LoginPage';
import { DashboardPage, ConfigPage, HistoryPage, PricesPage, GapsPage } from './components/pages';
import { JobStatusBanner } from './components/organisms/JobStatusBanner/JobStatusBanner';
import { ToastContainer } from './components/organisms/ToastContainer/ToastContainer';
import './App.css';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/prices': 'Cotizaciones',
  '/gaps': 'Gaps',
  '/history': 'Historial',
  '/config': 'Configuración',
};

function PageTitleUpdater() {
  const location = useLocation();
  useEffect(() => {
    const label = PAGE_TITLES[location.pathname];
    document.title = label ? `Gap Analyzer: ${label}` : 'Gap Analyzer';
  }, [location.pathname]);
  return null;
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link to={to} className={`nav-item${active ? ' nav-item-active' : ''}`}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function AppShell() {
  const { isAuthenticated, logout } = useAuth();

  if (!isAuthenticated) return <LoginPage />;

  return (
    <div className="app-container">
      <PageTitleUpdater />
      {/* Sidebar for Desktop */}
      <nav className="glass-panel sidebar">
        <div className="logo">GapAnalyzer</div>
        <div className="nav-links">
          <NavItem to="/" icon={<BarChart2 size={18} />} label="Dashboard" />
          <NavItem to="/prices" icon={<TrendingUp size={18} />} label="Cotizaciones" />
          <NavItem to="/gaps" icon={<GitCommitHorizontal size={18} />} label="Gaps" />
          <NavItem to="/history" icon={<Database size={18} />} label="Historial" />
          <NavItem to="/config" icon={<Settings size={18} />} label="Configuración" />
        </div>
        <button className="logout-btn" onClick={logout} title="Cerrar sesión">
          <LogOut size={16} />
          <span>Salir</span>
        </button>
      </nav>

      {/* Bottom Nav for Mobile */}
      <nav className="mobile-nav">
        <NavItem to="/" icon={<BarChart2 size={20} />} label="Dash" />
        <NavItem to="/prices" icon={<TrendingUp size={20} />} label="Precios" />
        <NavItem to="/gaps" icon={<GitCommitHorizontal size={20} />} label="Gaps" />
        <NavItem to="/history" icon={<Database size={20} />} label="Historial" />
        <NavItem to="/config" icon={<Settings size={20} />} label="Config" />
      </nav>

      {/* Header for Mobile */}
      <header className="mobile-header">
        <div className="mobile-logo">GapAnalyzer</div>
        <button className="mobile-logout-btn" onClick={logout} title="Cerrar sesión">
          <LogOut size={16} />
          <span>Salir</span>
        </button>
      </header>

      <main className="main-content">
        <JobStatusBanner />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/prices" element={<PricesPage />} />
          <Route path="/gaps" element={<GapsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/config" element={<ConfigPage />} />
        </Routes>
      </main>
      <ToastContainer />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <AppShell />
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
