import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X } from 'lucide-react';

export default function QRScanner({ isOpen, onClose, onScan, continuous = false }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isContinuous, setIsContinuous] = useState(continuous);
  const requestRef = useRef();

  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      if (!isOpen || !videoRef.current) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', true);
          videoRef.current.play();
          requestRef.current = requestAnimationFrame(tick);
        }
      } catch (err) {
        console.error("Camera error:", err);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Camera access denied or unavailable', type: 'error' } }));
        onClose();
      }
    };

    const stopCamera = () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (stream) stream.getTracks().forEach(track => track.stop());
    };

    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return stopCamera;
  }, [isOpen, onClose]);

  const tick = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && code.data) {
        onScan(code.data);
        if (!isContinuous) {
          onClose();
          return;
        } else {
          setTimeout(() => { requestRef.current = requestAnimationFrame(tick); }, 1500);
          return;
        }
      }
    }
    requestRef.current = requestAnimationFrame(tick);
  };

  if (!isOpen) return null;

  return (
    <div className="fullscreen-overlay fixed inset-0 bg-black z-[10000] flex flex-col justify-center items-center overflow-hidden">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-md z-[10002] text-white"
      >
        <X className="w-6 h-6" />
      </button>

      <video ref={videoRef} className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(88vw,460px)] h-[min(88vw,460px)] border-2 border-white/50 rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] z-[10001]">
        <div className="absolute top-[-2px] left-[-2px] w-[30px] h-[30px] border-t-4 border-l-4 border-emerald-500 rounded-tl-xl"></div>
        <div className="absolute top-[-2px] right-[-2px] w-[30px] h-[30px] border-t-4 border-r-4 border-emerald-500 rounded-tr-xl"></div>
        <div className="absolute bottom-[-2px] left-[-2px] w-[30px] h-[30px] border-b-4 border-l-4 border-emerald-500 rounded-bl-xl"></div>
        <div className="absolute bottom-[-2px] right-[-2px] w-[30px] h-[30px] border-b-4 border-r-4 border-emerald-500 rounded-br-xl"></div>
        <div className="absolute top-0 left-0 w-full h-[4px] bg-gradient-to-b from-transparent to-emerald-500 shadow-[0_0_15px_#10b981] animate-[scanLoop_2.5s_ease-in-out_infinite] rounded-sm"></div>
      </div>

      <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center gap-4 px-6 z-[10001]">
        <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-full text-sm border border-white/20 text-white">
          Align QR code within the frame
        </div>
        <label className="flex items-center gap-2 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full text-sm border border-white/20 cursor-pointer text-white">
          <input
            type="checkbox"
            checked={isContinuous}
            onChange={(e) => setIsContinuous(e.target.checked)}
            className="h-4 w-4 text-emerald-500 rounded border-white/30 bg-transparent"
          />
          Continuous Scan Mode
        </label>
      </div>
    </div>
  );
}
