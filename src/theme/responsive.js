// src/theme/responsive.js
// Système de mise en page réactive (breakpoints & dimensions dynamiques)

import React from 'react';
import { useWindowDimensions, View, StyleSheet } from 'react-native';

export const BREAKPOINTS = {
  smallPhone: 380,
  phone: 600,
  tablet: 1024,
};

export const MAX_CONTENT_WIDTHS = {
  form: 680,
  card: 480,
  modal: 640,
  page: 1100,
  wide: 1280,
};

/**
 * Hook retournant les informations d'écran et de responsive en temps réel
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const isSmall = width < BREAKPOINTS.smallPhone;
  const isPhone = width < BREAKPOINTS.phone;
  const isTablet = width >= BREAKPOINTS.phone && width < BREAKPOINTS.tablet;
  const isDesktop = width >= BREAKPOINTS.tablet;
  const isLandscape = width > height;

  // Calcul du nombre optimal de colonnes pour les grilles
  let numColumns = 1;
  if (width >= 900) {
    numColumns = 3;
  } else if (width >= 560) {
    numColumns = 2;
  }

  // Nombre de colonnes pour les boutons d'actions rapides (Dashboard)
  let dashboardActionCols = 3;
  if (isSmall) {
    dashboardActionCols = 2;
  } else if (isTablet || isDesktop) {
    dashboardActionCols = width >= 800 ? 6 : 4;
  }

  // Nombre de colonnes pour les cartes de statistiques
  let statCols = 3;
  if (isSmall) {
    statCols = 1;
  } else if (width >= 600) {
    statCols = 3;
  }

  // Largeur maximale sécurisée pour conteneur centré
  const getContainerWidth = (maxWidth = MAX_CONTENT_WIDTHS.page) => {
    return Math.min(width, maxWidth);
  };

  // Padding horizontal adaptatif
  const horizontalPadding = isSmall ? 12 : isTablet ? 24 : isDesktop ? 32 : 16;

  return {
    width,
    height,
    isSmall,
    isPhone,
    isTablet,
    isDesktop,
    isLandscape,
    numColumns,
    dashboardActionCols,
    statCols,
    getContainerWidth,
    horizontalPadding,
  };
}

/**
 * Composant conteneur centré pour tablettes et grands écrans
 */
export function ResponsiveContainer({
  children,
  maxWidth = MAX_CONTENT_WIDTHS.page,
  style,
  contentStyle,
  ...props
}) {
  const { width } = useWindowDimensions();
  const shouldConstrain = width > maxWidth;

  return (
    <View style={[styles.root, style]} {...props}>
      <View
        style={[
          styles.inner,
          shouldConstrain && { maxWidth, alignSelf: 'center', width: '100%' },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  inner: {
    flex: 1,
    width: '100%',
  },
});
