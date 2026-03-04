/**
 * Aegis Vault — Centralized Theme System
 * Provides light and dark color palettes with semantic naming.
 * All components should reference colors through this module.
 */

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ColorPalette {
  // Core surfaces
  bg: string;
  card: string;
  cardBorder: string;
  inputBg: string;

  // Text
  navy: string;          // Primary text
  muted: string;         // Subtle / secondary text
  white: string;         // Inverted / button text

  // Brand
  sage: string;
  sageLight: string;
  sageMid: string;

  // Semantic
  red: string;
  redBg: string;
  green: string;
  cyan: string;
  divider: string;

  // Navigation
  navBg: string;
  navBorder: string;

  // Modal
  modalOverlay: string;
  modalBg: string;

  // StatusBar
  statusBarStyle: 'light-content' | 'dark-content';
  statusBarBg: string;
}

export const LightPalette: ColorPalette = {
  bg: '#F0EEE9',
  card: 'rgba(255,255,255,0.45)',
  cardBorder: 'rgba(255,255,255,0.55)',
  inputBg: 'rgba(255,255,255,0.7)',

  navy: '#101828',
  muted: 'rgba(16,24,40,0.45)',
  white: '#fff',

  sage: '#72886f',
  sageLight: 'rgba(114,136,111,0.12)',
  sageMid: 'rgba(114,136,111,0.25)',

  red: '#ef4444',
  redBg: 'rgba(239,68,68,0.08)',
  green: '#22c55e',
  cyan: '#06b6d4',
  divider: 'rgba(16,24,40,0.06)',

  navBg: '#fff',
  navBorder: 'rgba(16,24,40,0.06)',

  modalOverlay: 'rgba(0,0,0,0.35)',
  modalBg: '#F0EEE9',

  statusBarStyle: 'dark-content',
  statusBarBg: '#F0EEE9',
};

export const DarkPalette: ColorPalette = {
  bg: '#0f1419',
  card: 'rgba(30,37,46,0.85)',
  cardBorder: 'rgba(55,65,81,0.5)',
  inputBg: 'rgba(30,37,46,0.9)',

  navy: '#e8eaed',
  muted: 'rgba(232,234,237,0.5)',
  white: '#fff',

  sage: '#8faa8b',
  sageLight: 'rgba(143,170,139,0.15)',
  sageMid: 'rgba(143,170,139,0.3)',

  red: '#f87171',
  redBg: 'rgba(248,113,113,0.12)',
  green: '#4ade80',
  cyan: '#22d3ee',
  divider: 'rgba(232,234,237,0.08)',

  navBg: '#161b22',
  navBorder: 'rgba(232,234,237,0.08)',

  modalOverlay: 'rgba(0,0,0,0.6)',
  modalBg: '#161b22',

  statusBarStyle: 'light-content',
  statusBarBg: '#0f1419',
};

/** Return the palette based on the mode flag */
export const getTheme = (isDark: boolean): ColorPalette =>
  isDark ? DarkPalette : LightPalette;
