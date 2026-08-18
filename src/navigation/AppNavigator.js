// src/navigation/AppNavigator.js
import React, { useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import useStore from '../store/useStore';
import useTheme from '../theme/useTheme';
import { THEME_IDS } from '../theme/themes';

// Admin screens
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
import PortefeuilleScreen from '../screens/admin/PortefeuilleScreen';

// Adherent screens
import AdherentHomeScreen from '../screens/adherent/AdherentHomeScreen';
import AdherentCreneauxScreen from '../screens/adherent/AdherentCreneauxScreen';
import AdherentPresencesScreen from '../screens/adherent/AdherentPresencesScreen';
import AdherentPaiementsScreen from '../screens/adherent/AdherentPaiementsScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ── Admin navigation (stack inchangé) ──────────────────────────────────────
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
        options={({ navigation }) => ({
          title: 'Adhérents',
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate('Config')}
              style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                alignItems: 'center', justifyContent: 'center', marginRight: 4,
              }}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="cog" size={22} color="#94A3B8" />
            </TouchableOpacity>
          ),
        })}
      />
      <Stack.Screen name="AdherentDetail" component={AdherentDetailScreen} options={{ title: 'Fiche adhérent' }} />
      <Stack.Screen
        name="AdherentForm"
        component={AdherentFormScreen}
        options={({ route }) => ({
          title: route.params?.adherentId ? 'Modifier adhérent' : 'Nouvel adhérent',
        })}
      />
      <Stack.Screen name="PaymentList"   component={PaymentListScreen}   options={{ title: 'Paiements' }} />
      <Stack.Screen name="PaymentDetail" component={PaymentDetailScreen} options={{ title: 'Détail paiements' }} />
      <Stack.Screen name="Portefeuille"  component={PortefeuilleScreen}  options={{ title: 'Portefeuille' }} />
      <Stack.Screen name="Seasons"       component={SeasonScreen}        options={{ title: 'Saisons' }} />
      <Stack.Screen name="Creneaux"      component={CreneauxScreen}      options={{ title: 'Planning & Créneaux' }} />
      <Stack.Screen name="Presences"     component={PresencesScreen}     options={{ title: 'Appel & Présences' }} />
      <Stack.Screen name="Config"        component={ConfigScreen}        options={{ title: 'Configuration' }} />
    </Stack.Navigator>
  );
}

// ── Espace adhérent — Bottom Tabs ───────────────────────────────────────────
function AdherentTabs({ COLORS }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.bgCard,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Accueil:      'home',
            MesCreneaux:  'calendar-clock',
            MesPresences: 'clipboard-check-outline',
            MesPaiements: 'cash-multiple',
          };
          return (
            <MaterialCommunityIcons name={icons[route.name] || 'circle'} size={size} color={color} />
          );
        },
      })}
    >
      <Tab.Screen
        name="Accueil"
        component={AdherentHomeScreen}
        options={{ tabBarLabel: 'Accueil' }}
      />
      <Tab.Screen
        name="MesCreneaux"
        component={AdherentCreneauxScreen}
        options={{ tabBarLabel: 'Créneaux' }}
      />
      <Tab.Screen
        name="MesPresences"
        component={AdherentPresencesScreen}
        options={{ tabBarLabel: 'Présences' }}
      />
      <Tab.Screen
        name="MesPaiements"
        component={AdherentPaiementsScreen}
        options={{ tabBarLabel: 'Paiements' }}
      />
    </Tab.Navigator>
  );
}

// ── Root navigator ───────────────────────────────────────────────────────────
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
        <AdherentTabs COLORS={COLORS} />
      )}
    </NavigationContainer>
  );
}
