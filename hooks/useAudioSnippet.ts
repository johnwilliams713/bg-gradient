import { Audio } from 'expo-av';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

/**
 * useAudioSnippet — Claude-style "tap-to-record, tap-to-stop, transcribe via
 * Whisper" voice input.
 *
 * Lifecycle
 *  ─────────
 *    idle
 *      └─ toggle() → request permission, set audio mode for recording,
 *                    create + start Audio.Recording, store in ref
 *    recording
 *      └─ toggle() → stop & unload recording, reset audio mode for playback,
 *                    POST file to Whisper, await transcript
 *    processing  (no-op while toggle pressed)
 *      └─ on response → onTranscript(text), back to idle
 *
 * The recording instance is held in a useRef so it survives renders and can
 * be aborted on unmount without React state thrash.
 *
 * After stopping we restore allowsRecordingIOS=false so that any other audio
 * playback in the app (system sounds, future TTS, etc.) isn't routed through
 * the recording category and silenced.
 */

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';

export type SnippetState = 'idle' | 'recording' | 'processing';

type Options = {
  onTranscript: (text: string) => void;
  apiKey: string | undefined;
};

export function useAudioSnippet({ onTranscript, apiKey }: Options) {
  const [state, setState] = useState<SnippetState>('idle');
  const recordingRef = useRef<Audio.Recording | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const resetPlaybackMode = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
    } catch {
      // best-effort — non-fatal
    }
  }, []);

  const start = useCallback(async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Microphone access', 'Please allow microphone access to record voice notes.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setState('recording');
    } catch (err) {
      console.warn('[snippet] start failed', err);
      Alert.alert('Recording failed', err instanceof Error ? err.message : 'Unknown error');
      await resetPlaybackMode();
      setState('idle');
    }
  }, [resetPlaybackMode]);

  const stop = useCallback(async () => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (!recording) {
      setState('idle');
      return;
    }

    setState('processing');

    let uri: string | null = null;
    try {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
    } catch (err) {
      console.warn('[snippet] stop failed', err);
    }
    await resetPlaybackMode();

    if (!uri) {
      setState('idle');
      return;
    }

    if (!apiKey) {
      Alert.alert(
        'Whisper API key missing',
        'Add EXPO_PUBLIC_OPENAI_API_KEY=... to .env.local and restart Metro.',
      );
      setState('idle');
      return;
    }

    try {
      const formData = new FormData();
      // React Native's FormData accepts { uri, type, name } objects for files;
      // the standard DOM type doesn't model this, so we cast.
      formData.append(
        'file',
        { uri, type: 'audio/m4a', name: 'recording.m4a' } as unknown as Blob,
      );
      formData.append('model', 'whisper-1');

      const res = await fetch(WHISPER_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Whisper ${res.status}: ${body.slice(0, 200)}`);
      }

      const json = (await res.json()) as { text?: string };
      const text = (json.text ?? '').trim();
      if (text) onTranscriptRef.current(text);
    } catch (err) {
      console.warn('[snippet] transcribe failed', err);
      Alert.alert(
        'Transcription failed',
        err instanceof Error ? err.message : 'Unknown error',
      );
    } finally {
      setState('idle');
    }
  }, [apiKey, resetPlaybackMode]);

  const toggle = useCallback(() => {
    if (state === 'idle') {
      void start();
    } else if (state === 'recording') {
      void stop();
    }
    // processing → no-op (button visually disabled)
  }, [state, start, stop]);

  // Best-effort cleanup if the component unmounts mid-recording
  useEffect(() => {
    return () => {
      const r = recordingRef.current;
      if (r) {
        recordingRef.current = null;
        r.stopAndUnloadAsync().catch(() => {});
        void resetPlaybackMode();
      }
    };
  }, [resetPlaybackMode]);

  return { state, toggle };
}
