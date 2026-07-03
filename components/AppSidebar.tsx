'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { Settings, Plus, Book, ChevronRight, ChevronDown, Trash2, Library, Folder, MessageSquare } from 'lucide-react';

export function AppSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state, setCurrentProject, setCurrentSeries, createProject, createSeries, deleteProject, deleteSeries, createChatSession, deleteChatSession, setCurrentChatSession } = useStore();
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({});

  const handleNewProject = () => {
    const title = 'Untitled Novel';
    const proj = createProject(title, '');
    setCurrentProject(proj.id);
  };

  const handleNewSeries = () => {
    const title = 'New Series';
    const series = createSeries(title, '');
    setCurrentSeries(series.id);
  };

  const handleNewBookInSeries = (seriesId: string) => {
    const title = 'Untitled Book';
    const proj = createProject(title, '', seriesId);
    setCurrentProject(proj.id);
    setExpandedSeries(prev => ({ ...prev, [seriesId]: true }));
  };

  const toggleSeries = (seriesId: string) => {
    setExpandedSeries(prev => ({ ...prev, [seriesId]: !prev[seriesId] }));
  };

  const standaloneProjects = state.projects.filter(p => !p.seriesId);

  return (
    <div className="w-64 bg-slate-900/10 backdrop-blur-md border-r border-white/20 flex flex-col h-full overflow-hidden select-none">
      {/* Mac window traffic light spacer */}
      <div className="h-14 flex items-center px-4 gap-2 border-b border-transparent">
        <div className="w-3 h-3 rounded-full bg-red-400 border border-red-500/20" />
        <div className="w-3 h-3 rounded-full bg-amber-400 border border-amber-500/20" />
        <div className="w-3 h-3 rounded-full bg-green-400 border border-green-500/20" />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4 space-y-6">
        
        {/* SERIES SECTION */}
        <div>
          <div className="px-2 flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Series</h2>
            <button onClick={handleNewSeries} className="text-slate-400 hover:text-slate-900 transition-colors" title="New Series">
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {state.series.length === 0 && (
              <div className="px-2 py-1 text-xs text-slate-500 italic">No series yet.</div>
            )}
            {state.series.map(s => {
              const isExpanded = expandedSeries[s.id] !== false; // default true
              const seriesBooks = state.projects.filter(p => p.seriesId === s.id);
              
              return (
                <div key={s.id} className="w-full">
                  <div className="group flex items-center gap-1 w-full">
                    <button
                      onClick={() => toggleSeries(s.id)}
                      className="p-1 text-slate-500 hover:text-slate-800 transition-colors"
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <button
                      onClick={() => setCurrentSeries(s.id)}
                      className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                        state.currentView === 'series' && state.currentSeriesId === s.id 
                          ? 'bg-white/30 text-slate-900 shadow-sm' 
                          : 'text-slate-600 hover:bg-white/20'
                      }`}
                    >
                      <Library size={14} className={state.currentView === 'series' && state.currentSeriesId === s.id ? 'text-indigo-600 shrink-0' : 'text-slate-500 shrink-0'} />
                      <span className="truncate text-left font-medium">{s.title || 'Untitled Series'}</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this series? Books inside will become standalone novels.')) {
                          deleteSeries(s.id);
                        }
                      }}
                      className="p-1.5 text-slate-400/50 hover:text-red-500 hover:bg-white/30 rounded-md transition-all shrink-0 opacity-0 group-hover:opacity-100"
                      title="Delete Series"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="ml-6 mt-1 space-y-1 border-l-2 border-slate-300/30 pl-2">
                      {seriesBooks.map(p => (
                        <div key={p.id} className="group flex items-center gap-1 w-full">
                          <button
                            onClick={() => setCurrentProject(p.id)}
                            className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-1 rounded-md text-sm transition-colors ${
                              state.currentView === 'project' && state.currentProjectId === p.id 
                                ? 'bg-white/30 text-slate-900 shadow-sm' 
                                : 'text-slate-600 hover:bg-white/20'
                            }`}
                          >
                            <Book size={12} className={state.currentView === 'project' && state.currentProjectId === p.id ? 'text-indigo-600 shrink-0' : 'text-slate-400 shrink-0'} />
                            <span className="truncate text-left text-xs">{p.title || 'Untitled'}</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('Delete this book?')) deleteProject(p.id);
                            }}
                            className="p-1 text-slate-400/50 hover:text-red-500 hover:bg-white/30 rounded-md transition-all shrink-0 opacity-0 group-hover:opacity-100"
                            title="Delete Book"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => handleNewBookInSeries(s.id)}
                        className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs text-slate-400 hover:text-slate-800 hover:bg-white/20 transition-colors"
                      >
                        <Plus size={12} />
                        <span>Add Book</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* STANDALONE NOVELS SECTION */}
        <div>
          <div className="px-2 flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Standalone Novels</h2>
            <button onClick={handleNewProject} className="text-slate-400 hover:text-slate-900 transition-colors" title="New Standalone Novel">
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {standaloneProjects.length === 0 && (
              <div className="px-2 py-1 text-xs text-slate-500 italic">No standalone novels.</div>
            )}
            {standaloneProjects.map(p => (
              <div key={p.id} className="group flex items-center gap-1 w-full">
                <button
                  onClick={() => setCurrentProject(p.id)}
                  className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                    state.currentView === 'project' && state.currentProjectId === p.id 
                      ? 'bg-white/30 text-slate-900 shadow-sm' 
                      : 'text-slate-600 hover:bg-white/20'
                  }`}
                >
                  <Book size={14} className={state.currentView === 'project' && state.currentProjectId === p.id ? 'text-indigo-600 shrink-0' : 'text-slate-500 shrink-0'} />
                  <span className="truncate text-left">{p.title || 'Untitled'}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure? This can\'t be undone.')) {
                      deleteProject(p.id);
                    }
                  }}
                  className="p-1.5 text-slate-400/50 hover:text-red-500 hover:bg-white/30 rounded-md transition-all shrink-0 opacity-0 group-hover:opacity-100"
                  title="Delete Novel"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* PLANNING CHATS SECTION */}
        <div>
          <div className="px-2 flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Planning Chats</h2>
            <button onClick={createChatSession} className="text-slate-400 hover:text-slate-900 transition-colors" title="New Chat Session">
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {state.chatSessions.length === 0 && (
              <div className="px-2 py-1 text-xs text-slate-500 italic">No chat sessions.</div>
            )}
            {state.chatSessions.map(c => (
              <div key={c.id} className="group flex items-center gap-1 w-full">
                <button
                  onClick={() => setCurrentChatSession(c.id)}
                  className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                    state.currentView === 'chat' && state.currentChatId === c.id 
                      ? 'bg-white/30 text-slate-900 shadow-sm' 
                      : 'text-slate-600 hover:bg-white/20'
                  }`}
                >
                  <MessageSquare size={14} className={state.currentView === 'chat' && state.currentChatId === c.id ? 'text-indigo-600 shrink-0' : 'text-slate-500 shrink-0'} />
                  <span className="truncate text-left">{c.title || 'Untitled Chat'}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this chat session?')) {
                      deleteChatSession(c.id);
                    }
                  }}
                  className="p-1.5 text-slate-400/50 hover:text-red-500 hover:bg-white/30 rounded-md transition-all shrink-0 opacity-0 group-hover:opacity-100"
                  title="Delete Chat"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>

      <div className="mt-auto p-4 border-t border-white/20">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-slate-600 hover:bg-white/20"
        >
          <Settings size={14} />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
