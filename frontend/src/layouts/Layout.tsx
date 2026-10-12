import { NavLink, Outlet } from 'react-router-dom';
import './Layout.css';

const navItems = [
  { path: '/', label: 'Мой питомец' },
  { path: '/care-inbox', label: 'Задачи по уходу' },
  { path: '/care-journey', label: 'Путь ухода' },
  { path: '/pet-memory', label: 'Воспоминания' },
  { path: '/medical-records', label: 'Медицинские записи' },
];

export function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <NavLink to="/" className="sidebar-logo" aria-label="Pawchito — на главную">
          <img className="logo-image" src="/images/paw-logo.svg" alt="Логотип Pawchito" />
          <span className="logo-text">Pawchito</span>
        </NavLink>

        <nav className="sidebar-nav" aria-label="Разделы сайта">
          {navItems.map(({ path, label }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <footer className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar" aria-hidden="true">ЗТ</div>
            <div className="user-details">
              <span className="user-name">Заня Та</span>
              <span className="user-role">Хозяйка питомца</span>
            </div>
          </div>
        </footer>
      </aside>

      {/* Только боковое меню общее. Карточка собаки, приветствие и заметки — лишь на главной. */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
