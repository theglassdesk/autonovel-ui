'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

// --- Types ---
export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  contextId?: string; // seriesId or projectId
  updatedAt: number;
};
export type Character = {
  id: string;
  name: string;
  description: string;
  role: string;
  identity: string;
  physicalDescription: string;
  distinctFeatures: string;
  coreValues: string;
  flaws: string;
  fears: string;
  want: string;
  need: string;
  lie: string;
};

export type ChapterOutline = {
  id: string;
  chapterNumber: number;
  title: string;
  summary: string;
  pov: string;
};

export type ChapterData = {
  id: string;
  chapterNumber: number;
  content: string; // The generated text
  status: 'pending' | 'generating' | 'drafted' | 'revised';
};

export type SeriesProject = {
  id: string;
  title: string;
  premise: string;
  penName?: string;
  systemPrompt?: string;
  bookIds: string[];
};

export type NovelProject = {
  id: string;
  title: string;
  premise: string;
  synopsis: string;
  characters: Character[];
  outline: ChapterOutline[];
  chapters: ChapterData[];
  outlineTemplate?: string;
  targetChapterCount?: number;
  povType?: string;
  dualPov?: boolean;
  seriesId?: string;
  penName?: string;
  systemPrompt?: string;
  previousBooksSummary?: string;
  lastActiveTab?: 'foundation' | 'drafting';
  lastSelectedChapter?: number | null;
};

export type AppState = {
  series: SeriesProject[];
  projects: NovelProject[];
  currentProjectId: string | null;
  currentSeriesId: string | null;
  currentChatId: string | null;
  currentView: 'project' | 'series' | 'chat';
  chatSessions: ChatSession[];
  settings: {
    draftingProvider: 'local' | 'gemini' | 'anthropic' | 'openrouter';
    draftingModel: string;
    chatProvider: 'local' | 'gemini' | 'anthropic' | 'openrouter';
    chatModel: string;
    apiUrl: string;
    systemPrompt: string;
    craftRules: string;
    antiSlop: string;
    antiPatterns: string;
    autoSaveToDisk: boolean;
  };
};

type StoreContextType = {
  state: AppState;
  createSeries: (title: string, premise: string) => SeriesProject;
  deleteSeries: (id: string) => void;
  setCurrentSeries: (id: string) => void;
  updateSeries: (id: string, updates: Partial<SeriesProject>) => void;
  createProject: (title: string, premise: string, seriesId?: string) => NovelProject;
  deleteProject: (id: string) => void;
  setCurrentProject: (id: string) => void;
  updateProject: (id: string, updates: Partial<NovelProject>) => void;
  createChatSession: () => ChatSession;
  deleteChatSession: (id: string) => void;
  setCurrentChatSession: (id: string) => void;
  updateChatSession: (id: string, updates: Partial<ChatSession>) => void;
  updateSettings: (updates: Partial<AppState['settings']>) => void;
  getCurrentProject: () => NovelProject | undefined;
  getCurrentSeries: () => SeriesProject | undefined;
  importState: (newState: AppState) => void;
};

const defaultSettings = {
  draftingProvider: 'gemini' as const,
  draftingModel: 'gemini-2.5-flash',
  chatProvider: 'gemini' as const,
  chatModel: 'gemini-2.5-flash',
  apiUrl: 'http://127.0.0.1:1234/v1', // LM Studio default
  systemPrompt: 'You are an award-winning novelist writing a gripping book. Respond thoughtfully and adhere closely to the instructions.',
  craftRules: 'Show, don\'t tell. Prioritize sensory details (sight, sound, smell, touch, taste). Ground the reader in the physical space before jumping into dialogue. Ensure character voices are distinct and authentic.',
  antiSlop: 'AVOID these overused AI words and phrases: "tapestry", "testament", "symphony", "labyrinth", "shivers down spine", "let out a breath they didn\'t know they were holding", "eyes flashed", "needless to say", "in a world where", "a dance of", "delve".',
  antiPatterns: 'AVOID structural AI patterns:\n- Do not end chapters with moralizing summaries, rhetorical questions, or neat wrap-ups.\n- Avoid overly balanced dialogue where everyone speaks in complete, polite paragraphs.\n- Avoid sudden, unearned emotional shifts or overly therapeutic language ("I see you", "your feelings are valid").',
  autoSaveToDisk: false
};

const StoreContext = createContext<StoreContextType | null>(null);

function loadState(): AppState {
  if (typeof window === 'undefined') return { series: [], projects: [], chatSessions: [], currentChatId: null, currentProjectId: null, currentSeriesId: null, currentView: 'project', settings: defaultSettings };
  try {
    const saved = localStorage.getItem('autonovel_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.settings) {
        parsed.settings = { ...defaultSettings, ...parsed.settings };
        // Migrate from useGemini boolean to provider string
        if (typeof (parsed.settings as any).useGemini === 'boolean') {
            parsed.settings.draftingProvider = (parsed.settings as any).useGemini ? 'gemini' : 'local';
            parsed.settings.chatProvider = parsed.settings.draftingProvider;
            delete (parsed.settings as any).useGemini;
        }
        
        // Migrate from single provider to drafting/chat providers
        if ((parsed.settings as any).provider && !parsed.settings.draftingProvider) {
          parsed.settings.draftingProvider = (parsed.settings as any).provider;
          parsed.settings.chatProvider = (parsed.settings as any).provider;
          delete (parsed.settings as any).provider;
        }
        if ((parsed.settings as any).model && !parsed.settings.draftingModel) {
          parsed.settings.draftingModel = (parsed.settings as any).model;
          parsed.settings.chatModel = (parsed.settings as any).model;
          delete (parsed.settings as any).model;
        }

        if (typeof parsed.settings.draftingProvider === 'undefined') parsed.settings.draftingProvider = defaultSettings.draftingProvider;
        if (typeof parsed.settings.draftingModel === 'undefined') parsed.settings.draftingModel = defaultSettings.draftingModel;
        if (typeof parsed.settings.chatProvider === 'undefined') parsed.settings.chatProvider = defaultSettings.chatProvider;
        if (typeof parsed.settings.chatModel === 'undefined') parsed.settings.chatModel = defaultSettings.chatModel;
        if (typeof parsed.settings.craftRules === 'undefined') parsed.settings.craftRules = defaultSettings.craftRules;
        if (typeof parsed.settings.antiSlop === 'undefined') parsed.settings.antiSlop = defaultSettings.antiSlop;
        if (typeof parsed.settings.antiPatterns === 'undefined') parsed.settings.antiPatterns = defaultSettings.antiPatterns;
        if (typeof parsed.settings.autoSaveToDisk === 'undefined') parsed.settings.autoSaveToDisk = defaultSettings.autoSaveToDisk;
      }
      if (!parsed.series) parsed.series = [];
      if (!parsed.chatSessions) parsed.chatSessions = [];
      
      // Migrate old planningChat to a ChatSession
      if (parsed.planningChat && parsed.planningChat.length > 0) {
        const oldChatId = crypto.randomUUID();
        parsed.chatSessions.push({
          id: oldChatId,
          title: 'Legacy Chat',
          messages: parsed.planningChat,
          updatedAt: Date.now()
        });
        delete parsed.planningChat;
      }

      if (!parsed.currentView) parsed.currentView = parsed.currentSeriesId ? 'series' : 'project';
      
      if (parsed.projects) {
        parsed.projects = parsed.projects.map((p: any) => ({
          ...p,
          characters: (p.characters || []).map((c: any) => ({
            id: c.id || crypto.randomUUID(),
            name: c.name || '',
            description: c.description || '',
            role: c.role || '',
            identity: c.identity || '',
            physicalDescription: c.physicalDescription || '',
            distinctFeatures: c.distinctFeatures || '',
            coreValues: c.coreValues || '',
            flaws: c.flaws || '',
            fears: c.fears || '',
            want: c.want || '',
            need: c.need || '',
            lie: c.lie || '',
          }))
        }));
      }
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load state', e);
  }
  return { series: [], projects: [], chatSessions: [], currentChatId: null, currentProjectId: null, currentSeriesId: null, currentView: 'project', settings: defaultSettings };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    series: [],
    projects: [],
    chatSessions: [],
    currentChatId: null,
    currentProjectId: null,
    currentSeriesId: null,
    currentView: 'project',
    settings: defaultSettings,
  });
  
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line
    setState(loadState());
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('autonovel_state', JSON.stringify(state));
      if (state.settings.autoSaveToDisk) {
        fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
        }).catch(err => console.error('Auto-save to disk failed:', err));
      }
    }
  }, [state, isLoaded]);

  const createSeries = (title: string, premise: string) => {
    const newSeries: SeriesProject = {
      id: crypto.randomUUID(),
      title,
      premise,
      bookIds: [],
    };
    setState(prev => ({
      ...prev,
      series: [...prev.series, newSeries],
      currentSeriesId: newSeries.id,
      currentProjectId: null,
      currentView: 'series'
    }));
    return newSeries;
  };

  const deleteSeries = (id: string) => {
    setState(prev => ({
      ...prev,
      series: prev.series.filter(s => s.id !== id),
      currentSeriesId: prev.currentSeriesId === id ? null : prev.currentSeriesId,
      currentView: prev.currentSeriesId === id ? 'project' : prev.currentView
    }));
  };

  const setCurrentSeries = (id: string) => {
    setState(prev => ({ ...prev, currentSeriesId: id, currentProjectId: null, currentView: 'series' }));
  };

  const updateSeries = (id: string, updates: Partial<SeriesProject>) => {
    setState(prev => ({
      ...prev,
      series: prev.series.map(s => s.id === id ? { ...s, ...updates } : s)
    }));
  };

  const createProject = (title: string, premise: string, seriesId?: string) => {
    const newProject: NovelProject = {
      id: crypto.randomUUID(),
      title,
      premise,
      synopsis: '',
      characters: [],
      outline: [],
      chapters: [],
      outlineTemplate: '',
      targetChapterCount: 10,
      povType: 'Third Person Limited',
      seriesId,
      lastActiveTab: 'foundation',
      lastSelectedChapter: null
    };
    
    setState(prev => {
      const nextState = {
        ...prev,
        projects: [...prev.projects, newProject],
        currentProjectId: newProject.id,
        currentSeriesId: null,
        currentView: 'project' as const
      };
      
      // If adding to a series, update the series' bookIds
      if (seriesId) {
        nextState.series = nextState.series.map(s => 
          s.id === seriesId ? { ...s, bookIds: [...s.bookIds, newProject.id] } : s
        );
      }
      
      return nextState;
    });
    
    return newProject;
  };

  const deleteProject = (id: string) => {
    setState(prev => {
      const nextState = {
        ...prev,
        projects: prev.projects.filter(p => p.id !== id),
        currentProjectId: prev.currentProjectId === id ? null : prev.currentProjectId
      };
      // Also remove from any series that references it
      nextState.series = nextState.series.map(s => ({
        ...s,
        bookIds: s.bookIds.filter(bid => bid !== id)
      }));
      return nextState;
    });
  };

  const setCurrentProject = (id: string) => {
    setState(prev => ({ ...prev, currentProjectId: id, currentSeriesId: null, currentView: 'project' }));
  };

  const updateProject = (id: string, updates: Partial<NovelProject>) => {
    setState(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === id ? { ...p, ...updates } : p)
    }));
  };

  const updateSettings = (updates: Partial<AppState['settings']>) => {
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, ...updates }
    }));
  };

  const createChatSession = () => {
    const newChat: ChatSession = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      updatedAt: Date.now()
    };
    setState(prev => ({
      ...prev,
      chatSessions: [...prev.chatSessions, newChat],
      currentChatId: newChat.id,
      currentProjectId: null,
      currentSeriesId: null,
      currentView: 'chat'
    }));
    return newChat;
  };

  const deleteChatSession = (id: string) => {
    setState(prev => ({
      ...prev,
      chatSessions: prev.chatSessions.filter(c => c.id !== id),
      currentChatId: prev.currentChatId === id ? null : prev.currentChatId,
      currentView: prev.currentChatId === id ? (prev.currentProjectId ? 'project' : (prev.currentSeriesId ? 'series' : 'project')) : prev.currentView
    }));
  };

  const setCurrentChatSession = (id: string) => {
    setState(prev => ({ ...prev, currentChatId: id, currentProjectId: null, currentSeriesId: null, currentView: 'chat' }));
  };

  const updateChatSession = (id: string, updates: Partial<ChatSession>) => {
    setState(prev => ({
      ...prev,
      chatSessions: prev.chatSessions.map(c => c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c)
    }));
  };

  const getCurrentProject = () => {
    return state.projects.find(p => p.id === state.currentProjectId);
  };

  const getCurrentSeries = () => {
    return state.series.find(s => s.id === state.currentSeriesId);
  };

  const importState = (newState: AppState) => {
    setState(newState);
  };

  if (!isLoaded) return null; // Prevent hydration mismatch

  return (
    <StoreContext.Provider value={{ 
      state, 
      createSeries, deleteSeries, setCurrentSeries, updateSeries,
      createProject, deleteProject, setCurrentProject, updateProject,
      createChatSession,
      deleteChatSession,
      setCurrentChatSession,
      updateChatSession,
      updateSettings,
      getCurrentProject, getCurrentSeries, importState 
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
}
