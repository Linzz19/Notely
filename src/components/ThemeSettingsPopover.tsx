import {
  AlertCircle,
  AppWindow,
  ArrowDownToLine,
  Check,
  CheckCircle2,
  Moon,
  Palette,
  Pipette,
  Power,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  AppUpdateState,
  CloseButtonBehavior,
  DesktopPreferences,
  DesktopPreferencesPatch,
} from '../types/electron';
import { ThemeMode, ThemePreset } from '../types/workspace';
import {
  ACCENT_SWATCHES,
  DEFAULT_DARK_ACCENT,
  DEFAULT_LIGHT_ACCENT,
  getContrastingForeground,
  resolveEffectiveAccent,
  THEME_PRESETS,
} from '../utils/theme';

export type SettingsPopoverTab = 'appearance' | 'app';

interface ThemeSettingsPopoverProps {
  theme: ThemeMode;
  themePreset: ThemePreset;
  accentColor: string;
  isDesktopApp: boolean;
  desktopPrefs: DesktopPreferences;
  updateState: AppUpdateState;
  initialTab?: SettingsPopoverTab;
  onChangeTheme: (theme: ThemeMode) => void;
  onChangeThemePreset: (preset: ThemePreset) => void;
  onChangeAccentColor: (accentColor: string) => void;
  onResetTheme: () => void;
  onUpdateDesktopPrefs: (patch: DesktopPreferencesPatch) => void;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onClose: () => void;
}

export function ThemeSettingsPopover({
  theme,
  themePreset,
  accentColor,
  isDesktopApp,
  desktopPrefs,
  updateState,
  initialTab = 'appearance',
  onChangeTheme,
  onChangeThemePreset,
  onChangeAccentColor,
  onResetTheme,
  onUpdateDesktopPrefs,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onClose,
}: ThemeSettingsPopoverProps) {
  const [activeTab, setActiveTab] = useState<SettingsPopoverTab>(initialTab);
  const panelRef = useRef<HTMLDivElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('[data-theme-settings-trigger="true"]')) return;
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const effectiveHex = resolveEffectiveAccent(accentColor, theme);
  const isCustomColor =
    accentColor !== 'default' &&
    !ACCENT_SWATCHES.some(
      (swatch) =>
        swatch.value !== 'default' &&
        swatch.value.toUpperCase() === accentColor.toUpperCase()
    );
  const isDefaultConfig = themePreset === 'default' && accentColor === 'default';
  const hasPendingUpdate =
    updateState.status === 'available' || updateState.status === 'downloaded';

  const handleCloseBehaviorChange = (behavior: CloseButtonBehavior) => {
    if (!isDesktopApp) return;
    onUpdateDesktopPrefs({ closeBehavior: behavior });
  };

  const handleStartupToggle = () => {
    if (!isDesktopApp || !desktopPrefs.canConfigureStartup) return;
    onUpdateDesktopPrefs({ openAtLogin: !desktopPrefs.openAtLogin });
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notely settings"
      className="app-no-drag absolute right-0 top-full mt-2 z-50 w-[328px] max-w-[calc(100vw-24px)] rounded-xl bg-[var(--surface-panel)] border border-[var(--surface-border)] shadow-xl overflow-hidden text-slate-900 dark:text-slate-100"
    >
      {/* Header + 2-Tab Switcher */}
      <div className="px-3.5 pt-3 pb-2.5 border-b border-[var(--surface-border)] bg-[var(--surface-sidebar)] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold font-display leading-tight text-slate-900 dark:text-slate-100">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Close settings (Esc)"
            className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Settings sections"
          className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[var(--surface-frame)] border border-[var(--surface-border)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'appearance'}
            onClick={() => setActiveTab('appearance')}
            className={`h-7 rounded-md text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
              activeTab === 'appearance'
                ? 'bg-[var(--surface-panel)] text-slate-900 dark:text-slate-100 shadow-xs border border-[var(--surface-border)]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Appearance</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'app'}
            onClick={() => setActiveTab('app')}
            className={`relative h-7 rounded-md text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
              activeTab === 'app'
                ? 'bg-[var(--surface-panel)] text-slate-900 dark:text-slate-100 shadow-xs border border-[var(--surface-border)]'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <AppWindow className="w-3.5 h-3.5" />
            <span>App</span>
            {hasPendingUpdate && (
              <span
                aria-label="Update available"
                className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0"
              />
            )}
          </button>
        </div>
      </div>

      {/* Tab Body */}
      <div className="p-3.5 max-h-[calc(100vh-148px)] overflow-y-auto">
        {activeTab === 'appearance' ? (
          <div className="space-y-4">
            {/* Section 1: Light / Dark Mode */}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Mode
              </div>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[var(--surface-frame)] border border-[var(--surface-border)]">
                <button
                  type="button"
                  onClick={() => onChangeTheme('light')}
                  aria-pressed={theme === 'light'}
                  className={`h-8 rounded-md text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                    theme === 'light'
                      ? 'bg-[var(--surface-panel)] text-slate-900 shadow-xs border border-[var(--surface-border)]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTheme('dark')}
                  aria-pressed={theme === 'dark'}
                  className={`h-8 rounded-md text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                    theme === 'dark'
                      ? 'bg-[var(--surface-elevated)] text-slate-100 shadow-xs border border-[var(--surface-border)]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark</span>
                </button>
              </div>
            </div>

            {/* Section 2: Surface Theme Presets */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Theme Preset
                </span>
              </div>
              <div className="space-y-1.5">
                {THEME_PRESETS.map((preset) => {
                  const isSelected = themePreset === preset.id;
                  const palette = theme === 'dark' ? preset.dark : preset.light;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onChangeThemePreset(preset.id)}
                      aria-pressed={isSelected}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                        isSelected
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                          : 'border-[var(--surface-border)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      {/* 2-Tone Mini Surface Swatch */}
                      <span
                        aria-hidden="true"
                        className="w-9 h-6 rounded-md overflow-hidden border shrink-0 flex shadow-2xs"
                        style={{ borderColor: palette.border }}
                      >
                        <span
                          className="w-3.5 h-full"
                          style={{ backgroundColor: palette.frame }}
                        />
                        <span
                          className="flex-1 h-full flex flex-col justify-end p-1"
                          style={{ backgroundColor: palette.panel }}
                        >
                          <span
                            className="h-1 w-full rounded-full"
                            style={{ backgroundColor: effectiveHex }}
                          />
                        </span>
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium text-slate-900 dark:text-slate-100 truncate leading-tight">
                          {preset.label}
                        </span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 leading-tight">
                          {preset.description}
                        </span>
                      </span>

                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 3: Accent Color */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Accent Color
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {accentColor === 'default'
                    ? `Auto (${effectiveHex})`
                    : effectiveHex}
                </span>
              </div>

              <div className="grid grid-cols-8 gap-1.5">
                {ACCENT_SWATCHES.map((swatch) => {
                  const isSelected =
                    swatch.value === 'default'
                      ? accentColor === 'default'
                      : accentColor.toUpperCase() === swatch.value.toUpperCase();

                  const displayColor =
                    swatch.value === 'default'
                      ? theme === 'dark'
                        ? DEFAULT_DARK_ACCENT
                        : DEFAULT_LIGHT_ACCENT
                      : swatch.value;

                  const checkColor = getContrastingForeground(displayColor);

                  return (
                    <button
                      key={swatch.id}
                      type="button"
                      onClick={() => onChangeAccentColor(swatch.value)}
                      title={swatch.label}
                      aria-label={swatch.label}
                      aria-pressed={isSelected}
                      className={`relative w-7 h-7 rounded-md flex items-center justify-center border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--accent)] ${
                        isSelected
                          ? 'border-slate-900 dark:border-white ring-1 ring-slate-900/20 dark:ring-white/30'
                          : 'border-black/15 dark:border-white/15'
                      }`}
                      style={
                        swatch.value === 'default'
                          ? {
                              background: `linear-gradient(135deg, ${DEFAULT_LIGHT_ACCENT} 50%, ${DEFAULT_DARK_ACCENT} 50%)`,
                            }
                          : { backgroundColor: swatch.value }
                      }
                    >
                      {isSelected && (
                        <Check
                          className="w-3.5 h-3.5 drop-shadow-xs"
                          style={{
                            color: swatch.value === 'default' ? '#FFFFFF' : checkColor,
                          }}
                          strokeWidth={3}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Custom Color Picker Row */}
              <div className="mt-2.5 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-subtle)]">
                <button
                  type="button"
                  onClick={() => colorInputRef.current?.click()}
                  className="flex items-center gap-2 text-[12px] font-medium text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white focus-visible:outline-none focus-visible:underline"
                >
                  <span
                    className="w-4 h-4 rounded border border-black/15 dark:border-white/20 shrink-0"
                    style={{ backgroundColor: effectiveHex }}
                  />
                  <Pipette className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>{isCustomColor ? 'Custom Color' : 'Pick Custom Color'}</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <input
                    ref={colorInputRef}
                    type="color"
                    aria-label="Pick custom accent color"
                    value={effectiveHex}
                    onChange={(e) => onChangeAccentColor(e.target.value.toUpperCase())}
                    className="w-6 h-6 p-0 border-0 rounded cursor-pointer bg-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Desktop Behavior: Close Button (X) */}
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                When Clicking Close (×)
              </div>
              <div
                className={`grid grid-cols-2 gap-1 p-1 rounded-lg bg-[var(--surface-frame)] border border-[var(--surface-border)] ${
                  !isDesktopApp ? 'opacity-55' : ''
                }`}
              >
                <button
                  type="button"
                  disabled={!isDesktopApp}
                  onClick={() => handleCloseBehaviorChange('tray')}
                  aria-pressed={desktopPrefs.closeBehavior === 'tray'}
                  className={`h-8 rounded-md text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed ${
                    desktopPrefs.closeBehavior === 'tray'
                      ? 'bg-[var(--surface-panel)] text-slate-900 dark:text-slate-100 shadow-xs border border-[var(--surface-border)]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <span>Minimize to Tray</span>
                </button>
                <button
                  type="button"
                  disabled={!isDesktopApp}
                  onClick={() => handleCloseBehaviorChange('exit')}
                  aria-pressed={desktopPrefs.closeBehavior === 'exit'}
                  className={`h-8 rounded-md text-[12px] font-medium flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed ${
                    desktopPrefs.closeBehavior === 'exit'
                      ? 'bg-[var(--surface-panel)] text-slate-900 dark:text-slate-100 shadow-xs border border-[var(--surface-border)]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <span>Exit App</span>
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                {!isDesktopApp
                  ? 'Available when running the installed Windows desktop app.'
                  : desktopPrefs.closeBehavior === 'tray'
                    ? 'Keeps Notely in the system tray so Ctrl+Shift+Space reopens it instantly.'
                    : 'Closes Notely completely and stops background tray activity.'}
              </p>
            </div>

            {/* Desktop Behavior: Launch at Windows Startup */}
            <div className="pt-3 border-t border-[var(--surface-border)]">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[12px] font-medium text-slate-900 dark:text-slate-100">
                    <Power className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                    <span>Launch at Startup</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    {!isDesktopApp
                      ? 'Start Notely automatically when signing in to Windows.'
                      : desktopPrefs.isPortable
                        ? 'Install using Notely Setup to manage Windows startup.'
                        : desktopPrefs.canConfigureStartup
                          ? 'Automatically open Notely when you sign in to Windows.'
                          : 'Available in packaged Windows builds.'}
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={desktopPrefs.openAtLogin}
                  aria-label="Launch Notely at Windows startup"
                  disabled={!isDesktopApp || !desktopPrefs.canConfigureStartup}
                  onClick={handleStartupToggle}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-45 disabled:cursor-not-allowed ${
                    desktopPrefs.openAtLogin
                      ? 'bg-[var(--accent)] border-[var(--accent)]'
                      : 'bg-[var(--surface-frame)] border-[var(--surface-border-strong)]'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full shadow-xs transition-transform ${
                      desktopPrefs.openAtLogin
                        ? 'translate-x-[17px] bg-[var(--accent-fg)]'
                        : 'translate-x-[2px] bg-slate-500 dark:bg-slate-300'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* App Updates Section */}
            <div className="pt-3 border-t border-[var(--surface-border)] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  App Updates
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] border border-[var(--surface-border)]">
                  v{updateState.currentVersion}
                </span>
              </div>

              <div className="p-2.5 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-subtle)] space-y-2.5">
                {/* Status Line */}
                <div className="flex items-start gap-2 text-[11.5px] leading-snug">
                  {updateState.status === 'up-to-date' && (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <span className="text-slate-700 dark:text-slate-200">
                        You&apos;re on the latest version of Notely.
                      </span>
                    </>
                  )}
                  {updateState.status === 'idle' && (
                    <span className="text-slate-600 dark:text-slate-300">
                      Checks automatically on launch via GitHub Releases.
                    </span>
                  )}
                  {updateState.status === 'checking' && (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-[var(--accent)] animate-spin shrink-0 mt-0.5" />
                      <span className="text-slate-700 dark:text-slate-200">
                        Checking GitHub Releases...
                      </span>
                    </>
                  )}
                  {updateState.status === 'available' && (
                    <>
                      <ArrowDownToLine className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
                      <span className="text-slate-800 dark:text-slate-100 font-medium">
                        Update{' '}
                        <span className="font-mono tabular-nums">
                          v{updateState.availableVersion}
                        </span>{' '}
                        is available.
                      </span>
                    </>
                  )}
                  {updateState.status === 'downloading' && (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-[var(--accent)] animate-spin shrink-0 mt-0.5" />
                      <span className="text-slate-800 dark:text-slate-100 font-medium">
                        Downloading{' '}
                        <span className="font-mono tabular-nums">
                          v{updateState.availableVersion}
                        </span>
                        ...{' '}
                        <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {updateState.progressPercent}%
                        </span>
                      </span>
                    </>
                  )}
                  {updateState.status === 'downloaded' && (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
                      <span className="text-slate-800 dark:text-slate-100 font-medium">
                        Update{' '}
                        <span className="font-mono tabular-nums">
                          v{updateState.availableVersion}
                        </span>{' '}
                        downloaded and ready to install.
                      </span>
                    </>
                  )}
                  {updateState.status === 'error' && (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                      <span className="text-red-700 dark:text-red-300">
                        {updateState.errorMessage || 'Could not check for updates.'}
                      </span>
                    </>
                  )}
                  {updateState.status === 'unsupported' && (
                    <span className="text-slate-500 dark:text-slate-400">
                      {updateState.errorMessage ||
                        'In-app updates apply in the Windows Setup desktop app.'}
                    </span>
                  )}
                </div>

                {/* Download Progress Bar */}
                {updateState.status === 'downloading' && (
                  <div className="h-1.5 w-full rounded-full bg-[var(--surface-frame)] overflow-hidden border border-[var(--surface-border)]">
                    <div
                      className="h-full bg-[var(--accent)] transition-all duration-200"
                      style={{
                        width: `${Math.max(4, updateState.progressPercent)}%`,
                      }}
                    />
                  </div>
                )}

                {/* Contextual Action Button */}
                {updateState.canUpdate && (
                  <div>
                    {(updateState.status === 'idle' ||
                      updateState.status === 'up-to-date' ||
                      updateState.status === 'error') && (
                      <button
                        type="button"
                        onClick={onCheckForUpdates}
                        className="w-full h-8 px-3 rounded-md border border-[var(--surface-border)] bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)] text-[12px] font-medium text-slate-800 dark:text-slate-100 inline-flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Check for Updates</span>
                      </button>
                    )}

                    {updateState.status === 'checking' && (
                      <button
                        type="button"
                        disabled
                        className="w-full h-8 px-3 rounded-md border border-[var(--surface-border)] bg-[var(--surface-panel)] text-[12px] font-medium text-slate-500 dark:text-slate-400 inline-flex items-center justify-center gap-1.5 opacity-70 cursor-not-allowed"
                      >
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Checking...</span>
                      </button>
                    )}

                    {updateState.status === 'available' && (
                      <button
                        type="button"
                        onClick={onDownloadUpdate}
                        className="w-full h-8 px-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5" />
                        <span>
                          Download v{updateState.availableVersion}
                        </span>
                      </button>
                    )}

                    {updateState.status === 'downloaded' && (
                      <button
                        type="button"
                        onClick={onInstallUpdate}
                        className="w-full h-8 px-3 rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Restart &amp; Install</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3.5 py-2.5 border-t border-[var(--surface-border)] bg-[var(--surface-sidebar)] flex items-center justify-between gap-2">
        {activeTab === 'appearance' ? (
          <>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {theme === 'light' ? 'Light' : 'Dark'} ·{' '}
              {THEME_PRESETS.find((p) => p.id === themePreset)?.label}
            </span>
            <button
              type="button"
              disabled={isDefaultConfig}
              onClick={onResetTheme}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-medium text-slate-700 dark:text-slate-200 hover:bg-[var(--surface-hover)] disabled:opacity-40 disabled:pointer-events-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset to Default</span>
            </button>
          </>
        ) : (
          <>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {isDesktopApp ? 'Windows Desktop' : 'Browser Preview'}
            </span>
            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Notely v{updateState.currentVersion}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
