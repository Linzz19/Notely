import React, { useEffect, useMemo, useState } from 'react';
import {
  Braces,
  Copy,
  DatabaseBackup,
  GripVertical,
  HelpCircle,
  LayoutGrid,
  Monitor,
  Palette,
  Pencil,
  Search,
  Sparkles,
  X,
} from 'lucide-react';

interface GuideModalProps {
  onClose: () => void;
}

interface GuideSection {
  id: string;
  title: string;
  summary: string;
  keywords: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

export const GuideModal: React.FC<GuideModalProps> = ({ onClose }) => {
  const [activeSectionId, setActiveSectionId] = useState<string>('hierarchy');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const sections: GuideSection[] = useMemo(
    () => [
      {
        id: 'hierarchy',
        title: 'Tabs, Categories & Reordering',
        summary: 'Organize projects as Tab > Category > Template and drag to realign.',
        keywords: 'tab category template drag reorder realign rename delete tag filter',
        icon: <LayoutGrid className="w-4 h-4" />,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Project Hierarchy (Tab &gt; Category &gt; Template)
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Keep unrelated workflows separated in top-level <strong>Project Tabs</strong> (for example: Customer Support, Client Outreach, Engineering Docs). Each tab holds its own set of <strong>Categories</strong>, keyword <strong>#Tags</strong>, and <strong>Templates</strong>.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-md bg-[var(--surface-subtle)] border border-[var(--surface-border)] space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <GripVertical className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Drag to Realign Tabs &amp; Categories</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Grab any <strong>Tab</strong> in the top bar or <strong>Category</strong> in the sidebar and drag it along with your cursor. Neighbors slide aside when you cross their midpoint; release early and it glides back to its original spot.
                </p>
              </div>

              <div className="p-3.5 rounded-md bg-[var(--surface-subtle)] border border-[var(--surface-border)] space-y-1.5">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Right-Click &amp; Multi-Select Templates
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Right-click any template (or use <strong>Select</strong>, <kbd className="font-mono text-[11px] px-1 py-0.5 rounded bg-[var(--surface-frame)] border border-[var(--surface-border)]">Ctrl+Click</kbd>, or <kbd className="font-mono text-[11px] px-1 py-0.5 rounded bg-[var(--surface-frame)] border border-[var(--surface-border)]">Shift+Click</kbd>) to assign multiple templates to a category, move them to another tab, add tags, duplicate, or delete in bulk.
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'variables',
        title: 'Insert {{var}} & Quick-Fill',
        summary: 'Add dynamic placeholders that prompt for values before copying.',
        keywords: 'insert var variable placeholder dynamic quick fill default braces {{}}',
        icon: <Braces className="w-4 h-4" />,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Dynamic Variables with Insert {'{{var}}'}
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Use <strong>Insert {'{{var}}'}</strong> in the editor toolbar (or type double curly braces) to turn static text into reusable fillable fields. You can also include an optional fallback value after a pipe <code className="font-mono text-xs px-1 py-0.5 rounded bg-slate-100 dark:bg-[#2A2A2F]">|</code>.
              </p>
            </div>

            <div className="p-3.5 rounded-md bg-[var(--surface-subtle)] border border-[var(--surface-border)] space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Syntax Examples
              </div>
              <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                <div>
                  <code className="font-mono text-[var(--accent)] bg-[var(--accent-soft)] px-1.5 py-0.5 rounded">
                    {'{{customer_name}}'}
                  </code>{' '}
                  — Prompts with an empty input field when you click Fill / Copy.
                </div>
                <div>
                  <code className="font-mono text-[var(--accent)] bg-[var(--accent-soft)] px-1.5 py-0.5 rounded">
                    {'{{eta_time|4:00 PM EST}}'}
                  </code>{' '}
                  — Pre-fills <strong>4:00 PM EST</strong> automatically so you can press <kbd className="font-mono text-[11px] px-1 py-0.5 rounded bg-[var(--surface-frame)] border border-[var(--surface-border)]">Enter</kbd> right away or override it.
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <strong>How Quick-Fill works:</strong> Whenever you copy a template containing variables, the Quick-Fill window opens, focuses the first field, shows a live rendered preview, and copies immediately on <kbd className="font-mono text-[11px] px-1 py-0.5 rounded bg-[var(--surface-frame)] border border-[var(--surface-border)]">Enter</kbd>. Need the raw placeholders instead? Click <strong>Copy Raw {'{{vars}}'}</strong> inside the dialog.
            </div>
          </div>
        ),
      },
      {
        id: 'quick-jump',
        title: 'Quick Jump (Ctrl+K)',
        summary: 'Search across every tab and copy or jump anywhere in seconds.',
        keywords: 'quick jump ctrl k cmd k command palette search shortcut keyboard',
        icon: <Search className="w-4 h-4" />,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                What is Quick Jump?
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                The normal search bar filters only inside your currently open tab. <strong>Quick Jump</strong> (<kbd className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#2C2C30] border border-slate-200 dark:border-[#3A3A3F]">Ctrl+K</kbd> or <kbd className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#2C2C30] border border-slate-200 dark:border-[#3A3A3F]">Cmd+K</kbd>) searches <strong>across all project tabs, categories, tags, and template text at once</strong> so you can grab any snippet without losing your place.
              </p>
            </div>

            <div className="divide-y divide-[var(--surface-border)] border border-[var(--surface-border)] rounded-md overflow-hidden text-xs">
              <div className="px-3.5 py-2.5 flex items-center justify-between gap-4 bg-[var(--surface-subtle)]">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Open / close Quick Jump from anywhere
                </span>
                <kbd className="font-mono px-2 py-0.5 rounded bg-[var(--surface-elevated)] border border-[var(--surface-border)]">
                  Ctrl + K
                </kbd>
              </div>
              <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Copy highlighted template (or open Quick-Fill)
                </span>
                <kbd className="font-mono px-2 py-0.5 rounded bg-[var(--surface-subtle)] border border-[var(--surface-border)]">
                  Enter
                </kbd>
              </div>
              <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Switch to that template&apos;s tab &amp; open it in editor
                </span>
                <kbd className="font-mono px-2 py-0.5 rounded bg-[var(--surface-subtle)] border border-[var(--surface-border)]">
                  Shift + Enter
                </kbd>
              </div>
              <div className="px-3.5 py-2.5 flex items-center justify-between gap-4">
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Run workspace commands (new template, switch tab, theme)
                </span>
                <kbd className="font-mono px-2 py-0.5 rounded bg-[var(--surface-subtle)] border border-[var(--surface-border)]">
                  Type &gt;
                </kbd>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'copy-formats',
        title: 'Format-Preserving Copy',
        summary: 'Choose between Formatted HTML, Plain text, or raw Markdown copy.',
        keywords: 'copy formatted plain markdown html outlook gmail teams slack paste',
        icon: <Copy className="w-4 h-4" />,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Three Copy Modes for Different Apps
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Templates are stored cleanly in Markdown and converted on copy to match wherever you are pasting.
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="p-3.5 rounded-md border border-[var(--surface-border)]">
                <div className="text-xs font-semibold text-[var(--accent)]">
                  Copy Formatted (Default)
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Copies both rich HTML and plain-text fallback simultaneously. Pasting into <strong>Outlook, Gmail, Microsoft Teams, Slack, Zendesk, or Notion</strong> keeps bold, italic, headings, numbered/bullet lists, links, and line breaks intact.
                </p>
              </div>

              <div className="p-3.5 rounded-md border border-[var(--surface-border)]">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Plain
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Strips Markdown symbols (<code className="font-mono">**</code>, <code className="font-mono">###</code>) and converts bullets into clean <code className="font-mono">•</code> characters for plain-text ticket fields, SMS, or terminal notes.
                </p>
              </div>

              <div className="p-3.5 rounded-md border border-[var(--surface-border)]">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  MD (Raw Markdown)
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Copies the exact Markdown source including unexpanded <code className="font-mono">{'{{variables}}'}</code>—ideal for GitHub PRs, READMEs, or documentation files.
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'editor-toolbar',
        title: 'Editor Modes & Toolbar',
        summary: 'Switch between Preview, Split, and Edit modes with quick formatting.',
        keywords: 'preview split edit toolbar bold italic heading link list code quote',
        icon: <Pencil className="w-4 h-4" />,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Preview, Split &amp; Edit Modes
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Use the segmented switch at the top of the template pane to toggle between <strong>Preview</strong> (clean reading &amp; copy), <strong>Split</strong> (live side-by-side editing and preview on wide screens), and <strong>Edit</strong>. Every change saves automatically.
              </p>
            </div>

            <div className="p-3.5 rounded-md bg-[var(--surface-subtle)] border border-[var(--surface-border)] space-y-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <div>
                <strong>Formatting Toolbar:</strong> Highlight text and click <strong>H2</strong>, <strong>H3</strong>, <strong>Bold</strong>, <strong>Italic</strong>, <strong>Link</strong>, <strong>Bullet List</strong>, <strong>Numbered List</strong>, <strong>Quote</strong>, or <strong>Inline Code</strong> to insert Markdown syntax automatically.
              </div>
              <div>
                <strong>Category &amp; Tags:</strong> Assign a template to any category (or click <strong>+</strong> beside the dropdown to create a new category on the spot) and press <kbd className="font-mono text-[11px] px-1 py-0.5 rounded bg-[var(--surface-frame)] border border-[var(--surface-border)]">Enter</kbd> or comma to attach searchable tags.
              </div>
              <div>
                <strong>Version History (Last 3 Edits):</strong> Click <strong>History</strong> in the template toolbar to inspect and restore up to the last 3 previous content versions saved automatically whenever you edit.
              </div>
              <div>
                <strong>Duplicate &amp; Delete:</strong> Use the duplicate icon in the top-right toolbar to clone an existing template as a starting point, or click the trash icon for an inline delete confirmation.
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'themes',
        title: 'Themes & Accent Colors',
        summary: 'Switch Light/Dark mode, surface presets, or custom accent colors.',
        keywords: 'theme appearance color accent dark light preset warm paper forest slate midnight indigo high contrast settings gear',
        icon: <Palette className="w-4 h-4" />,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Customize Workspace Appearance
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Click the <strong>Settings (⚙)</strong> button on the right side of the <strong>?</strong> guide icon in the top bar to open the compact Appearance &amp; Theme menu.
              </p>
            </div>

            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <div className="p-3 rounded-md border border-[var(--surface-border)]">
                <strong className="text-slate-900 dark:text-slate-100">Light &amp; Dark Mode:</strong> Toggle between Light and Dark mode directly inside Settings (or anytime via <kbd className="font-mono text-[11px] px-1 py-0.5 rounded bg-[var(--surface-subtle)] border border-[var(--surface-border)]">Ctrl+K</kbd> &rarr; <code className="font-mono">&gt; Switch to Dark/Light Mode</code>).
              </div>
              <div className="p-3 rounded-md border border-[var(--surface-border)]">
                <strong className="text-slate-900 dark:text-slate-100">5 Surface Presets:</strong> Switch between <strong>Default Fluent</strong>, <strong>Warm Paper</strong>, <strong>Forest Slate</strong>, <strong>Midnight Indigo</strong>, and <strong>High Contrast</strong>—each calibrated for both Light and Dark mode and synced to the Windows 11 title bar.
              </div>
              <div className="p-3 rounded-md border border-[var(--surface-border)]">
                <strong className="text-slate-900 dark:text-slate-100">Accent Swatches &amp; Custom Picker:</strong> Keep the adaptive <strong>Default Blue</strong> (Deep Blue in Light mode, Cyan Blue in Dark mode), pick from curated swatches, or select any custom hex color with automatic readable contrast. Use <strong>Reset to Default</strong> to restore defaults in one click.
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'backup',
        title: 'Cloud Sync & JSON Backup',
        summary: 'Auto-sync via Google Sign-In or export portable JSON backups.',
        keywords: 'backup export import json local storage merge replace reset appdata google login firebase cloud sync account',
        icon: <DatabaseBackup className="w-4 h-4" />,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Google Cloud Sync &amp; Offline-First JSON Portability
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Notely saves instantly to your device (<code className="font-mono text-xs">%APPDATA%\Notely\workspace.json</code> on Windows) so it always works offline. Click <strong>Sign In</strong> in the top bar with your Google account to automatically sync all tabs, categories, templates, and theme appearance across your devices via Firebase Cloud.
              </p>
            </div>

            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <div className="p-3 rounded-md border border-[var(--surface-border)]">
                <strong className="text-slate-900 dark:text-slate-100">Google Sign-In &amp; Auto-Sync:</strong> Every signed-in user gets a private cloud workspace isolated to their account. Changes sync automatically in the background and merge safely when signing in on a new computer.
              </div>
              <div className="p-3 rounded-md border border-[var(--surface-border)]">
                <strong className="text-slate-900 dark:text-slate-100">Export JSON:</strong> Click <strong>Backup</strong> in the top bar and select <strong>Export JSON</strong> to save a timestamped snapshot of your entire workspace via File Explorer.
              </div>
              <div className="p-3 rounded-md border border-[var(--surface-border)]">
                <strong className="text-slate-900 dark:text-slate-100">Merge vs. Replace Import:</strong> When importing a <code className="font-mono">.json</code> backup file, choose <strong>Merge Into Workspace</strong> to add its tabs alongside your existing ones, or <strong>Replace Existing</strong> to restore the exact snapshot.
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'windows-desktop',
        title: 'Windows Desktop & Updates',
        summary: 'In-app updates, Close (×) behavior, startup toggle, and tray hotkey.',
        keywords: 'windows exe desktop tray hotkey ctrl shift space portable installer update auto startup close exit',
        icon: <Monitor className="w-4 h-4" />,
        content: (
          <div className="space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Native Windows Desktop &amp; In-App Updates
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                When running as the installed Windows <code className="font-mono text-xs">.exe</code> application, Notely integrates directly with Windows and receives updates automatically inside the app.
              </p>
            </div>

            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <div className="p-3 rounded-md border border-[var(--surface-border)]">
                <strong className="text-slate-900 dark:text-slate-100">Direct In-App Updates:</strong> Notely checks GitHub Releases silently on launch and lets you check anytime under <strong>Settings (⚙) &rarr; App</strong>. Download updates directly inside Notely and click <strong>Restart &amp; Install</strong> — your templates, tabs, themes, and preferences in <code className="font-mono">%APPDATA%\Notely</code> remain untouched.
              </div>
              <div className="p-3 rounded-md border border-[var(--surface-border)]">
                <strong className="text-slate-900 dark:text-slate-100">Close Button (&times;) &amp; Launch at Startup:</strong> Open <strong>Settings (⚙) &rarr; App</strong> to choose whether clicking the top-right <strong>&times;</strong> minimizes Notely to the system tray or exits the app completely, and toggle whether Notely launches automatically when you sign in to Windows.
              </div>
              <div className="p-3 rounded-md border border-[var(--surface-border)] flex items-center justify-between gap-4">
                <div>
                  <strong className="text-slate-900 dark:text-slate-100">Global Summon Hotkey:</strong> Show or hide Notely from inside Outlook, Teams, Slack, or any Windows app and open Quick Jump immediately.
                </div>
                <kbd className="font-mono px-2 py-0.5 rounded bg-[var(--surface-subtle)] border border-[var(--surface-border)] whitespace-nowrap shrink-0">
                  Ctrl + Shift + Space
                </kbd>
              </div>
              <div className="p-3 rounded-md border border-[var(--surface-border)]">
                <strong className="text-slate-900 dark:text-slate-100">Native Windows Clipboard:</strong> Writes rich HTML and plain-text payloads directly to the Win32 clipboard with no browser prompts.
              </div>
            </div>
          </div>
        ),
      },
    ],
    []
  );

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.keywords.toLowerCase().includes(q)
    );
  }, [sections, searchQuery]);

  const activeSection =
    filteredSections.find((s) => s.id === activeSectionId) ||
    filteredSections[0] ||
    null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl h-[82vh] max-h-[660px] flex flex-col rounded-lg bg-[var(--surface-panel)] border border-[var(--surface-border)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--surface-border)] flex items-center justify-between gap-4 bg-[var(--surface-sidebar)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <HelpCircle className="w-4 h-4 text-[var(--accent)] shrink-0" />
            <div className="min-w-0">
              <h2
                id="guide-modal-title"
                className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate"
              >
                Notely User Guide &amp; Feature Reference
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Learn how every tool works — reopen anytime from the ? button in the top bar.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative hidden sm:block">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search guide..."
                aria-label="Search user guide"
                className="w-44 h-8 pl-8 pr-2.5 text-xs bg-[var(--surface-input)] border border-[var(--surface-border)] rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close user guide"
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-[var(--surface-hover)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body: Left Topics + Right Detailed Guide */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-[var(--surface-border)]">
          {/* Topic List */}
          <nav
            aria-label="Guide topics"
            className="w-full md:w-64 shrink-0 overflow-y-auto p-2.5 space-y-1 bg-[var(--surface-sidebar)]"
          >
            {filteredSections.length === 0 ? (
              <p className="px-2.5 py-4 text-xs text-slate-400 dark:text-slate-500">
                No guide topics match "{searchQuery}".
              </p>
            ) : (
              filteredSections.map((sec) => {
                const isSelected = activeSection?.id === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setActiveSectionId(sec.id)}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-md text-left transition-colors border ${
                      isSelected
                        ? 'bg-[var(--surface-elevated)] border-[var(--surface-border)] text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-[var(--surface-hover)] hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 ${
                        isSelected
                          ? 'text-[var(--accent)]'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {sec.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{sec.title}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-snug">
                        {sec.summary}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </nav>

          {/* Active Topic Content */}
          <div className="flex-1 min-w-0 p-6 overflow-y-auto bg-[var(--surface-panel)]">
            {activeSection ? (
              activeSection.content
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-sm text-slate-500 dark:text-slate-400">
                <Sparkles className="w-5 h-5 mb-2 opacity-60" />
                <p>Clear the guide search to view all topics.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--surface-border)] bg-[var(--surface-sidebar)] flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Tip: Press <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] border border-[var(--surface-border)]">Ctrl+K</kbd> anytime to search across all tabs.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-xs font-semibold transition-colors"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
