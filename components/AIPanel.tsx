
import React, { useState, useRef, useEffect } from 'react';
import { processUserPrompt } from '../services/geminiService';
import { VJState } from '../types';
import { audioService } from '../services/audioService';

interface AIPanelProps {
  vjState: VJState;
  setVjState: React.Dispatch<React.SetStateAction<VJState>>;
}

interface Message {
  role: 'user' | 'ai';
  text: string;
}

export const AIPanel: React.FC<AIPanelProps> = ({ vjState, setVjState }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: 'CORRUPTED DATA // NEURAL INTERFACE ONLINE. Ready for synthesis directives. Try "Brutalist Monolith", "Data Corruption", or "Electric Blue Tensions".' }
  ]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + 'px';
    }
  }, [input, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userText = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setLoading(true);

    try {
      // Capture detailed context
      const audioData = audioService.getAudioData();
      const stats = `Bass: ${(audioData.bass * 100).toFixed(0)}%, Peak: ${(audioData.peak * 100).toFixed(0)}%`;

      const response = await processUserPrompt(userText, {
        audioStats: stats,
        currentState: vjState
      });

      if (response.type === 'action' && response.data.parameters) {
        // Apply parameters and log research
        setVjState(prev => {
          const newState = { ...prev, ...response.data.parameters };
          const entry = {
            timestamp: Date.now(),
            prompt: userText,
            parameters: response.data.parameters
          };
          return {
            ...newState,
            researchLog: [entry, ...prev.researchLog].slice(0, 20)
          };
        });
        
        // If filter was changed by AI, ensure AudioEngine updates too
        if (response.data.parameters.filterValue !== undefined) {
           audioService.setFilter(response.data.parameters.filterValue);
        }
      }

      setMessages(prev => [...prev, { role: 'ai', text: response.data.responseText }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: 'Command Processing Failed.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  if (!vjState.showUI) return null;

  return (
    <>
      {/* Toggle Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-tr from-[#2D70FF] to-purple-600 hover:from-[#2D70FF]/80 hover:to-purple-500 shadow-[0_0_20px_rgba(45,112,255,0.6)] border border-white/20 flex items-center justify-center z-50 transition-all text-white group"
      >
         <span className={`text-xs font-bold ${loading ? 'animate-pulse' : ''}`}>{isOpen ? '✕' : 'AI'}</span>
      </button>

      {/* Terminal Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[500px] bg-black border-2 border-white text-xs font-mono text-white shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b-2 border-white bg-white/5 flex justify-between items-center">
            <h3 className="text-[10px] font-black uppercase tracking-widest flex items-center">
              <span className="w-2 h-2 bg-white rounded-full mr-2 animate-ping"></span>
              NEURAL_INTERFACE // LOG
            </h3>
            <div className="text-[8px] text-gray-500 font-black">V.4.0.0_STABLE</div>
          </div>
          
          {/* Output Log */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] p-2 text-[10px] border-l-2 whitespace-pre-wrap ${
                  m.role === 'user' 
                    ? 'border-transparent text-right text-gray-400' 
                    : 'border-white bg-white/5 text-white'
                }`}>
                  <span className="opacity-50 block text-[7px] mb-1 uppercase tracking-wider font-black">{m.role === 'user' ? 'RESEARCHER' : 'SYNTHESIZER'}</span>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
               <div className="text-white/50 text-[8px] animate-pulse pl-2 font-black">
                 &gt; SYNTHESIZING_DATA...
               </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="p-3 border-t-2 border-white bg-black">
            <div className="flex items-start bg-white/5 border-2 border-white/20 rounded px-3 py-2 focus-within:border-white transition-colors">
              <span className="text-white mr-2 text-sm pt-0.5">❯</span>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ENTER_DIRECTIVE..."
                className="w-full bg-transparent text-[10px] text-white placeholder-gray-600 focus:outline-none font-mono resize-none overflow-hidden leading-relaxed uppercase font-black"
                rows={1}
                autoFocus
              />
            </div>
          </form>
        </div>
      )}
    </>
  );
};
