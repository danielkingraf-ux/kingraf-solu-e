import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import type { Session } from '@supabase/supabase-js';
import Layout from './components/Layout/Layout';
import Login from './pages/Auth/Login';
import Dashboard from './pages/Quality/Dashboard';
import Selection from './pages/Selection/Selection';
import BoxRegistry from './pages/Production/BoxRegistry';
import ProductionDashboard from './pages/Production/ProductionDashboard';
import ProductionList from './pages/Production/ProductionList';
import Stock from './pages/Production/Stock';
import Sizes from './pages/Production/Sizes';
import Users from './pages/Production/Users';
import LabelPrinter from './pages/Labels/LabelPrinter';
import NewRevision from './pages/Quality/NewRevision';
import RevisionHistory from './pages/Quality/RevisionHistory';
import Registrations from './pages/Quality/Registrations';
import QualityReports from './pages/Quality/QualityReports';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Handle logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setSelectedModule(null);
  };

  // Show loading while checking auth
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0F172A',
        color: '#FFF',
        fontFamily: 'Sora, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>KINGRAF</h1>
          <p style={{ opacity: 0.5 }}>Carregando...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!session) {
    return <Login onLoginSuccess={() => { }} />;
  }

  // Authenticated content
  if (!selectedModule) {
    return <Selection onSelect={setSelectedModule} onLogout={handleLogout} />;
  }

  if (selectedModule === 'labels') {
    return <LabelPrinter onBack={() => setSelectedModule(null)} />;
  }

  const handleNavigate = (pageId: string) => {
    setSelectedModule(pageId);
  };

  const content = () => {
    // Módulo de Produção
    if (selectedModule === 'production') return <BoxRegistry />;
    if (selectedModule === 'prod-records') return <ProductionList />;
    if (selectedModule === 'prod-dashboard') return <ProductionDashboard />;
    if (selectedModule === 'prod-stock') return <Stock />;
    if (selectedModule === 'prod-sizes') return <Sizes />;
    if (selectedModule === 'prod-users') return <Users />;

    // Módulo de Qualidade
    if (selectedModule === 'revisions') return <NewRevision />;
    if (selectedModule === 'history') return <RevisionHistory />;
    if (selectedModule === 'reports') return <QualityReports />;
    if (selectedModule === 'registrations') return <Registrations />;

    // Dashboard padrão (Qualidade)
    return <Dashboard />;
  };

  return (
    <Layout
      currentPage={selectedModule}
      onExit={() => setSelectedModule(null)}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
    >
      {content()}
    </Layout>
  );
}

export default App;
