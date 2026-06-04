import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FlaskConical, ListChecks, PlusCircle, MoreHorizontal } from 'lucide-react';

export default function BottomNav({ onMoreClick }) {
  const navItems = [
    { to: "/", icon: <LayoutDashboard className="w-6 h-6" />, label: "Home" },
    { to: "/formulations", icon: <FlaskConical className="w-6 h-6" />, label: "Formulations" },
    { to: "/trials", icon: <ListChecks className="w-6 h-6" />, label: "Trials" },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(0,0,0,0.05)] pb-safe z-40">
      <div className="flex justify-around items-center h-16 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-16 h-full transition-colors ${
                isActive ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-800'
              }`
            }
          >
            {item.icon}
            <span className="text-[10px] font-semibold mt-1">{item.label}</span>
          </NavLink>
        ))}

        {/* Floating Action-like button for Scanning */}
        <NavLink
          to="/scanner"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center w-16 h-full transition-colors relative ${
              isActive ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-800'
            }`
          }
        >
          <div className="absolute -top-5 bg-emerald-500 text-white rounded-full p-3 shadow-lg border-4 border-slate-100">
            <PlusCircle className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-semibold mt-6">Scan</span>
        </NavLink>

        {/* More Menu Trigger */}
        <button
          onClick={onMoreClick}
          className="flex flex-col items-center justify-center w-16 h-full text-slate-500 hover:text-slate-800 transition-colors"
        >
          <MoreHorizontal className="w-6 h-6" />
          <span className="text-[10px] font-semibold mt-1">Menu</span>
        </button>
      </div>
    </div>
  );
}
