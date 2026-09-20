import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import type { Session } from '@supabase/supabase-js';
import Layout from './components/Layout/Layout';
import { ToastProvider } from './components/Toast/ToastProvider';
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
import Bipagem from './pages/Rastreio/Bipagem';
import NovoPalete from './pages/Rastreio/NovoPalete';
import ListaPaletes from './pages/Rastreio/ListaPaletes';
import ImportarOP from './pages/Rastreio/ImportarOP';
import Fechamento from './pages/Rastreio/Fechamento';
import Operadores from './pages/Rastreio/Operadores';
import SemAcesso from './pages/Rastreio/SemAcesso';
import { ehAdministrador } from './pages/Rastreio/api';



function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  // Conta de administracao (PCP, supervisao) enxerga importacao e cadastros.
  // O PC da maquina entra com conta de operacao e nao vê essas telas.
  const [admin, setAdmin] = useState(false);

  // Check for existing session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAdmin(false);   // o perfil e conferido de novo para a conta que entrou
    });

    return () => subscription.unsubscribe();
  }, []);

  // O perfil vem do banco a cada login, nunca do que a tela guardou.
  useEffect(() => {
    if (!session) return;
    let valendo = true;
    ehAdministrador().then(v => { if (valendo) setAdmin(v); });
    return () => { valendo = false; };
  }, [session]);

  // Handle logout
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setAdmin(false);
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
    return <Selection onSelect={setSelectedModule} onLogout={handleLogout} usuario={session.user.email} />;
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
    if (selectedModule === 'history') return <RevisionHistory onNavigate={handleNavigate} />;
    if (selectedModule === 'reports') return <QualityReports />;
    if (selectedModule === 'registrations') return <Registrations />;
    if (selectedModule === 'users') return <Users />;

    // Módulo de Rastreio de Palete
    if (selectedModule === 'rast-bipagem') return <Bipagem />;
    if (selectedModule === 'rast-novo') return <NovoPalete />;
    if (selectedModule === 'rast-paletes') return <ListaPaletes />;
    if (selectedModule === 'rast-fechamento') return <Fechamento />;
    if (selectedModule === 'rast-importar') return admin ? <ImportarOP /> : <SemAcesso />;
    if (selectedModule === 'rast-operadores') return admin ? <Operadores /> : <SemAcesso />;

    // Dashboard padrão (Qualidade)
    return <Dashboard />;
  };

  return (
    <ToastProvider>
      <Layout
        currentPage={selectedModule}
        session={session}
        onExit={() => setSelectedModule(null)}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        admin={admin}
      >
        {content()}
      </Layout>
    </ToastProvider>
  );
}

export default App;
