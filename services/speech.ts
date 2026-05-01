// Simple wrapper for Web Speech API

export const speak = (
  text: string, 
  onEnd?: () => void, 
  onBoundary?: (charIndex: number) => void
) => {
  if (!('speechSynthesis' in window)) {
    if (onEnd) onEnd();
    return;
  }
  
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Try to load voices (might be empty on first load in some browsers)
  let voices = window.speechSynthesis.getVoices();
  
  // Helper to set voice
  const setVoice = () => {
    const preferredVoice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) || voices[0];
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
  };

  // If voices are already loaded, set immediately. Otherwise wait for event (Chrome quirk).
  if (voices.length > 0) {
    setVoice();
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      voices = window.speechSynthesis.getVoices();
      setVoice();
    };
  }
  
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  if (onBoundary) {
    utterance.onboundary = (event) => {
      // event.charIndex represents the character index the speech is currently at
      onBoundary(event.charIndex);
    };
  }

  if (onEnd) {
    utterance.onend = () => {
      onEnd();
    };
    
    utterance.onerror = (e) => {
        // "canceled" and "interrupted" are normal when the user stops speech or a new message comes in.
        if (e.error === 'canceled' || e.error === 'interrupted') {
             // We generally don't want to trigger onEnd for manual interruptions 
             // because it might trigger the next step in a sequence (like restarting listening)
             // unexpectedly. However, if the logic relies on onEnd to unlock UI, we must be careful.
             // For this app, interruptions usually mean the user took control, so we DON'T call onEnd.
            return;
        }
        console.error("Speech synthesis error:", e.error);
        onEnd();
    };
  }

  window.speechSynthesis.speak(utterance);
};

export const stopSpeaking = () => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};

export const startListening = (
  onResult: (text: string) => void, 
  onEnd: () => void,
  options?: { continuous?: boolean }
): any => { // Returning the recognition instance
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.error("Speech recognition is not supported in this browser.");
    onEnd();
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = options?.continuous ?? false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event: any) => {
    // Iterate through results. In continuous mode, multiple results might be returned over time.
    // We only care about final results.
    for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
             const transcript = event.results[i][0].transcript;
             onResult(transcript);
        }
    }
  };

  recognition.onerror = (event: any) => {
    // ignore no-speech error, it just means silence. 
    // ignore aborted error, it means we stopped it manually.
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error("Speech recognition error:", event.error);
    }
    // Only call onEnd if we are actually stopping (error)
    // In continuous mode, minor errors might occur but we typically rely on onEnd event
    if (event.error === 'aborted' || event.error === 'not-allowed') {
       onEnd();
    }
  };

  recognition.onend = () => {
    onEnd();
  };

  try {
    recognition.start();
  } catch (e) {
    console.error("Failed to start recognition", e);
    onEnd();
  }
  
  return recognition;
};