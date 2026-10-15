/**
 * Central UI Color Configuration File
 *
 * All application UI colors are centrally defined here.
 * Future color changes must be made in this file only.
 *
 * Each token provides:
 * - `hex`: The canonical hexadecimal color string.
 * - `channels`: The space-separated RGB channel values used by CSS variables
 *   to safely support Tailwind opacity modifiers (e.g. `bg-gold/10`, `ring-gold/40`).
 */

function hexToRgbChannels(hex) {
  let c = hex.replace('#', '').trim();
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  } else if (c.length === 8) {
    c = c.substring(0, 6);
  }
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `${r} ${g} ${b}`;
}

// ---------------------------------------------------------------------------
// 1. Semantic & Brand Tokens
// ---------------------------------------------------------------------------
export const semanticColors = {
  // Primary brand identity (gold)
  'primary-brand': '#E8C985',
  'primary-brand-hover': '#FFF3D8',

  // Primary action & button CTA (royal/electric blue)
  'primary-action': '#315BFF',

  // Semantic feedback
  'success': '#16A34A',
  'success-bg': '#DCFCE7',
  'warning': '#92400E',
  'warning-bg': '#FFF3D8',
  'danger': '#F05B7A',

  // Third-party brand integrations
  'brand-whatsapp': '#16A34A',

  // App shell & layout surfaces (Deep Navy Blue #0B1B45, Ice Blue #EDF5FF, Soft White #FFFFFF)
  'navbar': '#0B1B45',
  'navbar-alt': '#142B5C',
  'gold': '#E8C985',
  'gold-soft': '#FFF3D8',
  'page': '#EDF5FF',
  'card': '#FFFFFF',
  
  'border-soft': '#D7E5FF',
  'highlight': '#FFF3D8',

  // Typography (Darker, high-contrast, crisp professional content)
  'ink': '#0F172A',
  'ink-muted': '#334155',
  'ink-onnavy': '#EDF5FF',

  // POS Billing Screen Tokens (Deep Navy #0B1B45, Royal #2449C6, Electric #315BFF, Ice #EDF5FF, Champagne #E8C985, Blush #F8DDE8, Warning #F05B7A)
  'pos-navy': '#0B1B45',
  'pos-navy-dark': '#071230',
  'pos-navy-light': '#142B5C',
  'pos-navy-surface': '#10245C',
  'pos-navy-border': '#1E387B',
  'pos-royal': '#2449C6',
  'pos-blue': '#315BFF',
  'pos-gold': '#E8C985',
  'pos-gold-soft': '#FFF3D8',
  'pos-pink': '#F8DDE8',
  'pos-pink-text': '#A8224E',
  'pos-stock-warning': '#F05B7A',
  'pos-ivory': '#E8C985',
  'pos-ivory-light': '#FFF3D8',
  'pos-ivory-soft': '#FFF8EA',
  'pos-ivory-text': '#8C6D1F',
  'pos-ice': '#EDF5FF',
  'pos-ice-card': '#F5F8FF',
  'pos-ice-silver': '#EDF5FF',
  'pos-silver-moon': '#D7E5FF',
  'pos-teal': '#315BFF',
  'pos-slate': '#334155',
  'pos-border': '#D7E5FF',

  // Universal base colors (channelized for byte-identical opacity support)
  'white': '#FFFFFF',
  'black': '#000000',
};

// ---------------------------------------------------------------------------
// 2. Actually Used Standard Palette Shades
// ---------------------------------------------------------------------------
export const standardPaletteColors = {
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
  emerald: {
    50: '#ECFDF5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
    800: '#065F46',
    950: '#022C22',
  },
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    950: '#450A0A',
  },
  indigo: {
    50: '#EEF2FF',
    100: '#E0E7FF',
    200: '#C7D2FE',
    300: '#A5B4FC',
    400: '#818CF8',
    500: '#6366F1',
    600: '#4F46E5',
    700: '#4338CA',
    900: '#312E81',
  },
  amber: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
  },
  rose: {
    50: '#FFF1F2',
    200: '#FECDD3',
    600: '#E11D48',
    800: '#9F1239',
  },
  blue: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    600: '#2563EB',
    700: '#1D4ED8',
  },
  cyan: {
    50: '#ECFEFF',
    200: '#A5F3FC',
    400: '#22D3EE',
    600: '#0891B2',
  },
  green: {
    50: '#F0FDF4',
    200: '#BBF7D0',
    600: '#16A34A',
    700: '#15803D',
  },
  teal: {
    50: '#F0FDFA',
    200: '#99F6E4',
    600: '#0D9488',
  },
  sky: {
    50: '#F0F9FF',
    200: '#BAE6FD',
    600: '#0284C7',
  },
  violet: {
    50: '#F5F3FF',
    200: '#DDD6FE',
    600: '#7C3AED',
  },
  purple: {
    50: '#FAF5FF',
    200: '#E9D5FF',
    600: '#9333EA',
  },
  orange: {
    50: '#FFF7ED',
    200: '#FED7AA',
    600: '#EA580C',
  },
};

// ---------------------------------------------------------------------------
// 3. Print Tokens
// ---------------------------------------------------------------------------
export const printColors = {
  'print-blue': '#1D4ED8',
  'print-amber': '#B45309',
  'print-border': '#999999',
  'print-black': '#000000',
  'print-dark': '#111111',
  'print-white': '#FFFFFF',
};

// ---------------------------------------------------------------------------
// 4. CSS Variables Mapping (R G B channels for Tailwind opacity support)
// ---------------------------------------------------------------------------
export function getCssVariables() {
  const vars = {};

  for (const [name, hex] of Object.entries(semanticColors)) {
    vars[`--color-${name}`] = hexToRgbChannels(hex);
  }

  for (const [family, shades] of Object.entries(standardPaletteColors)) {
    for (const [shade, hex] of Object.entries(shades)) {
      vars[`--color-${family}-${shade}`] = hexToRgbChannels(hex);
    }
  }

  for (const [name, hex] of Object.entries(printColors)) {
    vars[`--color-${name}`] = hexToRgbChannels(hex);
  }

  return vars;
}

// ---------------------------------------------------------------------------
// 5. Tailwind Color Configuration Generator
// ---------------------------------------------------------------------------
export function getTailwindColorConfig() {
  const config = {
    // Semantic tokens
    'primary-brand': 'rgb(var(--color-primary-brand) / <alpha-value>)',
    'primary-brand-hover': 'rgb(var(--color-primary-brand-hover) / <alpha-value>)',
    'primary-action': 'rgb(var(--color-primary-action) / <alpha-value>)',
    'brand-whatsapp': 'rgb(var(--color-brand-whatsapp) / <alpha-value>)',

    // App shell & theme colors
    navbar: {
      DEFAULT: 'rgb(var(--color-navbar) / <alpha-value>)',
      alt: 'rgb(var(--color-navbar-alt) / <alpha-value>)',
    },
    gold: {
      DEFAULT: 'rgb(var(--color-gold) / <alpha-value>)',
      soft: 'rgb(var(--color-gold-soft) / <alpha-value>)',
    },
    page: 'rgb(var(--color-page) / <alpha-value>)',
    card: 'rgb(var(--color-card) / <alpha-value>)',
    border: {
      soft: 'rgb(var(--color-border-soft) / <alpha-value>)',
    },
    ink: {
      DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
      muted: 'rgb(var(--color-ink-muted) / <alpha-value>)',
      onnavy: 'rgb(var(--color-ink-onnavy) / <alpha-value>)',
    },
    success: {
      DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
      bg: 'rgb(var(--color-success-bg) / <alpha-value>)',
    },
    warning: {
      DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
      bg: 'rgb(var(--color-warning-bg) / <alpha-value>)',
    },
    danger: {
      DEFAULT: 'rgb(var(--color-danger) / <alpha-value>)',
    },
    highlight: 'rgb(var(--color-highlight) / <alpha-value>)',

    // Universal base colors (channelized)
    white: 'rgb(var(--color-white) / <alpha-value>)',
    black: 'rgb(var(--color-black) / <alpha-value>)',
  };

  // Standard palette shades mapped to CSS variables
  for (const [family, shades] of Object.entries(standardPaletteColors)) {
    if (!config[family]) config[family] = {};
    for (const shade of Object.keys(shades)) {
      config[family][shade] = `rgb(var(--color-${family}-${shade}) / <alpha-value>)`;
    }
  }

  // Print colors
  for (const name of Object.keys(printColors)) {
    config[name] = `rgb(var(--color-${name}) / <alpha-value>)`;
  }

  // All semantic tokens (including pos-* theme tokens)
  for (const key of Object.keys(semanticColors)) {
    if (!config[key]) {
      config[key] = `rgb(var(--color-${key}) / <alpha-value>)`;
    }
  }

  return config;
}

// Automatically sync CSS variables to :root in browser environment
if (typeof document !== 'undefined') {
  const root = document.documentElement;
  for (const [key, val] of Object.entries(getCssVariables())) {
    root.style.setProperty(key, val);
  }
}
