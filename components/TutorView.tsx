import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, MicOff, Headphones, Brain, CheckCircle, XCircle, ArrowRight, Plus, X, Volume2, Network, Image as ImageIcon, Link, BrainCircuit, Edit3, Save, Loader, MessageCircleQuestion, Square, RefreshCw, Wand2, Play, Trash2, Copy, Check, Maximize2, Minimize2 } from 'lucide-react';
import mermaid from 'mermaid';
import { generateTutorResponse, generateMindmapOnly, regenerateSVG, generateAnimatedSVG } from '../services/gemini';
import { speak, stopSpeaking } from '../services/speech';
import { resizeImage } from '../services/mediaUtils';
import { TutorResponse, ChatMessage } from '../types';
import { useQuiz } from '../hooks/useQuiz';
import { useLiveMode } from '../hooks/useLiveMode';

interface TutorViewProps {
  contextMemory: string;
  contextImage?: string | null;
  contextImageMime?: string | null;
  activeTutorMemory?: string | null;
}

const STORAGE_KEY_HISTORY = 'mindmeld_chat_history';
const STORAGE_KEY_VISUALS = 'mindmeld_visual_state_v3';
const STORAGE_KEY_MEMORY = 'mindmeld_tutor_memory';

type VisualTab = 'illustration' | 'map';

// --- Helper Components ---
const SimpleMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-bold text-blue-900">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
};

const TutorView: React.FC<TutorViewProps> = ({ contextMemory, contextImage, contextImageMime, activeTutorMemory }) => {
  // --- STATE ---
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_HISTORY);
    return saved ? JSON.parse(saved) : [];
  });
  
  const initialVisuals = (): any => {
    const savedVisuals = localStorage.getItem(STORAGE_KEY_VISUALS);
    if (savedVisuals) {
        try { return JSON.parse(savedVisuals); } catch(e) { return null; }
    }
    return null;
  };

  const [currentMindmap, setCurrentMindmap] = useState<string | null>(() => {
    const visuals = initialVisuals();
    return visuals?.mindmap || null;
  });
  
  const [svgHistory, setSvgHistory] = useState<{id: number, code: string}[]>(() => {
    const visuals = initialVisuals();
    if (visuals?.svgHistory) return visuals.svgHistory;
    if (visuals?.svg) return [{ id: 1, code: visuals.svg }];
    return [];
  });
  
  const [viewingSvgId, setViewingSvgId] = useState<number | null>(() => {
    const visuals = initialVisuals();
    if (visuals?.svgHistory && visuals.svgHistory.length > 0) {
        return visuals.svgHistory[visuals.svgHistory.length - 1].id;
    }
    if (visuals?.svg) return 1;
    return null;
  });
  
  const defaultSvg = `<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="800" height="600" fill="#fcfcfc"/><text x="400" y="300" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="20" fill="#0369a1">Start Learning</text></svg>`;

  const currentSvg = viewingSvgId !== null 
      ? svgHistory.find(s => s.id === viewingSvgId)?.code || defaultSvg
      : svgHistory.length > 0 ? svgHistory[svgHistory.length - 1].code : defaultSvg;

  const [turnCounter, setTurnCounter] = useState<number>(() => {
     if (messages.length > 0) {
         const lastMsg = messages[messages.length - 1];
         return lastMsg.id ? lastMsg.id + 1 : messages.length + 1;
     }
     return 1;
  });
  const [activeTab, setActiveTab] = useState<VisualTab>('illustration');
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [isRegeneratingVisual, setIsRegeneratingVisual] = useState(false);
  const [isAnimatingVisual, setIsAnimatingVisual] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [splitPercentage, setSplitPercentage] = useState(60);
  const [isDragging, setIsDragging] = useState(false);
  const [isRopeVisible, setIsRopeVisible] = useState(false);
  const ropeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isReloadModalOpen, setIsReloadModalOpen] = useState(false);
  const [reloadStep, setReloadStep] = useState<'ask' | 'input'>('ask');
  const [reloadSuggestion, setReloadSuggestion] = useState('');
  const [mindmapSvg, setMindmapSvg] = useState<string>('');
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTools, setShowTools] = useState(false);
  
  const [localImage, setLocalImage] = useState<string | null>(null);
  const [localImageMime, setLocalImageMime] = useState<string | null>(null);
  
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);

  const handleDiagramClick = (id: number) => {
      if (viewingSvgId === id) {
          const element = document.getElementById(`message-${id}`);
          if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setHighlightedMessageId(id);
              setTimeout(() => setHighlightedMessageId(null), 1000);
          }
      } else {
          setViewingSvgId(id);
      }
  };

  const [localMemory, setLocalMemory] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_MEMORY) || '';
  });
  const [isMemoryEditorOpen, setIsMemoryEditorOpen] = useState(false);
  const [memoryEditText, setMemoryEditText] = useState('');
  
  // NEW: Quick Mode state
  const [isQuickMode, setIsQuickMode] = useState(false);
  // NEW: Web Search Mode state
  const [isWebSearchMode, setIsWebSearchMode] = useState(false);

  // --- REFS ---
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- HOOKS ---
  // To avoid circular dependency during render, we use a ref for the message handler that the hooks can call
  const sendMessageRef = useRef<(text: string) => void>(() => {});

  const {
    liveMode,
    isListening, // Manual mic
    toggleLiveMode,
    toggleManualMic,
    setLiveMode,
    restartLiveListeningIfActive,
    recognitionRef // needed to abort during send
  } = useLiveMode({
    onUserInput: (text) => sendMessageRef.current(text),
    isLoading
  });

  const {
    quizData,
    isQuizActive,
    currentQuestionIndex,
    selectedOption,
    isAnswerRevealed,
    score,
    startQuiz,
    handleOptionSelect,
    handleNextQuestion
  } = useQuiz({
    setMessages,
    contextMemory,
    activeTutorMemory: localMemory, // Use the local override if present
    setIsLoading,
    setLiveMode,
    handleSendMessage: (text) => sendMessageRef.current(text)
  });

  // --- EFFECTS ---

  useEffect(() => {
    if (activeTutorMemory) {
        setLocalMemory(activeTutorMemory);
        setMemoryEditText(activeTutorMemory); // Sync Active Tutor Memory to Editor so it appears in modal
    }
  }, [activeTutorMemory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MEMORY, localMemory);
  }, [localMemory]);

  useEffect(() => {
    mermaid.initialize({ 
        startOnLoad: false, 
        theme: 'neutral',
        fontFamily: 'Inter, sans-serif',
        securityLevel: 'loose',
        mindmap: { padding: 50, useMaxWidth: false }
    });
  }, []);

  useEffect(() => {
    const renderMindmap = async () => {
        if (currentMindmap) {
            const id = `mindmap-${Date.now()}`;
            try {
                const { svg } = await mermaid.render(id, currentMindmap);
                setMindmapSvg(svg);
            } catch (error) { setMindmapSvg('<div class="text-xs text-red-300">Map failed</div>'); }
        } else { setMindmapSvg(''); }
    };
    renderMindmap();
    
    // Auto-save history
    localStorage.setItem(STORAGE_KEY_VISUALS, JSON.stringify({ 
        mindmap: currentMindmap, 
        svgHistory: svgHistory 
    }));
  }, [currentMindmap, svgHistory]);

  useEffect(() => {
      if (activeTab === 'map' && !currentMindmap && !isMapLoading && messages.length > 0) {
          fetchMissingMindmap();
      }
  }, [activeTab]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
  }, []);

  // --- DRAG TO RESIZE LOGIC ---
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
      setIsDragging(true);
      document.body.style.userSelect = 'none'; // Prevent text selection
  };

  useEffect(() => {
      const handleDrag = (e: MouseEvent | TouchEvent) => {
          if (!isDragging || !containerRef.current) return;
          
          let clientY = 0;
          if (e instanceof MouseEvent) {
              clientY = e.clientY;
          } else if (e instanceof TouchEvent) {
              clientY = e.touches[0].clientY;
          }

          const containerRect = containerRef.current.getBoundingClientRect();
          const topOffset = 80; 
          const availableHeight = containerRect.height - topOffset;
          
          let newPercentage = ((clientY - containerRect.top - topOffset) / availableHeight) * 100;

          if (newPercentage <= 10) {
             newPercentage = 0;
             setIsRopeVisible(true);
          } else if (newPercentage >= 90) {
             newPercentage = 100;
             setIsRopeVisible(true);
          } else {
             newPercentage = Math.max(0, Math.min(100, newPercentage));
             setIsRopeVisible(false);
          }

          setSplitPercentage(newPercentage);
      };

      const handleDragEnd = () => {
          if (isDragging) {
              setIsDragging(false);
              document.body.style.userSelect = 'auto';
          }
      };

      if (isDragging) {
          window.addEventListener('mousemove', handleDrag);
          window.addEventListener('mouseup', handleDragEnd);
          window.addEventListener('touchmove', handleDrag, { passive: false });
          window.addEventListener('touchend', handleDragEnd);
      }

      return () => {
          window.removeEventListener('mousemove', handleDrag);
          window.removeEventListener('mouseup', handleDragEnd);
          window.removeEventListener('touchmove', handleDrag);
          window.removeEventListener('touchend', handleDragEnd);
      };
  }, [isDragging]);

  // --- AUTO-HIDE ROPE HOVER LOGIC ---
  useEffect(() => {
      const handleGlobalMouseMove = (e: MouseEvent) => {
          if (!containerRef.current || isExpanded || isDragging) return;
          
          if (splitPercentage !== 0 && splitPercentage !== 100) return;

          const containerRect = containerRef.current.getBoundingClientRect();
          const clientY = e.clientY;
          
          const relativeY = clientY - containerRect.top;
          const containerHeight = containerRect.height;
          
          let isInTriggerZone = false;
          if (splitPercentage === 0 && relativeY < containerHeight * 0.15) {
              isInTriggerZone = true;
          } else if (splitPercentage === 100 && relativeY > containerHeight * 0.85) {
              isInTriggerZone = true;
          }

          if (isInTriggerZone) {
              setIsRopeVisible(true);
              if (ropeTimeoutRef.current) clearTimeout(ropeTimeoutRef.current);
              
              ropeTimeoutRef.current = setTimeout(() => {
                  setIsRopeVisible(false);
              }, 2000);
          }
      };

      window.addEventListener('mousemove', handleGlobalMouseMove);
      return () => {
          window.removeEventListener('mousemove', handleGlobalMouseMove);
          if (ropeTimeoutRef.current) clearTimeout(ropeTimeoutRef.current);
      };
  }, [splitPercentage, isExpanded, isDragging]);

  // --- LOGIC ---

  const handleClearHistory = (e?: React.MouseEvent) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY_HISTORY);
    localStorage.removeItem(STORAGE_KEY_VISUALS);
    localStorage.removeItem(STORAGE_KEY_MEMORY);
    setLocalMemory('');
    
    // Reset visuals
    setCurrentMindmap(null);
    setSvgHistory([]);
    setViewingSvgId(null);
    setTurnCounter(1);
    
    setLocalImage(null);
    setLocalImageMime(null);
    setShowTools(false);
    
    speak("History cleared.");
  };

  const fetchMissingMindmap = async () => {
      setIsMapLoading(true);
      const lastModelMessage = [...messages].reverse().find(m => m.role === 'model');
      const contextToMap = activeTutorMemory || lastModelMessage?.text || contextMemory;
      const history = messages.map(m => ({ role: m.role, text: m.text }));

      if (contextToMap) {
          const code = await generateMindmapOnly(contextToMap, history);
          setCurrentMindmap(code);
      }
      setIsMapLoading(false);
  };

  const handleRegenerateVisual = async (customSuggestion?: string) => {
      const targetMessage = messages.find(m => m.id === viewingSvgId && m.role === 'model') 
        || [...messages].reverse().find(m => m.role === 'model');
      
      if (!targetMessage) return;
      
      setIsRegeneratingVisual(true);
      try {
          const newSvg = await regenerateSVG(targetMessage.text, customSuggestion);
          setSvgHistory(prev => {
             const existingId = viewingSvgId || targetMessage.id;
             if (prev.some(item => item.id === existingId)) {
                 return prev.map(item => item.id === existingId ? { ...item, code: newSvg } : item);
             } else {
                 const expanded = [...prev, { id: targetMessage.id || Date.now(), code: newSvg }];
                 return expanded.slice(-20);
             }
          });
      } catch (e) { console.error(e); } 
      finally { setIsRegeneratingVisual(false); }
  };

  const handleAnimateVisual = async () => {
      const targetMessage = messages.find(m => m.id === viewingSvgId && m.role === 'model') 
        || [...messages].reverse().find(m => m.role === 'model');
      
      if (!targetMessage) return;

      setIsAnimatingVisual(true);
      try {
          const animatedSvg = await generateAnimatedSVG(targetMessage.text);
          setSvgHistory(prev => {
             const existingId = viewingSvgId || targetMessage.id;
             if (prev.some(item => item.id === existingId)) {
                 return prev.map(item => item.id === existingId ? { ...item, code: animatedSvg } : item);
             } else {
                 const expanded = [...prev, { id: targetMessage.id || Date.now(), code: animatedSvg }];
                 return expanded.slice(-20);
             }
          });
      } catch (e) { console.error(e); } 
      finally { setIsAnimatingVisual(false); }
  };

  const openReloadModal = () => {
      setIsReloadModalOpen(true);
      setReloadStep('ask');
      setReloadSuggestion('');
  };

  const confirmReload = (shouldCustomize: boolean) => {
      if (shouldCustomize) {
          setReloadStep('input');
      } else {
          handleRegenerateVisual();
          setIsReloadModalOpen(false);
      }
  };

  const submitReloadWithSuggestion = () => {
      handleRegenerateVisual(reloadSuggestion);
      setIsReloadModalOpen(false);
  };

  const handleStopGeneration = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
      }
      setIsLoading(false);
      stopSpeaking();
  };

  const handleSendMessage = async (text: string, isInitial = false) => {
    if ((!text.trim() && !isInitial) || isLoading) return;

    handleStopGeneration();
    const ac = new AbortController();
    abortControllerRef.current = ac;

    let currentId = turnCounter;
    if (!isInitial) {
        setTurnCounter(c => c + 1);
    }
    const userMsg: ChatMessage = { role: 'user', text, id: currentId };
    if (!isInitial) setMessages(prev => [...prev, userMsg]);
    
    setInput('');
    const imageToSend = localImage;
    const mimeToSend = localImageMime;
    setLocalImage(null);
    setLocalImageMime(null);

    setIsLoading(true); 
    stopSpeaking(); 
    if (recognitionRef.current) recognitionRef.current.abort();
    setCurrentMindmap(null);

    try {
      const history = messages.map(m => ({ role: m.role, text: m.text }));
      // Pass isQuickMode and isWebSearchMode
      const response: TutorResponse = await generateTutorResponse(
          text, history, contextMemory, imageToSend, mimeToSend, localMemory || null, isQuickMode, isWebSearchMode
      );

      if (ac.signal.aborted) return;
      
      // If we got an SVG (Quick Mode = null), update it. If not, keep previous or ignore.
      if (response.svg_code) {
          setSvgHistory(prev => {
              const updated = [...prev, { id: currentId, code: response.svg_code as string }];
              return updated.slice(-20); // Keep max 20 diagrams
          });
          setViewingSvgId(currentId);
      }
      
      const speechText = response.speech_response + (response.question ? `\n\n${response.question}` : '');
      const modelMsg: ChatMessage = {
        role: 'model',
        text: speechText,
        mindmap: null, 
        svg: response.svg_code || undefined, // Maintain types
        id: currentId
      };

      setMessages(prev => [...prev, modelMsg]);
      speak(speechText, restartLiveListeningIfActive);

    } catch (err) {
      if (ac.signal.aborted) return;
      console.error(err);
      restartLiveListeningIfActive(); // Restart listening on error if active
    } finally {
      if (!ac.signal.aborted) setIsLoading(false);
    }
  };

  // Assign the ref so hooks can access it
  useEffect(() => {
    sendMessageRef.current = handleSendMessage;
  }, [handleSendMessage, isQuickMode, isWebSearchMode]); // Add isWebSearchMode dep

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setShowTools(false);
      try {
        const { base64, mime } = await resizeImage(e.target.files[0]);
        setLocalImage(base64);
        setLocalImageMime(mime);
        speak("Image attached. Ask a question about it.");
      } catch (err) { console.error(err); }
    }
  };

  // --- RENDER ---
  return (
    <div ref={containerRef} className="flex flex-col h-full w-full bg-stone-50 relative">
      <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />

      {/* TOP VISUAL STAGE */}
      <div 
        className={`w-full grid-pattern overflow-hidden relative transition-none flex flex-col ${isExpanded ? 'pt-16 px-6 pb-6 h-full' : 'pt-20 px-6 pb-6'}`}
        style={!isExpanded ? { height: `${splitPercentage}%`, display: splitPercentage === 0 ? 'none' : 'flex' } : {}}
      >
        {isQuizActive && quizData ? (
             <div className="w-full h-full flex items-center justify-center">
                 <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-stone-200 p-8 animate-fade-in flex flex-col z-10">
                     <div className="flex justify-between items-center mb-6">
                         <h2 className="text-2xl font-bold text-stone-800">Quiz: {quizData.topic}</h2>
                         <span className="text-stone-400 font-medium">Q{currentQuestionIndex + 1} of {quizData.questions.length}</span>
                     </div>
                     <p className="text-xl text-stone-700 mb-8 font-medium leading-relaxed">{quizData.questions[currentQuestionIndex].question}</p>
                     <div className="grid grid-cols-1 gap-3 mb-6">
                         {quizData.questions[currentQuestionIndex].options.map((opt, idx) => {
                             let btnClass = "p-4 text-left rounded-xl border-2 transition-all font-medium ";
                             if (isAnswerRevealed) {
                                 if (idx === quizData.questions[currentQuestionIndex].correctAnswerIndex) btnClass += "border-green-500 bg-green-50 text-green-800";
                                 else if (idx === selectedOption) btnClass += "border-red-500 bg-red-50 text-red-800";
                                 else btnClass += "border-stone-100 text-stone-400";
                             } else btnClass += "border-stone-100 hover:border-blue-500 hover:bg-blue-50 text-stone-600";
                             
                             return (
                                 <button key={idx} onClick={() => handleOptionSelect(idx)} disabled={isAnswerRevealed} className={btnClass}>
                                     <div className="flex items-center justify-between">
                                         <span>{opt}</span>
                                         {isAnswerRevealed && idx === quizData.questions[currentQuestionIndex].correctAnswerIndex && <CheckCircle className="text-green-500" size={20}/>}
                                         {isAnswerRevealed && idx === selectedOption && idx !== quizData.questions[currentQuestionIndex].correctAnswerIndex && <XCircle className="text-red-500" size={20}/>}
                                     </div>
                                 </button>
                             )
                         })}
                     </div>
                     {isAnswerRevealed && (
                         <div className="flex justify-between items-center mt-4">
                            <p className="text-stone-600 text-sm italic mr-4 flex-1">{quizData.questions[currentQuestionIndex].explanation}</p>
                             <div className="flex items-center gap-2 shrink-0">
                                 <button onClick={() => speak(quizData.questions[currentQuestionIndex].explanation)} className="p-2 rounded-full text-stone-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Volume2 size={20} /></button>
                                 <button onClick={handleNextQuestion} className="flex items-center gap-2 px-6 py-2 bg-stone-900 text-white rounded-full hover:bg-stone-700 transition-colors">
                                     {currentQuestionIndex < quizData.questions.length - 1 ? 'Next' : 'Finish'} <ArrowRight size={16} />
                                 </button>
                             </div>
                         </div>
                     )}
                 </div>
             </div>
        ) : (
            <div className="flex flex-col w-full h-full bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden relative">
                {/* Visual Tabs & Actions */}
                <div className="flex flex-wrap items-center gap-2 p-4 border-b border-stone-100 z-30 shrink-0 bg-white">
                    <div className="flex bg-stone-100/80 backdrop-blur-sm p-1 rounded-lg border border-stone-200/50">
                        <button onClick={() => setActiveTab('illustration')} className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-2 transition-all ${activeTab === 'illustration' ? 'bg-white text-stone-800 shadow-sm border border-stone-200/50' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-200/50'}`}><ImageIcon size={14} /> Illustration</button>
                        <button onClick={() => setActiveTab('map')} className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-2 transition-all ${activeTab === 'map' ? 'bg-white text-stone-800 shadow-sm border border-stone-200/50' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-200/50'}`}><Network size={14} /> Concept Map</button>
                    </div>
                    <button onClick={() => { setMemoryEditText(localMemory); setIsMemoryEditorOpen(true); }} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-sm transition-colors ${localMemory && localMemory.trim().length > 0 ? 'bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100' : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-50'}`}><BrainCircuit size={16} /><span className="text-xs font-bold uppercase tracking-wide">Memory</span></button>
                    <div className="relative">
                        <button onClick={openReloadModal} disabled={isRegeneratingVisual || isLoading || svgHistory.length === 0} className={`flex items-center justify-center w-8 h-8 rounded-lg border shadow-sm transition-colors ${isRegeneratingVisual ? 'bg-blue-50 border-blue-200 text-blue-500' : 'bg-white border-stone-200 text-stone-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50'}`}><RefreshCw size={14} className={isRegeneratingVisual ? "animate-spin" : ""} /></button>
                        {isReloadModalOpen && (
                            <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-stone-200 p-4 z-50 animate-fade-in origin-top-left">
                                {reloadStep === 'ask' ? (
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-start justify-between"><p className="text-sm font-semibold text-stone-800">Suggestion?</p><button onClick={() => setIsReloadModalOpen(false)}><X size={14} /></button></div>
                                        <div className="flex gap-2 mt-1"><button onClick={() => confirmReload(true)} className="flex-1 bg-blue-600 text-white text-xs py-2 rounded-lg">Yes</button><button onClick={() => confirmReload(false)} className="flex-1 bg-stone-100 text-stone-600 text-xs py-2 rounded-lg">No</button></div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                         <div className="flex items-center justify-between"><span className="text-xs font-bold text-stone-500 uppercase">Customize Visual</span><button onClick={() => setIsReloadModalOpen(false)}><X size={14} /></button></div>
                                        <textarea value={reloadSuggestion} onChange={(e) => setReloadSuggestion(e.target.value)} className="w-full h-20 p-2 text-sm border border-stone-200 rounded-lg bg-stone-50" placeholder="e.g. 'Make it simpler', 'Add arrows'" autoFocus />
                                        
                                        <div className="flex flex-wrap gap-2">
                                            {['Simplify', 'Add Labels', 'Step-by-Step', 'High Contrast'].map(tag => (
                                                <button key={tag} onClick={() => setReloadSuggestion(tag)} className="px-2 py-1 text-[10px] font-medium bg-stone-100 text-stone-500 rounded hover:bg-stone-200 border border-stone-200 transition-colors">
                                                    {tag}
                                                </button>
                                            ))}
                                        </div>
                                        
                                        <button onClick={submitReloadWithSuggestion} className="w-full bg-blue-600 text-white text-xs py-2 rounded-lg flex items-center justify-center gap-2 mt-1"><Wand2 size={12} /> Generate Custom</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <button onClick={handleAnimateVisual} disabled={isAnimatingVisual || isRegeneratingVisual || isLoading || svgHistory.length === 0} className={`flex items-center justify-center w-8 h-8 rounded-lg border shadow-sm transition-colors ${isAnimatingVisual ? 'bg-purple-50 border-purple-200 text-purple-500' : 'bg-white border-stone-200 text-stone-400 hover:text-purple-600 hover:border-purple-200 hover:bg-purple-50'}`}><Play size={14} className={isAnimatingVisual ? "animate-pulse" : ""} fill={isAnimatingVisual ? "currentColor" : "none"} /></button>
                    <div className="w-px h-6 bg-stone-200 ml-1"></div>
                    <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center justify-center w-8 h-8 rounded-lg border shadow-sm transition-colors bg-white border-stone-200 text-stone-500 hover:text-stone-800 hover:bg-stone-50">
                        {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 relative bg-white flex flex-col min-h-0"> 
                    {activeTab === 'illustration' && svgHistory.length > 0 && (
                        <div className="flex gap-2 px-6 py-2 border-b border-stone-100 bg-stone-50 overflow-x-auto shrink-0 shadow-sm z-10 w-full justify-start items-center">
                            <span className="text-xs font-bold text-stone-400 uppercase tracking-widest mr-2 shrink-0">History:</span>
                            {svgHistory.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => handleDiagramClick(item.id)}
                                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap border flex-shrink-0 ${viewingSvgId === item.id ? 'bg-purple-100 text-purple-700 border-purple-300 shadow-sm scale-105' : 'bg-white text-stone-500 hover:bg-stone-50 border-stone-200'}`}
                                >
                                    Diagram #{item.id}
                                </button>
                            ))}
                        </div>
                    )}
                    {activeTab === 'illustration' ? (
                         isRegeneratingVisual ? <div className="flex flex-col items-center justify-center h-full gap-3 text-stone-400"><Loader className="animate-spin text-blue-500" size={32} /><span className="text-sm font-medium">Re-drawing diagram...</span></div>
                         : isAnimatingVisual ? <div className="flex flex-col items-center justify-center h-full gap-3 text-stone-400"><Loader className="animate-spin text-purple-500" size={32} /><span className="text-sm font-medium">Animating...</span></div>
                         : currentSvg ? (
                             <div className="w-full h-full relative group">
                                <div className="absolute top-4 right-4 z-20">
                                   <button 
                                      onClick={() => {
                                          navigator.clipboard.writeText(currentSvg);
                                          setIsCopied(true);
                                          setTimeout(() => setIsCopied(false), 2000);
                                      }}
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-sm border border-stone-200 text-stone-600 rounded-lg shadow-sm hover:bg-white hover:text-stone-900 transition-colors opacity-0 group-hover:opacity-100"
                                   >
                                      {isCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                      <span className="text-xs font-semibold">{isCopied ? 'Copied HTML/SVG' : 'Copy SVG'}</span>
                                   </button>
                                </div>
                                <div key={currentSvg.length} className="w-full h-full flex items-center justify-center overflow-auto p-4 animate-fade-in svg-container [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto [&>svg]:overflow-hidden" dangerouslySetInnerHTML={{ __html: currentSvg }} />
                             </div>
                         )
                         : <div className="h-full text-stone-300 text-sm flex flex-col items-center justify-center gap-2"><ImageIcon size={32} /><span>No illustration available</span></div>
                    ) : (
                        isMapLoading ? <div className="flex flex-col items-center justify-center h-full gap-3 text-stone-400"><Loader className="animate-spin text-blue-500" size={32} /><span className="text-sm font-medium">Generating Concept Map...</span></div>
                        : currentMindmap ? <div className="mermaid w-full h-full flex items-start justify-center overflow-auto p-4 animate-fade-in [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto [&>svg]:overflow-hidden" dangerouslySetInnerHTML={{ __html: mindmapSvg }} />
                        : <div className="h-full text-stone-300 text-sm flex flex-col items-center justify-center gap-2"><Network size={32} /><span>No map data available</span>{messages.length > 0 && <button onClick={fetchMissingMindmap} className="mt-2 text-blue-500 hover:underline text-xs">Generate Map</button>}</div>
                    )}
                </div>
            </div>
        )}
      </div>

      {/* Memory Editor Modal */}
      {isMemoryEditorOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-6 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]">
                  <div className="p-4 border-b border-stone-100 flex justify-between items-center bg-stone-50"><div className="flex items-center gap-2 text-purple-700"><BrainCircuit size={20} /><h3 className="font-bold">Active Learning Memory</h3></div><button onClick={() => setIsMemoryEditorOpen(false)}><X size={20} /></button></div>
                  <div className="p-4 flex-1 overflow-hidden bg-white">
                      <textarea 
                          value={memoryEditText} 
                          onChange={(e) => setMemoryEditText(e.target.value)} 
                          className="w-full h-64 p-3 border border-stone-300 rounded-lg resize-none text-sm bg-stone-50 text-stone-800 placeholder-stone-400 font-mono focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400" 
                          placeholder="Enter concepts to focus on..." 
                      />
                  </div>
                  <div className="p-4 border-t border-stone-100 flex justify-end gap-2 bg-stone-50"><button onClick={() => setIsMemoryEditorOpen(false)} className="px-4 py-2 text-stone-500 hover:bg-stone-200 rounded-lg text-sm font-medium">Cancel</button><button onClick={() => { setLocalMemory(memoryEditText); setIsMemoryEditorOpen(false); speak("Memory updated."); }} className="px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 rounded-lg text-sm font-medium flex items-center gap-2"><Save size={16} /> Save Memory</button></div>
              </div>
          </div>
      )}


      {/* RESIZE DRAG HANDLE OR ROPE */}
      {!isExpanded && splitPercentage > 0 && splitPercentage < 100 && (
          <div 
              className="w-full h-3 bg-stone-200 hover:bg-blue-400 active:bg-blue-500 cursor-row-resize flex items-center justify-center transition-colors z-40 relative group shrink-0"
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
          >
              <div className="w-10 h-1 rounded-full bg-stone-400 opacity-50 group-hover:opacity-100 transition-opacity" />
          </div>
      )}

      {/* TOP ROPE (Hanging Down) */}
      {!isExpanded && splitPercentage === 0 && isRopeVisible && (
          <div 
              className="absolute top-0 left-1/2 -translate-x-1/2 z-50 cursor-row-resize pt-2 pb-6 px-4 animate-fade-in drop-shadow-md transition-opacity"
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
          >
              <svg width="24" height="60" viewBox="0 0 24 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 0C12 10 14 20 12 30C10 40 12 45 12 50" stroke="#a8a29e" strokeWidth="4" strokeLinecap="round" strokeDasharray="4 2" />
                  <circle cx="12" cy="52" r="6" fill="#78716c" />
                  <path d="M9 52L15 52M12 49L12 55" stroke="#fff" strokeWidth="1.5" />
              </svg>
          </div>
      )}

      {/* BOTTOM ROPE (Floating Up) */}
      {!isExpanded && splitPercentage === 100 && isRopeVisible && (
          <div 
              className="absolute bottom-0 left-1/2 -translate-x-1/2 z-50 cursor-row-resize pt-6 pb-2 px-4 animate-fade-in drop-shadow-md"
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
              style={{ animation: 'bob 2s ease-in-out infinite' }}
          >
              <style>{`@keyframes bob { 0%, 100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, -6px); } }`}</style>
              <svg width="24" height="60" viewBox="0 0 24 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="8" r="6" fill="#78716c" />
                  <path d="M9 8L15 8M12 5L12 11" stroke="#fff" strokeWidth="1.5" />
                  <path d="M12 14C12 25 10 35 12 45C14 55 12 60 12 60" stroke="#a8a29e" strokeWidth="4" strokeLinecap="round" strokeDasharray="4 2" />
              </svg>
          </div>
      )}

      {/* Bottom Chat Bar */}
      <div 
        className={`transition-none origin-bottom ${isExpanded ? 'hidden' : 'bg-white flex flex-col shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] relative z-30'}`}
        style={!isExpanded ? { height: `${100 - splitPercentage}%`, display: splitPercentage === 100 ? 'none' : 'flex' } : {}}
      >
         {localImage && <div className="px-6 pt-3 flex items-center gap-2 animate-fade-in shrink-0"><div className="relative group"><img src={`data:${localImageMime};base64,${localImage}`} alt="Upload" className="h-16 w-16 object-cover rounded-lg border border-stone-200 shadow-sm" /><button onClick={() => { setLocalImage(null); setLocalImageMime(null); }} className="absolute -top-2 -right-2 bg-stone-800 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100"><X size={12} /></button></div><span className="text-xs text-blue-500 font-medium">Image attached</span></div>}
         <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0 scroll-smooth">
            {messages.map((msg, idx) => (
                <div 
                    key={idx} 
                    id={msg.id && msg.role === 'model' ? `message-${msg.id}` : `message-idx-${idx}`}
                    className={`flex flex-col gap-1 p-2 -mx-2 rounded-xl transition-all duration-1000 ${msg.id && highlightedMessageId === msg.id && msg.role === 'model' ? 'bg-emerald-50 ring-2 ring-emerald-300 scale-[1.01] shadow-sm' : ''} ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                    <span className="text-[10px] font-bold text-stone-400 uppercase px-1">
                        {msg.role === 'model' ? 'Tutor' : 'You'} {msg.id ? `#${msg.id}` : ''}
                    </span>
                    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}>
                        {msg.role === 'model' ? (
                            <div className="flex items-start gap-2 max-w-[85%]"><div className="p-4 rounded-2xl text-sm bg-blue-50 text-blue-900 rounded-bl-none border border-blue-100 shadow-sm"><SimpleMarkdown text={msg.text} /></div><button onClick={() => speak(msg.text, restartLiveListeningIfActive)} className="mt-1 p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-full shrink-0"><Volume2 size={16} /></button></div>
                        ) : ( <div className="max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed bg-stone-100 text-stone-800 rounded-br-none shadow-sm">{msg.text}</div> )}
                    </div>
                </div>
            ))}
             {isLoading && <div className="text-xs text-stone-400 px-6 animate-pulse">Tutor is thinking...</div>}
            <div ref={messagesEndRef} />
         </div>

         <div className="px-6 pb-2 bg-white text-center">
            {isQuickMode && !isQuizActive ? (
                <p className="text-xs text-amber-600 font-bold animate-pulse">Running in Quick Answer Mode (Text Only)</p>
            ) : liveMode === 'active' ? (
                <p className="text-xs text-green-600 font-bold animate-pulse">Live: Listening... Say "Pass" to pause, "Stop" to end.</p>
            ) : liveMode === 'standby' ? (
                <p className="text-xs text-amber-500 font-bold">Live: Standby. Say "Start" to resume.</p>
            ) : (
                <p className="text-xs text-blue-400/80 font-medium">Try to draw the diagram and structure the map to understand the concept better.</p>
            )}
         </div>

         <div className="p-4 border-t border-stone-100 flex gap-2 items-end bg-white">
            <div className="relative">
                {showTools && (
                    <div className="absolute bottom-full left-0 mb-3 flex flex-col gap-2 bg-white p-1.5 rounded-full shadow-xl border border-stone-200 animate-fade-in z-50 min-w-[3rem] items-center">
                        <button onClick={() => fileInputRef.current?.click()} disabled={isLoading || isQuizActive || liveMode !== 'off'} className="p-3 rounded-full text-stone-400 hover:bg-blue-50 hover:text-blue-600 transition-all"><ImageIcon size={20} /></button>
                        <button onClick={() => startQuiz(messages)} disabled={isLoading || isQuizActive || liveMode !== 'off'} className="p-3 rounded-full hover:bg-purple-50 text-stone-400 hover:text-purple-600 transition-all"><Brain size={20} /></button>
                        <button onClick={toggleLiveMode} disabled={isQuizActive} className={`p-3 rounded-full transition-all ${liveMode === 'active' ? 'bg-green-100 text-green-700 animate-pulse ring-2 ring-green-400' : liveMode === 'standby' ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-400' : 'text-stone-400 hover:bg-stone-50'}`}><Headphones size={20} /></button>
                        
                        {/* New Quick Answer Button */}
                        <button 
                            onClick={() => setIsQuickMode(!isQuickMode)} 
                            disabled={isLoading || isQuizActive || liveMode !== 'off'} 
                            className={`p-3 rounded-full transition-all ${isQuickMode ? 'bg-yellow-100 text-yellow-700 ring-2 ring-yellow-400' : 'text-stone-400 hover:bg-yellow-50 hover:text-yellow-600'}`} 
                            title="Quick Answer Mode (Text Only)"
                        >
                            <span className="text-lg leading-none">🏃</span>
                        </button>

                        {/* New Web Search Mode Button */}
                        <button 
                            onClick={() => setIsWebSearchMode(!isWebSearchMode)} 
                            disabled={isLoading || isQuizActive || liveMode !== 'off'} 
                            className={`p-3 rounded-full transition-all ${isWebSearchMode ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-400' : 'text-stone-400 hover:bg-indigo-50 hover:text-indigo-600'}`} 
                            title="Web Search Mode"
                        >
                            <span className="text-lg leading-none">🌍</span>
                        </button>
                        
                        <button onClick={(e) => handleClearHistory(e)} disabled={isLoading || isQuizActive || liveMode !== 'off'} className="p-3 rounded-full text-stone-400 hover:bg-red-50 hover:text-red-600 transition-all" title="Clear History"><Trash2 size={20} /></button>
                    </div>
                )}
                <button onClick={() => setShowTools(!showTools)} className="p-3 rounded-full text-stone-400 hover:bg-stone-100 transition-all">{showTools ? <X size={20} /> : <Plus size={20} />}</button>
            </div>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(input); } }} placeholder={isQuizActive ? "Quiz Active..." : (liveMode !== 'off' ? "Live Mode Active..." : (isQuickMode ? "Ask for a quick answer..." : "Ask the tutor..."))} disabled={isListening || isQuizActive || (liveMode !== 'off' && !isLoading)} className="flex-1 bg-stone-50 border-transparent focus:bg-white focus:border-stone-200 focus:ring-0 rounded-2xl px-6 py-3 text-sm transition-all shadow-inner resize-none overflow-y-auto" rows={1} ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; } }} />
            <button onClick={() => handleSendMessage("I am ready. Ask me a question.")} disabled={isQuizActive || isLoading || liveMode !== 'off'} className="p-3 rounded-full text-stone-400 hover:bg-purple-50 hover:text-purple-600 transition-all"><MessageCircleQuestion size={20} /></button>
            <button onClick={() => toggleManualMic(input, setInput)} disabled={isQuizActive} className={`p-3 rounded-full transition-all ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-stone-400 hover:bg-stone-50'}`}>{isListening ? <MicOff size={20} /> : <Mic size={20} />}</button>
            <button onClick={isLoading ? handleStopGeneration : () => handleSendMessage(input)} disabled={isQuizActive || (liveMode !== 'off' && !isLoading) || (!input.trim() && !isLoading)} className={`p-3 rounded-full text-white transition-all shadow-md ${isLoading ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50'}`}>{isLoading ? <Square size={18} fill="currentColor" /> : <Send size={18} />}</button>
         </div>
      </div>
    </div>
  );
};

export default TutorView;