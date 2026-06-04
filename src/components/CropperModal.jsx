import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RotateCcw, RotateCw, X } from 'lucide-react';

export default function CropperModal({ isOpen, onClose, imageSrc, onCropComplete }) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [dragging, setDragging] = useState(null); // { type, startX, startY, origCrop }
  const [canvasSize, setCanvasSize] = useState({ w: 1, h: 1 });
  const [imageLoaded, setImageLoaded] = useState(false);

  const HANDLE = 10;

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.complete) return;
    const ctx = canvas.getContext('2d');
    const { w: cw, h: ch } = canvasSize;
    ctx.clearRect(0, 0, cw, ch);

    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate((rotation * Math.PI) / 180);

    const isRotated90 = (rotation % 180) !== 0;
    const drawWidth = isRotated90 ? img.naturalHeight : img.naturalWidth;
    const drawHeight = isRotated90 ? img.naturalWidth : img.naturalHeight;
    const scale = Math.min(cw / drawWidth, ch / drawHeight) * 0.98;

    ctx.drawImage(img, -img.naturalWidth * scale / 2, -img.naturalHeight * scale / 2, img.naturalWidth * scale, img.naturalHeight * scale);
    ctx.restore();

    const { x, y, w, h } = crop;
    if (w > 0 && h > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, cw, y);
      ctx.fillRect(0, y + h, cw, ch - y - h);
      ctx.fillRect(0, y, x, h);
      ctx.fillRect(x + w, y, cw - x - w, h);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      const thirds = [1/3, 2/3];
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      thirds.forEach(t => {
        ctx.beginPath(); ctx.moveTo(x + w * t, y); ctx.lineTo(x + w * t, y + h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + h * t); ctx.lineTo(x + w, y + h * t); ctx.stroke();
      });
      [[x, y], [x+w, y], [x, y+h], [x+w, y+h]].forEach(([hx, hy]) => {
        ctx.fillStyle = '#10b981';
        ctx.fillRect(hx - HANDLE/2, hy - HANDLE/2, HANDLE, HANDLE);
      });
    }
  }, [crop, rotation, canvasSize]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  useEffect(() => {
    if (!isOpen || !imageSrc) {
      setRotation(0);
      imgRef.current = null;
      setImageLoaded(false);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setImageLoaded(true);
    };
    img.src = imageSrc;
  }, [isOpen, imageSrc]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !imageLoaded) return;

    const isRotated90 = (rotation % 180) !== 0;
    const wVal = isRotated90 ? img.naturalHeight : img.naturalWidth;
    const hVal = isRotated90 ? img.naturalWidth : img.naturalHeight;

    const maxW = Math.min(window.innerWidth - 48, 760);
    const maxH = Math.min(window.innerHeight * 0.6, 520);
    const scale = Math.min(maxW / wVal, maxH / hVal);
    const w = Math.round(wVal * scale);
    const h = Math.round(hVal * scale);
    const margin = Math.round(Math.min(w, h) * 0.05);
    setCrop({ x: margin, y: margin, w: w - margin * 2, h: h - margin * 2 });
    setCanvasSize({ w, h });
  }, [rotation, imageLoaded]);

  useEffect(() => {
    if (canvasRef.current && imgRef.current) {
      drawCanvas();
    }
  }, [canvasSize]);

  const hitTest = (px, py) => {
    const { x, y, w, h } = crop;
    const corners = [
      { type: 'nw', cx: x, cy: y },
      { type: 'ne', cx: x + w, cy: y },
      { type: 'sw', cx: x, cy: y + h },
      { type: 'se', cx: x + w, cy: y + h },
    ];
    for (const c of corners) if (Math.abs(px - c.cx) <= HANDLE && Math.abs(py - c.cy) <= HANDLE) return c.type;
    if (px > x && px < x + w && py > y && py < y + h) return 'move';
    return null;
  };

  const pointerDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    const type = hitTest(px, py);
    if (type) setDragging({ type, startX: px, startY: py, origCrop: { ...crop } });
  };

  const pointerMove = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const px = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    const dx = px - dragging.startX, dy = py - dragging.startY;
    const { x, y, w, h } = dragging.origCrop;
    const { w: cw, h: ch } = canvasSize;
    const MIN = 20;
    if (dragging.type === 'move') {
      setCrop({ x: Math.max(0, Math.min(cw - w, x + dx)), y: Math.max(0, Math.min(ch - h, y + dy)), w, h });
    } else {
      let nx = x, ny = y, nw = w, nh = h;
      if (dragging.type.includes('e')) { nw = Math.max(MIN, w + dx); }
      if (dragging.type.includes('s')) { nh = Math.max(MIN, h + dy); }
      if (dragging.type.includes('w')) { nx = Math.min(x + w - MIN, x + dx); nw = Math.max(MIN, w - dx); }
      if (dragging.type.includes('n')) { ny = Math.min(y + h - MIN, y + dy); nh = Math.max(MIN, h - dy); }
      setCrop({ x: Math.max(0, nx), y: Math.max(0, ny), w: Math.min(cw - nx, nw), h: Math.min(ch - ny, nh) });
    }
  };

  const handleApplyCrop = () => {
    const img = imgRef.current;
    if (!img) return;

    // 1. Determine rotated dimensions
    const isRotated90 = (rotation % 180) !== 0;
    const rotatedW = isRotated90 ? img.naturalHeight : img.naturalWidth;
    const rotatedH = isRotated90 ? img.naturalWidth : img.naturalHeight;

    // 2. Create full-resolution rotated canvas
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = rotatedW;
    rotCanvas.height = rotatedH;
    const rotCtx = rotCanvas.getContext('2d');

    rotCtx.save();
    rotCtx.translate(rotatedW / 2, rotatedH / 2);
    rotCtx.rotate((rotation * Math.PI) / 180);
    rotCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    rotCtx.restore();

    // 3. Map crop coordinates to rotated canvas
    const { w: cw, h: ch } = canvasSize;
    const scale = Math.min(cw / rotatedW, ch / rotatedH) * 0.98;
    const imgDrawW = rotatedW * scale;
    const imgDrawH = rotatedH * scale;
    const imgOffX = (cw - imgDrawW) / 2;
    const imgOffY = (ch - imgDrawH) / 2;

    const { x, y, w, h } = crop;
    const srcX = (x - imgOffX) / scale;
    const srcY = (y - imgOffY) / scale;
    const srcW = w / scale;
    const srcH = h / scale;

    // 4. Crop the rotated canvas
    const out = document.createElement('canvas');
    out.width = Math.round(Math.max(1, srcW));
    out.height = Math.round(Math.max(1, srcH));
    const ctx = out.getContext('2d');
    ctx.drawImage(rotCanvas, srcX, srcY, srcW, srcH, 0, 0, out.width, out.height);

    onCropComplete(out.toDataURL('image/jpeg', 0.95));
  };

  const rotateCCW = () => setRotation(r => r - 90);
  const rotateCW = () => setRotation(r => r + 90);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-[10000] flex flex-col items-center justify-center p-3">
      <div className="bg-white rounded-2xl p-4 w-full max-w-3xl flex flex-col gap-3">
        <div className="flex justify-between items-center border-b pb-3">
          <h3 className="text-lg font-bold text-slate-800">Crop & Rotate</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex justify-center bg-slate-100 rounded-xl overflow-hidden">
          <canvas
            ref={canvasRef}
            width={canvasSize.w}
            height={canvasSize.h}
            style={{ cursor: 'crosshair', touchAction: 'none', maxWidth: '100%' }}
            onMouseDown={pointerDown}
            onMouseMove={pointerMove}
            onMouseUp={() => setDragging(null)}
            onMouseLeave={() => setDragging(null)}
            onTouchStart={pointerDown}
            onTouchMove={pointerMove}
            onTouchEnd={() => setDragging(null)}
          />
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex gap-2">
            <button onClick={rotateCCW} className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition" title="Rotate left">
              <RotateCcw className="w-5 h-5" />
            </button>
            <button onClick={rotateCW} className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition" title="Rotate right">
              <RotateCw className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <button onClick={onClose} className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition flex-1 sm:flex-none">
              Cancel
            </button>
            <button onClick={handleApplyCrop} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition flex-1 sm:flex-none">
              Apply Crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
