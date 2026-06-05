import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { generateChatCompletion } from '@/lib/inference';
import { Loader2, Send, Book, Bot, User } from 'lucide-react';

export function PlanningTab() {
  const { state, updatePlanningChat } = useStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = React.useMemo(() => state.planningChat || [], [state.planningChat]);

  // Determine available models based on provider
  const availableModels = React.useMemo(() => {
    switch (state.settings.provider) {
      case 'gemini':
        return [
          { id: 'gemini-3.5-flash', label: '3.5 Flash (Fastest)' },
          { id: 'gemini-3.1-flash-lite', label: '3.1 Flash (Lite)' },
          { id: 'gemini-3.1-pro-preview', label: '3.1 Pro Preview (Advanced)' },
        ];
      case 'anthropic':
        return [
          { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
          { id: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
        ];
      case 'openrouter':
        return [
          { id: 'openai/gpt-4o', label: 'GPT-4o' },
          { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4' },
          { id: 'x-ai/grok-4.3', label: 'Grok 4.3' },
          { id: 'deepseek/deepseek-v4-pro', label: 'Deepseek V4 Pro' },
          { id: 'meta-llama/llama-3-70b-instruct', label: 'Llama 3 70B' },
        ];
      case 'local':
      default:
        return [
          { id: 'local-model', label: 'Local Model' }
        ];
    }
  }, [state.settings.provider]);

  const currentModel = React.useMemo(() => {
    return availableModels.find(m => m.id === selectedModel) ? selectedModel : availableModels[0]?.id || '';
  }, [availableModels, selectedModel]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user' as const, content: input.trim() };
    const newMessages = [...messages, userMessage];
    updatePlanningChat(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const endpointURL = state.settings.provider === 'local' ? state.settings.apiUrl : '/api';

      let systemPrompt = "You are a friendly helper that knows the book industry. Any questions or concerns the user has about any part of the book planning or writing process, you know about it and provide expert advice.";

      // Inject context if a project is selected
      if (selectedProjectId) {
        const project = state.projects.find(p => p.id === selectedProjectId);
        if (project) {
          systemPrompt += `\n\nThe user has selected to discuss their novel titled "${project.title}". Here is the novel's context:\n`;
          if (project.premise) systemPrompt += `\nPremise: ${project.premise}`;
          if (project.synopsis) systemPrompt += `\nSynopsis: ${project.synopsis}`;
          if (project.characters && project.characters.length > 0) {
            systemPrompt += `\nCharacters: ${JSON.stringify(project.characters)}`;
          }
          if (project.outline && project.outline.length > 0) {
            systemPrompt += `\nOutline: ${JSON.stringify(project.outline)}`;
          }
          if (project.chapters && project.chapters.length > 0) {
            const draftedChapters = project.chapters.filter(c => c.status === 'drafted' && c.content);
            if (draftedChapters.length > 0) {
              systemPrompt += `\n\nDrafted Chapters:\n`;
              draftedChapters.forEach(ch => {
                const outlineItem = project.outline.find(o => o.chapterNumber === ch.chapterNumber);
                const title = outlineItem ? outlineItem.title : `Chapter ${ch.chapterNumber}`;
                systemPrompt += `\n--- ${title} ---\n${ch.content}\n`;
              });
            }
          }
        }
      }

      // Format messages for the API (which expects { role: 'system'|'user'|'assistant', content })
      const apiMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...newMessages
      ];

      const response = await generateChatCompletion(
        endpointURL,
        currentModel || state.settings.model,
        apiMessages,
        0.7,
        undefined,
        state.settings.provider
      );

      updatePlanningChat([
        ...newMessages,
        { role: 'assistant', content: response }
      ]);
    } catch (error: any) {
      console.error("Chat Error:", error);
      updatePlanningChat([
        ...newMessages,
        { role: 'assistant', content: `**Error:** ${error.message || "Something went wrong."}` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <h2 className="text-4xl font-semibold text-slate-800 tracking-tight mb-8">Ask away!</h2>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-4 max-w-3xl mx-auto ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <Bot size={16} className="text-indigo-600" />
                </div>
              )}
              <div className={`px-5 py-3.5 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : 'bg-white/60 border border-white/60 text-slate-800 rounded-bl-sm shadow-sm whitespace-pre-wrap'
                }`}>
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                  <User size={16} className="text-slate-600" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-4 max-w-3xl mx-auto justify-start">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <Bot size={16} className="text-indigo-600" />
              </div>
              <div className="px-5 py-3.5 rounded-2xl bg-white/60 border border-white/60 text-slate-800 rounded-bl-sm shadow-sm flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-indigo-500" />
                <span className="text-sm text-slate-500">Thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-white/40 border-t border-white/40 shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-2 px-2">
            <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
              <Book size={14} />
              <span>Attach Context:</span>
            </div>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="text-xs bg-white/50 border border-white/60 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 text-slate-700"
            >
              <option value="">None (General Chat)</option>
              {state.projects.map(p => (
                <option key={p.id} value={p.id}>{p.title || 'Untitled Project'}</option>
              ))}
            </select>
          </div>

          <div className="relative flex items-center bg-white rounded-full shadow-sm border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-400 transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask me anything about planning your novel..."
              className="flex-1 bg-transparent border-none outline-none px-6 py-4 text-slate-800 placeholder-slate-400 text-sm"
            />

            <div className="flex items-center gap-2 pr-3">
              <select
                value={currentModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="appearance-none bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium py-1.5 pl-3 pr-8 rounded-full outline-none transition-colors border border-transparent cursor-pointer"
                style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23475569%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px top 50%', backgroundSize: '8px auto' }}
              >
                {availableModels.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>

              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center disabled:opacity-50 disabled:bg-slate-400 transition-colors"
              >
                <Send size={16} className="ml-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
