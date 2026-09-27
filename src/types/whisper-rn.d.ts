// Type shim for `whisper.rn`.
//
// The package declares a conditional "exports" map with only wildcard subpaths
// and no root "." entry, so TypeScript (moduleResolution: bundler) cannot
// resolve the bare specifier. Reading it as "Unable to resolve module whisper.rn".
//
// We only ever load it dynamically, and the small surface we use is re-declared
// locally in src/voice/asr/whisper/whisperModule.ts, so a permissive declaration
// is enough here and keeps us immune to upstream type changes.
declare module 'whisper.rn';
