import { Easing } from 'react-native-reanimated';

/** Bottom chat vs voice chrome — shared by App and BlobShape for lock-step motion. */
export const VOICE_CHROME_DURATION_MS = 320;
export const VOICE_CHROME_EASING = Easing.inOut(Easing.cubic);

/**
 * After the last speech-recognition result, wait this long with no new result
 * then `stop()` to finalize the utterance (auto-send turn).
 */
export const VOICE_SILENCE_COMMIT_MS = 1800;
