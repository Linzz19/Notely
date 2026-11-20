import React from 'react';
import {
  ArrowUpDown,
  Check,
  Copy,
  FileText,
  Plus,
  Search,
  X,
} from 'lucide-react';
import {
  SnippetTemplate,
  SortOption,
  TemplateCategory,
} from '../types/workspace';
import { extractVariables, getSnippetPreview } from '../utils/templateEngine';

interface TemplateListPaneProps {
  templates: SnippetTemplate[];
  categories: TemplateCategory[];
  selectedTemplateId: string | null;
  copiedTemplateId: string | null;
  searchQuery: string;
  activeCategoryLabel: string;
  activeTag: string | null;
  sortBy: SortOption;
  onSearchChange: (query: string) => void;
  onSortChange: (sort: SortOption) => void;
  onClearFilters: () => void;
  onSelectTemplate: (templateId: string) => void;
  onQuickCopyTemplate: (template: SnippetTemplate) => void;
  onCreateTemplate: () => void;
}

export const TemplateListPane: React.FC<TemplateListPaneProps> = ({
  templates,
  categories,
  selectedTemplateId,
  copiedTemplateId,
  searchQuery,
  activeCategoryLabel,
  activeTag,
  sortBy,
  onSearchChange,
  onSortChange,
  onClearFilters,
  onSelectTemplate,
  onQuickCopyTemplate,
  onCreateTemplate,
}) => {
  const categoryNameMap = new Map(categories.map((c) => [c.id, c.name]));
  const hasFilters = Boolean(searchQuery.trim() || activeTag || activeCategoryLabel !== 'All Templates');

  return (
    <section
      aria-label="Templates list"
      className="w-full md:w-[340px] lg:w-[368px] shrink-0 h-full flex flex-col bg-white dark:bg-[#202023] border-r border-slate-200 dark:border-[#2E2E32]"
    >
      {/* Search & Primary Action Header */}
      <div className="p-3 border-b border-slate-200 dark:border-[#2E2E32] space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter by title, text, or #tag..."
              aria-label="Filter templates"
              className="w-full h-9 pl-8 pr-7 text-[13px] bg-[#F8FAFC] dark:bg-[#18181B] border border-slate-200 dark:border-[#2E2E32] rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#0067C0] dark:focus:border-[#4CC2FF] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onCreateTemplate}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-[#0067C0] hover:bg-[#005A9E] dark:bg-[#4CC2FF] dark:hover:bg-[#38B6F8] text-white dark:text-[#0F172A] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#0067C0] dark:focus-visible:ring-[#4CC2FF]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>

        {/* Context & Sort Row */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="min-w-0 flex items-center gap-1.5 text-slate-500 dark:text-slate-400 truncate">
            <span className="font-medium text-slate-700 dark:text-slate-200 truncate">
              {activeCategoryLabel}
            </span>
            {activeTag && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#0067C0] dark:text-[#4CC2FF] font-medium truncate">
                  #{activeTag}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{templates.length}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <ArrowUpDown className="w-3 h-3 text-slate-400" />
            <select
              aria-label="Sort templates"
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              className="bg-transparent text-xs font-medium text-slate-600 dark:text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="updated" className="bg-white dark:bg-[#202023]">
                Recent
              </option>
              <option value="usage" className="bg-white dark:bg-[#202023]">
                Most Copied
              </option>
              <option value="title" className="bg-white dark:bg-[#202023]">
                Title A–Z
              </option>
            </select>
          </div>
        </div>
      </div>

      {/* Template Rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2A2A2E]">
        {templates.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-[#28282C] flex items-center justify-center text-slate-400 mb-3">
              <FileText className="w-5 h-5" />
            </div>
            <p className="font-display text-sm font-semibold text-slate-800 dark:text-slate-200">
              {hasFilters ? 'No matching templates' : 'No templates yet'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-[240px] leading-relaxed">
              {hasFilters
                ? 'Try adjusting your search keywords or clearing the active category/tag filter.'
                : 'Store your daily email replies, chat snippets, and documentation blocks here.'}
            </p>
            <div className="mt-4 flex items-center gap-2">
              {hasFilters && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="px-3 py-1.5 rounded-md border border-slate-200 dark:border-[#3A3A3F] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  Clear Filters
                </button>
              )}
              <button
                type="button"
                onClick={onCreateTemplate}
                className="px-3 py-1.5 rounded-md bg-[#0067C0] dark:bg-[#4CC2FF] text-white dark:text-[#0F172A] text-xs font-semibold hover:opacity-95 transition-opacity"
              >
                Create Template
              </button>
            </div>
          </div>
        ) : (
          templates.map((tpl) => {
            const isSelected = tpl.id === selectedTemplateId;
            const isCopied = tpl.id === copiedTemplateId;
            const vars = extractVariables(tpl.content);
            const catName = categoryNameMap.get(tpl.categoryId) || 'Unassigned';
            const preview = getSnippetPreview(tpl.content, 115);

            return (
              <div
                key={tpl.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectTemplate(tpl.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectTemplate(tpl.id);
                  }
                }}
                className={`group relative px-3.5 py-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0067C0] dark:focus-visible:ring-[#4CC2FF] ${
                  isSelected
                    ? 'bg-[#0067C0]/[0.06] dark:bg-[#4CC2FF]/[0.09]'
                    : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3
                    className={`font-display text-[13.5px] font-semibold leading-snug truncate ${
                      isSelected
                        ? 'text-[#0067C0] dark:text-[#4CC2FF]'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {tpl.title || 'Untitled Template'}
                  </h3>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickCopyTemplate(tpl);
                    }}
                    title={vars.length > 0 ? 'Fill variables & copy' : 'Copy formatted template'}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isCopied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-[#2C2C30] text-slate-700 dark:text-slate-200 hover:bg-[#0067C0] hover:text-white dark:hover:bg-[#4CC2FF] dark:hover:text-[#0F172A]'
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>{vars.length > 0 ? 'Fill' : 'Copy'}</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                  {preview || 'Empty template body'}
                </p>

                {/* Unboxed metadata row (Zero-pill discipline) */}
                <div className="mt-2 flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    {catName}
                  </span>
                  {tpl.tags.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate max-w-[160px]">
                        {tpl.tags.slice(0, 3).map((t) => `#${t}`).join(' ')}
                        {tpl.tags.length > 3 ? ` +${tpl.tags.length - 3}` : ''}
                      </span>
                    </>
                  )}
                  {vars.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-[#0067C0] dark:text-[#4CC2FF]">
                        {vars.length} {vars.length === 1 ? 'var' : 'vars'}
                      </span>
                    </>
                  )}
                  {tpl.usageCount > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{tpl.usageCount}×</span>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
