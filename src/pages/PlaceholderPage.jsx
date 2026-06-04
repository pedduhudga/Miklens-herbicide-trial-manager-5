import React from 'react';
import TopBar from '../components/TopBar.jsx';

export default function PlaceholderPage({ title, onMenuClick }) {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <TopBar title={title} onMenuClick={onMenuClick} />

      <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-10 text-center max-w-lg">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🚧</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">{title}</h2>
          <p className="text-slate-500">
            This module has been scaffolded and wired up into the React Router configuration.
            The legacy DOM logic and component state needs to be fully transcribed into React primitives.
          </p>
        </div>
      </div>
    </div>
  );
}
