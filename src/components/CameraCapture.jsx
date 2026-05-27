import React, { useEffect, useRef, useState } from 'react';
import { X, Zap } from 'lucide-react';

export default function CameraCapture({ isOpen = true, onClose, onCapture }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [flashSupported, setFlashSupported] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  useEffect(() => {
    let activeStream = null;

    const startCamera = async (constraints) => {
      try {
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = s;
        setStream(s);

        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.setAttribute('playsinline', true);
          await videoRef.current.play();
        }

        // Check for flash support
        const track = s.getVideoTracks()[0];
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        if (capabilities.torch) {
          setFlashSupported(true);
        }
      } catch (err) {
        console.warn("Camera attempt failed:", constraints, err);
        if (constraints.video.width) {
            await startCamera({ video: { facingMode: { ideal: 'environment' } } });
        } else if (constraints.video.facingMode) {
            await startCamera({ video: true });
        } else {
            window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Camera access denied or unavailable.', type: 'error' } }));
            onClose();
        }
      }
    };

    const constraints = {
      video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
      }
    };
    startCamera(constraints);

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => {
          try { track.applyConstraints({ advanced: [{ torch: false }] }); } catch(_) {}
          track.stop();
        });
      }
    };
  }, []);

  const toggleFlash = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track && track.applyConstraints) {
      try {
        const newFlashState = !flashOn;
        await track.applyConstraints({ advanced: [{ torch: newFlashState }] });
        setFlashOn(newFlashState);
      } catch (err) {
        console.warn('Flash toggle failed', err);
      }
    }
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Set canvas dimensions to match actual video feed
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // High quality JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    onCapture(dataUrl);
    onClose();
  };

  return (
    <div className="fullscreen-overlay fixed inset-0 bg-black z-[10000] flex flex-col justify-center items-center overflow-hidden">
      <div className="camera-shell relative w-[min(98vw,760px)] h-[92%] max-h-[960px] rounded-3xl overflow-hidden bg-[#020617] border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">

        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-md z-[10002] text-white hover:bg-black/70 transition"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="absolute inset-0 bg-black">
          <video ref={videoRef} className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />

          {/* Target Box Overlay */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(80vw,400px)] h-[min(80vw,400px)] border border-white/30 rounded-xl pointer-events-none flex items-center justify-center">
             <div className="w-4 h-4 border-t-2 border-l-2 border-emerald-500 absolute top-[-2px] left-[-2px]"></div>
             <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-500 absolute top-[-2px] right-[-2px]"></div>
             <div className="w-4 h-4 border-b-2 border-l-2 border-emerald-500 absolute bottom-[-2px] left-[-2px]"></div>
             <div className="w-4 h-4 border-b-2 border-r-2 border-emerald-500 absolute bottom-[-2px] right-[-2px]"></div>
             <div className="w-12 h-12 border border-white/20 rounded-full flex items-center justify-center">
                 <div className="w-1 h-1 bg-emerald-500 rounded-full"></div>
             </div>
          </div>

          <div className="absolute bottom-4 left-0 right-0 flex justify-around items-center px-4 z-[10001]">
            <div className="w-12 h-12">
               {flashSupported && (
                 <button
                    onClick={toggleFlash}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${flashOn ? 'bg-yellow-400 text-yellow-900' : 'bg-black/40 text-white backdrop-blur-md'}`}
                 >
                   <Zap className="w-6 h-6" />
                 </button>
               )}
            </div>

            <button
              onClick={handleCapture}
              className="w-[72px] h-[72px] rounded-full bg-white border-4 border-white/30 flex items-center justify-center active:scale-90 transition-transform shadow-xl"
            >
              <div className="w-[58px] h-[58px] rounded-full border-2 border-black"></div>
            </button>

            <div className="w-12 h-12"></div> {/* Spacer for flex balance */}
          </div>
        </div>
      </div>
    </div>
  );
}
