import { useState, useRef, useEffect, useCallback } from 'react';
import { startListening, stopSpeaking, speak } from '../services/speech';

type LiveModeState = 'off' | 'active' | 'standby';

interface UseLiveModeProps {
  onUserInput: (text: string) => void;
  isLoading: boolean;
}

export const useLiveMode = ({ onUserInput, isLoading }: UseLiveModeProps) => {
  const [liveMode, setLiveMode] = useState<LiveModeState>('off');
  const [isListening, setIsListening] = useState(false); // Manual mic state
  
  // Refs to avoid stale closures in recursive callbacks
  const liveModeRef = useRef<LiveModeState>('off');
  const isLoadingRef = useRef(isLoading);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef(''); // Helper for manual mic accumulation
  const startTimeRef = useRef<number>(0); // Track session start for loop safety
  
  // Flag to bridge the gap between user speaking and React state update
  const isProcessingRef = useRef(false);

  // Sync refs
  useEffect(() => { liveModeRef.current = liveMode; }, [liveMode]);
  
  useEffect(() => { 
      isLoadingRef.current = isLoading; 
      // If loading finishes, we can reset processing flag
      if (!isLoading) {
          isProcessingRef.current = false;
      }
  }, [isLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const startLiveListening = useCallback(() => {
      if (liveModeRef.current === 'off') return;

      startTimeRef.current = Date.now();
      recognitionRef.current = startListening(
          (text) => handleLiveInput(text),
          () => {
               // On End (Silence or Stop)
               const duration = Date.now() - startTimeRef.current;
               
               // If we are currently processing input (intentional stop), 
               // OR loading is true (AI thinking), we DO NOT restart here.
               // We wait for the restartLiveListeningIfActive trigger after TTS.
               if (isProcessingRef.current || isLoadingRef.current) {
                   return;
               }

               // Recursive restart if still in live mode
               if (liveModeRef.current !== 'off') {
                   // Safety check: If session was super short (<1s) and we weren't processing,
                   // it might be an error loop (e.g., permission denied or no mic).
                   if (duration > 1000) {
                       setTimeout(startLiveListening, 100);
                   } else {
                       console.warn("Speech recognition stopped too quickly without processing flag. Stopping Live Mode to prevent loop.");
                       setLiveMode('off');
                       liveModeRef.current = 'off';
                       speak("Microphone unstable. Live mode stopped.");
                   }
               }
          },
          { continuous: true } // Enable continuous mode
      );
  }, [onUserInput]); // handleLiveInput dependency via wrapper

  const handleLiveInput = (text: string) => {
      const lower = text.toLowerCase().trim();

      // GLOBAL: Stop
      if (lower === 'stop' || lower.includes('stop conversation')) {
          setLiveMode('off');
          liveModeRef.current = 'off';
          if (recognitionRef.current) recognitionRef.current.abort();
          speak("Live conversation stopped.");
          return;
      }

      // ACTIVE MODE Logic
      if (liveModeRef.current === 'active') {
          if (lower === 'pass' || lower.startsWith('pass ')) {
              setLiveMode('standby');
              speak("Standing by."); 
              return;
          }

          if (!isLoadingRef.current) {
              // Mark as processing to prevent "Stopped too quickly" error when we abort recognition
              isProcessingRef.current = true;
              onUserInput(text);
          }
      } 
      // STANDBY MODE Logic
      else if (liveModeRef.current === 'standby') {
          if (lower === 'start' || lower.includes('start conversation')) {
              setLiveMode('active');
              speak("Resuming conversation.");
              return;
          }
      }
  };

  const toggleLiveMode = () => {
      if (liveMode !== 'off') {
          setLiveMode('off');
          liveModeRef.current = 'off';
          if (recognitionRef.current) recognitionRef.current.abort();
          speak("Live mode off.");
      } else {
          setLiveMode('active');
          liveModeRef.current = 'active';
          speak("Live conversation started. Say 'Pass' to pause, 'Start' to resume, or 'Stop' to end.", () => {
               startLiveListening();
          });
      }
  };

  // Manual Mic Logic
  const startManualListening = (currentInput: string, setInput: (s: string) => void) => {
      setIsListening(true);
      inputRef.current = currentInput;
      
      recognitionRef.current = startListening(
        (text) => {
             const newVal = inputRef.current + (inputRef.current ? ' ' : '') + text;
             inputRef.current = newVal;
             setInput(newVal);
        },
        () => {
            setIsListening(false);
            recognitionRef.current = null;
        }
      );
  };

  const stopManualListening = () => {
      setIsListening(false);
      if (recognitionRef.current) {
          recognitionRef.current.stop();
          recognitionRef.current = null;
      }
  };

  const toggleManualMic = (currentInput: string, setInput: (s: string) => void) => {
    if (liveMode !== 'off') {
        speak("Please stop Live Mode first.");
        return;
    }

    if (isListening) {
        stopManualListening();
    } else {
        startManualListening(currentInput, setInput);
    }
  };

  // Triggered when AI finishes speaking in Live Mode
  const restartLiveListeningIfActive = () => {
    if (liveModeRef.current === 'active') {
         // Reset processing flag so the next onEnd check knows we are ready
         isProcessingRef.current = false;
         // Small delay to ensure previous audio context is clear
         setTimeout(startLiveListening, 100);
    }
  };

  return {
    liveMode,
    isListening, // Manual mic status
    toggleLiveMode,
    toggleManualMic,
    setLiveMode,
    restartLiveListeningIfActive,
    recognitionRef // Exposed for aborting if needed externally
  };
};