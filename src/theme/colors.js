// src/theme/colors.js
// Palette de couleurs CMBClub – thème sombre premium

export const COLORS = {
  // Backgrounds
  bg: '#0F1923',
  bgCard: '#1A2535',
  bgInput: '#1E2D40',
  bgModal: '#141E2B',

  // Primary accent – bleu sport
  primary: '#0095FF',
  primaryLight: '#3AABFF',
  primaryDark: '#006FBE',

  // Secondary – doré
  secondary: '#F9CA24',
  secondaryLight: '#FEDD5C',

  // Accent – vert succès
  success: '#1DD1A1',
  successLight: '#55EFC4',

  // Danger / retard
  danger: '#EE5A24',
  dangerLight: '#FFA07A',

  // Warning
  warning: '#F9CA24',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#8FA3BB',
  textMuted: '#4A6179',
  textInverse: '#0F1923',

  // Borders
  border: '#1E3050',
  borderLight: '#2A4060',

  // Gradient stops
  gradStart: '#0F1923',
  gradMid: '#122035',
  gradEnd: '#0A1520',

  // Category colors
  catPoussin: '#FF9F43',
  catPupille: '#54A0FF',
  catMinime: '#5F27CD',
  catCadet: '#00D2D3',
  catJunior: '#1DD1A1',
  catSenior: '#EE5A24',
  catVeteran: '#C8D6E5',
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  bold: 'System',
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const SHADOWS = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  button: {
    shadowColor: '#0095FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
};
