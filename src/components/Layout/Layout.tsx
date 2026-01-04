import React, { useState } from 'react';
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
  FileText
} from 'lucide-react';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onExit?: () => void;
  onNavigate?: (pageId: string) => void;
  onLogout?: () => void;
}

import logoFull from '../../assets/logo/logo-full.png';

const Layout: React.FC<LayoutProps> = ({ children, currentPage, onExit, onNavigate, onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
    ];
  };

  const menuItems = getMenuItems();

  return (
    <div className={`app-container ${!isSidebarOpen ? 'sidebar-closed' : ''}`}>
      <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <img src={logoFull} alt="Kingraf Logo" className="sidebar-logo-img" />
            <div className="logo-subtitle">LEAN START</div>
          </div>
          <button className="mobile-close" onClick={() => setIsSidebarOpen(false)}>
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
                    onClick={() => onNavigate ? onNavigate(item.id) : null}
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
              <button className="nav-item exit-button animate-slide-in-right delay-500" onClick={onExit}>
                <span className="nav-icon"><LogOut size={20} /></span>
                <span className="nav-label">Trocar Módulo</span>
              </button>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              <User size={20} />
            </div>
            <div className="user-details">
              <span className="user-name">Daniel Oliveira</span>
              <span className="user-role">Supervisor de Produção</span>
            </div>
            <button className="logout-btn" onClick={onLogout} title="Sair da conta">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-header">
          <div className="header-left">
            <button className="toggle-sidebar" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              <Menu size={24} />
            </button>
            <h1 className="page-title">{menuItems.find(i => i.id === currentPage)?.label || 'Dashboard'}</h1>
          </div>
          <div className="header-right">
            <div className="status-indicator">
              <div className="status-dot"></div>
              <span>Sistema Online</span>
            </div>
            <div className="time-display">23:31:23</div>
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
