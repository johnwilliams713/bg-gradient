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

function normalizeVolume(raw: number): number {
  if (raw < 0) return 0;
  return Math.min(1, raw / 7);
}

type Options = {
  onTranscript: (text: string) => void;
  onSessionEnd?: (lastTranscript: string) => void;
  onSessionStart?: () => void;
};

export function useVoiceComposer({
  onTranscript,
  onSessionEnd,
  onSessionStart,
}: Options) {
  const [listening, setListening] = useState(false);
  const voiceEnergy = useSharedValue(0);

  // Stable refs so listeners never go stale
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onSessionEndRef = useRef(onSessionEnd);
  onSessionEndRef.current = onSessionEnd;
  const onSessionStartRef = useRef(onSessionStart);
  onSessionStartRef.current = onSessionStart;
  const transcriptRef = useRef('');
  const listeningRef = useRef(false);
  listeningRef.current = listening;

  // Register all native listeners imperatively inside one useEffect so the
  // hook call-count is always the same whether or not the native module exists.
  useEffect(() => {
    const mod = speechMod?.ExpoSpeechRecognitionModule;
    if (!mod) return; // Expo Go – skip, no-op

    const subs = [
      mod.addListener('volumechange', (ev: { value: number }) => {
        // Ramp toward each new sample over ~90ms so Reanimated interpolates
        // every display frame between the (slower) audio samples. Linear easing
        // chains gracefully when interrupted by the next sample.
        voiceEnergy.value = withTiming(normalizeVolume(ev.value), {
          duration: 90,
          easing: Easing.linear,
        });
      }),
      mod.addListener('start', () => {
        setListening(true);
        transcriptRef.current = '';
        onSessionStartRef.current?.();
      }),
      mod.addListener('result', (ev: { results: Array<{ transcript: string }> }) => {
        const text = ev.results[0]?.transcript ?? '';
        transcriptRef.current = text;
        onTranscriptRef.current(text);
      }),
      mod.addListener('end', () => {
        setListening(false);
        voiceEnergy.value = withTiming(0, { duration: 450 });
        const last = transcriptRef.current;
        transcriptRef.current = '';
        onSessionEndRef.current?.(last);
      }),
      mod.addListener('error', (ev: { error: string; message: string }) => {
        setListening(false);
        voiceEnergy.value = withTiming(0, { duration: 250 });
        if (ev.error !== 'aborted') {
          Alert.alert('Voice input', ev.message || ev.error);
        }
      }),
    ];

    return () => {
      subs.forEach((s) => s.remove());
      try { mod.abort(); } catch { /* already stopped */ }
    };
  // voiceEnergy is a shared value ref — stable across renders, safe to omit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = useCallback(async () => {
    const mod = speechMod?.ExpoSpeechRecognitionModule;

    if (!mod) {
      Alert.alert('Development build required', EXPO_GO_NOTICE);
      return;
    }

    if (listeningRef.current) {
      mod.stop();
      return;
    }

    const perm = await mod.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Microphone & speech',
        'Please allow microphone and speech recognition to use voice input.',
      );
      return;
    }

    mod.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 30 },
      iosTaskHint: 'dictation',
    });
  }, []);

  return { listening, voiceEnergy, toggleMic, voiceAvailable: speechMod !== null };
}
