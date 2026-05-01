import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Mic, MicOff, Sparkles, Image as ImageIcon, X, Volume2, Square, RefreshCw, Highlighter, Rocket, Loader, Check } from 'lucide-react';
import { generateDiarySummary } from '../services/gemini';
import { startListening, speak, stopSpeaking } from '../services/speech';
import { resizeImage } from '../services/mediaUtils';

interface DiaryViewProps {
  initialText: string;
  onUpdateText: (text: string) => void;
  contextMemory: string;
  initialImage: string | null;
  onUpdateImage: (base64: string | null, mimeType: string | null) => void;
  summary: string;
  insight: string | null;
  onUpdateSummary: (summary: string) => void;
  onUpdateInsight: (insight: string | null) => void;
  onSendToTutor: (text: string) => void;
}

// Token interface for Karaoke logic
interface WordToken {
  id: string;
  text: string;      // The text to display
  cleanText: string; // The text to speak (no markdown)
  isBold: boolean;
  isHeader: boolean;
  startIndex: number; // Global char index start in the clean speech string
  endIndex: number;   // Global char index end
}

const DiaryView: React.FC<DiaryViewProps> = ({ 
  initialText, 
  onUpdateText, 
  initialImage, 
  onUpdateImage,
  summary,
  insight,
  onUpdateSummary,
  onUpdateInsight,
  onSendToTutor
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingForRocket, setIsGeneratingForRocket] = useState(false);
  const [isSaved, setIsSaved] = useState(false); // Success state for rocket
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Karaoke State
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Parse Summary into Tokens for Karaoke
  const { tokens, fullCleanText } = useMemo(() => {
    if (!summary || typeof summary !== 'string') return { tokens: [], fullCleanText: '' };

    const lines = summary.split('\n');
    let globalCharIndex = 0;
    const parsedTokens: WordToken[] = [];
    
    lines.forEach((line, lineIdx) => {
      // Basic markdown parsing
      const isHeader = line.startsWith('#');
      const cleanLine = line.replace(/^#+\s*/, '').replace(/^\*\s*/, ''); // Remove header chars and bullet points
      
      const words = cleanLine.split(' ');
      
      words.forEach((word, wordIdx) => {
        const isBold = word.startsWith('**') || word.startsWith('__');
        const cleanWord = word.replace(/\*\*/g, '').replace(/__/g, '').replace(/\*/g, '');
        
        if (cleanWord.trim().length > 0) {
           parsedTokens.push({
             id: `${lineIdx}-${wordIdx}`,
             text: cleanWord, // Display clean word
             cleanText: cleanWord,
             isBold: isBold,
             isHeader: isHeader,
             startIndex: globalCharIndex,
             endIndex: globalCharIndex + cleanWord.length
           });
           
           // Advance index (word length + space)
           globalCharIndex += cleanWord.length + 1; 
        }
      });
    });

    return { 
      tokens: parsedTokens, 
      fullCleanText: parsedTokens.map(t => t.cleanText).join(' ') 
    };
  }, [summary]);


  // Only auto-generate if summary is empty (Initial Draft)
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (summary) return;

      if (initialText.length > 10 && !isLoading) {
        setIsLoading(true);
        const { summary: newSummary, insight: newInsight } = await generateDiarySummary(
             initialText, 
             '', 
             initialImage, 
             null 
        );
        onUpdateSummary(newSummary);
        onUpdateInsight(newInsight);
        setIsLoading(false);
      }
    }, 2000);

    return () => clearTimeout(delayDebounce);
  }, [initialText, initialImage, summary]);

  // Reset "Saved" state when user modifies text, allowing them to re-send to tutor
  useEffect(() => {
      if (isSaved) setIsSaved(false);
  }, [initialText]);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  const handleRegenerate = async () => {
      setIsLoading(true);
      const { summary: newSummary, insight: newInsight } = await generateDiarySummary(initialText, '', initialImage, null);
      onUpdateSummary(newSummary);
      onUpdateInsight(newInsight);
      setIsLoading(false);
  };

  const handleRocketClick = async () => {
      if (isGeneratingForRocket || isSaved) return;
      
      let textToSend = summary;

      // Requirement: Convert raw input to structured output before sending if not already done
      if (!textToSend && initialText.trim()) {
          setIsGeneratingForRocket(true);
          try {
              const res = await generateDiarySummary(initialText, '', initialImage, null);
              onUpdateSummary(res.summary);
              onUpdateInsight(res.insight);
              textToSend = res.summary;
          } catch (e) {
              console.error(e);
              textToSend = initialText; // Fallback to raw text if generation fails
          } finally {
              setIsGeneratingForRocket(false);
          }
      }

      if (textToSend) {
          setIsSaved(true);
          onSendToTutor(textToSend);
      }
  };

  const toggleMic = () => {
    if (isListening) {
      setIsListening(false);
      if (recognitionRef.current) recognitionRef.current.stop();
    } else {
      setIsListening(true);
      recognitionRef.current = startListening(
        (text) => {
            // Use ref value to prevent overwriting concurrent typing
            const currentVal = textareaRef.current?.value || initialText;
            onUpdateText(currentVal + (currentVal ? ' ' : '') + text);
        },
        () => setIsListening(false)
      );
    }
  };

  const handleHighlight = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (start === end) return; 

      const selectedText = initialText.substring(start, end);
      const before = initialText.substring(0, start);
      const after = initialText.substring(end);

      const newText = `${before}**${selectedText}**${after}`;
      onUpdateText(newText);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const { base64, mime } = await resizeImage(e.target.files[0]);
      onUpdateImage(base64, mime);
    }
  };

  const toggleSpeech = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      setHighlightIndex(-1);
    } else {
      setIsSpeaking(true);
      speak(
          fullCleanText, 
          () => {
              setIsSpeaking(false);
              setHighlightIndex(-1);
          },
          (charIndex) => {
              setHighlightIndex(charIndex);
          }
      );
    }
  };

  const handleWordDoubleClick = (token: WordToken) => {
      stopSpeaking();
      setIsSpeaking(true);
      const offset = token.startIndex;
      const textToSpeak = fullCleanText.substring(offset);
      
      speak(
          textToSpeak,
          () => {
              setIsSpeaking(false);
              setHighlightIndex(-1);
          },
          (charIndex) => {
              setHighlightIndex(charIndex + offset);
          }
      );
  };

  return (
    <div className="flex h-full w-full">
      {/* LEFT: Raw Input */}
      {/* Changed pt-28 to clear the ModeToggle pill */}
      <div className="w-1/2 h-full flex flex-col border-r border-stone-200 bg-white pt-28 pb-8 px-8 relative group">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <span className="text-xs font-bold text-stone-400 tracking-widest uppercase flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-stone-300 group-hover:bg-blue-400 transition-colors"></div>
            Raw Input
          </span>
          <div className="flex gap-2">
             <button 
                onClick={handleHighlight}
                className="p-2 text-stone-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-full transition-all"
                title="Highlight Selection"
             >
                <Highlighter size={18} />
             </button>
            <button 
                onClick={() => fileInputRef.current?.click()}
                className={`p-2 rounded-full transition-all ${initialImage ? 'text-blue-600 bg-blue-50' : 'text-stone-400 hover:bg-stone-100'}`}
            >
              <ImageIcon size={18} />
            </button>
            <button 
                onClick={toggleMic}
                className={`p-2 rounded-full transition-all ${isListening ? 'text-red-600 bg-red-50 animate-pulse' : 'text-stone-400 hover:bg-stone-100'}`}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          </div>
        </div>
        
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
            className="hidden" 
            accept="image/*"
        />

        {/* Scrollable Input Area */}
        <div className="flex-1 relative flex flex-col min-h-0">
            {initialImage && (
                <div className="mb-4 relative group shrink-0">
                    <img src={`data:image/jpeg;base64,${initialImage}`} alt="Context" className="w-full h-48 object-cover rounded-lg border border-stone-200" />
                    <button 
                        onClick={() => onUpdateImage(null, null)}
                        className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}
            <textarea
              ref={textareaRef}
              className="w-full flex-1 resize-none outline-none bg-white text-black text-lg leading-relaxed placeholder-stone-400"
              placeholder="Start typing your thoughts..."
              value={initialText}
              onChange={(e) => onUpdateText(e.target.value)}
            />
        </div>
      </div>

      {/* RIGHT: Structured View (Karaoke) */}
      {/* Changed pt-28 to clear ModeToggle, and switched to flex col for static header */}
      <div className="w-1/2 h-full flex flex-col bg-stone-50 pt-28 pb-8 px-10 relative">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <span className="text-xs font-bold text-stone-400 tracking-widest uppercase flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-stone-300"></div>
            Structured View
          </span>
          <div className="flex gap-2">
            <button 
              onClick={handleRocketClick}
              disabled={isGeneratingForRocket}
              className={`p-2 rounded-full transition-all relative ${isSaved ? 'text-green-600 bg-green-50 ring-2 ring-green-100' : 'text-stone-400 hover:text-purple-600 hover:bg-purple-50'}`}
              title="Send to Tutor Memory"
            >
              {isGeneratingForRocket ? (
                <Loader size={18} className="animate-spin text-purple-600"/> 
              ) : isSaved ? (
                <Rocket size={18} className="text-green-600 fill-current" />
              ) : (
                <Rocket size={18} />
              )}
            </button>
            <button 
              onClick={handleRegenerate}
              disabled={isLoading || isGeneratingForRocket}
              className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
              title="Reload Analysis"
            >
              <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button 
              onClick={toggleSpeech}
              className={`p-2 rounded-full transition-all ${isSpeaking ? 'text-blue-600 bg-blue-50' : 'text-stone-400 hover:bg-stone-100'}`}
              title={isSpeaking ? "Stop Reading" : "Read Aloud"}
            >
              {isSpeaking ? <Square size={18} fill="currentColor" /> : <Volume2 size={18} />}
            </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          {summary ? (
            <div className="prose prose-stone max-w-none pb-8">
              {/* Karaoke Token Rendering */}
              <div className="text-lg leading-relaxed text-stone-700 space-x-1 whitespace-pre-wrap">
                {tokens.map((token, idx) => {
                    const isHighlighted = isSpeaking && highlightIndex >= token.startIndex && highlightIndex < token.endIndex;
                    return (
                        <React.Fragment key={token.id}>
                            {token.isHeader && idx > 0 && <div className="h-4 w-full block" />} {/* Simple spacer for headers */}
                            <span
                                onDoubleClick={() => handleWordDoubleClick(token)}
                                className={`
                                    cursor-pointer transition-colors duration-200 rounded px-0.5
                                    ${token.isHeader ? 'text-2xl font-bold text-stone-900 block mb-2 mt-4' : ''}
                                    ${token.isBold ? 'font-bold text-stone-800' : ''}
                                    ${isHighlighted ? 'bg-yellow-200 text-stone-900 shadow-sm' : 'hover:bg-stone-200'}
                                `}
                            >
                                {token.text}
                            </span>
                        </React.Fragment>
                    );
                })}
              </div>

              {insight && (
                <div className="mt-8 p-4 bg-yellow-50 border border-yellow-100 rounded-xl relative animate-fade-in group pr-8">
                  <button 
                      onClick={() => onUpdateInsight(null)}
                      className="absolute top-2 right-2 text-yellow-400 hover:text-yellow-700 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                      <X size={16} />
                  </button>
                  <div className="flex items-start gap-3">
                    <Sparkles className="text-yellow-500 shrink-0 mt-1" size={18} />
                    <div>
                      <span className="text-xs font-bold text-yellow-600 tracking-wide block mb-1">CONNECTION FOUND</span>
                      <p className="text-sm text-stone-700">{insight}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-stone-400">
              {isLoading || isGeneratingForRocket ? (
                  <div className="flex flex-col items-center gap-3">
                      <Loader className="animate-spin text-stone-300" size={32} />
                      <span className="animate-pulse">Analyzing your thoughts...</span>
                  </div>
              ) : (
                  <>
                      <Sparkles size={48} className="mb-4 opacity-20" />
                      <p>Start typing or speaking to see the magic happen.</p>
                  </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiaryView;