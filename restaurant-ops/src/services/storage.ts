import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
export const storage = {
  get: async (key: string) => Platform.OS === 'web' ? (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)) : SecureStore.getItemAsync(key),
  set: async (key: string, value: string) => { if (Platform.OS === 'web') { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); } else await SecureStore.setItemAsync(key, value); },
  delete: async (key: string) => { if (Platform.OS === 'web') { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); } else await SecureStore.deleteItemAsync(key); },
};
