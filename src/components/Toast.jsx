import React, { useEffect, useState, useRef } from 'react';

const DURATIONS = { success: 4000, error: 5000, warning: 4500, info: 3500 };

export default function Toast() {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  useEffect(() => {
    const handleToast = (e) => {
      const id = ++counterRef.current;
      const type = e.detail.type || 'info';
      const duration = DURATIONS[type] || 3500;
      setToasts(prev => [...prev.slice(-3), { id, msg: e.detail.msg, type }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    };
    window.addEventListener('app:toast', handleToast);
    return () => window.removeEventListener('app:toast', handleToast);
  }, []);

  const bgColors = {
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    warning: 'bg-amber-500',
    info: 'bg-blue-500',
  };

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: '⏳',
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 items-center pointer-events-none" style={{minWidth: '280px', maxWidth: '90vw'}}>
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl text-white shadow-xl text-sm font-medium animate-fade-in ${bgColors[t.type] || bgColors.info}`}
          style={{width: '100%'}}
        >
          <span>{icons[t.type] || '💬'}</span>
          <span className="flex-1">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
