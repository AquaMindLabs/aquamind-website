import { initializeApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

function readRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Fill it in .env (based on .env.example).`
    );
  }

  return value;
}

const firebaseConfig = {
  apiKey: readRequiredEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: readRequiredEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: readRequiredEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: readRequiredEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readRequiredEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readRequiredEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
};

const app = initializeApp(firebaseConfig);

function createAuth() {
  if (Platform.OS === 'web') {
    return getAuth(app);
  }

  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createAuth();
export const db = getFirestore(app);
