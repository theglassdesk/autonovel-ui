'use client';

import React from 'react';
import { useStore } from '@/lib/store';
import { Settings, Plus, Book, ChevronRight, PenTool, Trash2 } from 'lucide-react';

export function AppSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state, setCurrentProject, createProject, deleteProject } = useStore();

  const handleNewProject = () => {
    const title = 'Untitled Novel';
    const proj = createProject(title, '');
    setCurrentProject(proj.id);
  };

  return (
    <div className="w-64 bg-slate-900/10 backdrop-blur-md border-r border-white/20 flex flex-col h-full overflow-hidden select-none">
      {/* Mac window traffic light spacer */}
      <div className="h-14 flex items-center px-4 gap-2 border-b border-transparent">
        <div className="w-3 h-3 rounded-full bg-red-400 border border-red-500/20" />
        <div className="w-3 h-3 rounded-full bg-amber-400 border border-amber-500/20" />
        <div className="w-3 h-3 rounded-full bg-green-400 border border-green-500/20" />
      </div>

      <div className="px-4 py-2">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Projects</h2>
        <div className="space-y-1">
          {state.projects.map(p => (
            <div key={p.id} className="group flex items-center gap-1 w-full">
              <button
                onClick={() => setCurrentProject(p.id)}
                className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                  state.currentProjectId === p.id 
                    ? 'bg-white/30 text-slate-900 shadow-sm' 
                    : 'text-slate-600 hover:bg-white/20'
                }`}
              >
                <Book size={14} className={state.currentProjectId === p.id ? 'text-indigo-600 shrink-0' : 'text-slate-500 shrink-0'} />
                <span className="truncate text-left">{p.title || 'Untitled'}</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Are you sure? This can\'t be undone.')) {
                    deleteProject(p.id);
                  }
                }}
                className="p-1.5 text-slate-400/50 hover:text-red-500 hover:bg-white/30 rounded-md transition-all shrink-0"
                title="Delete Novel"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        
        <button
          onClick={handleNewProject}
          className="mt-2 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-slate-500 hover:text-slate-900 hover:bg-white/20 transition-colors"
        >
          <Plus size={14} />
          <span>New Novel</span>
        </button>
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
