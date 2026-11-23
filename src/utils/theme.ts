import { ThemeMode, ThemePreset } from '../types/workspace';

export interface ThemePresetDefinition {
  id: ThemePreset;
  label: string;
  description: string;
  light: {
    frame: string;
    sidebar: string;
    panel: string;
    border: string;
    symbolColor: string;
  };
  dark: {
    frame: string;
    sidebar: string;
    panel: string;
    border: string;
    symbolColor: string;
  };
}

export interface AccentSwatch {
  id: string;
  label: string;
  value: string; // 'default' or '#RRGGBB'
  lightPreview: string;
  darkPreview: string;
}

export const DEFAULT_LIGHT_ACCENT = '#0067C0';
export const DEFAULT_DARK_ACCENT = '#4CC2FF';

export const THEME_PRESETS: ThemePresetDefinition[] = [
  {
    id: 'default',
    label: 'Default Fluent',
    description: 'Crisp Windows 11 neutrals',
    light: {
      frame: '#F3F4F6',
      sidebar: '#F8FAFC',
      panel: '#FFFFFF',
      border: '#E2E8F0',
      symbolColor: '#1E293B',
    },
    dark: {
      frame: '#161618',
      sidebar: '#1B1B1E',
      panel: '#202023',
      border: '#2E2E32',
      symbolColor: '#F1F5F9',
    },
  },
  {
    id: 'warm-paper',
    label: 'Warm Paper',
    description: 'Editorial stone & espresso',
    light: {
      frame: '#F3EFE7',
      sidebar: '#FAF7F1',
      panel: '#FFFEFA',
      border: '#E5DDD0',
      symbolColor: '#292524',
    },
    dark: {
      frame: '#191614',
      sidebar: '#201C19',
      panel: '#26221E',
      border: '#3A332D',
      symbolColor: '#F5F0E8',
    },
  },
  {
    id: 'forest-slate',
    label: 'Forest Slate',
    description: 'Calm sage & deep pine',
    light: {
      frame: '#EDF2EE',
      sidebar: '#F4F8F5',
      panel: '#FBFEFC',
      border: '#D5E1D8',
      symbolColor: '#1C2A22',
    },
    dark: {
      frame: '#131917',
      sidebar: '#18201D',
      panel: '#1E2723',
      border: '#2D3A34',
      symbolColor: '#ECFDF5',
    },
  },
  {
    id: 'midnight-indigo',
    label: 'Midnight Indigo',
    description: 'Cool slate & cobalt ink',
    light: {
      frame: '#EEF1F8',
      sidebar: '#F5F7FC',
      panel: '#FDFEFF',
      border: '#D9DFEE',
      symbolColor: '#1E2438',
    },
    dark: {
      frame: '#121521',
      sidebar: '#171B2A',
      panel: '#1D2234',
      border: '#2D344E',
      symbolColor: '#EEF2FF',
    },
  },
  {
    id: 'high-contrast',
    label: 'High Contrast',
    description: 'Sharp borders & maximum legibility',
    light: {
      frame: '#E8ECF0',
      sidebar: '#F8FAFC',
      panel: '#FFFFFF',
      border: '#94A3B8',
      symbolColor: '#0F172A',
    },
    dark: {
      frame: '#09090B',
      sidebar: '#0F0F12',
      panel: '#141418',
      border: '#475569',
      symbolColor: '#FFFFFF',
    },
  },
];

export const ACCENT_SWATCHES: AccentSwatch[] = [
  {
    id: 'default',
    label: 'Default Blue (Adaptive)',
    value: 'default',
    lightPreview: DEFAULT_LIGHT_ACCENT,
    darkPreview: DEFAULT_DARK_ACCENT,
  },
  {
    id: 'teal',
    label: 'Ocean Teal',
    value: '#0D9488',
    lightPreview: '#0D9488',
    darkPreview: '#14B8A6',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    value: '#059669',
    lightPreview: '#059669',
    darkPreview: '#10B981',
  },
  {
    id: 'indigo',
    label: 'Royal Indigo',
    value: '#4F46E5',
    lightPreview: '#4F46E5',
    darkPreview: '#6366F1',
  },
  {
    id: 'violet',
    label: 'Violet',
    value: '#7C3AED',
    lightPreview: '#7C3AED',
    darkPreview: '#8B5CF6',
  },
  {
    id: 'rose',
    label: 'Crimson Rose',
    value: '#E11D48',
    lightPreview: '#E11D48',
    darkPreview: '#F43F5E',
  },
  {
    id: 'amber',
    label: 'Warm Amber',
    value: '#D97706',
    lightPreview: '#D97706',
    darkPreview: '#F59E0B',
  },
  {
    id: 'graphite',
    label: 'Graphite',
    value: '#475569',
    lightPreview: '#475569',
    darkPreview: '#94A3B8',
  },
];

const VALID_PRESETS = new Set<ThemePreset>(THEME_PRESETS.map((p) => p.id));
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function normalizeThemePreset(value: unknown): ThemePreset {
  if (typeof value === 'string' && VALID_PRESETS.has(value as ThemePreset)) {
    return value as ThemePreset;
  }
  return 'default';
}

export function normalizeAccentColor(value: unknown): string {
  if (typeof value !== 'string') return 'default';
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === 'default') return 'default';
  if (HEX_COLOR_RE.test(trimmed)) return trimmed.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) return `#${trimmed.toUpperCase()}`;
  return 'default';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const intVal = parseInt(clean, 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * WCAG 2.1 relative luminance for choosing crisp white vs dark slate text
 * on top of filled accent surfaces.
 */
function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (channel: number) => {
    const sRGB = channel / 255;
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function getContrastingForeground(hex: string): '#FFFFFF' | '#0F172A' {
  const lum = getRelativeLuminance(hex);
  // Compare contrast ratio against white (L=1) vs #0F172A (L≈0.008)
  const contrastWhite = (1 + 0.05) / (lum + 0.05);
  const contrastDark = (lum + 0.05) / (0.008 + 0.05);
  return contrastWhite >= contrastDark ? '#FFFFFF' : '#0F172A';
}

function adjustHexBrightness(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  if (amount < 0) {
    const factor = 1 + amount;
    return rgbToHex(r * factor, g * factor, b * factor);
  }
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount
  );
}

export function resolveEffectiveAccent(
  accentColor: string,
  mode: ThemeMode
): string {
  const normalized = normalizeAccentColor(accentColor);
  if (normalized === 'default') {
    return mode === 'dark' ? DEFAULT_DARK_ACCENT : DEFAULT_LIGHT_ACCENT;
  }
  return normalized;
}

export function getPresetDefinition(preset: ThemePreset): ThemePresetDefinition {
  return (
    THEME_PRESETS.find((item) => item.id === preset) ?? THEME_PRESETS[0]
  );
}

export interface AppliedThemeTokens {
  mode: ThemeMode;
  color: string;
  symbolColor: string;
  accentHex: string;
}

/**
 * Applies theme mode, surface preset attribute, and computed WCAG-safe accent
 * CSS variables to `document.documentElement`. Returns resolved frame overlay
 * colors for Electron's native Windows 11 titlebar.
 */
export function applyThemeToDocument(
  mode: ThemeMode,
  preset: ThemePreset,
  accentColor: string
): AppliedThemeTokens {
  const root = document.documentElement;
  const safePreset = normalizeThemePreset(preset);
  const safeAccent = normalizeAccentColor(accentColor);

  if (mode === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  root.dataset.themePreset = safePreset;

  const accentHex = resolveEffectiveAccent(safeAccent, mode);
  const accentFg = getContrastingForeground(accentHex);

  // Preserve exact original Fluent hover colors for default blue
  let accentHover: string;
  if (safeAccent === 'default') {
    accentHover = mode === 'dark' ? '#38B6F8' : '#005A9E';
  } else {
    accentHover =
      mode === 'dark'
        ? adjustHexBrightness(accentHex, 0.1)
        : adjustHexBrightness(accentHex, -0.14);
  }

  const { r, g, b } = hexToRgb(accentHex);
  const softAlpha = mode === 'dark' ? 0.14 : 0.08;
  const softStrongAlpha = mode === 'dark' ? 0.22 : 0.14;
  const ringAlpha = mode === 'dark' ? 0.35 : 0.28;

  root.style.setProperty('--accent', accentHex);
  root.style.setProperty('--accent-hover', accentHover);
  root.style.setProperty('--accent-fg', accentFg);
  root.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, ${softAlpha})`);
  root.style.setProperty(
    '--accent-soft-strong',
    `rgba(${r}, ${g}, ${b}, ${softStrongAlpha})`
  );
  root.style.setProperty('--accent-ring', `rgba(${r}, ${g}, ${b}, ${ringAlpha})`);

  const presetDef = getPresetDefinition(safePreset);
  const overlay = mode === 'dark' ? presetDef.dark : presetDef.light;

  return {
    mode,
    color: overlay.frame,
    symbolColor: overlay.symbolColor,
    accentHex,
  };
}
