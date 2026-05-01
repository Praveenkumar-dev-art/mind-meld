export type AppMode = 'diary' | 'tutor';

export interface Insight {
  text: string;
  relatedTopic?: string;
}

export interface TutorResponse {
  mindmap_code?: string | null;
  svg_code: string | null; // Changed to nullable
  speech_response: string;
  question?: string | null;
  scaffolding_state: 'example' | 'problem' | 'fading';
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  mindmap?: string | null;
  svg?: string | null; // Changed to nullable
}

export interface GeminiConfig {
  temperature?: number;
  topK?: number;
  topP?: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface QuizData {
  topic: string;
  questions: QuizQuestion[];
}