import React from 'react';
import { Menu } from 'lucide-react';
import SyncStatus from './SyncStatus.jsx';

export default function TopBar({ title, onMenuClick }) {
  return (
    <header className="bg-white/60 backdrop-blur-md border-b border-white/40 p-5 flex justify-between items-center flex-shrink-0 shadow-[0_4px_24px_rgba(0,0,0,0.02)] sticky top-0 z-20">
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 rounded-xl text-slate-600 hover:bg-white/80 transition-colors"
      >
        <Menu className="w-6 h-6" />
      </button>

      <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{title}</h1>

      <SyncStatus />
    </header>
  );
}
