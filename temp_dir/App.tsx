import React, { useState } from 'react';
import ModeToggle from './components/ModeToggle';
import DiaryView from './components/DiaryView';
import TutorView from './components/TutorView';
import { ApiKeyModal } from './components/ApiKeyModal';
import { AppMode } from './types';

/**
 * ============================================================================
 * MINDMELD ROOT COMPONENT (App.tsx)
 * ============================================================================
 * 
 * WELCOME JUNIOR DEVELOPER! 👋
 * 
 * --- WHAT IS MINDMELD? ---
 * MindMeld is a dual-mode, AI-powered learning assistant built with React, TypeScript,
 * and Vite. It integrates Google's Gemini API to help users study and learn.
 * 
 * The application has two primary views (or modes):
 * 1. DIARY MODE: A free-form journal/workspace where the user writes down thoughts,
 *    attaches images, highlights terms, and triggers AI summaries.
 * 2. TUTOR MODE: An interactive Socratic tutor that guides the user via chat,
 *    multiple-choice quizzes, SVG diagrams, and Mermaid.js concept maps.
 * 
 * --- THE CORE CONCEPT & CONTEXT SHARING ---
 * Crucially, these two modes share context memory. What the user writes in the Diary
 * directly influences how the Tutor responds and what it teaches.
 * 
 * --- DATA FLOW & LIFECYCLE MAP ---
 * Here's a quick ASCII roadmap of how data flows through our app:
 * 
 *  [User writes in DiaryView]
 *             │
 *             ├─► (Local updates via state: diaryText / diaryImage)
 *             │
 *             ▼
 *  [User clicks Rocket Button (🚀)]
 *             │
 *             ▼
 *  [gemini.ts -> generateDiarySummary()]  ◄─── Calls Google Gemini API
 *             │
 *             ▼
 *  [App.tsx -> setTutorMemory(summary)]  ◄─── Active Learning Memory is set
 *             │
 *             ▼
 *  [TutorView receives tutorMemory prop]
 *             │
 *             ▼
 *  [User asks Socratic question] 
 *             │
 *             ▼
 *  [gemini.ts -> generateTutorResponse()] ◄─── Uses activeTutorMemory + user question
 *             │
 *             ▼
 *  [Render SVG diagram / Play TTS Audio / Show Chat Bubble]
 * 
 * Let's dive into the state and render tree below!
 */

const App: React.FC = () => {
  /**
   * State 1: Active Mode Selector
   * ----------------------------
   * Tracks whether the user is in 'diary' mode or 'tutor' mode.
   * Renders either <DiaryView /> or <TutorView /> accordingly.
   * Controlled by the ModeToggle component located at the top of the viewport.
   */
  const [mode, setMode] = useState<AppMode>('diary');
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeyError, setApiKeyError] = useState('');

  React.useEffect(() => {
      const handleOpenModal = (e: Event) => {
          setIsApiKeyModalOpen(true);
          if (e instanceof CustomEvent && e.detail?.error) {
              setApiKeyError(e.detail.error);
          } else {
              setApiKeyError('');
          }
      };
      window.addEventListener('open-api-key-modal', handleOpenModal);
      return () => window.removeEventListener('open-api-key-modal', handleOpenModal);
  }, []);
  
  /**
   * State 2: Shared Context (Diary Text & Image)
   * ---------------------------------------------
   * These states hold the current textual and visual state of the diary.
   * We keep them in App.tsx (the parent component) so they do not reset 
   * when switching tabs/modes, maintaining user input continuity.
   * 
   * - diaryText: The raw string content of the user's journal.
   * - diaryImage: The base64 data string of the uploaded image.
   * - diaryImageMime: The media type of the image (e.g. image/png, image/jpeg).
   */
  const [diaryText, setDiaryText] = useState('');
  const [diaryImage, setDiaryImage] = useState<string | null>(null);
  const [diaryImageMime, setDiaryImageMime] = useState<string | null>(null);

  /**
   * State 3: Active Learning Memory (Tutor Memory)
   * ----------------------------------------------
   * Holds the AI-generated structured summary/insight of the diary text.
   * This is sent to the Gemini API in Tutor Mode to ground the Socratic AI
   * in the user's current context/studies.
   * 
   * Transferred from DiaryView when the user triggers the "Rocket" (🚀) action.
   */
  const [tutorMemory, setTutorMemory] = useState<string | null>(null);
  
  return (
    // Outer layout wrapper. 
    // - bg-stone-200: A darker background outside the tablet frame
    <div className="w-full h-screen overflow-hidden bg-stone-200 font-sans text-stone-900 flex justify-center">
      
      {/* 
        Tablet Frame Wrapper: 
        Constrains the app to a maximum of 800px width on large screens. 
      */}
      <div className="w-full max-w-[800px] h-full bg-stone-50 relative shadow-2xl border-x border-stone-300 flex flex-col overflow-hidden">
        
        {/* 
          ModeToggle: Floating pill navigation at the top of the viewport.
          Allows the user to slide between 'Diary' and 'Tutor' modes.
        */}
        <ModeToggle mode={mode} setMode={setMode} />
        
        {/* 
          Main content container.
          pt-0: Because components handle their own top padding (TutorView: pt-24, DiaryView: pt-28)
          to prevent overlapping with the absolute-positioned ModeToggle bar.
        */}
        <main className="w-full h-full pt-0">
          {mode === 'diary' ? (
            /*
              DIARY VIEW
              ----------
              Props:
              - initialText: Passed down to seed the textarea state.
              - onUpdateText: Callback to update App.tsx's state as the user types.
              - contextMemory: The current text, used inside DiaryView for other functions.
              - initialImage: Resized base64 image (via mediaUtils.ts/resizeImage) for display.
              - onUpdateImage: Callback invoked when the user uploads a new image.
              - onSendToTutor: Callback when the user clicks the Rocket button (🚀).
                It saves the summarized learning memory into `tutorMemory`.
                Note: Automatic navigation removed as per user request
            */
            <DiaryView 
              initialText={diaryText} 
              onUpdateText={setDiaryText}
              contextMemory={diaryText}
              initialImage={diaryImage}
              onUpdateImage={(img, mime) => {
                setDiaryImage(img);
                setDiaryImageMime(mime);
              }}
              onSendToTutor={(text) => {
                setTutorMemory(text);
                // Automatic navigation removed as per user request
              }}
            />
          ) : (
            /*
              TUTOR VIEW
              ----------
              Props:
              - contextMemory: Passed down as general context of the diary.
              - contextImage / contextImageMime: Attached image context.
              - activeTutorMemory: The main learning context summarizing the diary.
                The Socratic Tutor uses this to formulate response paths and custom diagrams.
            */
            <TutorView 
              contextMemory={diaryText}
              contextImage={diaryImage}
              contextImageMime={diaryImageMime}
              activeTutorMemory={tutorMemory}
            />
          )}
        </main>
        
        <ApiKeyModal 
            isOpen={isApiKeyModalOpen} 
            onClose={() => setIsApiKeyModalOpen(false)} 
            error={apiKeyError}
        />
      </div>
    </div>
  );
};

export default App;