import React, { useState, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { startVoiceDictation } from '../utils/voiceUtils.js';

export default function VoiceInput({ value, onChange, placeholder, className, ...props }) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [recognition, setRecognition] = useState(null);

  useEffect(() => {
    return () => {
      if (recognition) recognition.stop();
    };
  }, [recognition]);

  const handleToggleListen = () => {
    if (isListening) {
      if (recognition) recognition.stop();
      setIsListening(false);
      return;
    }

    const currentBaseVal = value || '';

    const rec = startVoiceDictation(
      ({ finalTranscript, interimTranscript }) => {
        if (finalTranscript) {
          onChange(currentBaseVal + (currentBaseVal ? ' ' : '') + finalTranscript);
        }
        setInterimText(interimTranscript);
      },
      (err) => {
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: err, type: 'error' } }));
        setIsListening(false);
      },
      () => {
        setIsListening(false);
        setInterimText('');
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Dictation complete', type: 'success' } }));
      }
    );

    if (rec) {
      setRecognition(rec);
      setIsListening(true);
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Microphone active. Start speaking.', type: 'info' } }));
    }
  };

  const displayValue = isListening && interimText ? value + (value ? ' ' : '') + interimText : value;

  return (
    <div className="relative w-full">
      <textarea
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isListening ? "Listening... Speak now." : placeholder}
        className={\`\${className} \${isListening ? 'ring-4 ring-emerald-300 bg-emerald-50 border-emerald-400' : ''}\`}
        {...props}
      />
      <button
        type="button"
        onClick={handleToggleListen}
        className={\`absolute bottom-3 right-3 p-2 rounded-full transition-all shadow-sm \${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700'}\`}
        title="Voice Dictation"
      >
        {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </button>
    </div>
  );
}
