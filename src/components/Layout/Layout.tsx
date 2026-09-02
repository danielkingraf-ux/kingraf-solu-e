import React, { useState, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  LayoutDashboard,
  ClipboardCheck,
  Settings,
  Package,
  Menu,
  X,
  User,
  LogOut,
  ClipboardList,
  PlusCircle,
  Box,
  Users,
  FileText,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onExit?: () => void;
  onNavigate?: (pageId: string) => void;
  onLogout?: () => void;
  session?: Session | null;
}

import logoFull from '../../assets/logo/logo-full.png';

// Abaixo disso o menu vira gaveta sobreposta; acima, trilho de icones.
const MOBILE_QUERY = '(max-width: 1024px)';
const STORAGE_KEY = 'kingraf.sidebar.aberta';

const Layout: React.FC<LayoutProps> = ({ children, currentPage, onExit, onNavigate, onLogout, session }) => {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (window.matchMedia(MOBILE_QUERY).matches) return false;
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      return salvo === null ? true : salvo === '1';
    } catch {
      return true;
    }
  });
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('pt-BR'));
  const userMetadata = (session?.user?.user_metadata || {}) as Record<string, any>;
  const userName = userMetadata.full_name || userMetadata.nome_completo || session?.user?.email || 'Usuario';
  const userRole = userMetadata.profile || 'Operador';

  // Atualiza o relogio a cada segundo
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('pt-BR'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Acompanha a troca de faixa. Ao virar celular a gaveta fecha; ao voltar para
  // desktop, o menu retoma a preferencia que o usuario tinha salvado.
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const aoMudar = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (e.matches) {
        setIsSidebarOpen(false);
      } else {
        try {
          setIsSidebarOpen(localStorage.getItem(STORAGE_KEY) !== '0');
        } catch {
          setIsSidebarOpen(true);
        }
      }
    };
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  // Esc fecha a gaveta, e o fundo nao rola enquanto ela esta aberta.
  useEffect(() => {
    if (!isMobile || !isSidebarOpen) return;

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSidebarOpen(false);
    };
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', aoTeclar);

    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener('keydown', aoTeclar);
    };
  }, [isMobile, isSidebarOpen]);

  const alternarSidebar = useCallback(() => {
    setIsSidebarOpen(anterior => {
      const proximo = !anterior;
      // A preferencia so faz sentido no desktop: no celular a gaveta sempre
      // comeca fechada, senao ela cobriria a tela a cada entrada.
      if (!window.matchMedia(MOBILE_QUERY).matches) {
        try {
          localStorage.setItem(STORAGE_KEY, proximo ? '1' : '0');
        } catch {
          // modo privativo ou storage bloqueado: segue sem persistir
        }
      }
      return proximo;
    });
  }, []);

  const handleNavigate = (pageId: string) => {
    if (onNavigate) {
      onNavigate(pageId);
    }

    if (window.matchMedia(MOBILE_QUERY).matches) {
      setIsSidebarOpen(false);
    }
  };

  const getMenuItems = () => {
    // Check if we are in any production-related page
    const isProduction = ['production', 'prod-dashboard', 'prod-records', 'prod-stock', 'prod-sizes', 'prod-users', 'production-registry'].includes(currentPage || '');

    if (isProduction) {
      return [
        { id: 'prod-dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, group: 'Principal' },
        { id: 'prod-records', label: 'Registros', icon: <ClipboardList size={20} />, group: 'Produção' },
        { id: 'production', label: 'Novo Registro', icon: <PlusCircle size={20} />, group: 'Produção' },
        { id: 'prod-stock', label: 'Estoque', icon: <Package size={20} />, group: 'Gerenciamento' },
        { id: 'prod-sizes', label: 'Tamanhos', icon: <Box size={20} />, group: 'Gerenciamento' },
        { id: 'prod-users', label: 'Usuários', icon: <Users size={20} />, group: 'Configurações' },
      ];
    }

    return [
      { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, group: 'Principal' },
      { id: 'revisions', label: 'Nova Revisão', icon: <ClipboardCheck size={20} />, group: 'Operacional' },
      { id: 'history', label: 'Histórico', icon: <ClipboardList size={20} />, group: 'Operacional' },
      { id: 'reports', label: 'Relatórios', icon: <FileText size={20} />, group: 'Operacional' },
      { id: 'registrations', label: 'Cadastros', icon: <Settings size={20} />, group: 'Configurações' },
      { id: 'users', label: 'Usuários', icon: <Users size={20} />, group: 'Configurações' },
    ];
  };

  const menuItems = getMenuItems();
  // No desktop recolhido o menu vira trilho de icones; no celular ele some.
  const emTrilho = !isMobile && !isSidebarOpen;

  return (
    <div className={`app-container ${!isSidebarOpen ? 'sidebar-closed' : ''} ${emTrilho ? 'sidebar-rail' : ''}`}>
      {isMobile && isSidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <img src={logoFull} alt="Kingraf Logo" className="sidebar-logo-img" />
            <div className="logo-subtitle">LEAN START</div>
          </div>
          <button
            className="mobile-close"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {['Principal', 'Produção', 'Gerenciamento', 'Configurações', 'Operacional', 'Qualidade', 'Gestão', 'Sistema'].map(group => {
            const groupParams = menuItems.filter(item => item.group === group);
            if (groupParams.length === 0) return null;

            return (
              <div key={group} className="nav-group">
                <h3 className="group-title">{group}</h3>
                {groupParams.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    title={item.label}
                    aria-label={item.label}
                    className={`nav-item ${currentPage === item.id ? 'active' : ''} animate-slide-in-right delay-${(idx + 1) * 100}`}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    <span className="nav-label">{item.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
          {onExit && (
            <div className="nav-group">
              <h3 className="group-title">Navegação</h3>
              <button
                className="nav-item exit-button animate-slide-in-right delay-500"
                onClick={onExit}
                title="Trocar Módulo"
                aria-label="Trocar Módulo"
              >
                <span className="nav-icon"><LogOut size={20} /></span>
                <span className="nav-label">Trocar Módulo</span>
              </button>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar" title={`${userName} - ${userRole}`}>
              <User size={20} />
            </div>
            <div className="user-details">
              <span className="user-name">{userName}</span>
              <span className="user-role">{userRole}</span>
            </div>
            <button className="logout-btn" onClick={onLogout} title="Sair da conta" aria-label="Sair da conta">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-header">
          <div className="header-left">
            <button
              className="toggle-sidebar"
              onClick={alternarSidebar}
              aria-label={isSidebarOpen ? 'Recolher menu' : 'Expandir menu'}
              aria-expanded={isSidebarOpen}
              title={isSidebarOpen ? 'Recolher menu' : 'Expandir menu'}
            >
              {isMobile
                ? <Menu size={24} />
                : (isSidebarOpen ? <PanelLeftClose size={24} /> : <PanelLeftOpen size={24} />)}
            </button>
            <h1 className="page-title">{menuItems.find(i => i.id === currentPage)?.label || 'Dashboard'}</h1>
          </div>
          <div className="header-right">
            <div className="status-indicator">
              <div className="status-dot"></div>
              <span>Sistema Online</span>
            </div>
            <div className="time-display">{currentTime}</div>
          </div>
        </header>

        <div className="content-inner">
          {children}
        </div>
      </main>
    </div>
  );
};


export default Layout;
