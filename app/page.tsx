'use client';

import React, { useState } from 'react';
import { AppSidebar } from '@/components/AppSidebar';
import { Workspace } from '@/components/Workspace';
import { SeriesWorkspace } from '@/components/SeriesWorkspace';
import { ChatWorkspace } from '@/components/ChatWorkspace';
import { SettingsModal } from '@/components/SettingsModal';
import { useStore } from '@/lib/store';

export default function Page() {
  const [showSettings, setShowSettings] = useState(false);
  const { state } = useStore();

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col font-sans text-slate-800" style={{ background: 'radial-gradient(circle at top left, #a5b4fc, #e0e7ff 30%, #fef3c7 70%, #fda4af)' }}>
      <div className="flex-1 m-6 bg-white/40 backdrop-blur-3xl rounded-2xl border border-white/40 shadow-2xl flex overflow-hidden">
        <AppSidebar onOpenSettings={() => setShowSettings(true)} />
        {state.currentView === 'chat' ? <ChatWorkspace /> : state.currentView === 'series' ? <SeriesWorkspace /> : <Workspace key={state.currentProjectId} />}
      </div>
      
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
