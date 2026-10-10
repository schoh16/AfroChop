import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const tokenKey = 'afrochop.auth-token';

export const authTokenStorage = {
  get: () => Platform.OS === 'web' ? Promise.resolve(null) : SecureStore.getItemAsync(tokenKey),
  set: (token: string) => Platform.OS === 'web'
    ? Promise.resolve()
    : SecureStore.setItemAsync(tokenKey, token),
  remove: () => Platform.OS === 'web'
    ? Promise.resolve()
    : SecureStore.deleteItemAsync(tokenKey),
};
