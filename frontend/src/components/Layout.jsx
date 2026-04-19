import React from 'react';
import { NavLink } from 'react-router-dom';

const Layout = ({ children, connected }) => {
  return (
    <div className="layout">
      <nav className="sidebar" id="main-navigation">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🥔</span>
            <div className="logo-text">
              <h1>PotatoGuard</h1>
              <span className="logo-subtitle">Spoilage Detection</span>
            </div>
          </div>
        </div>

        <div className="nav-links">
          <NavLink
            to="/"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            id="nav-dashboard"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/history"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            id="nav-history"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span>History</span>
          </NavLink>

          <NavLink
            to="/nodes"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            id="nav-nodes"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            <span>Nodes</span>
          </NavLink>
        </div>

        <div className="sidebar-footer">
          <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`} id="connection-status">
            <span className="status-dot"></span>
            <span>{connected ? 'Live Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </nav>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

export default Layout;
