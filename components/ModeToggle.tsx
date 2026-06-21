import React from 'react';
import { BookOpen, GraduationCap, Key } from 'lucide-react';
import { AppMode } from '../types';

interface ModeToggleProps {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
}

const ModeToggle: React.FC<ModeToggleProps> = ({ mode, setMode }) => {
  return (
    <div className="flex items-center justify-center p-4 absolute top-0 left-0 right-0 z-50 pointer-events-none">
      <div className="bg-white/90 backdrop-blur-sm shadow-lg rounded-full p-1 flex gap-1 pointer-events-auto border border-stone-200">
        <button
          onClick={() => setMode('diary')}
          className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
            mode === 'diary'
              ? 'bg-stone-800 text-white shadow-md'
              : 'text-stone-500 hover:bg-stone-100'
          }`}
        >
          <BookOpen size={16} />
          Diary Mode
        </button>
        <button
          onClick={() => setMode('tutor')}
          className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
            mode === 'tutor'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-stone-500 hover:bg-blue-50'
          }`}
        >
          <GraduationCap size={16} />
          Tutor Mode
        </button>
      </div>
      <button 
        onClick={() => window.dispatchEvent(new Event('open-api-key-modal'))} 
        className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-auto bg-white/90 p-2 rounded-full shadow-sm hover:bg-stone-100 text-stone-500 border border-stone-200 transition-colors"
        title="Set API Key"
      >
        <Key size={16} />
      </button>
    </div>
  );
};

export default ModeToggle;