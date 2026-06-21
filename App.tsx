import React, { useState } from 'react';
import ModeToggle from './components/ModeToggle';
import DiaryView from './components/DiaryView';
import TutorView from './components/TutorView';
import { AppMode } from './types';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('diary');
  
  // State shared between modes (Context Memory)
  const [diaryText, setDiaryText] = useState('');
  const [diaryImage, setDiaryImage] = useState<string | null>(null);
  const [diaryImageMime, setDiaryImageMime] = useState<string | null>(null);

  // Focused Learning Memory (Transferred from Diary via Rocket)
  const [tutorMemory, setTutorMemory] = useState<string | null>(null);
  
  return (
    <div className="w-full h-screen overflow-hidden bg-stone-50 font-sans text-stone-900">
      <ModeToggle mode={mode} setMode={setMode} />
      
      <main className="w-full h-full pt-0">
        {mode === 'diary' ? (
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
          <TutorView 
            contextMemory={diaryText}
            contextImage={diaryImage}
            contextImageMime={diaryImageMime}
            activeTutorMemory={tutorMemory}
          />
        )}
      </main>
    </div>
  );
};

export default App;