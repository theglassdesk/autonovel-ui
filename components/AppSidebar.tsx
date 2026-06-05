'use client';

import React from 'react';
import { useStore } from '@/lib/store';
import { Settings, Plus, Book, ChevronRight, PenTool } from 'lucide-react';

export function AppSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state, setCurrentProject, createProject } = useStore();

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
            <button
              key={p.id}
              onClick={() => setCurrentProject(p.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                state.currentProjectId === p.id 
                  ? 'bg-white/30 text-slate-900 shadow-sm' 
                  : 'text-slate-600 hover:bg-white/20'
              }`}
            >
              <Book size={14} className={state.currentProjectId === p.id ? 'text-indigo-600' : 'text-slate-500'} />
              <span className="truncate">{p.title || 'Untitled'}</span>
            </button>
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
