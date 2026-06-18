import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { generateChatCompletion } from '@/lib/inference';
import { Loader2, Send, Book, Bot, User, Copy, Download, Trash2 } from 'lucide-react';

export function PlanningTab() {
  const { state, updatePlanningChat, updatePlanningChatConfig } = useStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = React.useMemo(() => state.planningChat || [], [state.planningChat]);

  const [availableModels, setAvailableModels] = useState<{id: string, label: string}[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  useEffect(() => {
    async function fetchModels() {
      setLoadingModels(true);
      try {
        const res = await fetch(`/api/models?provider=${state.settings.chatProvider}`);
        const data = await res.json();
        if (data.data) {
          setAvailableModels(data.data);
        }
      } catch (e) {
        console.error("Failed to fetch chat models", e);
      } finally {
        setLoadingModels(false);
      }
    }
    fetchModels();
  }, [state.settings.chatProvider]);

  const selectedModel = state.planningChatConfig?.modelId || state.settings.chatModel || '';
  const selectedProjectId = state.planningChatConfig?.projectId || '';

  const currentModel = selectedModel;

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
      const endpointURL = state.settings.chatProvider === 'local' ? state.settings.apiUrl : '/api';

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
        currentModel,
        apiMessages,
        0.7,
        undefined,
        state.settings.chatProvider
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

  const handleCopyChat = () => {
    const text = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}:\n${m.content}`).join('\n\n---\n\n');
    navigator.clipboard.writeText(text);
  };

  const handleDownloadChat = () => {
    const text = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}:\n${m.content}`).join('\n\n---\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'planning-chat.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearChat = () => {
    if (confirm('Are you sure you want to clear the chat history?')) {
      updatePlanningChat([]);
      updatePlanningChatConfig(undefined);
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden relative">
      {messages.length > 0 && (
        <div className="absolute top-4 right-6 flex items-center gap-2 z-10">
          <button onClick={handleCopyChat} className="p-1.5 px-2.5 bg-white/80 backdrop-blur-sm border border-white/60 text-slate-600 hover:bg-white text-xs font-medium rounded-lg shadow-sm transition-all flex items-center gap-1.5" title="Copy Chat">
            <Copy size={14} /> Copy
          </button>
          <button onClick={handleDownloadChat} className="p-1.5 px-2.5 bg-white/80 backdrop-blur-sm border border-white/60 text-slate-600 hover:bg-white text-xs font-medium rounded-lg shadow-sm transition-all flex items-center gap-1.5" title="Download Chat">
            <Download size={14} /> Download
          </button>
          <button onClick={handleClearChat} className="p-1.5 px-2.5 bg-white/80 backdrop-blur-sm border border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 text-xs font-medium rounded-lg shadow-sm transition-all flex items-center gap-1.5" title="Clear Chat">
            <Trash2 size={14} /> Clear
          </button>
        </div>
      )}

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
              onChange={(e) => updatePlanningChatConfig({ projectId: e.target.value, modelId: currentModel })}
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
              <div className="relative">
                <input
                  type="text"
                  list="planning-chat-models"
                  value={currentModel}
                  onChange={(e) => updatePlanningChatConfig({ projectId: selectedProjectId, modelId: e.target.value })}
                  placeholder={loadingModels ? "Loading..." : "Model ID"}
                  className="w-32 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium py-1.5 px-3 rounded-full outline-none transition-colors border border-transparent placeholder-slate-400"
                />
                <datalist id="planning-chat-models">
                  {availableModels.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </datalist>
              </div>

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
