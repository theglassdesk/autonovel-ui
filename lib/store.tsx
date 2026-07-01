'use client';

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

// --- Types ---
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
};

export type AppState = {
  projects: NovelProject[];
  currentProjectId: string | null;
  planningChat?: { role: 'user' | 'assistant'; content: string }[];
  planningChatConfig?: { projectId: string; modelId: string };
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
  createProject: (title: string, premise: string) => NovelProject;
  deleteProject: (id: string) => void;
  setCurrentProject: (id: string) => void;
  updateProject: (id: string, updates: Partial<NovelProject>) => void;
  updateSettings: (updates: Partial<AppState['settings']>) => void;
  updatePlanningChat: (messages: { role: 'user' | 'assistant'; content: string }[]) => void;
  updatePlanningChatConfig: (config: { projectId: string; modelId: string } | undefined) => void;
  getCurrentProject: () => NovelProject | undefined;
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
  if (typeof window === 'undefined') return { projects: [], currentProjectId: null, planningChat: [], settings: defaultSettings };
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
      if (!parsed.planningChat) parsed.planningChat = [];
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
  return { projects: [], currentProjectId: null, planningChat: [], settings: defaultSettings };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    projects: [],
    currentProjectId: null,
    planningChat: [],
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

  const createProject = (title: string, premise: string) => {
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
    };
    setState(prev => ({
      ...prev,
      projects: [...prev.projects, newProject],
      currentProjectId: newProject.id
    }));
    return newProject;
  };

  const deleteProject = (id: string) => {
    setState(prev => ({
      ...prev,
      projects: prev.projects.filter(p => p.id !== id),
      currentProjectId: prev.currentProjectId === id ? null : prev.currentProjectId
    }));
  };

  const setCurrentProject = (id: string) => {
    setState(prev => ({ ...prev, currentProjectId: id }));
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

  const updatePlanningChat = (messages: { role: 'user' | 'assistant'; content: string }[]) => {
    setState(prev => ({
      ...prev,
      planningChat: messages
    }));
  };

  const updatePlanningChatConfig = (config: { projectId: string; modelId: string } | undefined) => {
    setState(prev => ({
      ...prev,
      planningChatConfig: config
    }));
  };

  const getCurrentProject = () => {
    return state.projects.find(p => p.id === state.currentProjectId);
  };

  const importState = (newState: AppState) => {
    setState(newState);
  };

  if (!isLoaded) return null; // Prevent hydration mismatch

  return (
    <StoreContext.Provider value={{ state, createProject, deleteProject, setCurrentProject, updateProject, updateSettings, updatePlanningChat, updatePlanningChatConfig, getCurrentProject, importState }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
}
