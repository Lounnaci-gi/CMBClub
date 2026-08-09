import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import React, { useEffect, useState, useMemo } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, StatusBar, Image } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getDatabase } from './src/database/database';
import AppNavigator from './src/navigation/AppNavigator';
import useStore from './src/store/useStore';
import useTheme from './src/theme/useTheme';
import { THEME_IDS } from './src/theme/themes';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const loadConfig = useStore(s => s.loadConfig);
  const { colors: COLORS, RADIUS, shadows: SHADOWS, themeId } = useTheme();
  const statusBarStyle = themeId === THEME_IDS.LIGHT ? 'dark-content' : 'light-content';
  const styles = useMemo(() => createStyles(COLORS, RADIUS, SHADOWS), [COLORS, RADIUS, SHADOWS]);

  useEffect(() => {
    (async () => {
      try {
        await getDatabase();
        await loadConfig();
        setReady(true);
      } catch (e) {
        setError(e.message || 'Erreur d\'initialisation');
      }
    })();
  }, [loadConfig]);

  if (error) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle={statusBarStyle} />
        <Text style={styles.errorTitle}>Erreur</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <StatusBar barStyle={statusBarStyle} />
        <Image
          source={require('./assets/cmbclub.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Initialisation CMBClub…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle={statusBarStyle} backgroundColor={COLORS.bg} />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const createStyles = (COLORS, RADIUS, SHADOWS) => StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 8,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 8,
  },
  errorTitle: {
    color: COLORS.danger,
    fontSize: 20,
    fontWeight: '700',
  },
  errorText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
});
