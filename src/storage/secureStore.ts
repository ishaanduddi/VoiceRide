/**
 * Thin wrapper around expo-secure-store.
 *
 * All credentials (Spotify access/refresh tokens) go through here so that they
 * are encrypted at rest by the OS keychain / Android Keystore. Nothing in this
 * app writes a token to AsyncStorage or to the repository.
 */

import * as SecureStore from 'expo-secure-store';

import { createLogger } from '@/utils/logger';

const log = createLogger('secure-store');

export async function saveSecure(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    log.warn(`failed to write ${key}`, error);
    throw error;
  }
}

export async function loadSecure(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    log.warn(`failed to read ${key}`, error);
    return null;
  }
}

export async function deleteSecure(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    log.warn(`failed to delete ${key}`, error);
  }
}

export async function saveJsonSecure<T>(key: string, value: T): Promise<void> {
  await saveSecure(key, JSON.stringify(value));
}

export async function loadJsonSecure<T>(key: string): Promise<T | null> {
  const raw = await loadSecure(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    log.warn(`corrupt JSON in ${key}, ignoring`);
    return null;
  }
}
