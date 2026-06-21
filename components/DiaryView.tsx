import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Image as ImageIcon, X, Volume2, Square, Highlighter, Rocket, Loader } from 'lucide-react';
import { generateDiarySummary } from '../services/gemini';
import { startListening, speak, stopSpeaking } from '../services/speech';
import { resizeImage } from '../services/mediaUtils';

interface DiaryViewProps {
  initialText: string;
  onUpdateText: (text: string) => void;
  contextMemory: string;
  initialImage: string | null;
  onUpdateImage: (base64: string | null, mimeType: string | null) => void;
  onSendToTutor: (text: string) => void;
}

const DiaryView: React.FC<DiaryViewProps> = ({ 
  initialText, 
  onUpdateText, 
  initialImage, 
  onUpdateImage,
  onSendToTutor
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isGeneratingForRocket, setIsGeneratingForRocket] = useState(false);
  const [isSaved, setIsSaved] = useState(false); // Success state for rocket
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Reset "Saved" state when user modifies text, allowing them to re-send to tutor
  useEffect(() => {
      if (isSaved) setIsSaved(false);
  }, [initialText]);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  const handleRocketClick = async () => {
      if (isGeneratingForRocket || isSaved) return;
      
      let textToSend = '';

      if (initialText.trim()) {
          setIsGeneratingForRocket(true);
          try {
              const res = await generateDiarySummary(initialText, '', initialImage, null);
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
    } else {
      setIsSpeaking(true);
      speak(
          initialText, 
          () => {
              setIsSpeaking(false);
          }
      );
    }
  };

  return (
    <div className="flex h-full w-full">
      {/* Raw Input (Full Width) */}
      <div className="w-full h-full flex flex-col bg-white pt-28 pb-8 px-8 relative group">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <span className="text-xs font-bold text-stone-400 tracking-widest uppercase flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-stone-300 group-hover:bg-blue-400 transition-colors"></div>
            Raw Input
          </span>
          <div className="flex gap-2">
             <button 
                onClick={handleRocketClick}
                disabled={isGeneratingForRocket || !initialText.trim()}
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
                onClick={toggleSpeech}
                disabled={!initialText.trim()}
                className={`p-2 rounded-full transition-all ${isSpeaking ? 'text-blue-600 bg-blue-50' : 'text-stone-400 hover:bg-stone-100'}`}
                title={isSpeaking ? "Stop Reading" : "Read Aloud"}
              >
                {isSpeaking ? <Square size={18} fill="currentColor" /> : <Volume2 size={18} />}
              </button>
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
    </div>
  );
};

export default DiaryView;