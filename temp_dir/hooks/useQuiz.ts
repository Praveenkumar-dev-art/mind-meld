import React, { useState, useRef } from 'react';
import { generateQuiz } from '../services/gemini';
import { speak, stopSpeaking } from '../services/speech';
import { QuizData, ChatMessage } from '../types';

interface UseQuizProps {
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  contextMemory: string;
  activeTutorMemory: string | null;
  setIsLoading: (loading: boolean) => void;
  setLiveMode: (mode: 'off' | 'active' | 'standby') => void;
  handleSendMessage: (text: string) => void;
}

export const useQuiz = ({ 
  setMessages, 
  contextMemory, 
  activeTutorMemory, 
  setIsLoading, 
  setLiveMode, 
  handleSendMessage 
}: UseQuizProps) => {
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [isQuizActive, setIsQuizActive] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [score, setScore] = useState(0);

  const startQuiz = async (messages: ChatMessage[]) => {
      setIsLoading(true);
      stopSpeaking();
      setLiveMode('off');

      const history = messages.map(m => ({ role: m.role, text: m.text }));
      // Prioritize active memory if set, otherwise context
      const context = activeTutorMemory || contextMemory;
      
      try {
        const quiz = await generateQuiz(context, history);
        setQuizData(quiz);
        setCurrentQuestionIndex(0);
        setScore(0);
        setSelectedOption(null);
        setIsAnswerRevealed(false);
        setIsQuizActive(true);
        speak(`Let's test your knowledge on ${quiz.topic}. Question one.`);
      } catch (e) {
        console.error("Failed to start quiz", e);
      } finally {
        setIsLoading(false);
      }
  };

  const handleOptionSelect = (index: number) => {
      if (isAnswerRevealed || !quizData) return;
      setSelectedOption(index);
      setIsAnswerRevealed(true);
      const isCorrect = index === quizData.questions[currentQuestionIndex].correctAnswerIndex;
      if (isCorrect) setScore(s => s + 1);
      speak(isCorrect ? "Correct!" : "Not quite.");
  };

  const handleNextQuestion = () => {
      if (!quizData) return;
      if (currentQuestionIndex < quizData.questions.length - 1) {
          setCurrentQuestionIndex(prev => prev + 1);
          setSelectedOption(null);
          setIsAnswerRevealed(false);
          speak("Next question.");
      } else {
          const finalScore = score; 
          const total = quizData.questions.length;
          const topic = quizData.topic;
          
          // Reset State
          setIsQuizActive(false);
          setQuizData(null);
          
          // Send result to chat
          const resultMsg = `I finished the quiz on ${topic}. I scored ${finalScore}/${total}.`;
          handleSendMessage(resultMsg);
      }
  };

  return {
    quizData,
    isQuizActive,
    currentQuestionIndex,
    selectedOption,
    isAnswerRevealed,
    score,
    startQuiz,
    handleOptionSelect,
    handleNextQuestion
  };
};