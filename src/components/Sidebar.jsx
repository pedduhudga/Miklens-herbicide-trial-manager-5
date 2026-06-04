import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, ScanQrCode, FlaskConical,
  ListChecks, FileBox, ShoppingBag, Sparkles, BarChartBig,
  MapPin, Search, Database, Settings, Users, LogOut, Calculator, Bell,
  TrendingDown, ShieldAlert, Flame
} from 'lucide-react';
import { useAppState } from '../hooks/useAppState.jsx';
import { useAuth } from '../hooks/useAuth.js';

export default function Sidebar({ isOpen, onClose }) {
  const { user, isAdmin, logout } = useAuth();
  const { state } = useAppState();
  const firebaseEnabled = !!state.settings?.firebaseEnabled;

  const navItems = [
    { to: "/", icon: <LayoutDashboard className="w-5 h-5" />, label: "Dashboard" },
    { to: "/projects", icon: <FolderKanban className="w-5 h-5" />, label: "Projects (RCBD)" },
    { to: "/scanner", icon: <ScanQrCode className="w-5 h-5" />, label: "Plot Scanner" },
    { to: "/formulations", icon: <FlaskConical className="w-5 h-5" />, label: "Formulations" },
    { to: "/trials", icon: <ListChecks className="w-5 h-5" />, label: "Trials" },
    { to: "/reports", icon: <FileBox className="w-5 h-5" />, label: "Reports & Cards" },
    { to: "/organisations", icon: <FolderKanban className="w-5 h-5" />, label: "Organisations" },
    { to: "/ingredients", icon: <ShoppingBag className="w-5 h-5" />, label: "Ingredient Costs" },
    { to: "/ai-assistant", icon: <Sparkles className="w-5 h-5" />, label: "AI Assistant" },
    { to: "/analytics", icon: <BarChartBig className="w-5 h-5" />, label: "Analytics" },
    { to: "/statistics", icon: <Calculator className="w-5 h-5" />, label: "Statistics" },
    { to: "/dose-response", icon: <TrendingDown className="w-5 h-5" />, label: "Dose-Response (ED50)" },
    { to: "/resistance", icon: <ShieldAlert className="w-5 h-5" />, label: "Resistance Tracker" },
    { to: "/alerts", icon: <Bell className="w-5 h-5" />, label: "Smart Alerts" },
    { to: "/map", icon: <MapPin className="w-5 h-5" />, label: "Field Map" },
    { to: "/search", icon: <Search className="w-5 h-5" />, label: "Smart Search" },
  ];

  const bottomItems = [
    { to: "/data", icon: <Database className="w-5 h-5" />, label: "Data Management" },
    { to: "/settings", icon: <Settings className="w-5 h-5" />, label: "Settings" },
  ];

  const sidebarClass = `sidebar bg-white/70 backdrop-blur-md w-64 flex-shrink-0 border-r border-white/40 shadow-[4px_0_24px_rgba(0,0,0,0.02)] flex flex-col fixed inset-y-0 left-0 z-30 md:relative md:translate-x-0 transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-20 md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={sidebarClass}>
        <div className="px-6 py-6 border-b border-white/50 flex justify-between items-center">
          <h2 className="font-bold text-xl text-emerald-800 flex items-center gap-2 tracking-tight">
            <FlaskConical className="text-emerald-600 h-6 w-6" />
            Trial Manager
          </h2>
        </div>

        <nav className="flex-grow overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => window.innerWidth < 768 && onClose()}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-emerald-100 text-emerald-800 shadow-sm'
                    : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:translate-x-1'
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}

          <div className="pt-4 mt-8 border-t border-slate-200/50">
            {bottomItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => window.innerWidth < 768 && onClose()}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-emerald-100 text-emerald-800 shadow-sm'
                      : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:translate-x-1'
                  }`
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}

            {isAdmin && (
              <div className="border-t border-slate-200/50 mt-4 pt-4 space-y-1">
                <NavLink
                  to="/users"
                  onClick={() => window.innerWidth < 768 && onClose()}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-emerald-100 text-emerald-800 shadow-sm'
                        : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:translate-x-1'
                    }`
                  }
                >
                  <Users className="w-5 h-5" />
                  <span>User Management</span>
                </NavLink>
                <NavLink
                  to="/migration"
                  onClick={() => window.innerWidth < 768 && onClose()}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-orange-100 text-orange-800 shadow-sm'
                        : 'text-slate-600 hover:bg-orange-50 hover:text-orange-700 hover:translate-x-1'
                    }`
                  }
                >
                  <Flame className="w-5 h-5" />
                  <span className="flex items-center gap-1.5">
                    Firebase Migration
                    {firebaseEnabled && <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-bold">ON</span>}
                  </span>
                </NavLink>
              </div>
            )}
          </div>
        </nav>

        {user && (
          <div className="mt-auto p-4 border-t border-slate-200/50 bg-white/50">
            <div className="flex items-center gap-3 mb-4 px-2">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold uppercase">
                {user.username?.[0] || 'U'}
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-bold text-slate-800 truncate">{user.username}</span>
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">{user.role}</span>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-600 hover:bg-red-50 transition-all duration-200 font-medium"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
