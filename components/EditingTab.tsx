'use client';

import React, { useState, useRef } from 'react';
import { NovelProject, useStore } from '@/lib/store';
import { Loader2, BookOpen, Activity, MessageSquare, Zap, Repeat, Search, CheckCircle, Wand2, Check, X, Download, UserCheck } from 'lucide-react';
import { analyzeManuscript } from '@/lib/inference';

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

function replaceFuzzy(source: string, search: string, replacement: string): string | null {
  // Normalize whitespace, newlines, and quotes for comparison
  const normalize = (str: string) =>
    str
      .replace(/\r\n/g, '\n')
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

  const normSource = normalize(source);
  const normSearch = normalize(search);

  if (!normSource.includes(normSearch)) {
    return null;
  }

  // If exact match, use standard replace
  if (source.includes(search)) {
    return source.replace(search, replacement);
  }

  // Create sliding/flexible regex match
  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const regexStr = escapeRegExp(search)
    .replace(/\\\s+/g, '\\s+') // Match any whitespace
    .replace(/['’]/g, "['’]")  // Match straight/curly single quotes
    .replace(/["“”]/g, '["“”]'); // Match straight/curly double quotes

  try {
    const regex = new RegExp(regexStr);
    if (regex.test(source)) {
      return source.replace(regex, replacement);
    }
  } catch (e) {
    // Fallback
  }

  return null;
}

function findFuzzyMatchIndices(source: string, search: string): { start: number; end: number } | null {
  if (source.includes(search)) {
    const start = source.indexOf(search);
    return { start, end: start + search.length };
  }
  
  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexStr = escapeRegExp(search)
    .replace(/\\\s+/g, '\\s+')
    .replace(/['’]/g, "['’]")
    .replace(/["“”]/g, '["“”]');
    
  try {
    const regex = new RegExp(regexStr);
    const match = source.match(regex);
    if (match && match.index !== undefined) {
      return { start: match.index, end: match.index + match[0].length };
    }
  } catch (e) {
    // ignore
  }
  return null;
}

type EditingTabProps = {
  project: NovelProject;
  effectiveSystemPrompt: string;
  seriesContext: any;
};

type ToolType = 'readability' | 'pacing' | 'dialogue' | 'cliches' | 'repetitiveness' | 'inconsistencies' | 'grammar' | 'betaReader' | 'full';

export function EditingTab({ project, effectiveSystemPrompt, seriesContext }: EditingTabProps) {
  const { state, updateProject } = useStore();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [suggestedEdits, setSuggestedEdits] = useState<{ id: string; originalText: string; newText: string; chapterNumber: number; explanation: string; applied: boolean }[]>([]);
  const [currentTool, setCurrentTool] = useState<ToolType | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  const draftedChapters = project.chapters.filter(c => c.status === 'drafted' && c.content);

  const handleAnalyze = async (tool: ToolType) => {
    if (draftedChapters.length === 0) {
      setError("You need to draft at least one chapter before analyzing.");
      return;
    }
    
    setCurrentTool(tool);
    setLoading(true);
    setError(null);
    setReport(null);
    setSuggestedEdits([]);

    try {
      const endpointURL = state.settings.editingProvider === 'local' ? state.settings.apiUrl : '/api';
      
      const result = await analyzeManuscript(
        endpointURL,
        state.settings.editingModel,
        effectiveSystemPrompt,
        project,
        draftedChapters,
        tool,
        state.settings.editingProvider,
        seriesContext,
        project.genre,
        state.settings.antiSlop
      );

      setReport(result.report);
      if (result.suggestedEdits && result.suggestedEdits.length > 0) {
        setSuggestedEdits(result.suggestedEdits.map((edit: any, idx: number) => ({ ...edit, id: `edit-${idx}`, applied: false })));
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const applyEdit = (editId: string) => {
    const edit = suggestedEdits.find(e => e.id === editId);
    if (!edit || edit.applied) return;

    const chapterToUpdate = project.chapters.find(c => c.chapterNumber === edit.chapterNumber);
    if (!chapterToUpdate || !chapterToUpdate.content) {
        setEditErrors(prev => ({ ...prev, [editId]: `Could not find chapter ${edit.chapterNumber} to apply the edit.` }));
        return;
    }

    const matchIndices = findFuzzyMatchIndices(chapterToUpdate.content, edit.originalText);

    const replaced = replaceFuzzy(chapterToUpdate.content, edit.originalText, edit.newText);
    if (replaced === null) {
        setEditErrors(prev => ({ ...prev, [editId]: `Could not find the original text in Chapter ${edit.chapterNumber}. It may have been modified.` }));
        return;
    }

    updateProject(project.id, {
        chapters: project.chapters.map(c => c.chapterNumber === edit.chapterNumber ? { ...c, content: replaced } : c)
    });

    setSuggestedEdits(prev => prev.map(e => e.id === editId ? { ...e, applied: true } : e));
    setEditErrors(prev => {
        const copy = { ...prev };
        delete copy[editId];
        return copy;
    });

    // Scroll parent view to show the replaced text, focus it, and highlight/select the new text
    setTimeout(() => {
        const chapEl = document.getElementById(`chap-${edit.chapterNumber}`);
        if (chapEl) {
            chapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            const textarea = chapEl.querySelector('textarea') as HTMLTextAreaElement | null;
            if (textarea && matchIndices) {
                textarea.focus();
                // Select the new replacement text
                const newLength = edit.newText.length;
                textarea.setSelectionRange(matchIndices.start, matchIndices.start + newLength);
            }
        }
    }, 100);
  };

  const handleDownloadReport = () => {
    if (!report) return;
    
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const sanitizedTitle = (project.title || 'untitled-manuscript')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const toolName = currentTool || 'full';
    const filename = `${sanitizedTitle}-analysis-${toolName}.md`;
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const tools = [
    { id: 'readability', label: 'Readability', icon: BookOpen, desc: 'Analyze reading level and flow.' },
    { id: 'pacing', label: 'Pacing', icon: Activity, desc: 'Check scene length and narrative speed.' },
    { id: 'dialogue', label: 'Dialogue vs. Narrative', icon: MessageSquare, desc: 'Check the balance of dialogue to action.' },
    { id: 'cliches', label: 'Cliches', icon: Zap, desc: 'Find and rewrite overused tropes.' },
    { id: 'repetitiveness', label: 'Repetitiveness', icon: Repeat, desc: 'Find repeated words and reveals.' },
    { id: 'inconsistencies', label: 'Inconsistencies', icon: Search, desc: 'Check against the Story So Far.' },
    { id: 'grammar', label: 'Spelling & Grammar', icon: CheckCircle, desc: 'Fix mechanical errors.' },
    { id: 'betaReader', label: 'Beta Reader', icon: UserCheck, desc: 'Get genre-specific audience feedback and identify drop-off risks.' }
  ] as const;

  if (draftedChapters.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 h-full">
        <Wand2 className="w-12 h-12 mb-4 opacity-20 mx-auto" />
        <h2 className="text-xl font-medium text-slate-700 mb-2">No Manuscript to Edit</h2>
        <p>Draft at least one chapter in the Drafting tab before running the editor.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden bg-white/40 border-t border-white/40 rounded-b-2xl">
      
      {/* Left Panel: Continuous Manuscript */}
      <div className="flex-1 overflow-y-auto bg-white/60 border-r border-white/40 shadow-sm relative custom-scrollbar">
        <div className="max-w-3xl mx-auto py-12 px-8 space-y-12">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-serif font-bold text-slate-800">{project.title || 'Untitled Manuscript'}</h1>
            </div>
            
            {draftedChapters.map((chapter) => {
                const outlineDef = project.outline.find(o => o.chapterNumber === chapter.chapterNumber);
                return (
                    <div key={chapter.id} className="relative group scroll-mt-8" id={`chap-${chapter.chapterNumber}`}>
                        <div className="absolute -left-12 top-0 text-slate-300 font-medium text-xl opacity-0 group-hover:opacity-100 transition-opacity select-none">
                            {chapter.chapterNumber}
                        </div>
                        <h2 className="text-xl font-serif font-semibold text-slate-800 mb-4">{outlineDef?.title || `Chapter ${chapter.chapterNumber}`}</h2>
                        
                        <textarea
                            className="w-full resize-none outline-none bg-transparent font-serif text-lg leading-relaxed text-slate-700 overflow-hidden"
                            value={chapter.content}
                            onChange={(e) => {
                                updateProject(project.id, {
                                    chapters: project.chapters.map(c => c.chapterNumber === chapter.chapterNumber ? { ...c, content: e.target.value } : c)
                                })
                            }}
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = target.scrollHeight + 'px';
                            }}
                            ref={(el) => {
                                if (el) {
                                    el.style.height = 'auto';
                                    el.style.height = el.scrollHeight + 'px';
                                }
                            }}
                        />
                    </div>
                );
            })}
        </div>
      </div>

      {/* Right Panel: Tools & Analysis */}
      <div className="w-full lg:w-96 flex flex-row bg-slate-50/80 border-l border-slate-200 h-full overflow-hidden">
        
        {/* Report Area */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar h-full">
            {error && (
                <div className="p-3 mb-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg">
                    {error}
                </div>
            )}
            
            {loading && !error && (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                    <Loader2 className="h-8 w-8 animate-spin mb-4 text-indigo-500" />
                    <p className="text-sm">Analyzing manuscript...</p>
                    <p className="text-xs mt-2 text-slate-400">This may take a minute or two.</p>
                </div>
            )}

            {!loading && report && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="prose prose-sm max-w-none prose-slate mb-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm leading-relaxed text-slate-700">
                        {renderMarkdown(report)}
                    </div>

                    <button
                        onClick={handleDownloadReport}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 mb-6 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-800 text-sm font-medium rounded-xl border border-slate-200 transition-all shadow-sm active:scale-[0.98]"
                    >
                        <Download size={15} className="text-slate-500" />
                        Download Report
                    </button>

                    {suggestedEdits.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Suggested Edits</h4>
                            {suggestedEdits.map((edit) => (
                                <div key={edit.id} className={`p-3 rounded-xl border shadow-sm transition-all ${edit.applied ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-indigo-200'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">Chapter {edit.chapterNumber}</span>
                                        {edit.applied && <span className="text-xs font-medium text-emerald-600 flex items-center gap-1"><Check size={12}/> Applied</span>}
                                    </div>
                                    <p className="text-xs text-slate-600 mb-2 italic bg-slate-50 p-2 rounded border border-slate-100 line-through decoration-slate-400">{edit.originalText}</p>
                                    <p className="text-sm font-serif text-slate-800 mb-3 font-medium bg-indigo-50/50 p-2 rounded border border-indigo-100">{edit.newText}</p>
                                    <p className="text-[10px] text-slate-500 mb-3">{edit.explanation}</p>
                                    
                                    {!edit.applied && (
                                        <button
                                            onClick={() => applyEdit(edit.id)}
                                            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors"
                                        >
                                            <Check size={14} /> Accept & Replace
                                        </button>
                                    )}

                                    {editErrors[edit.id] && (
                                        <p className="text-[10px] text-red-600 font-medium mt-2 bg-red-50 p-2 rounded border border-red-100 animate-in fade-in duration-200">
                                            {editErrors[edit.id]}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {!loading && !report && !error && (
                <div className="text-center py-12 text-slate-400">
                    <p className="text-sm">Select a tool on the right to analyze your manuscript.</p>
                </div>
            )}
        </div>

        {/* Tools Palette (Vertical Sidebar on the right) */}
        <div className="w-14 flex flex-col items-center py-4 bg-white/60 border-l border-slate-200 h-full shrink-0 gap-2 relative">
            {/* Full Analysis Button */}
            <button
                onClick={() => handleAnalyze('full')}
                disabled={loading}
                className={`group relative w-10 h-10 flex items-center justify-center rounded-xl transition-all shadow-sm disabled:opacity-50 shrink-0 ${
                    currentTool === 'full'
                        ? 'bg-indigo-600 text-white border border-indigo-700'
                        : 'bg-slate-800 hover:bg-slate-900 text-white border border-slate-900'
                }`}
            >
                {loading && currentTool === 'full' ? (
                    <Loader2 size={18} className="animate-spin text-white" />
                ) : (
                    <Wand2 size={18} />
                )}

                {/* Tooltip */}
                <div className="absolute right-full mr-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 flex items-center">
                    <div className="bg-slate-900/95 backdrop-blur-sm text-white text-[11px] rounded-lg px-3 py-1.5 shadow-xl flex flex-col items-start gap-0.5 border border-slate-800">
                        <span className="font-semibold text-slate-100 whitespace-nowrap">Full Analysis</span>
                        <span className="text-[10px] text-slate-400 font-normal leading-normal whitespace-nowrap">Generate Full Analysis</span>
                    </div>
                    <div className="w-1.5 h-1.5 bg-slate-900/95 rotate-45 -ml-[3px] border-r border-t border-slate-800" />
                </div>
            </button>

            {/* Divider */}
            <div className="w-8 h-[1px] bg-slate-200 my-1 shrink-0" />

            {/* Individual Tool Buttons */}
            <div className="flex flex-col gap-2 shrink-0">
                {tools.map((tool) => {
                    const isSelected = currentTool === tool.id;
                    const isLoadingThis = loading && currentTool === tool.id;
                    return (
                        <button
                            key={tool.id}
                            onClick={() => handleAnalyze(tool.id)}
                            disabled={loading}
                            className={`group relative w-10 h-10 flex items-center justify-center rounded-xl border transition-all disabled:opacity-50 ${
                                isSelected
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm'
                                    : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 text-slate-600 hover:text-indigo-600'
                            }`}
                        >
                            {isLoadingThis ? (
                                <Loader2 size={18} className="animate-spin text-indigo-600" />
                            ) : (
                                <tool.icon size={18} />
                            )}

                            {/* Tooltip */}
                            <div className="absolute right-full mr-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 flex items-center">
                                <div className="bg-slate-900/95 backdrop-blur-sm text-white text-[11px] rounded-lg px-3 py-1.5 shadow-xl flex flex-col items-start gap-0.5 border border-slate-800">
                                    <span className="font-semibold text-slate-100 whitespace-nowrap">{tool.label}</span>
                                    <span className="text-[10px] text-slate-400 font-normal leading-normal whitespace-nowrap">{tool.desc}</span>
                                </div>
                                <div className="w-1.5 h-1.5 bg-slate-900/95 rotate-45 -ml-[3px] border-r border-t border-slate-800" />
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
      </div>
    </div>
  );
}
