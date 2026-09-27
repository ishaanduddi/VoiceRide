/**
 * Ambient types for the compile-time environment variables Expo inlines.
 * Keeping them typed means a typo in `process.env.EXPO_PUBLIC_...` fails the
 * TypeScript build instead of silently evaluating to `undefined`.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_SPOTIFY_CLIENT_ID?: string;
    readonly EXPO_PUBLIC_SPOTIFY_MARKET?: string;
    readonly EXPO_PUBLIC_ASR_ENDPOINT?: string;
    readonly EXPO_PUBLIC_ASR_API_KEY?: string;
    readonly EXPO_PUBLIC_ASR_MODEL?: string;
    readonly NODE_ENV?: 'development' | 'production' | 'test';
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};
