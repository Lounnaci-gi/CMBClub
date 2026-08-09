// src/theme/themes.js
// Palettes de thèmes CMBClub

export const THEME_IDS = {
  DARK: 'dark',
  LIGHT: 'light',
  CLUB: 'club',
};

export const THEME_OPTIONS = [
  { id: THEME_IDS.DARK, label: 'Sombre', icon: 'weather-night', preview: '#0095FF' },
  { id: THEME_IDS.LIGHT, label: 'Clair', icon: 'white-balance-sunny', preview: '#0284C7' },
  { id: THEME_IDS.CLUB, label: 'Club CMB', icon: 'shield-star', preview: '#DC2626' },
];

export const THEMES = {
  [THEME_IDS.DARK]: {
    bg: '#0F1923',
    bgCard: '#1A2535',
    bgInput: '#1E2D40',
    bgModal: '#141E2B',
    primary: '#0095FF',
    primaryLight: '#3AABFF',
    primaryDark: '#006FBE',
    secondary: '#F9CA24',
    secondaryLight: '#FEDD5C',
    success: '#1DD1A1',
    successLight: '#55EFC4',
    danger: '#EE5A24',
    dangerLight: '#FFA07A',
    warning: '#F9CA24',
    textPrimary: '#FFFFFF',
    textSecondary: '#8FA3BB',
    textMuted: '#4A6179',
    textInverse: '#0F1923',
    border: '#1E3050',
    borderLight: '#2A4060',
    gradStart: '#0F1923',
    gradMid: '#122035',
    gradEnd: '#0A1520',
    catPoussin: '#FF9F43',
    catPupille: '#54A0FF',
    catMinime: '#5F27CD',
    catCadet: '#00D2D3',
    catJunior: '#1DD1A1',
    catSenior: '#EE5A24',
    catVeteran: '#C8D6E5',
  },
  [THEME_IDS.LIGHT]: {
    bg: '#F1F5F9',
    bgCard: '#FFFFFF',
    bgInput: '#E2E8F0',
    bgModal: '#FFFFFF',
    primary: '#0284C7',
    primaryLight: '#38BDF8',
    primaryDark: '#0369A1',
    secondary: '#CA8A04',
    secondaryLight: '#EAB308',
    success: '#059669',
    successLight: '#34D399',
    danger: '#DC2626',
    dangerLight: '#F87171',
    warning: '#D97706',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    textInverse: '#FFFFFF',
    border: '#CBD5E1',
    borderLight: '#E2E8F0',
    gradStart: '#F1F5F9',
    gradMid: '#E2E8F0',
    gradEnd: '#CBD5E1',
    catPoussin: '#EA580C',
    catPupille: '#2563EB',
    catMinime: '#7C3AED',
    catCadet: '#0891B2',
    catJunior: '#059669',
    catSenior: '#DC2626',
    catVeteran: '#64748B',
  },
  [THEME_IDS.CLUB]: {
    bg: '#1A0A0A',
    bgCard: '#2D1212',
    bgInput: '#3D1818',
    bgModal: '#220C0C',
    primary: '#DC2626',
    primaryLight: '#EF4444',
    primaryDark: '#B91C1C',
    secondary: '#F9CA24',
    secondaryLight: '#FDE047',
    success: '#16A34A',
    successLight: '#4ADE80',
    danger: '#EA580C',
    dangerLight: '#FB923C',
    warning: '#F59E0B',
    textPrimary: '#FFFFFF',
    textSecondary: '#FCA5A5',
    textMuted: '#9F7070',
    textInverse: '#1A0A0A',
    border: '#4A2020',
    borderLight: '#6B3030',
    gradStart: '#1A0A0A',
    gradMid: '#2D1212',
    gradEnd: '#150808',
    catPoussin: '#FF9F43',
    catPupille: '#54A0FF',
    catMinime: '#5F27CD',
    catCadet: '#00D2D3',
    catJunior: '#1DD1A1',
    catSenior: '#EE5A24',
    catVeteran: '#C8D6E5',
  },
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export function getShadows(colors) {
  return {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    button: {
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 8,
    },
  };
}

export function getThemeColors(themeId) {
  return THEMES[themeId] || THEMES[THEME_IDS.DARK];
}
