// src/navigation/AppNavigator.js
import React, { useMemo } from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import useStore from '../store/useStore';
import useTheme from '../theme/useTheme';
import { THEME_IDS } from '../theme/themes';

import LoginScreen from '../screens/auth/LoginScreen';
import AdminDashboard from '../screens/admin/AdminDashboard';
import AdherentListScreen from '../screens/admin/AdherentListScreen';
import AdherentDetailScreen from '../screens/admin/AdherentDetailScreen';
import AdherentFormScreen from '../screens/admin/AdherentFormScreen';
import PaymentListScreen from '../screens/admin/PaymentListScreen';
import PaymentDetailScreen from '../screens/admin/PaymentDetailScreen';
import SeasonScreen from '../screens/admin/SeasonScreen';
import ConfigScreen from '../screens/admin/ConfigScreen';
import CreneauxScreen from '../screens/admin/CreneauxScreen';
import PresencesScreen from '../screens/admin/PresencesScreen';
import AdherentHomeScreen from '../screens/adherent/AdherentHomeScreen';

const Stack = createNativeStackNavigator();

function AdminStack({ screenOptions }) {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Dashboard"
        component={AdminDashboard}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AdherentList"
        component={AdherentListScreen}
        options={{ title: 'Adhérents' }}
      />
      <Stack.Screen
        name="AdherentDetail"
        component={AdherentDetailScreen}
        options={{ title: 'Fiche adhérent' }}
      />
      <Stack.Screen
        name="AdherentForm"
        component={AdherentFormScreen}
        options={({ route }) => ({
          title: route.params?.adherentId ? 'Modifier adhérent' : 'Nouvel adhérent',
        })}
      />
      <Stack.Screen
        name="PaymentList"
        component={PaymentListScreen}
        options={{ title: 'Paiements' }}
      />
      <Stack.Screen
        name="PaymentDetail"
        component={PaymentDetailScreen}
        options={{ title: 'Détail paiements' }}
      />
      <Stack.Screen
        name="Seasons"
        component={SeasonScreen}
        options={{ title: 'Saisons' }}
      />
      <Stack.Screen
        name="Creneaux"
        component={CreneauxScreen}
        options={{ title: 'Planning & Créneaux' }}
      />
      <Stack.Screen
        name="Presences"
        component={PresencesScreen}
        options={{ title: 'Appel & Présences' }}
      />
      <Stack.Screen
        name="Config"
        component={ConfigScreen}
        options={{ title: 'Configuration' }}
      />
    </Stack.Navigator>
  );
}

function AdherentStack({ screenOptions }) {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="AdherentHome"
        component={AdherentHomeScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const user = useStore(s => s.user);
  const { colors: COLORS, themeId } = useTheme();

  const navTheme = useMemo(() => {
    const base = themeId === THEME_IDS.LIGHT ? DefaultTheme : DarkTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: COLORS.bg,
        card: COLORS.bgCard,
        text: COLORS.textPrimary,
        border: COLORS.border,
        primary: COLORS.primary,
      },
    };
  }, [COLORS, themeId]);

  const screenOptions = useMemo(() => ({
    headerStyle: { backgroundColor: COLORS.bgCard },
    headerTintColor: COLORS.textPrimary,
    headerTitleStyle: { fontWeight: '700', fontSize: 17 },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: COLORS.bg },
  }), [COLORS]);

  return (
    <NavigationContainer theme={navTheme}>
      {!user ? (
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.bg } }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      ) : user.role === 'admin' ? (
        <AdminStack screenOptions={screenOptions} />
      ) : (
        <AdherentStack screenOptions={screenOptions} />
      )}
    </NavigationContainer>
  );
}
