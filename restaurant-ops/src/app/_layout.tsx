import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { Platform } from 'react-native';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 2_000, gcTime: 60_000, retry: 1, refetchOnWindowFocus: true }, mutations: { retry: 0 } } });
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }) });

function AppSetup() {
  useEffect(() => {
    if (Platform.OS !== 'web') {
      void import('expo-audio').then(({ setAudioModeAsync }) => setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'doNotMix' })).catch(() => undefined);
    }
    if (Platform.OS === 'android') void Notifications.setNotificationChannelAsync('incoming-orders', { name: 'Incoming orders', description: 'Urgent new restaurant orders', importance: AndroidImportance.MAX, vibrationPattern: [0, 450, 180, 450, 180, 450], lightColor: '#F5B942', sound: 'order-alert.wav', lockscreenVisibility: AndroidNotificationVisibility.PUBLIC });
  }, []);
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() { return <QueryClientProvider client={queryClient}><AppSetup /></QueryClientProvider>; }
