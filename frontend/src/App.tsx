import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Settings, BarChart2, Database, TrendingUp, LogOut, DatabaseZap } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/pages/LoginPage';
import { DashboardPage, ConfigPage, HistoryPage, PricesPage } from './components/pages';
import { TickerChips } from './components/atoms/TickerChips/TickerChips';
import './App.css';

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

function BackfillPage() {
  const { authHeader } = useAuth();
  const [tickers, setTickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const savedConfig = localStorage.getItem('gapAnalyzerConfig');
  const apiKey = savedConfig ? JSON.parse(savedConfig).twelveDataKey : '';

  const handleBackfill = async () => {
    if (!tickers.length) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('https://gap-analyzer-worker.agrolepra.workers.dev/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ tickers, apiKey }),
      });
      const data = await res.json();
      setMsg(data.message || data.error || 'Hecho');
    } catch { setMsg('Error de conexión'); }
    setLoading(false);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'24px' }}>
      <div>
        <h1 style={{margin:0,fontSize:'1.8rem',fontWeight:700,color:'var(--text-primary)'}}>Cargar Histórico (~1 año)</h1>
        <p style={{color:'var(--text-muted)',marginTop:'8px'}}>Carga hasta 365 días de precios históricos sin duplicar. El proceso corre en segundo plano respetando el límite de la API.</p>
      </div>
      <div className="glass-panel" style={{padding:'24px',display:'flex',flexDirection:'column',gap:'16px'}}>
        <label style={{fontWeight:500,color:'var(--text-secondary)',fontSize:'0.9rem'}}>Tickers a cargar:</label>
        <TickerChips tickers={tickers} onChange={setTickers} />
        <button
          onClick={handleBackfill}
          disabled={loading || !tickers.length}
          style={{background:'var(--accent-gradient)',color:'white',border:'none',padding:'12px 24px',borderRadius:'10px',fontFamily:'inherit',fontSize:'0.95rem',fontWeight:600,cursor:'pointer',opacity:loading||!tickers.length?0.6:1,alignSelf:'flex-start'}}
        >
          {loading ? 'Iniciando...' : 'Iniciar Backfill'}
        </button>
        {msg && <div style={{background:'rgba(99,102,241,0.1)',border:'1px solid rgba(99,102,241,0.2)',color:'#a5b4fc',padding:'12px 16px',borderRadius:'8px',fontSize:'0.9rem'}}>{msg}</div>}
      </div>
    </div>
  );
}

function AppShell() {
  const { isAuthenticated, logout } = useAuth();

  if (!isAuthenticated) return <LoginPage />;

  return (
    <div className="app-container">
      {/* Sidebar for Desktop */}
      <nav className="glass-panel sidebar">
        <div className="logo">GapAnalyzer</div>
        <div className="nav-links">
          <NavItem to="/" icon={<BarChart2 size={18} />} label="Dashboard" />
          <NavItem to="/history" icon={<Database size={18} />} label="Historial Gaps" />
          <NavItem to="/prices" icon={<TrendingUp size={18} />} label="Cotizaciones" />
          <NavItem to="/backfill" icon={<DatabaseZap size={18} />} label="Cargar Histórico" />
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
        <NavItem to="/history" icon={<Database size={20} />} label="Gaps" />
        <NavItem to="/prices" icon={<TrendingUp size={20} />} label="Precios" />
        <NavItem to="/backfill" icon={<DatabaseZap size={20} />} label="Histórico" />
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
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/prices" element={<PricesPage />} />
          <Route path="/backfill" element={<BackfillPage />} />
          <Route path="/config" element={<ConfigPage />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppShell />
      </Router>
    </AuthProvider>
  );
}

export default App;
