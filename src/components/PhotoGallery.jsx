// src/components/PhotoGallery.jsx
import React, { useRef } from 'react';
import CameraCapture from './CameraCapture.jsx';
import { X, Image, RefreshCw } from 'lucide-react';

/**
 * PhotoGallery – a reusable component that lets the user capture multiple photos
 * via the device camera or upload from the file system, preview them as a grid,
 * and optionally trigger AI analysis for each image.
 *
 * Props:
 *   photos: Array of photo objects { id, base64, direction, aiResult? }
 *   setPhotos: setter function to update the photos array
 *   onCapture: function(base64) called when a new photo is captured (optional)
 *   maxPhotos: optional limit (default 10)
 *   enableAI: boolean – show a button to run AI on a photo
 */
export default function PhotoGallery({
  photos = [],
  setPhotos,
  onCapture,
  maxPhotos = 10,
  enableAI = true,
}) {
  const fileInputRef = useRef(null);

  const addPhoto = (base64, direction = 'Nadir') => {
    const newPhoto = {
      id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      base64,
      direction,
    };
    setPhotos(prev => [...prev, newPhoto]);
    if (onCapture) onCapture(base64);
  };

  const handleFileSelect = e => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        addPhoto(ev.target.result, 'Nadir');
      };
      reader.readAsDataURL(file);
    });
    e.target.value = null;
  };

  const removePhoto = id => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const triggerCamera = () => {
    setShowCamera(true);
  };

  const [showCamera, setShowCamera] = React.useState(false);

  const handleCapture = base64 => {
    addPhoto(base64);
    setShowCamera(false);
  };

  const runAI = async (photo) => {
    if (photo.aiResult) return;
    setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, loading: true } : p));
    try {
      const { identifyWeedFromPhoto } = await import('../services/multiProviderAI.js');
      const result = await identifyWeedFromPhoto(photo.base64);
      setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, aiResult: result, loading: false } : p));
    } catch (err) {
      console.warn('AI analysis failed', err);
      setPhotos(prev => prev.map(p => p.id === photo.id ? { ...p, loading: false } : p));
    }
  };

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-xl shadow-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-emerald-700">Field Photos</h3>
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-full bg-emerald-100 hover:bg-emerald-200 transition"
            title="Upload from Gallery"
          >
            <Image className="w-5 h-5 text-emerald-600" />
          </button>
          <button
            onClick={triggerCamera}
            className="p-2 rounded-full bg-emerald-100 hover:bg-emerald-200 transition"
            title="Capture with Camera"
          >
            <RefreshCw className="w-5 h-5 text-emerald-600" />
          </button>
        </div>
        <input
          type="file"
          multiple
          accept="image/*"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map(photo => (
          <div key={photo.id} className="relative group">
            <img src={photo.base64} alt="capture" className="w-full h-32 object-cover rounded-lg border border-emerald-200" />
            <button onClick={() => removePhoto(photo.id)} className="absolute top-1 right-1 p-1 bg-white/80 rounded-full opacity-0 group-hover:opacity-100 transition" title="Remove"><X className="w-4 h-4 text-emerald-600" /></button>
            {enableAI && (
              <div className="absolute inset-0 flex items-end justify-center p-2">
                {photo.loading ? (
                  <span className="bg-black/50 text-white text-xs px-2 py-1 rounded">Analyzing…</span>
                ) : photo.aiResult ? (
                  <span className="bg-black/50 text-white text-xs px-2 py-1 rounded">{photo.aiResult.length} weeds detected</span>
                ) : (
                  <button onClick={() => runAI(photo)} className="bg-emerald-600 text-white text-xs px-2 py-1 rounded opacity-80 hover:opacity-100 transition">Run AI</button>
                )}
              </div>
            )}
          </div>
        ))}
        {photos.length < maxPhotos && (
          <div onClick={triggerCamera} className="flex items-center justify-center border-2 border-dashed border-emerald-300 rounded-lg cursor-pointer hover:bg-emerald-50 transition">
            <span className="text-emerald-600 font-medium">Add Photo</span>
          </div>
        )}
      </div>
      {showCamera && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <CameraCapture isOpen={true} onClose={() => setShowCamera(false)} onCapture={handleCapture} initialAspectRatio="3:4" onAspectChange={() => {}} />
        </div>
      )}
    </div>
  );
}
