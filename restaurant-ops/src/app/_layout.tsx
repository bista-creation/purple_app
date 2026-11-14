import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { initNotificationHandler, setupNotificationChannels } from '../services/notifications';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2_000,
      gcTime: 60_000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});

initNotificationHandler();

function AppSetup() {
  useEffect(() => {
    // Configure audio system for alarm playback
    if (Platform.OS !== 'web') {
      void import('expo-audio')
        .then(({ setAudioModeAsync }) =>
          setAudioModeAsync({
            playsInSilentMode: true,
            interruptionMode: 'doNotMix',
            shouldPlayInBackground: true,
          })
        )
        .catch(() => undefined);
    }

    // Configure all Android notification channels
    void setupNotificationChannels();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppSetup />
    </QueryClientProvider>
  );
}
