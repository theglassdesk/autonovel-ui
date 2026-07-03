'use client';

import React from 'react';
import { useStore } from '@/lib/store';
import { Library, User, BookOpen } from 'lucide-react';

export function SeriesWorkspace() {
  const { state, updateSeries } = useStore();
  const series = state.series.find(s => s.id === state.currentSeriesId);

  if (!series) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 relative overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3 max-w-4xl mx-auto w-full">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Library size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={series.title}
              onChange={(e) => updateSeries(series.id, { title: e.target.value })}
              className="text-2xl font-semibold text-slate-900 bg-transparent border-none p-0 focus:ring-0 placeholder:text-slate-300 w-full truncate"
              placeholder="Untitled Series"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <User size={16} className="text-slate-400" />
              <h3 className="font-medium text-slate-800">Series Settings</h3>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Author Pen Name</label>
                <input
                  type="text"
                  value={series.penName || ''}
                  onChange={(e) => updateSeries(series.id, { penName: e.target.value })}
                  placeholder="e.g. J.K. Rowling (Leave blank for default)"
                  className="w-full text-sm p-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">This pen name will be used as context for all books in this series, unless overridden at the book level.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Base System Prompt</label>
                <textarea
                  value={series.systemPrompt || ''}
                  onChange={(e) => updateSeries(series.id, { systemPrompt: e.target.value })}
                  placeholder="e.g. You are an expert thriller novelist..."
                  className="w-full h-24 text-sm p-3 border border-slate-200 rounded-md resize-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">Overrides the global system prompt for all books in this series.</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2 shrink-0">
              <BookOpen size={16} className="text-slate-400" />
              <h3 className="font-medium text-slate-800">Series Bible (Premise & Lore)</h3>
            </div>
            <textarea
              value={series.premise}
              onChange={(e) => updateSeries(series.id, { premise: e.target.value })}
              placeholder="Describe the overarching plot of the series, the world, the magic system, and any recurring characters..."
              className="flex-1 w-full text-base p-6 border-none resize-none focus:ring-0 outline-none bg-transparent leading-relaxed"
            />
          </div>

        </div>
      </div>
    </div>
  );
}
