import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { generateChatCompletion } from '@/lib/inference';
import { Loader2, Send, Book, Bot, User, Copy, Download, Trash2, Check, MessageSquare } from 'lucide-react';

interface Token {
  type: 'text' | 'bold' | 'italic' | 'code' | 'link';
  content: string;
  href?: string;
}

function parseInline(text: string): React.ReactNode[] {
  let parts: Token[] = [
    { type: 'text', content: text }
  ];

  // 1. Bold (**text**)
  parts = parts.flatMap((p): Token[] => {
    if (p.type !== 'text') return [p];
    const regex = /\*\*([^*]+)\*\*/g;
    const subParts: Token[] = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(p.content)) !== null) {
      if (match.index > lastIndex) {
        subParts.push({ type: 'text', content: p.content.slice(lastIndex, match.index) });
      }
      subParts.push({ type: 'bold', content: match[1] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < p.content.length) {
      subParts.push({ type: 'text', content: p.content.slice(lastIndex) });
    }
    return subParts;
  });

  // 2. Italic (*text*)
  parts = parts.flatMap((p): Token[] => {
    if (p.type !== 'text') return [p];
    const regex = /\*([^*]+)\*/g;
    const subParts: Token[] = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(p.content)) !== null) {
      if (match.index > lastIndex) {
        subParts.push({ type: 'text', content: p.content.slice(lastIndex, match.index) });
      }
      subParts.push({ type: 'italic', content: match[1] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < p.content.length) {
      subParts.push({ type: 'text', content: p.content.slice(lastIndex) });
    }
    return subParts;
  });

  // 3. Italic (_text_)
  parts = parts.flatMap((p): Token[] => {
    if (p.type !== 'text') return [p];
    const regex = /_([^_]+)_/g;
    const subParts: Token[] = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(p.content)) !== null) {
      if (match.index > lastIndex) {
        subParts.push({ type: 'text', content: p.content.slice(lastIndex, match.index) });
      }
      subParts.push({ type: 'italic', content: match[1] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < p.content.length) {
      subParts.push({ type: 'text', content: p.content.slice(lastIndex) });
    }
    return subParts;
  });

  // 4. Code (`code`)
  parts = parts.flatMap((p): Token[] => {
    if (p.type !== 'text') return [p];
    const regex = /`([^`]+)`/g;
    const subParts: Token[] = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(p.content)) !== null) {
      if (match.index > lastIndex) {
        subParts.push({ type: 'text', content: p.content.slice(lastIndex, match.index) });
      }
      subParts.push({ type: 'code', content: match[1] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < p.content.length) {
      subParts.push({ type: 'text', content: p.content.slice(lastIndex) });
    }
    return subParts;
  });

  // 5. Links ([label](url))
  parts = parts.flatMap((p): Token[] => {
    if (p.type !== 'text') return [p];
    const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const subParts: Token[] = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(p.content)) !== null) {
      if (match.index > lastIndex) {
        subParts.push({ type: 'text', content: p.content.slice(lastIndex, match.index) });
      }
      subParts.push({ type: 'link', content: match[1], href: match[2] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < p.content.length) {
      subParts.push({ type: 'text', content: p.content.slice(lastIndex) });
    }
    return subParts;
  });

  return parts.map((p, idx) => {
    switch (p.type) {
      case 'bold':
        return <strong key={idx} className="font-semibold text-slate-950">{p.content}</strong>;
      case 'italic':
        return <em key={idx} className="italic text-slate-800">{p.content}</em>;
      case 'code':
        return <code key={idx} className="bg-slate-100/80 px-1.5 py-0.5 rounded font-mono text-xs text-indigo-600 border border-slate-200/50">{p.content}</code>;
      case 'link':
        return <a key={idx} href={p.href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{p.content}</a>;
      default:
        return <React.Fragment key={idx}>{p.content}</React.Fragment>;
    }
  });
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let currentParagraph: string[] = [];

  const flushParagraph = (key: number) => {
    if (currentParagraph.length > 0) {
      elements.push(
        <p key={`p-${key}`} className="mb-3 last:mb-0">
          {parseInline(currentParagraph.join(' '))}
        </p>
      );
      currentParagraph = [];
    }
  };

  const flushList = (key: number) => {
    if (currentList) {
      const ListTag = currentList.type === 'ol' ? 'ol' : 'ul';
      const listClass = currentList.type === 'ol' ? 'list-decimal pl-6 mb-3' : 'list-disc pl-6 mb-3';
      elements.push(
        <ListTag key={`list-${key}`} className={listClass}>
          {currentList.items.map((item, idx) => (
            <li key={idx} className="mb-1">
              {parseInline(item)}
            </li>
          ))}
        </ListTag>
      );
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Empty lines
    if (trimmed === '') {
      flushParagraph(i);
      flushList(i);
      continue;
    }

    // 2. Horizontal Rule
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushParagraph(i);
      flushList(i);
      elements.push(<hr key={`hr-${i}`} className="my-4 border-t border-slate-200/80" />);
      continue;
    }

    // 3. Headers
    if (trimmed.startsWith('#')) {
      flushParagraph(i);
      flushList(i);

      const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        const content = match[2];
        const headingClass = level === 1 ? 'text-2xl font-bold mt-4 mb-2 text-slate-900' :
                             level === 2 ? 'text-xl font-semibold mt-4 mb-2 text-slate-900' :
                             level === 3 ? 'text-lg font-semibold mt-3 mb-2 text-slate-900' :
                             'text-base font-semibold mt-2 mb-1 text-slate-900';
        const HeadingTag = `h${level}` as any;
        elements.push(
          <HeadingTag key={`h-${i}`} className={headingClass}>
            {parseInline(content)}
          </HeadingTag>
        );
        continue;
      }
    }

    // 4. Unordered lists
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (ulMatch) {
      flushParagraph(i);
      const content = ulMatch[2];
      if (currentList && currentList.type === 'ul') {
        currentList.items.push(content);
      } else {
        flushList(i);
        currentList = { type: 'ul', items: [content] };
      }
      continue;
    }

    // 5. Ordered lists
    const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
    if (olMatch) {
      flushParagraph(i);
      const content = olMatch[2];
      if (currentList && currentList.type === 'ol') {
        currentList.items.push(content);
      } else {
        flushList(i);
        currentList = { type: 'ol', items: [content] };
      }
      continue;
    }

    // 6. Blockquote
    if (trimmed.startsWith('>')) {
      flushParagraph(i);
      flushList(i);
      const content = trimmed.replace(/^>\s*/, '');
      elements.push(
        <blockquote key={`bq-${i}`} className="border-l-4 border-indigo-200 pl-4 italic text-slate-600 mb-3 bg-indigo-50/20 py-1 rounded-r">
          {parseInline(content)}
        </blockquote>
      );
      continue;
    }

    // 7. Normal text lines
    if (currentList) {
      flushList(i);
    }
    currentParagraph.push(line);
  }

  flushParagraph(lines.length);
  flushList(lines.length);

  return <>{elements}</>;
}

export function ChatWorkspace() {
  const { state, updateChatSession, createChatSession } = useStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentSession = state.chatSessions.find(c => c.id === state.currentChatId);
  const messages = React.useMemo(() => currentSession?.messages || [], [currentSession]);

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

  const [selectedModel, setSelectedModel] = useState(state.settings.chatModel || '');
  const currentModel = selectedModel || state.settings.chatModel || '';
  const selectedContextId = currentSession?.contextId || '';

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !currentSession) return;

    // Auto-title if it's the first message
    let title = currentSession.title;
    if (messages.length === 0) {
      title = input.trim().substring(0, 30) + (input.trim().length > 30 ? '...' : '');
      updateChatSession(currentSession.id, { title });
    }

    const userMessage = { role: 'user' as const, content: input.trim() };
    const newMessages = [...messages, userMessage];
    updateChatSession(currentSession.id, { messages: newMessages });
    setInput('');
    setIsLoading(true);

    try {
      const endpointURL = state.settings.chatProvider === 'local' ? state.settings.apiUrl : '/api';

      let systemPrompt = "You are a friendly helper that knows the book industry. Any questions or concerns the user has about any part of the book planning or writing process, you know about it and provide expert advice.";

      // Inject context if a project or series is selected
      if (selectedContextId) {
        let project = state.projects.find(p => p.id === selectedContextId);
        let series = state.series.find(s => s.id === selectedContextId);
        
        if (project) {
          systemPrompt += `\n\nThe user has selected to discuss their novel titled "${project.title}". Here is the novel's context:\n`;
          
          if (project.seriesId) {
            const series = state.series.find(s => s.id === project.seriesId);
            if (series && series.premise) {
              systemPrompt += `\nSeries Context: This book is part of a series. Series Premise: ${series.premise}\n`;
            }
            const effectivePenName = project.penName || series?.penName;
            if (effectivePenName) {
              systemPrompt += `\nThe author's pen name is ${effectivePenName}.\n`;
            }
          } else if (project.penName) {
            systemPrompt += `\nThe author's pen name is ${project.penName}.\n`;
          }

          if (project.premise) systemPrompt += `\nPremise: ${project.premise}`;
          if (project.previousBooksSummary) systemPrompt += `\nPrevious Books Summary: ${project.previousBooksSummary}`;
          if (project.synopsis) systemPrompt += `\nSynopsis: ${project.synopsis}`;
          if (project.characters && project.characters.length > 0) {
            systemPrompt += `\nCharacters: ${JSON.stringify(project.characters)}`;
          }
          if (project.outline && project.outline.length > 0) {
            systemPrompt += `\nOutline: ${JSON.stringify(project.outline)}`;
          }
          if (project.chapters && project.chapters.length > 0) {
            const draftedChapters = project.chapters.filter(c => c.content && c.content.trim() !== '');
            if (draftedChapters.length > 0) {
              systemPrompt += `\n\nDrafted Chapters:\n`;
              draftedChapters.forEach(ch => {
                const outlineItem = project.outline.find(o => o.chapterNumber === ch.chapterNumber);
                const title = outlineItem ? outlineItem.title : `Chapter ${ch.chapterNumber}`;
                systemPrompt += `\n--- ${title} ---\n${ch.content}\n`;
              });
            }
          }
        } else if (series) {
          systemPrompt += `\n\nThe user has selected to discuss their series titled "${series.title}". Here is the series context:\n`;
          if (series.premise) systemPrompt += `\nSeries Premise: ${series.premise}\n`;
          if (series.penName) systemPrompt += `\nThe author's pen name is ${series.penName}.\n`;
          const seriesBooks = state.projects.filter(p => p.seriesId === series.id);
          if (seriesBooks.length > 0) {
            systemPrompt += `\nBooks in this series:\n` + seriesBooks.map(b => `- ${b.title}: ${b.premise}`).join('\n');
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

      updateChatSession(currentSession.id, { messages: [
        ...newMessages,
        { role: 'assistant', content: response }
      ]});
    } catch (error: any) {
      console.error("Chat Error:", error);
      updateChatSession(currentSession.id, { messages: [
        ...newMessages,
        { role: 'assistant', content: `**Error:** ${error.message || "Something went wrong."}` }
      ]});
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyChat = () => {
    const text = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}:\n${m.content}`).join('\n\n---\n\n');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(err => {
          console.error('Failed to copy text: ', err);
          fallbackCopyText(text);
        });
    } else {
      fallbackCopyText(text);
    }
  };

  const fallbackCopyText = (text: string) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        console.error('Fallback copy failed');
      }
    } catch (err) {
      console.error('Fallback copy failed', err);
    }
    document.body.removeChild(textArea);
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
      if (currentSession) {
        updateChatSession(currentSession.id, { messages: [] });
      }
    }
  };

  if (!currentSession) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent h-full">
        <div className="text-center max-w-sm">
          <MessageSquare className="mx-auto h-12 w-12 text-slate-400 mb-4 opacity-50" />
          <h2 className="text-xl font-medium text-slate-900">No chat selected</h2>
          <p className="text-sm text-slate-600 mt-2">Select a planning chat from the sidebar or create a new one to begin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent overflow-hidden relative">
      {messages.length > 0 && (
        <div className="absolute top-2.5 right-6 flex items-center gap-2 z-10">
          <button onClick={handleCopyChat} className="p-1.5 px-2.5 bg-white/80 backdrop-blur-sm border border-white/60 text-slate-600 hover:bg-white text-xs font-medium rounded-lg shadow-sm transition-all flex items-center gap-1.5" title="Copy Chat">
            {copied ? (
              <>
                <Check size={14} className="text-emerald-500" />
                <span className="text-emerald-600 font-semibold">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={14} /> Copy
              </>
            )}
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
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-14 space-y-6 custom-scrollbar">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-4 max-w-3xl mx-auto ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <Bot size={16} className="text-indigo-600" />
                </div>
              )}
              <div className={`px-5 py-3.5 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : 'bg-white/60 border border-white/60 text-slate-800 rounded-bl-sm shadow-sm'
                }`}>
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  <div className="text-slate-800">
                    {renderMarkdown(msg.content)}
                  </div>
                )}
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
              value={selectedContextId}
              onChange={(e) => updateChatSession(currentSession.id, { contextId: e.target.value })}
              className="text-xs bg-white/50 border border-white/60 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 text-slate-700"
            >
              <option value="">None (General Chat)</option>
              <optgroup label="Series">
                {state.series.map(s => (
                  <option key={s.id} value={s.id}>{s.title || 'Untitled Series'}</option>
                ))}
              </optgroup>
              <optgroup label="Books">
                {state.projects.map(p => (
                  <option key={p.id} value={p.id}>{p.title || 'Untitled Book'}</option>
                ))}
              </optgroup>
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
                  onChange={(e) => setSelectedModel(e.target.value)}
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
