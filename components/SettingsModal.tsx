'use client';

import React, { useState, useEffect } from 'react';
import { useStore, AppState } from '@/lib/store';
import { X, Download, Upload } from 'lucide-react';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { state, updateSettings, importState, getCurrentProject } = useStore();

  const [draftingModels, setDraftingModels] = useState<{id: string, label: string}[]>([]);
  const [chatModels, setChatModels] = useState<{id: string, label: string}[]>([]);
  const [loadingDrafting, setLoadingDrafting] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);

  useEffect(() => {
    async function fetchModels() {
      setLoadingDrafting(true);
      try {
        const res = await fetch(`/api/models?provider=${state.settings.draftingProvider}`);
        const data = await res.json();
        if (data.data) setDraftingModels(data.data);
      } catch (e) {
        console.error("Failed to fetch drafting models", e);
      } finally {
        setLoadingDrafting(false);
      }
    }
    fetchModels();
  }, [state.settings.draftingProvider]);

  useEffect(() => {
    async function fetchModels() {
      setLoadingChat(true);
      try {
        const res = await fetch(`/api/models?provider=${state.settings.chatProvider}`);
        const data = await res.json();
        if (data.data) setChatModels(data.data);
      } catch (e) {
        console.error("Failed to fetch chat models", e);
      } finally {
        setLoadingChat(false);
      }
    }
    fetchModels();
  }, [state.settings.chatProvider]);

  const handleExport = () => {
    const dateStr = new Date().toISOString().split('T')[0];
    const title = `autonovel_backup_${dateStr}`;

    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (typeof result === 'string') {
          const parsed = JSON.parse(result) as AppState;
          if (parsed && parsed.projects) {
            importState(parsed);
            alert('Project data imported successfully!');
          } else {
            alert('Invalid backup file format.');
          }
        }
      } catch (err) {
        alert('Failed to parse backup file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50 shrink-0">
          <h2 className="text-sm font-semibold text-gray-700">Settings & Guardrails</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-md text-gray-500">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          {/* Section: Data Management */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-gray-100 pb-2">Data Management</h3>

            <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
              <div>
                <h3 className="text-sm font-medium text-gray-800">Auto-save to Local Disk</h3>
                <p className="text-xs text-gray-500">Continuously backup your novels to the local project folder (`data/autonovel_state.json`).</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={state.settings.autoSaveToDisk} onChange={(e) => updateSettings({ autoSaveToDisk: e.target.checked })} />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-md transition-colors"
              >
                <Download size={14} /> Export Backup (JSON)
              </button>
              <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 shadow-sm hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-md transition-colors cursor-pointer">
                <Upload size={14} /> Import Backup (JSON)
                <input type="file" accept=".json" className="hidden" onChange={handleImport} />
              </label>
            </div>
          </div>

          {/* Section: Drafting Engine */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-gray-100 pb-2">Drafting Engine (Writing & Outlines)</h3>

            <div className="space-y-3 p-3 bg-white border border-gray-200 rounded-lg">
              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">AI Provider</label>
                <select
                  value={state.settings.draftingProvider}
                  onChange={(e) => {
                    const newProvider = e.target.value as AppState['settings']['draftingProvider'];
                    let defaultModel = state.settings.draftingModel;
                    if (newProvider === 'gemini') defaultModel = 'gemini-2.5-flash';
                    if (newProvider === 'anthropic') defaultModel = 'claude-3-5-sonnet-20241022';
                    if (newProvider === 'openrouter') defaultModel = 'google/gemma-4-31b-it:free';
                    if (newProvider === 'local') defaultModel = 'local-model';

                    updateSettings({ draftingProvider: newProvider, draftingModel: defaultModel });
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="local">Local Inference (LM Studio, Ollama, etc.)</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">Ensure you have the correct API keys in your `.env` file for cloud providers.</p>
              </div>

              {state.settings.draftingProvider === 'local' && (
                <div className="pt-2 border-t border-gray-100">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Local Inference API URL</label>
                  <input
                    type="text"
                    value={state.settings.apiUrl}
                    onChange={(e) => updateSettings({ apiUrl: e.target.value })}
                    placeholder="http://127.0.0.1:1234/v1"
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">OpenAI-compatible endpoint (e.g. LM Studio: http://127.0.0.1:1234/v1)</p>
                </div>
              )}
            </div>

            <div>
              <label className="flex justify-between items-center text-xs font-semibold text-gray-500 mb-1">
                <span>Model Name</span>
                {loadingDrafting && <span className="text-[10px] text-indigo-400 animate-pulse">Fetching...</span>}
              </label>
              <input
                type="text"
                list="drafting-model-suggestions"
                value={state.settings.draftingModel}
                onChange={(e) => updateSettings({ draftingModel: e.target.value })}
                placeholder="Model ID or Alias (e.g., gemini-2.5-flash)"
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <datalist id="drafting-model-suggestions">
                {draftingModels.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </datalist>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Base System Prompt</label>
              <textarea
                value={state.settings.systemPrompt}
                onChange={(e) => updateSettings({ systemPrompt: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y font-mono text-xs"
              />
            </div>
          </div>

          {/* Section: Chat Engine */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-gray-100 pb-2">Chat Engine (Planning Tab)</h3>

            <div className="space-y-3 p-3 bg-white border border-gray-200 rounded-lg">
              <div>
                <label className="block text-xs font-semibold text-gray-800 mb-1">AI Provider</label>
                <select
                  value={state.settings.chatProvider}
                  onChange={(e) => {
                    const newProvider = e.target.value as AppState['settings']['chatProvider'];
                    let defaultModel = state.settings.chatModel;
                    if (newProvider === 'gemini') defaultModel = 'gemini-2.5-flash';
                    if (newProvider === 'anthropic') defaultModel = 'claude-3-5-sonnet-20241022';
                    if (newProvider === 'openrouter') defaultModel = 'google/gemma-4-31b-it:free';
                    if (newProvider === 'local') defaultModel = 'local-model';

                    updateSettings({ chatProvider: newProvider, chatModel: defaultModel });
                  }}
                  className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="local">Local Inference (LM Studio, Ollama, etc.)</option>
                </select>
              </div>

              {state.settings.chatProvider === 'local' && (
                <div className="pt-2 border-t border-gray-100">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Local Inference API URL (Uses same as drafting)</label>
                  <input
                    type="text"
                    value={state.settings.apiUrl}
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 text-gray-500"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="flex justify-between items-center text-xs font-semibold text-gray-500 mb-1">
                <span>Model Name</span>
                {loadingChat && <span className="text-[10px] text-indigo-400 animate-pulse">Fetching...</span>}
              </label>
              <input
                type="text"
                list="chat-model-suggestions"
                value={state.settings.chatModel}
                onChange={(e) => updateSettings({ chatModel: e.target.value })}
                placeholder="Model ID or Alias"
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              <datalist id="chat-model-suggestions">
                {chatModels.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </datalist>
            </div>
          </div>

          {/* Section: Guardrails */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-gray-100 pb-2">Writing Guardrails</h3>
            <p className="text-xs text-gray-500 mb-2">These act as the &quot;immune system&quot; during drafting, preventing the model from sounding like AI slop.</p>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">1. CRAFT.md Rules</label>
              <textarea
                value={state.settings.craftRules}
                onChange={(e) => updateSettings({ craftRules: e.target.value })}
                rows={3}
                placeholder="Show, don't tell..."
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">2. ANTI-SLOP.md (Banned Words)</label>
              <textarea
                value={state.settings.antiSlop}
                onChange={(e) => updateSettings({ antiSlop: e.target.value })}
                rows={4}
                placeholder="Avoid words like testament, tapestry, delve..."
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">3. ANTI-PATTERNS.md (Structural Bans)</label>
              <textarea
                value={state.settings.antiPatterns}
                onChange={(e) => updateSettings({ antiPatterns: e.target.value })}
                rows={4}
                placeholder="Do not end chapters with rhetorical questions..."
                className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y font-mono text-xs"
              />
            </div>
          </div>

        </div>

        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-md hover:bg-blue-600 shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
