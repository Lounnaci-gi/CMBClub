// src/navigation/AppNavigator.js
import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import useStore from '../store/useStore';
import { COLORS } from '../theme/colors';

import LoginScreen from '../screens/auth/LoginScreen';
import AdminDashboard from '../screens/admin/AdminDashboard';
import AdherentListScreen from '../screens/admin/AdherentListScreen';
import AdherentDetailScreen from '../screens/admin/AdherentDetailScreen';
import AdherentFormScreen from '../screens/admin/AdherentFormScreen';
import PaymentListScreen from '../screens/admin/PaymentListScreen';
import PaymentDetailScreen from '../screens/admin/PaymentDetailScreen';
import SeasonScreen from '../screens/admin/SeasonScreen';
import ConfigScreen from '../screens/admin/ConfigScreen';
import AdherentHomeScreen from '../screens/adherent/AdherentHomeScreen';

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: COLORS.bg,
    card: COLORS.bgCard,
    text: COLORS.textPrimary,
    border: COLORS.border,
    primary: COLORS.primary,
  },
};

const screenOptions = {
  headerStyle: { backgroundColor: COLORS.bgCard },
  headerTintColor: COLORS.textPrimary,
  headerTitleStyle: { fontWeight: '700', fontSize: 17 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: COLORS.bg },
};

function AdminStack() {
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
        name="Config"
        component={ConfigScreen}
        options={{ title: 'Configuration' }}
      />
    </Stack.Navigator>
  );
}

function AdherentStack() {
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

  return (
    <NavigationContainer theme={navTheme}>
      {!user ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      ) : user.role === 'admin' ? (
        <AdminStack />
      ) : (
        <AdherentStack />
      )}
    </NavigationContainer>
  );
}
