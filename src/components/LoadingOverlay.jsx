import React, { useEffect, useState } from 'react';

export default function LoadingOverlay() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handleLoading = (e) => {
      setShow(e.detail.show);
    };

    window.addEventListener('app:loading', handleLoading);
    return () => window.removeEventListener('app:loading', handleLoading);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-white/75 flex items-center justify-center z-[9999]">
      <div className="spinner"></div>
    </div>
  );
}
