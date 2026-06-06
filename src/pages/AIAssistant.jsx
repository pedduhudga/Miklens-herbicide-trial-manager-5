import { useState, useRef, useEffect } from 'react';
import { useAppState } from '../hooks/useAppState.jsx';
import TopBar from '../components/TopBar.jsx';
import { Sparkles, SendHorizontal, Trash2, Copy, Check, Paperclip, X, Mic, MicOff, Image as ImageIcon, Search, PlusCircle, MessageSquare } from 'lucide-react';
import { safeJsonParse } from '../utils/helpers.js';
import { _callGeminiApiWithRetries, resetGeminiState } from '../services/ai.js';
import { getAiChatSessions, saveAiChatSession, deleteAiChatSession } from '../services/dataLayer.js';

const SUGGESTED_PROMPTS = [
  'Which formulation has the highest average efficacy across all trials?',
  'Summarize the most recent 5 trials and highlight any patterns.',
  'Which weed species appears most frequently across trials?',
  'Which trials have no observations recorded yet?',
  'Compare the efficacy of trials with Excellent vs Good result ratings.',
];

export default function AIAssistant({ onMenuClick }) {
  const { state, updateState, getAppState } = useAppState();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [attachedImage, setAttachedImage] = useState(null); // { base64, mimeType, name }
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  const sessions = state.aiChatSessions || [];
  const currentSessionId = state.currentAiChatSessionId;
  const currentSession = sessions.find(s => s.id === currentSessionId) || { id: null, messages: [] };
  const history = currentSession.messages;

  const filteredHistory = history.filter(msg => {
    if (!searchQuery.trim()) return true;
    return msg.content.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Migrate legacy chat history on mount
  useEffect(() => {
    if ((!state.aiChatSessions || state.aiChatSessions.length === 0) && state.aiChatHistory && state.aiChatHistory.length > 0) {
      const legacySession = {
        id: Date.now().toString(),
        title: 'Legacy Chat',
        messages: state.aiChatHistory,
        timestamp: Date.now()
      };
      updateState({ aiChatSessions: [legacySession], aiChatHistory: [] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear stale Gemini quota/block cache every time the AI assistant is opened
  useEffect(() => {
    resetGeminiState();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Force new chat on mount
  useEffect(() => {
    updateState({ currentAiChatSessionId: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Robust chat sessions persistence
  useEffect(() => {
    let mounted = true;
    const saveSessions = async () => {
      try {
        if (sessions && sessions.length > 0) {
           // Fallback save to local storage immediately
           localStorage.setItem('aiChatSessions', JSON.stringify(sessions));

           // Async save to firebase
           for (const session of sessions) {
               if (!mounted) break;
               await saveAiChatSession(session, getAppState);
           }
        }
      } catch (err) {
         console.warn('Background save to Firebase failed:', err);
      }
    };

    // Only save when the sessions array changes and we are fully loaded
    if (state.hasLoadedInitialData) {
        saveSessions();
    }

    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, state.hasLoadedInitialData]);



  // Load initial sessions
  useEffect(() => {
    let mounted = true;
    const fetchSessions = async () => {
      try {
         const remoteSessions = await getAiChatSessions({}, getAppState);
         if (mounted && remoteSessions && remoteSessions.length > 0) {
            updateState({ aiChatSessions: remoteSessions });
         } else if (mounted) {
            const localSessions = localStorage.getItem('aiChatSessions');
            if (localSessions) {
               const parsed = JSON.parse(localSessions);
               if (parsed.length > 0) {
                  updateState({ aiChatSessions: parsed });
               }
            }
         }
      } catch (err) {
         console.error('Failed to load chat sessions:', err);
      }
    };
    if (state.hasLoadedInitialData) {
       fetchSessions();
    }
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hasLoadedInitialData]);


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history.length, isLoading]);

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

    let activeSessionId = currentSessionId;
    let newSessions = [...sessions];

    if (!activeSessionId) {
      activeSessionId = Date.now().toString();
      const newSession = {
        id: activeSessionId,
        title: userMsg.substring(0, 30) + (userMsg.length > 30 ? '...' : ''),
        messages: newHistory,
        timestamp: Date.now()
      };
      newSessions = [newSession, ...newSessions];
    } else {
      const sessionIndex = newSessions.findIndex(s => s.id === activeSessionId);
      if (sessionIndex !== -1) {
        newSessions[sessionIndex] = {
          ...newSessions[sessionIndex],
          messages: newHistory
        };
      }
    }

    updateState({ aiChatSessions: newSessions, currentAiChatSessionId: activeSessionId });

    try {
      const trials = state.trials || [];
      const trialsCtx = trials.slice(0, 30).map(t => {
        const eff = safeJsonParse(t.EfficacyDataJSON, []);
        
        // Find baseline (DAA 0 or earliest DAA) weed cover to compute WCE
        const sortedEff = [...eff].sort((a, b) => {
          const daaA = a.daa ?? a.day ?? a.DAA ?? 0;
          const daaB = b.daa ?? b.day ?? b.DAA ?? 0;
          return daaA - daaB;
        });
        const baseline = sortedEff.find(obs => (obs.daa ?? obs.day ?? obs.DAA ?? 0) === 0) || sortedEff[0];
        const baselineCover = baseline ? (baseline.weedCover ?? baseline.cover ?? null) : null;

        const isCompleted = t.IsCompleted === true || t.IsCompleted === 'true';
        let calculatedControlDays = null;
        if (t.FinalControlDuration) {
          calculatedControlDays = parseInt(t.FinalControlDuration, 10);
        } else if (t.Date) {
          const start = new Date(t.Date);
          const end = isCompleted && t.FinalizationDate ? new Date(t.FinalizationDate) : new Date();
          calculatedControlDays = Math.max(0, Math.round((end - start) / 86400000));
        }

        // Detect if the trial has any actual post-treatment observations (DAA > 0)
        const postTreatmentObs = sortedEff.filter(obs => {
          const daa = obs.daa ?? obs.day ?? obs.DAA ?? 0;
          return daa > 0;
        });

        // Compute final efficacy value directly
        let calculatedFinalEfficacy = 0;
        if (postTreatmentObs.length > 0) {
          const latestObs = postTreatmentObs[postTreatmentObs.length - 1];
          const weedCover = latestObs.weedCover ?? latestObs.cover ?? null;
          let controlPct = latestObs.controlPct ?? latestObs.control ?? latestObs.efficacy ?? null;
          
          if (controlPct !== null) {
            calculatedFinalEfficacy = parseFloat(controlPct);
          } else if (baselineCover && weedCover !== null && baselineCover > 0) {
            const calculatedWce = ((baselineCover - weedCover) / baselineCover) * 100;
            calculatedFinalEfficacy = Math.max(-100, Math.min(100, Math.round(calculatedWce * 10) / 10));
          }
        }

        return {
          id: t.ID,
          formulation: t.FormulationName,
          dosage: t.Dosage,
          result: t.Result || 'Unrated',
          weeds: t.WeedSpecies,
          location: t.Location,
          date: t.Date,
          status: isCompleted ? 'Finalized' : 'Active',
          controlDays: calculatedControlDays,
          hasExplicitControlDays: !!t.FinalControlDuration,
          hasOnlyBaselineDaa0: postTreatmentObs.length === 0,
          finalEfficacyPct: postTreatmentObs.length === 0 ? 0 : calculatedFinalEfficacy,
          observations: eff.map(obs => {
            const daa = obs.daa ?? obs.day ?? obs.DAA ?? 0;
            const weedCover = obs.weedCover ?? obs.cover ?? null;
            let controlPct = obs.controlPct ?? obs.control ?? obs.efficacy ?? null;
            
            // Calculate WCE percentage based on weed cover reduction from baseline
            let wce = null;
            if (daa === 0) {
              wce = 0; // DAA 0 baseline always has 0% weed control efficacy
            } else if (baselineCover && weedCover !== null && baselineCover > 0) {
              wce = Math.round(((baselineCover - weedCover) / baselineCover) * 1000) / 10;
              wce = Math.max(-100, Math.min(100, wce));
            }

            // Fallback control percentage if null
            if (controlPct === null && wce !== null) {
              controlPct = wce;
            }

            return {
              daa,
              controlPct: controlPct,
              weedCover: weedCover,
              wcePct: wce,
              cropInjury: obs.cropInjury ?? obs.injury ?? obs.injuryPct ?? null,
              notes: obs.notes || ''
            };
          })
        };
      });

       const systemCtx = `You are a Senior Weed Scientist and expert agricultural research assistant specialized in analyzing herbicide efficacy trials. 
The user has ${trials.length} trial(s) on record. Here is a detailed summary of up to 30 recent trials, including all of their observation records:
${JSON.stringify(trialsCtx, null, 2)}

Projects: ${(state.projects || []).map(p => p.Name).join(', ') || 'None'}
Formulations: ${(state.formulations || []).map(f => f.Name).join(', ') || 'None'}

RIGOROUS SCIENTIFIC ANSWERING PROTOCOL:
- **Scientific Persona**: Adopt a highly professional, objective, and analytical tone. Speak with scientific authority, using terms like "herbicidal efficacy," "weed control efficiency (WCE)," "canopy suppression," "phytotoxicity/crop injury," and "sustained control timeline."
- **Data-Driven Analysis**: For every answer comparing formulations or highlighting results, first perform a systematic parameter-by-parameter evaluation. Do not jump to conclusions without discussing:
  1. The specific weed species targeted.
  2. The timeline of evaluations (DAA - Days After Application).
  3. The Weed Control Efficacy (WCE % / controlPct) values across specific DAA steps.
  4. The duration of control (controlDays), noting if the duration is finalized or merely ongoing elapsed time.
- **Anomalies and Data Auditing**: Explicitly identify and point out anomalies to the user like a meticulous researcher would. For instance:
  - Mention if a trial remains "Active" with a large elapsed time but has only a DAA 0 baseline observation (pointing out that it was never finalized or stopped, and mathematically has 0% control).
  - Distinguish between pre-treatment baseline levels (DAA 0) and mature evaluation intervals (7, 14, 21, 28 DAA).

CRITICAL ANSWERING GUIDELINES:
1. **Zero Efficacy for Baseline-Only Trials**: IMPORTANT: If a trial has 'hasOnlyBaselineDaa0: true' (or finalEfficacyPct is 0), its Weed Control Efficacy is strictly 0%. NEVER claim it has high efficacy or control, even if a user rating says "Excellent" or the weed cover is high. E.g., "Goweed Ultra Base" and "Goweed (Mik3) - 35ml FIELD" are baseline-only trials with 0% efficacy. DO NOT rank them or call them top performers. They have 0% control.
2. **Cross-Reference Control Days & Efficacy Data (The "Forgot to Stop" Check)**: Some trials have high \`controlDays\` (e.g. 40, 60, 90 days active) simply because they are ongoing and the user "forgot to stop" or finalize them. You must cross-reference \`controlDays\` with the actual observations. If a trial has a high number of active days but only a baseline DAA 0 observation (hasOnlyBaselineDaa0 is true), its actual efficacy is 0%. Only count control duration as genuine if it is supported by mature observations (DAA >= 7) showing sustained high controlPct (>= 80%).
3. **Sustained Control & High Efficacy**: To find the best formulation, look for trials that have BOTH:
   - High controlDays or mature DAA observations (e.g. 7 to 28 days).
   - High controlPct / wcePct (e.g. 80% to 100%) at those mature days.
   Prioritize finalized legacy trials that have consistent multiple observations and high mature control over ongoing active trials that lack observations.
4. **Calculation of Average Efficacy**: To compute average efficacy, average the *final/latest* control percentage (controlPct / wcePct) of mature observations (DAA > 0). Exclude trials with only DAA 0 observations (hasOnlyBaselineDaa0: true).
5. **Human-Readable Trial Names & Clickable Hyperlinks**: NEVER display raw, unreadable Trial IDs (like "1780124537550"). Instead, always represent every trial using its Formulation name and Dosage (e.g. "Goweed (Mik3) - 2.5 L/ha"). Wrap every trial name reference in a clickable Markdown hyperlink pointing exactly to its details hash route format: \`[Formulation - Dosage](#/trials?focus=TRIAL_ID)\`.`;

      const fullPrompt = `${systemCtx}\n\nUser: ${userMsg}`;
      let reply;

      const geminiCall = async (genAI) => {
        const modelName = (typeof window !== 'undefined' && window._activeApiModelOverride)
          || getAppState()?.settings?.apiModel
          || getAppState()?.settings?.selectedModel
          || 'gemini-3.1-flash-lite';
          
        if (img) {
          const response = await genAI.models.generateContent({
            model: modelName,
            contents: [
              {
                parts: [
                  { text: `${systemCtx}\n\nUser: ${userMsg}` },
                  { inlineData: { data: img.base64, mimeType: img.mimeType } }
                ]
              }
            ]
          });
          const text = response?.candidates?.[0]?.content?.parts?.[0]?.text
            || (typeof response?.text === 'function' ? response.text() : response?.text)
            || '';
          return text;
        } else {
          const response = await genAI.models.generateContent({
            model: modelName,
            contents: [{ parts: [{ text: fullPrompt }] }]
          });
          const text = response?.candidates?.[0]?.content?.parts?.[0]?.text
            || (typeof response?.text === 'function' ? response.text() : response?.text)
            || '';
          return text;
        }
      };

      reply = await _callGeminiApiWithRetries(geminiCall, getAppState);

      const sessionIndex = newSessions.findIndex(s => s.id === activeSessionId);
      if (sessionIndex !== -1) {
        newSessions[sessionIndex] = {
          ...newSessions[sessionIndex],
          messages: [...newHistory, { role: 'assistant', content: reply }]
        };
        updateState({ aiChatSessions: newSessions });
      }
    } catch (err) {
      const sessionIndex = newSessions.findIndex(s => s.id === activeSessionId);
      if (sessionIndex !== -1) {
        newSessions[sessionIndex] = {
          ...newSessions[sessionIndex],
          messages: [...newHistory, { role: 'assistant', content: `⚠️ ${err.message}` }]
        };
        updateState({ aiChatSessions: newSessions });
      }
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


  const handleClear = async () => {
    if (window.confirm('Clear all chat sessions?')) {
      const sessionsToDelete = [...sessions];
      updateState({ aiChatSessions: [], currentAiChatSessionId: null });
      localStorage.removeItem('aiChatSessions');

      try {
          for (const session of sessionsToDelete) {
             await deleteAiChatSession({ id: session.id }, getAppState);
          }
      } catch (e) {
          console.warn('Failed to delete sessions from Firebase', e);
      }
    }
  };


  const handleDeleteMessage = (idx) => {
    if (window.confirm('Delete this message?')) {
      const newHistory = [...history];
      newHistory.splice(idx, 1);

      const newSessions = [...sessions];
      const sessionIndex = newSessions.findIndex(s => s.id === currentSessionId);
      if (sessionIndex !== -1) {
        newSessions[sessionIndex] = { ...newSessions[sessionIndex], messages: newHistory };
        updateState({ aiChatSessions: newSessions });
      }
    }
  };

  const handleNewChat = () => {
    updateState({ currentAiChatSessionId: null });
  };

  const modelName = state.settings?.selectedModel || 'gemini-3.1-flash-lite';
  const hasKey = (state.settings?.apiKeys || []).length > 0;

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
      <TopBar title="AI Assistant" onMenuClick={onMenuClick} />

      <div className="flex-1 flex min-h-0 w-full overflow-hidden">

        {/* Sidebar (Desktop always visible, Mobile togglable) */}
        <div className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 absolute md:relative z-20 w-64 h-full bg-slate-900 text-slate-300 flex flex-col transition-transform duration-300 ease-in-out`}>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <button onClick={() => { handleNewChat(); setIsSidebarOpen(false); }} className="w-full flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg transition-colors font-medium text-sm">
              <PlusCircle className="w-4 h-4" />
              New Chat
            </button>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden ml-2 p-1 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {sessions.map(session => (
              <button
                key={session.id}
                onClick={() => { updateState({ currentAiChatSessionId: session.id }); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-2 text-left px-3 py-2.5 rounded-lg transition-colors text-sm ${currentSessionId === session.id ? 'bg-slate-800 text-white font-medium' : 'hover:bg-slate-800/50'}`}
              >
                <MessageSquare className="w-4 h-4 shrink-0 opacity-70" />
                <span className="truncate flex-1">{session.title}</span>
              </button>
            ))}
            {sessions.length === 0 && (
              <div className="text-center p-4 text-xs text-slate-500">
                No previous chats.
              </div>
            )}
          </div>

          {sessions.length > 0 && (
            <div className="p-3 border-t border-slate-800">
              <button onClick={handleClear} className="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-red-400 transition-colors py-2 rounded hover:bg-slate-800/50">
                <Trash2 className="w-3.5 h-3.5" />
                Clear All Sessions
              </button>
            </div>
          )}
        </div>

        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-10 md:hidden" onClick={() => setIsSidebarOpen(false)} />
        )}

        <div className="flex-1 flex flex-col min-h-0 md:p-4 max-w-5xl mx-auto w-full relative">
          <div className="flex-1 bg-white md:rounded-2xl md:shadow-sm md:border md:border-slate-200 flex flex-col min-h-0 overflow-hidden">

          {/* Header */}
          <div className="p-4 border-b bg-slate-50 flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-slate-500 hover:text-slate-800 rounded-lg">
              <MessageSquare className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div>
                <h3 className="font-bold text-slate-800">Herbicide AI Agent</h3>
                <p className="text-xs text-slate-500 truncate">
                  Model: <span className="font-medium text-indigo-600">{modelName}</span>
                  {!hasKey && <span className="ml-2 text-red-500 font-semibold">⚠ No API key</span>}
                </p>
              </div>
            </div>
            {history.length > 0 && (
              <div className="flex items-center gap-2">
                {isSearchOpen ? (
                  <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden h-8 px-2 transition-all shadow-inner">
                    <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search messages..."
                      className="text-xs outline-none bg-transparent w-32"
                      autoFocus
                    />
                    <button onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }} className="text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setIsSearchOpen(true)} title="Search chat" className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition">
                    <Search className="w-4 h-4" />
                  </button>
                )}
                <button onClick={handleClear} title="Clear all chat history" className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
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
            ) : filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 py-8">
                <Search className="w-10 h-10 text-slate-200 mb-3" />
                <p className="font-semibold text-slate-500 text-sm">No messages match your search.</p>
              </div>
            ) : (
              filteredHistory.map((msg) => {
                const originalIndex = history.indexOf(msg);
                return (
                  <div key={originalIndex} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group relative mb-8`}>
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0 mr-2 mt-0.5">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className={`relative max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm'}`}>
                      <div className="text-sm whitespace-pre-wrap leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: msg.content
                          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                          .replace(/\[(.*?)\]\((.*?)\)/g, `<a href="$2" class="${msg.role === 'user' ? 'text-emerald-200 hover:text-white' : 'text-emerald-600 hover:text-emerald-800'} font-semibold underline">$1</a>`)
                          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                          .replace(/\*(.*?)\*/g, '<em>$1</em>')
                          .replace(/\n/g, '<br/>') }} />
                    </div>

                    {/* Actions Menu (Copy/Delete) */}
                    <div className={`absolute -bottom-8 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 ${msg.role === 'user' ? 'right-0' : 'left-0 ml-10'}`}>
                      {msg.role === 'assistant' && (
                        <button onClick={() => handleCopy(msg.content, originalIndex)} title="Copy message"
                          className="p-1.5 rounded-lg bg-white shadow-sm border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-emerald-600 transition">
                          {copied === originalIndex ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button onClick={() => handleDeleteMessage(originalIndex)} title="Delete message"
                        className="p-1.5 rounded-lg bg-white shadow-sm border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-red-500 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
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
                <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
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
    </div>
  );
}
