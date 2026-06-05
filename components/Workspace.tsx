'use client';

import React, { useState } from 'react';
import { useStore } from '@/lib/store';
import { generateSynopsis, generateCharacters, generateOutline, continueOutline, generateChapter, generateTitle } from '@/lib/inference';
import { Loader2, Play, Check, ChevronRight, FileText, Users, ListTree, BookOpen, PenTool, Wand2, Download, Plus, Trash2 } from 'lucide-react';

export function Workspace() {
  const { state, getCurrentProject, updateProject } = useStore();
  const project = getCurrentProject();
  const [loading, setLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'foundation' | 'drafting'>('foundation');
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent h-full">
        <div className="text-center max-w-sm">
          <BookOpen className="mx-auto h-12 w-12 text-slate-400 mb-4 opacity-50" />
          <h2 className="text-xl font-medium text-slate-900">No novel selected</h2>
          <p className="text-sm text-slate-600 mt-2">Select a project from the sidebar or create a new one to begin writing.</p>
        </div>
      </div>
    );
  }

  const handleGenerateSynopsis = async () => {
    setLoading('synopsis');
    setError(null);
    try {
      const endpointURL = state.settings.provider === 'local' ? state.settings.apiUrl : '/api';
      const result = await generateSynopsis(endpointURL, state.settings.model, state.settings.systemPrompt, project.title, project.premise, state.settings.provider);
      updateProject(project.id, { synopsis: result });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleGenerateCharacters = async () => {
    setLoading('characters');
    setError(null);
    try {
      const endpointURL = state.settings.provider === 'local' ? state.settings.apiUrl : '/api';
      const result = await generateCharacters(endpointURL, state.settings.model, state.settings.systemPrompt, project.synopsis, state.settings.provider);
      const charactersWithIds = result.map((c: any) => ({
        id: c.id || crypto.randomUUID(),
        name: c.name || '',
        role: c.role || '',
        description: c.description || ''
      }));
      updateProject(project.id, { characters: charactersWithIds });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleGenerateOutline = async () => {
    setLoading('outline');
    setError(null);
    try {
      const endpointURL = state.settings.provider === 'local' ? state.settings.apiUrl : '/api';
      const result = await generateOutline(endpointURL, state.settings.model, state.settings.systemPrompt, project.synopsis, project.characters, project.targetChapterCount || 10, project.outlineTemplate || '', state.settings.provider);

      // Initialize chapter data based on outline
      const newChapters = result.map((c: any) => ({
        id: crypto.randomUUID(),
        chapterNumber: c.chapterNumber,
        content: '',
        status: 'pending'
      }));

      updateProject(project.id, { outline: result, chapters: newChapters });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleContinueOutline = async () => {
    setLoading('continue-outline');
    setError(null);
    try {
      const endpointURL = state.settings.provider === 'local' ? state.settings.apiUrl : '/api';
      const newOutlineData = await continueOutline(endpointURL, state.settings.model, state.settings.systemPrompt, project.synopsis, project.characters, project.outline, project.outlineTemplate || '', state.settings.provider);

      const combinedOutline = [...project.outline, ...newOutlineData];

      // Initialize chapter data based on new outline items
      const newChapters = newOutlineData.map((c: any) => ({
        id: crypto.randomUUID(),
        chapterNumber: c.chapterNumber,
        content: '',
        status: 'pending'
      }));

      updateProject(project.id, {
        outline: combinedOutline,
        chapters: [...project.chapters, ...newChapters]
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleGenerateChapter = async (chapNum: number) => {
    setLoading(`chapter-${chapNum}`);
    setError(null);
    updateProject(project.id, {
      chapters: project.chapters.map(c => c.chapterNumber === chapNum ? { ...c, status: 'generating' } : c)
    });

    try {
      const endpointURL = state.settings.provider === 'local' ? state.settings.apiUrl : '/api';
      const guardrails = {
        craft: state.settings.craftRules,
        antiSlop: state.settings.antiSlop,
        antiPatterns: state.settings.antiPatterns,
      };
      const currentChapter = project.chapters.find(c => c.chapterNumber === chapNum);
      const existingContent = currentChapter?.content || undefined;
      const result = await generateChapter(endpointURL, state.settings.model, state.settings.systemPrompt, project.synopsis, project.outline, chapNum, state.settings.provider, guardrails, existingContent, project.povType || 'First Person (I/me)');
      updateProject(project.id, {
        chapters: project.chapters.map(c => c.chapterNumber === chapNum ? { ...c, content: result, status: 'drafted' } : c)
      });
    } catch (e: any) {
      setError(e.message);
      updateProject(project.id, {
        chapters: project.chapters.map(c => c.chapterNumber === chapNum ? { ...c, status: 'pending' } : c)
      });
    } finally {
      setLoading(null);
    }
  };

  const handleGenerateTitle = async () => {
    setLoading('title');
    setError(null);
    try {
      const endpointURL = state.settings.provider === 'local' ? state.settings.apiUrl : '/api';
      const result = await generateTitle(endpointURL, state.settings.model, state.settings.systemPrompt, project.synopsis, state.settings.provider);
      updateProject(project.id, { title: result });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleDownloadDraft = () => {
    let content = `# ${project.title}\n\n`;
    const sortedChapters = [...project.chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
    for (const c of sortedChapters) {
      const outlineInfo = project.outline.find(o => o.chapterNumber === c.chapterNumber);
      content += `## Chapter ${c.chapterNumber}: ${outlineInfo?.title || ''}\n\n`;
      content += `${c.content}\n\n`;
    }

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title || 'novel-draft'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadChapter = (chapNum: number, title: string, content: string) => {
    const filename = `Chapter_${chapNum}_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hasChapters = project.chapters.length > 0;

  return (
    <div className="flex-1 flex flex-col h-full bg-transparent relative overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-white/20 flex items-center justify-between px-6 shrink-0 bg-white/20 z-10 w-full pl-6">
        <div className="flex-1 flex max-w-lg items-center relative group">
          <input
            type="text"
            value={project.title}
            onChange={e => updateProject(project.id, { title: e.target.value })}
            className="text-lg font-medium text-slate-900 focus:outline-none placeholder-slate-400 bg-transparent w-full truncate"
            placeholder="Novel Title"
          />
          {project.synopsis && (
            <button
              onClick={handleGenerateTitle}
              disabled={loading === 'title'}
              className="ml-2 p-1.5 shrink-0 text-indigo-500 hover:bg-white/40 rounded transition-colors disabled:opacity-50 opacity-0 group-hover:opacity-100"
              title="Suggest Title"
            >
              {loading === 'title' ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {hasChapters && (
            <button
              onClick={handleDownloadDraft}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500 text-white hover:bg-indigo-600 text-xs font-medium rounded-lg transition-colors shadow-sm"
              title="Download Full Draft"
            >
              <Download size={14} /> Download Draft
            </button>
          )}
          <div className="flex items-center gap-1 bg-white/20 p-1 rounded-lg border border-white/20">
            <button
              onClick={() => setActiveTab('foundation')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === 'foundation' ? 'bg-white/60 shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-white/20'}`}
            >
              Foundation
            </button>
            <button
              onClick={() => setActiveTab('drafting')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activeTab === 'drafting' ? 'bg-white/60 shadow-sm text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-white/20'}`}
            >
              Drafting
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-md">
          {error}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-8">

        {activeTab === 'foundation' && (
          <div className="max-w-3xl mx-auto space-y-12 pb-12">

            {/* Step 1: Premise */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-blue-50 text-blue-500 flex items-center justify-center"><FileText size={14} /></div>
                <h3 className="font-medium text-slate-900">1. Premise</h3>
              </div>
              <textarea
                value={project.premise}
                onChange={e => updateProject(project.id, { premise: e.target.value })}
                placeholder="What is your novel about? (e.g. A young programmer discovers her code can alter reality...)"
                className="w-full h-24 p-3 border border-white/40 rounded-lg text-sm bg-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white/60 shadow-sm resize-none"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleGenerateSynopsis}
                  disabled={loading === 'synopsis' || !project.premise}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
                >
                  {loading === 'synopsis' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  Generate Synopsis
                </button>
              </div>
            </section>

            {/* Step 2: Synopsis */}
            {project.synopsis && (
              <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-purple-50 text-purple-500 flex items-center justify-center"><FileText size={14} /></div>
                  <h3 className="font-medium text-slate-900">2. Expanded Synopsis</h3>
                </div>
                <textarea
                  value={project.synopsis}
                  onChange={e => updateProject(project.id, { synopsis: e.target.value })}
                  className="w-full h-48 p-3 border border-white/40 rounded-lg text-sm bg-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white/60 shadow-sm resize-none"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleGenerateCharacters}
                    disabled={loading === 'characters' || !project.synopsis}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {loading === 'characters' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    Generate Characters
                  </button>
                </div>
              </section>
            )}

            {/* Step 3: Characters */}
            {project.synopsis && (
              <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-emerald-50 text-emerald-500 flex items-center justify-center">
                      <Users size={14} />
                    </div>
                    <h3 className="font-medium text-slate-900">3. Cast</h3>
                  </div>
                  {project.characters.length > 0 && (
                    <button
                      onClick={() => {
                        const newChar = [
                          ...project.characters,
                          { id: crypto.randomUUID(), name: '', role: 'Supporting', description: '' }
                        ];
                        updateProject(project.id, { characters: newChar });
                      }}
                      className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 rounded-lg"
                    >
                      <Plus size={14} /> Add Character
                    </button>
                  )}
                </div>

                {project.characters.length === 0 ? (
                  <div className="p-8 border border-dashed border-white/60 rounded-xl bg-white/10 text-center">
                    <Users className="mx-auto h-8 w-8 text-slate-400 mb-2 opacity-50" />
                    <p className="text-xs text-slate-600 mb-4">No characters defined for this novel yet.</p>
                    <div className="flex justify-center gap-3">
                      <button
                        onClick={handleGenerateCharacters}
                        disabled={loading === 'characters'}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {loading === 'characters' ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                        Generate from Synopsis
                      </button>
                      <button
                        onClick={() => {
                          updateProject(project.id, {
                            characters: [{ id: crypto.randomUUID(), name: '', role: 'Protagonist', description: '' }]
                          });
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/50 hover:bg-white/80 border border-white/60 text-slate-800 text-xs font-medium rounded-lg transition-colors shadow-sm"
                      >
                        <Plus size={12} /> Add Manually
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3">
                      {project.characters.map((c, i) => (
                        <div key={c.id || i} className="p-4 border border-white/40 rounded-lg bg-white/30 shadow-sm transition-all hover:bg-white/40">
                          <div className="flex justify-between items-center mb-1 gap-4">
                            <input
                              className="font-semibold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none w-1/2 px-1 py-0.5 rounded transition-colors"
                              value={c.name}
                              placeholder="Character Name"
                              onChange={(e) => {
                                const newChar = [...project.characters];
                                newChar[i] = { ...newChar[i], name: e.target.value };
                                updateProject(project.id, { characters: newChar });
                              }}
                            />
                            <div className="flex items-center gap-2">
                              <input
                                className="text-xs font-medium text-indigo-700 bg-indigo-100/80 px-2.5 py-1 rounded uppercase tracking-wider outline-none border border-transparent focus:border-indigo-300 w-28 text-center transition-colors placeholder:text-indigo-400 font-sans"
                                value={c.role}
                                placeholder="ROLE"
                                onChange={(e) => {
                                  const newChar = [...project.characters];
                                  newChar[i] = { ...newChar[i], role: e.target.value };
                                  updateProject(project.id, { characters: newChar });
                                }}
                              />
                              <button
                                onClick={() => {
                                  const newChar = project.characters.filter((_, idx) => idx !== i);
                                  updateProject(project.id, { characters: newChar });
                                }}
                                className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                title="Delete Character"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <textarea
                            className="text-sm text-slate-700 bg-transparent w-full resize-none h-16 outline-none mt-2 border border-transparent hover:border-slate-200 focus:border-indigo-500/30 focus:bg-white/20 p-1 rounded transition-all"
                            value={c.description}
                            placeholder="Character description, background, and traits..."
                            onChange={(e) => {
                              const newChar = [...project.characters];
                              newChar[i] = { ...newChar[i], description: e.target.value };
                              updateProject(project.id, { characters: newChar });
                            }}
                          />
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const newChar = [
                            ...project.characters,
                            { id: crypto.randomUUID(), name: '', role: 'Supporting', description: '' }
                          ];
                          updateProject(project.id, { characters: newChar });
                        }}
                        className="flex items-center justify-center gap-2 p-3 border border-dashed border-white/60 rounded-lg hover:bg-white/30 text-slate-600 hover:text-slate-900 text-sm font-medium transition-all mt-2"
                      >
                        <Plus size={16} /> Add Another Character
                      </button>
                    </div>

                    <div className="mt-6 pt-4 border-t border-white/20">
                      <h4 className="font-medium text-slate-900 text-sm mb-2">Outline Configuration</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="flex flex-col gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Target Chapters</label>
                            <input
                              type="number"
                              min={1}
                              value={project.targetChapterCount || 10}
                              onChange={(e) => updateProject(project.id, { targetChapterCount: parseInt(e.target.value) || 10 })}
                              className="w-full px-3 py-2 border border-white/40 bg-white/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                            <p className="text-[10px] text-slate-500 mt-1">How many chapters to outline in total.</p>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Perspective (POV Type)</label>
                            <select
                              value={project.povType || 'Third Person Limited'}
                              onChange={(e) => updateProject(project.id, { povType: e.target.value })}
                              className="w-full px-3 py-2 border border-white/40 bg-white/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            >
                              <option value="First Person (I/me)">First Person (I/me)</option>
                              <option value="Third Person Limited (he/she)">Third Person Limited (he/she)</option>
                              <option value="Third Person Omniscient">Third Person Omniscient</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Structural Template (Optional)</label>
                          <textarea
                            value={project.outlineTemplate || ''}
                            onChange={(e) => updateProject(project.id, { outlineTemplate: e.target.value })}
                            placeholder="e.g., Save the Cat, Hero's Journey, Romancing the Beat... Paste your beat sheet here."
                            className="w-full px-3 py-2 border border-white/40 bg-white/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 h-24 resize-none"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">If provided, the AI will map the chapters to these beats.</p>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={handleGenerateOutline}
                          disabled={loading === 'outline'}
                          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
                        >
                          {loading === 'outline' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                          Generate Outline
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}

            {/* Step 4: Outline */}
            {project.outline.length > 0 && (
              <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <div className="flex items-center gap-2 pb-2">
                  <div className="w-6 h-6 rounded bg-amber-50 text-amber-500 flex items-center justify-center"><ListTree size={14} /></div>
                  <h3 className="font-medium text-slate-900">4. Chapter Outline</h3>
                </div>
                <div className="border-l-2 border-white/40 ml-3 pl-5 space-y-6 relative">
                  {project.outline.map((o, i) => (
                    <div key={i} className="relative">
                      <div className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-white border-2 border-indigo-400"></div>
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="font-medium text-slate-900 text-sm">Ch {o.chapterNumber}: {o.title}</h4>
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-slate-500">POV:</span>
                          <input
                            className="font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded outline-none border border-transparent focus:border-indigo-300 w-24 text-center"
                            value={o.pov || ''}
                            placeholder="Character"
                            onChange={(e) => {
                              const newOutline = [...project.outline];
                              newOutline[i].pov = e.target.value;
                              updateProject(project.id, { outline: newOutline });
                            }}
                          />
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{o.summary}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-4">
                  <button
                    onClick={handleContinueOutline}
                    disabled={loading === 'continue-outline'}
                    className="flex items-center gap-2 px-4 py-2 bg-white/40 hover:bg-white/60 border border-white/60 text-slate-800 shadow-sm text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {loading === 'continue-outline' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    Add More Chapters
                  </button>

                  <button
                    onClick={() => setActiveTab('drafting')}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200 text-sm font-medium rounded-lg transition-colors"
                  >
                    Proceed to Drafting
                    <ChevronRight size={16} />
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

        {/* Drafting Tab */}
        {activeTab === 'drafting' && project.outline.length > 0 && (
          <div className="h-full flex gap-6">

            {/* Outline List (Sidebar within Drafting) */}
            <div className="w-64 shrink-0 flex flex-col gap-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Chapters</h3>
              {project.outline.map((c) => {
                const chapData = project.chapters.find(ch => ch.chapterNumber === c.chapterNumber);
                const status = chapData?.status || 'pending';
                const isSelected = selectedChapter === c.chapterNumber;

                return (
                  <button
                    key={c.chapterNumber}
                    onClick={() => setSelectedChapter(c.chapterNumber)}
                    className={`text-left p-3 rounded-xl border text-sm transition-all ${isSelected ? 'bg-white/60 border-white/60 shadow-sm' : 'bg-white/20 border-transparent hover:bg-white/40 hover:border-white/40 text-slate-700'
                      }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium text-slate-900">Chapter {c.chapterNumber}</span>
                      {status === 'pending' && <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>}
                      {status === 'generating' && <Loader2 size={12} className="animate-spin text-indigo-500" />}
                      {status === 'drafted' && <Check size={12} className="text-emerald-500" />}
                    </div>
                    <p className="text-slate-600 text-xs truncate">{c.title}</p>
                  </button>
                );
              })}
            </div>

            {/* Chapter Editor / Viewer */}
            <div className="flex-1 bg-white/60 border border-white/60 rounded-2xl shadow-sm flex flex-col overflow-hidden">
              {selectedChapter ? (() => {
                const outDef = project.outline.find(o => o.chapterNumber === selectedChapter);
                const data = project.chapters.find(ch => ch.chapterNumber === selectedChapter);

                return (
                  <>
                    <div className="p-4 border-b border-white/40 flex items-center gap-4 bg-white/20">
                      <div className="min-w-0 flex-1">
                        <h2 className="font-medium text-slate-900 truncate">Chapter {selectedChapter}: {outDef?.title}</h2>
                        <p className="text-xs text-slate-600 mt-1 truncate">{outDef?.summary}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {data?.status === 'drafted' && data.content && (
                          <button
                            onClick={() => handleDownloadChapter(selectedChapter, outDef?.title || 'Draft', data.content)}
                            className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/40 shadow-sm hover:bg-white/30 text-slate-800 text-xs font-medium rounded-lg transition-colors"
                          >
                            <Download size={14} className="text-slate-600" />
                            Download
                          </button>
                        )}
                        <button
                          onClick={() => handleGenerateChapter(selectedChapter)}
                          disabled={loading === `chapter-${selectedChapter}`}
                          className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/40 shadow-sm hover:bg-white/30 text-slate-800 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
                        >
                          {loading === `chapter-${selectedChapter}` ? <Loader2 size={14} className="animate-spin" /> : <PenTool size={14} className="text-indigo-500" />}
                          {data?.status === 'pending' ? 'Write Chapter' : 'Rewrite'}
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-hidden p-6 relative group">
                      {loading === `chapter-${selectedChapter}` ? (
                        <div className="absolute inset-0 bg-white/40 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                          <Loader2 className="h-8 w-8 text-indigo-500 animate-spin mb-4" />
                          <p className="text-sm font-medium text-slate-700 animate-pulse">Generating Chapter {selectedChapter} via local inference...</p>
                        </div>
                      ) : null}

                      <textarea
                        value={data?.content || ''}
                        onChange={(e) => {
                          updateProject(project.id, {
                            chapters: project.chapters.map(c => c.chapterNumber === selectedChapter ? { ...c, content: e.target.value } : c)
                          })
                        }}
                        placeholder="Chapter text will appear here..."
                        className="w-full h-full resize-none outline-none font-serif text-slate-800 text-lg leading-relaxed bg-transparent custom-scrollbar whitespace-pre-wrap"
                      />
                    </div>
                  </>
                );
              })() : (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                  Select a chapter to read or generate
                </div>
              )}
            </div>

          </div>
        )}

        {activeTab === 'drafting' && project.outline.length === 0 && (
          <div className="text-center py-20">
            <p className="text-slate-600">Complete the Foundation steps to generate an outline before drafting.</p>
            <button onClick={() => setActiveTab('foundation')} className="mt-4 text-sm text-indigo-600 font-medium hover:underline">Go to Foundation</button>
          </div>
        )}

      </div>
    </div>
  );
}
