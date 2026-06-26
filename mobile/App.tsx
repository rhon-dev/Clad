import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

import { supabase } from './src/lib/supabase';
import AuthScreen from './src/screens/AuthScreen';
import WardrobeScreen from './src/screens/WardrobeScreen';
import UploadScreen from './src/screens/UploadScreen';
import RecommendScreen from './src/screens/RecommendScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0f0f0f' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarStyle: { backgroundColor: '#0f0f0f', borderTopColor: '#1a1a1a' },
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#555',
      }}
    >
      <Tab.Screen
        name="Wardrobe"
        component={WardrobeScreen}
        options={{ tabBarLabel: 'Wardrobe', title: 'My Wardrobe' }}
      />
      <Tab.Screen
        name="Recommend"
        component={RecommendScreen}
        options={{ tabBarLabel: 'Outfit', title: 'Get Outfit' }}
      />
    </Tab.Navigator>
  );
}

async function handleDeepLink(url: string) {
  // Supabase appends tokens as URL fragment: #access_token=...&refresh_token=...
  // expo-linking parses # as part of the path on some platforms, so handle both
  const parsed = Linking.parse(url);
  const fragment = url.split('#')[1] ?? '';
  const params = new URLSearchParams(fragment);

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Handle magic link that opened the app cold
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    // Handle magic link while app is already open
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => {
      sub.remove();
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0f0f0f', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#6366f1" size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {!session ? (
          <Stack.Screen
            name="Auth"
            component={AuthScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="Main"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Upload"
              component={UploadScreen}
              options={{
                title: 'Add Item',
                headerStyle: { backgroundColor: '#0f0f0f' },
                headerTintColor: '#fff',
                presentation: 'modal',
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
