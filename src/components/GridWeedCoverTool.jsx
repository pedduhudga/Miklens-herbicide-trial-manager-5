import React, { useEffect, useRef, useState } from 'react';

export default function GridWeedCoverTool({ imageUrl, initialSelected = [], initialGridSize = 10, onUpdate }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [gridSize, setGridSize] = useState(initialGridSize);
  const [selectedCells, setSelectedCells] = useState(new Set(initialSelected));
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawMode, setDrawMode] = useState(null); // 'select' or 'deselect'
  const imgObjectRef = useRef(null);

  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });

  // Load Image and initialize canvas
  useEffect(() => {
    if (!imageUrl || !canvasRef.current || !containerRef.current) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const container = containerRef.current;
      if (!container) return;

      const maxWidth = container.clientWidth || 300;
      const maxHeight = window.innerHeight * 0.5 || 400;

      let targetWidth = img.width;
      let targetHeight = img.height;

      if (targetWidth > maxWidth) {
        targetHeight = (targetHeight / targetWidth) * maxWidth;
        targetWidth = maxWidth;
      }
      if (targetHeight > maxHeight) {
        targetWidth = (targetWidth / targetHeight) * maxHeight;
        targetHeight = maxHeight;
      }

      setCanvasDimensions({ width: targetWidth, height: targetHeight });
      imgObjectRef.current = img;
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Draw loop
  useEffect(() => {
    if (!canvasRef.current || !imgObjectRef.current || canvasDimensions.width === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { width, height } = canvasDimensions;

    canvas.width = width;
    canvas.height = height;

    const cellWidth = width / gridSize;
    const cellHeight = height / gridSize;

    // Clear and draw image
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(imgObjectRef.current, 0, 0, width, height);

    // Draw Grid Lines
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= width; x += cellWidth) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += cellHeight) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();

    // Draw Selected Cells
    ctx.fillStyle = 'rgba(239, 68, 68, 0.4)'; // Red overlay for weeds
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.lineWidth = 2;

    selectedCells.forEach(cellIndex => {
      const col = cellIndex % gridSize;
      const row = Math.floor(cellIndex / gridSize);
      const x = col * cellWidth;
      const y = row * cellHeight;
      ctx.fillRect(x, y, cellWidth, cellHeight);
      ctx.strokeRect(x, y, cellWidth, cellHeight);
    });

  }, [canvasDimensions, gridSize, selectedCells]);

  // Report changes up
  useEffect(() => {
    const totalCells = gridSize * gridSize;
    const percentage = Math.round((selectedCells.size / totalCells) * 100);
    onUpdate({ cover: percentage, cells: Array.from(selectedCells), size: gridSize });
  }, [selectedCells, gridSize]); // eslint-disable-line

  // Interaction handlers
  const getCellIndexFromEvent = (e) => {
    if (!canvasRef.current || canvasDimensions.width === 0) return null;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const cellWidth = canvasDimensions.width / gridSize;
    const cellHeight = canvasDimensions.height / gridSize;

    const col = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);

    if (col >= 0 && col < gridSize && row >= 0 && row < gridSize) {
      return row * gridSize + col;
    }
    return null;
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    const cellIndex = getCellIndexFromEvent(e);
    if (cellIndex === null) return;

    setIsDrawing(true);
    const isCurrentlySelected = selectedCells.has(cellIndex);
    const newDrawMode = isCurrentlySelected ? 'deselect' : 'select';
    setDrawMode(newDrawMode);

    toggleCell(cellIndex, newDrawMode);
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    e.preventDefault();

    const cellIndex = getCellIndexFromEvent(e);
    if (cellIndex !== null) {
      toggleCell(cellIndex, drawMode);
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    setDrawMode(null);
  };

  const toggleCell = (index, mode) => {
    setSelectedCells(prev => {
      const newSet = new Set(prev);
      if (mode === 'select') {
        newSet.add(index);
      } else {
        newSet.delete(index);
      }
      return newSet;
    });
  };

  const autoFill = (percentage) => {
    const totalCells = gridSize * gridSize;
    const targetSelected = Math.floor((percentage / 100) * totalCells);
    const newSet = new Set();

    // Fill from bottom up, clustering slightly to simulate actual field growth
    let count = 0;
    while (count < targetSelected && count < totalCells) {
       // Highly simplistic cluster algorithm (prefer bottom half and middle)
       let row = Math.floor(Math.random() * (gridSize / 2)) + Math.floor(gridSize / 2);
       let col = Math.floor(Math.random() * gridSize);

       // Sometime pick anywhere to make it organic
       if (Math.random() > 0.7) {
         row = Math.floor(Math.random() * gridSize);
       }

       // Ensure bounded
       row = Math.min(Math.max(0, row), gridSize - 1);
       const idx = row * gridSize + col;

       if (!newSet.has(idx)) {
         newSet.add(idx);
         count++;
       }
    }
    setSelectedCells(newSet);
  };

  const handleGridSizeChange = (e) => {
    setGridSize(Number(e.target.value));
    setSelectedCells(new Set()); // Reset selections on size change to avoid bad mapping
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-slate-700">Grid Detail:</label>
          <select
            value={gridSize}
            onChange={handleGridSizeChange}
            className="px-3 py-1 border rounded-lg focus:ring-emerald-500 outline-none text-sm"
          >
            <option value="4">4x4 (Rough)</option>
            <option value="6">6x6</option>
            <option value="10">10x10 (Standard)</option>
            <option value="20">20x20 (Fine)</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelectedCells(new Set())}
            className="px-3 py-1 bg-red-50 text-red-600 rounded-lg text-sm font-bold hover:bg-red-100"
          >
            Clear Grid
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative w-full flex justify-center bg-black/5 rounded-xl overflow-hidden touch-none select-none cursor-crosshair"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          // Touch events as fallback if PointerEvents fail
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          onTouchCancel={handlePointerUp}
          className="shadow-md rounded block max-w-full"
        />
      </div>

      <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 flex justify-between items-center">
        <div>
           <span className="text-sm font-semibold text-emerald-800 block">Calculated Coverage</span>
           <span className="text-xs text-emerald-600">{selectedCells.size} of {gridSize * gridSize} cells</span>
        </div>
        <span className="font-bold text-emerald-700 text-2xl">
          {Math.round((selectedCells.size / (gridSize * gridSize)) * 100)}%
        </span>
      </div>

      {/* Expose autoFill method via a ref if needed by parent, but for now we provide a direct prop trigger or button */}
      {/* If parent provides a suggested percentage, we could show an autofill button here */}
    </div>
  );
}
