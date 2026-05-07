import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * Lazily load expo-speech-recognition so the module does not crash in Expo Go
 * where the native ExpoSpeechRecognition module is unavailable. The require()
 * is wrapped in try/catch; if it throws (Expo Go), `speechMod` stays null and
 * all voice paths become graceful no-ops.
 */
type SpeechMod = typeof import('expo-speech-recognition');

let speechMod: SpeechMod | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  speechMod = require('expo-speech-recognition') as SpeechMod;
} catch {
  speechMod = null;
}

const EXPO_GO_NOTICE =
  'Voice input needs a development build.\n\nRun:\n  npx expo run:ios --device\n\nThen open the app from Xcode / Expo CLI instead of Expo Go.';

const START_OPTIONS = {
  lang: 'en-US',
  interimResults: true,
  continuous: true,
  volumeChangeEventOptions: { enabled: true, intervalMillis: 30 },
  iosTaskHint: 'dictation' as const,
};

/** Recognition ended with nothing heard — expected when user stops voice mode without talking. */
const SILENT_END_ERRORS = new Set<string>(['no-speech', 'speech-timeout']);

function normalizeVolume(raw: number): number {
  if (raw < 0) return 0;
  // Map device → [0,1] a bit more aggressively so waves hit higher bandEnv sooner.
  return Math.min(1, raw / 4.75);
}

type Options = {
  onTranscript: (text: string) => void;
  onSessionEnd?: (lastTranscript: string) => void;
  onSessionStart?: () => void;
  /**
   * After this many ms without a new `result` event, call `stop()` to flush the
   * utterance when the transcript is non-empty. Omit or ≤0 to disable.
   */
  silenceCommitMs?: number;
};

export function useVoiceComposer({
  onTranscript,
  onSessionEnd,
  onSessionStart,
  silenceCommitMs,
}: Options) {
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  /** User speech observed (native VAD / first partial). Resets each recognition `start`. */
  const [speechPickedUp, setSpeechPickedUp] = useState(false);
  const voiceEnergy = useSharedValue(0);

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onSessionEndRef = useRef(onSessionEnd);
  onSessionEndRef.current = onSessionEnd;
  const onSessionStartRef = useRef(onSessionStart);
  onSessionStartRef.current = onSessionStart;
  const transcriptRef = useRef('');
  const listeningRef = useRef(false);
  listeningRef.current = listening;
  /** When true, the next recognition end must not commit (mic mute used `abort`). */
  const skipSessionEndRef = useRef(false);
  const silenceCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceCommitMsRef = useRef(silenceCommitMs);
  silenceCommitMsRef.current = silenceCommitMs;

  useEffect(() => {
    const mod = speechMod?.ExpoSpeechRecognitionModule;
    if (!mod) return; // Expo Go – skip, no-op

    const clearSilenceCommitTimer = () => {
      if (silenceCommitTimerRef.current != null) {
        clearTimeout(silenceCommitTimerRef.current);
        silenceCommitTimerRef.current = null;
      }
    };

    const scheduleSilenceCommit = () => {
      clearSilenceCommitTimer();
      const ms = silenceCommitMsRef.current;
      if (ms == null || ms <= 0) return;
      silenceCommitTimerRef.current = setTimeout(() => {
        silenceCommitTimerRef.current = null;
        const m = speechMod?.ExpoSpeechRecognitionModule;
        if (!m || !listeningRef.current) return;
        const t = transcriptRef.current.trim();
        if (!t) return;
        m.stop();
      }, ms);
    };

    const subs = [
      mod.addListener('volumechange', (ev: { value: number }) => {
        voiceEnergy.value = withTiming(normalizeVolume(ev.value), {
          duration: 90,
          easing: Easing.linear,
        });
      }),
      mod.addListener('start', () => {
        clearSilenceCommitTimer();
        setListening(true);
        setSpeechPickedUp(false);
        transcriptRef.current = '';
        onTranscriptRef.current('');
        onSessionStartRef.current?.();
      }),
      mod.addListener('speechstart', () => {
        setSpeechPickedUp(true);
      }),
      mod.addListener('result', (ev: { results: Array<{ transcript: string }> }) => {
        const text = ev.results[0]?.transcript ?? '';
        transcriptRef.current = text;
        onTranscriptRef.current(text);
        if (text.trim()) {
          setSpeechPickedUp(true);
          scheduleSilenceCommit();
        }
      }),
      mod.addListener('end', () => {
        clearSilenceCommitTimer();
        setListening(false);
        voiceEnergy.value = withTiming(0, { duration: 450 });
        const last = transcriptRef.current;
        transcriptRef.current = '';
        if (skipSessionEndRef.current) {
          skipSessionEndRef.current = false;
          return;
        }
        onSessionEndRef.current?.(last);
      }),
      mod.addListener('error', (ev: { error: string; message: string }) => {
        clearSilenceCommitTimer();
        setListening(false);
        voiceEnergy.value = withTiming(0, { duration: 250 });
        if (ev.error === 'aborted') {
          return;
        }
        if (SILENT_END_ERRORS.has(ev.error)) {
          return;
        }
        Alert.alert('Voice input', ev.message || ev.error);
      }),
    ];

    return () => {
      clearSilenceCommitTimer();
      subs.forEach((s) => s.remove());
      try { mod.abort(); } catch { /* already stopped */ }
    };
  // voiceEnergy is a shared value ref — stable across renders, safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = useCallback(async (): Promise<boolean> => {
    const mod = speechMod?.ExpoSpeechRecognitionModule;

    if (!mod) {
      Alert.alert('Development build required', EXPO_GO_NOTICE);
      return false;
    }

    if (listeningRef.current) {
      return true;
    }

    const perm = await mod.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Microphone & speech',
        'Please allow microphone and speech recognition to use voice input.',
      );
      return false;
    }

    skipSessionEndRef.current = false;
    mod.start(START_OPTIONS);
    return true;
  }, []);

  /**
   * Mic off: `abort()` stops capture and STT immediately without committing a turn
   * (same idea as muting a streaming assistant — no audio processed until unmute).
   * Unmute starts a fresh recognition session; there is no engine-level “pause” in
   * expo-speech-recognition.
   */
  const muteRecognition = useCallback(() => {
    if (silenceCommitTimerRef.current != null) {
      clearTimeout(silenceCommitTimerRef.current);
      silenceCommitTimerRef.current = null;
    }
    const mod = speechMod?.ExpoSpeechRecognitionModule;
    if (!mod || !listeningRef.current) return;
    skipSessionEndRef.current = true;
    mod.abort();
    setMuted(true);
    voiceEnergy.value = withTiming(0, { duration: 200 });
  }, [voiceEnergy]);

  const unmuteRecognition = useCallback(async () => {
    const ok = await startListening();
    if (ok) {
      setMuted(false);
    }
  }, [startListening]);

  const toggleMute = useCallback(() => {
    if (muted) {
      void unmuteRecognition();
    } else {
      muteRecognition();
    }
  }, [muted, muteRecognition, unmuteRecognition]);

  /**
   * End the voice-mode session from the Stop control.
   * If recognition is active, `stop()` commits a final transcript via the `end` event.
   * If muted (no active session), commit synchronously using the ref or fallback.
   */
  const endVoiceSession = useCallback((fallbackTranscript = '') => {
    if (silenceCommitTimerRef.current != null) {
      clearTimeout(silenceCommitTimerRef.current);
      silenceCommitTimerRef.current = null;
    }
    const mod = speechMod?.ExpoSpeechRecognitionModule;
    setMuted(false);
    if (listeningRef.current && mod) {
      mod.stop();
      return;
    }
    const last = transcriptRef.current || fallbackTranscript;
    transcriptRef.current = '';
    onSessionEndRef.current?.(last);
  }, []);

  return {
    listening,
    muted,
    speechPickedUp,
    voiceEnergy,
    startListening,
    toggleMute,
    endVoiceSession,
    voiceAvailable: speechMod !== null,
  };
}
