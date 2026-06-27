import React, { useState, useEffect } from 'react';
import { Key, X, Check, ExternalLink } from 'lucide-react';

interface ApiKeyModalProps {
    isOpen: boolean;
    onClose: () => void;
    error?: string;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, error }) => {
    const [apiKey, setApiKey] = useState('');
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const savedKey = localStorage.getItem('MINDMELD_USER_API_KEY');
            if (savedKey) {
                setApiKey(savedKey);
            }
            setIsSaved(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (apiKey.trim()) {
            localStorage.setItem('MINDMELD_USER_API_KEY', apiKey.trim());
            setIsSaved(true);
            setTimeout(() => {
                onClose();
            }, 1000);
        } else {
            localStorage.removeItem('MINDMELD_USER_API_KEY');
            setIsSaved(true);
            setTimeout(() => {
                onClose();
            }, 1000);
        }
    };

    return (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-md overflow-hidden flex flex-col">
                <div className="p-4 border-b border-stone-100 flex justify-between items-center bg-stone-50">
                    <div className="flex items-center gap-2 text-stone-700">
                        <Key size={20} className="text-amber-500" />
                        <h3 className="font-bold">Gemini API Key</h3>
                    </div>
                    <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 flex-1 bg-white space-y-4">
                    <p className="text-sm text-stone-600">
                        To use MindMeld, please provide your own Google Gemini API key. This key is stored securely in your browser's local storage and is never sent to our servers.
                    </p>
                    
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg font-medium flex items-start gap-2">
                            <span>⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}
                    
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Your API Key</label>
                        <input 
                            type="password" 
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="AIzaSy..."
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white transition-all font-mono text-sm"
                        />
                    </div>
                    
                    <div className="pt-2 flex justify-between items-center">
                        <a 
                            href="https://aistudio.google.com/app/apikey" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:text-blue-600 font-medium flex items-center gap-1"
                        >
                            Get a free API key <ExternalLink size={12} />
                        </a>
                        
                        <button 
                            onClick={handleSave}
                            className={`px-6 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${isSaved ? 'bg-emerald-500 text-white' : 'bg-stone-800 text-white hover:bg-stone-700 active:scale-95'}`}
                        >
                            {isSaved ? <><Check size={16} /> Saved</> : 'Save Key'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
