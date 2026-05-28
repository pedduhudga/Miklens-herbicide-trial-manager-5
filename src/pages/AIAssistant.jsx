import React, { useState, useRef, useEffect } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import { Sparkles, SendHorizontal, Trash2, Copy, Check, Paperclip, X, Mic, MicOff, Image } from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';

const SUGGESTED_PROMPTS = [
  'Which formulation has the highest average efficacy across all trials?',
  'Summarize the most recent 5 trials and highlight any patterns.',
  'Which weed species appears most frequently across trials?',
  'Which trials have no observations recorded yet?',
  'Compare the efficacy of trials with Excellent vs Good result ratings.',
];

async function callGemini(prompt, getAppState) {
  const st = getAppState();
  const apiKeys = st?.settings?.apiKeys || [];
  const key = (apiKeys[st?.settings?.currentApiKeyIndex || 0])?.key
    || apiKeys[st?.settings?.currentApiKeyIndex || 0]
    || apiKeys[0]?.key || apiKeys[0];
  if (!key) throw new Error('No Gemini API key configured. Go to Settings → AI Keys to add one.');
  const model = st?.settings?.selectedModel || 'gemini-2.0-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI.';
}

export default function AIAssistant({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  const [attachedImage, setAttachedImage] = useState(null); // { base64, mimeType, name }
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  const history = state.aiChatHistory || [];

  // Robust chat history persistence
  useEffect(() => {
    try {
      if (history.length === 0) {
        const localHistory = localStorage.getItem('aiChatHistory');
        if (localHistory) {
          updateState({ aiChatHistory: JSON.parse(localHistory) });
        }
      } else {
        localStorage.setItem('aiChatHistory', JSON.stringify(history));
      }
    } catch(e) { }
  }, [history, updateState]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isLoading]);

  const handleAttachImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const [header, base64] = dataUrl.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
      setAttachedImage({ base64, mimeType, name: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { msg: 'Voice input not supported in this browser', type: 'error' } }));
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;
    const original = input;
    recognition.onresult = (ev) => {
      let interim = '', final = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) final += ev.results[i][0].transcript;
        else interim += ev.results[i][0].transcript;
      }
      setInput((original ? original + ' ' : '') + final + interim);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
  };

  const sendMessage = async (text) => {
    const userMsg = text.trim();
    if (!userMsg || isLoading) return;
    setInput('');
    const img = attachedImage;
    setAttachedImage(null);
    setIsLoading(true);

    const displayContent = img ? `📎 [Image: ${img.name}]\n${userMsg}` : userMsg;
    const newHistory = [...history, { role: 'user', content: displayContent }];
    updateState({ aiChatHistory: newHistory });

    try {
      const trials = state.trials || [];
      const trialsCtx = trials.slice(0, 20).map(t => {
        const eff = safeJsonParse(t.EfficacyDataJSON, []);
        const finalWce = eff.length > 0
          ? (eff[eff.length - 1].controlPct ?? eff[eff.length - 1].weedCover ?? null)
          : null;
        return {
          id: t.ID,
          formulation: t.FormulationName,
          dosage: t.Dosage,
          result: t.Result || 'Unrated',
          weeds: t.WeedSpecies,
          location: t.Location,
          date: t.Date,
          observations: eff.length,
          finalWce,
          status: (t.IsCompleted === true || t.IsCompleted === 'true') ? 'Finalized' : 'Active',
        };
      });

      const systemCtx = `You are an expert agricultural research assistant for a herbicide trial management system.
The user has ${trials.length} trial(s) on record. Here is a summary of up to 20 recent trials:
${JSON.stringify(trialsCtx, null, 2)}

Projects: ${(state.projects || []).map(p => p.Name).join(', ') || 'None'}
Formulations: ${(state.formulations || []).map(f => f.Name).join(', ') || 'None'}

You must optimize for fast answers and strictly incorporate product formulation rules. You must explicitly recognize input weed types and recommend the precise herbicide formula composition or calculate a modified composition optimization when tasked with developing a new version of the product. Answer the user's question clearly and concisely. Use bullet points where helpful. Reference specific trial data when relevant.`;

      const fullPrompt = `${systemCtx}\n\nUser: ${userMsg}`;
      let reply;
      if (img) {
        const st = getAppState();
        const apiKeys = st?.settings?.apiKeys || [];
        const key = (apiKeys[st?.settings?.currentApiKeyIndex || 0])?.key
          || apiKeys[st?.settings?.currentApiKeyIndex || 0]
          || apiKeys[0]?.key || apiKeys[0];
        if (!key) throw new Error('No Gemini API key configured.');
        const model = st?.settings?.selectedModel || 'gemini-2.0-flash';
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [
              { text: `${systemCtx}\n\nUser: ${userMsg}` },
              { inlineData: { mimeType: img.mimeType, data: img.base64 } }
            ] }] }) }
        );
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
        const data = await res.json();
        reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI.';
      } else {
        reply = await callGemini(fullPrompt, getAppState);
      }
      updateState({ aiChatHistory: [...newHistory, { role: 'assistant', content: reply }] });
    } catch (err) {
      updateState({ aiChatHistory: [...newHistory, { role: 'assistant', content: `⚠️ ${err.message}` }] });
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleSubmit = (e) => { e.preventDefault(); sendMessage(input); };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const handleClear = () => {
    if (window.confirm('Clear all chat history?')) updateState({ aiChatHistory: [] });
  };

  const modelName = state.settings?.selectedModel || 'gemini-2.0-flash';
  const hasKey = (state.settings?.apiKeys || []).length > 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="AI Assistant" onMenuClick={onMenuClick} />

      <div className="flex-1 flex flex-col min-h-0 md:p-4 md:max-w-5xl md:mx-auto w-full">
        <div className="flex-1 bg-white md:rounded-2xl md:shadow-sm md:border md:border-slate-200 flex flex-col min-h-0 overflow-hidden">

          {/* Header */}
          <div className="p-4 border-b bg-slate-50 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-800">Herbicide AI Agent</h3>
              <p className="text-xs text-slate-500 truncate">
                Model: <span className="font-medium text-indigo-600">{modelName}</span>
                {!hasKey && <span className="ml-2 text-red-500 font-semibold">⚠ No API key</span>}
              </p>
            </div>
            {history.length > 0 && (
              <button onClick={handleClear} title="Clear chat" className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 py-8">
                <Sparkles className="w-12 h-12 text-slate-200 mb-4" />
                <p className="font-semibold text-slate-500 text-center mb-6">Ask me anything about your trial data</p>
                <div className="w-full max-w-lg space-y-2">
                  {SUGGESTED_PROMPTS.map((p, i) => (
                    <button key={i} onClick={() => sendMessage(p)}
                      className="w-full text-left text-sm px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 transition text-slate-600 font-medium">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              history.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0 mr-2 mt-0.5">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                  )}
                  <div className={`relative max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'}`}>
                    <div className="text-sm whitespace-pre-wrap leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: msg.content
                        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em>$1</em>')
                        .replace(/\n/g, '<br/>') }} />
                    {msg.role === 'assistant' && (
                      <button onClick={() => handleCopy(msg.content, i)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-200 transition text-slate-400">
                        {copied === i ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start items-start gap-2">
                <div className="w-7 h-7 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t bg-white">
            {!hasKey && (
              <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg mb-2 border border-amber-100">
                No Gemini API key — go to Settings → AI Keys to add one.
              </p>
            )}
            {attachedImage && (
              <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg">
                <Image className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-xs text-blue-700 font-medium truncate flex-1">{attachedImage.name}</span>
                <button onClick={() => setAttachedImage(null)} className="text-blue-400 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <form className="flex gap-2" onSubmit={handleSubmit}>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAttachImage} />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                title="Attach image"
                className="p-3 rounded-xl text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition shrink-0">
                <Paperclip className="w-5 h-5" />
              </button>
              <button type="button" onClick={handleVoiceInput}
                title={isListening ? 'Stop listening' : 'Voice input'}
                className={`p-3 rounded-xl transition shrink-0 ${isListening ? 'text-red-500 bg-red-50 animate-pulse' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }}}
                placeholder="Ask about your trials, formulations, or weed data…"
                disabled={isLoading}
                className="flex-1 px-4 py-3 bg-slate-100 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition text-sm"
              />
              <button type="submit" disabled={!input.trim() || isLoading}
                className="btn-primary p-3 rounded-xl flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed">
                <SendHorizontal className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}