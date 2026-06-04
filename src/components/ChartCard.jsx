import React, { useEffect, useRef, memo } from 'react';
import Chart from 'chart.js/auto';

function ChartCard({ id, title, description, config, height = "300px" }) {
  const chartRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !config) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    try {
      chartRef.current = new Chart(canvasRef.current, config);
    } catch (e) {
      console.error(`Failed to create chart ${id}:`, e);
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [config, id]);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-5 dashboard-card">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
          {description && <p className="text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      <div style={{ height, position: 'relative', width: '100%' }}>
        <canvas id={id} ref={canvasRef}></canvas>
      </div>
    </div>
  );
}

// Custom comparison to handle config object deeply
function areEqual(prevProps, nextProps) {
  return prevProps.id === nextProps.id &&
         prevProps.title === nextProps.title &&
         prevProps.description === nextProps.description &&
         prevProps.height === nextProps.height &&
         JSON.stringify(prevProps.config) === JSON.stringify(nextProps.config);
}

export default memo(ChartCard, areEqual);
