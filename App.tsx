import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { VOICE_CHROME_DURATION_MS, VOICE_CHROME_EASING } from './constants/voiceChrome';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BlobShape } from './components/BlobShape';
import { BottomAppCluster } from './components/BottomAppCluster';
import { VoiceModeBottomBar } from './components/VoiceModeBottomBar';
import { useAudioSnippet } from './hooks/useAudioSnippet';
import { useVoiceComposer } from './hooks/useVoiceComposer';
import { PALETTE } from './constants/palette';

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

type Message = { id: string; role: 'user' | 'assistant'; text: string };

const VOICE_ACK =
  'Got it — this PoC does not call a real model yet, but your voice message was captured.';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [voiceSessionActive, setVoiceSessionActive] = useState(false);
  const voiceChromeProgress = useSharedValue(0);

  const handleSessionEnd = useCallback((lastTranscript: string) => {
    setVoiceSessionActive(false);
    const t = lastTranscript.trim();
    if (!t) return;
    const id = `${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `u-${id}`, role: 'user', text: t },
      { id: `a-${id}`, role: 'assistant', text: VOICE_ACK },
    ]);
    setDraft('');
  }, []);

  const {
    listening,
    muted,
    speechPickedUp,
    voiceEnergy,
    voiceAvailable,
    startListening,
    toggleMute,
    endVoiceSession,
  } = useVoiceComposer({
    onTranscript: setDraft,
    onSessionEnd: handleSessionEnd,
  });

  useEffect(() => {
    voiceChromeProgress.value = withTiming(voiceSessionActive ? 1 : 0, {
      duration: VOICE_CHROME_DURATION_MS,
      easing: VOICE_CHROME_EASING,
    });
  }, [voiceSessionActive]);

  const enterVoiceMode = useCallback(async () => {
    setVoiceSessionActive(true);
    const ok = await startListening();
    if (!ok) {
      setVoiceSessionActive(false);
    }
  }, [startListening]);

  const handleStopVoiceMode = useCallback(() => {
    endVoiceSession(draft);
  }, [draft, endVoiceSession]);

  const chatChromeStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(voiceChromeProgress.value, [0, 1], [0, 220]),
      },
    ],
    opacity: interpolate(voiceChromeProgress.value, [0, 1], [1, 0]),
  }));

  const voiceChromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(voiceChromeProgress.value, [0, 1], [0, 1]),
    transform: [
      {
        translateY: interpolate(voiceChromeProgress.value, [0, 1], [140, 0]),
      },
    ],
  }));

  const handleSendText = useCallback((text: string) => {
    const id = `${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `u-${id}`, role: 'user', text },
      { id: `a-${id}`, role: 'assistant', text: VOICE_ACK },
    ]);
    setDraft('');
  }, []);

  const handleSnippetTranscript = useCallback((text: string) => {
    setDraft((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text));
  }, []);

  const { state: snippetState, toggle: toggleSnippet } = useAudioSnippet({
    onTranscript: handleSnippetTranscript,
    apiKey: OPENAI_API_KEY,
  });

  return (
    <SafeAreaProvider style={styles.appBackground}>
      {/* Skia blob — peeks 50 % above screen bottom, reacts to voice */}
      <BlobShape
        voiceEnergy={voiceEnergy}
        voiceChromeProgress={voiceChromeProgress}
      />

      <SafeAreaView style={styles.root} edges={['top']}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable hitSlop={12} style={styles.headerIcon}>
              <Text style={styles.headerIconText}>☰</Text>
            </Pressable>
            <View style={styles.headerTitles}>
              <Text style={styles.headerTitle}>Claude</Text>
              <Text style={styles.headerSubtitle}>Sonnet · PoC</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          {/* Thread */}
          <View style={styles.threadWrap}>
            <ScrollView
              style={styles.thread}
              contentContainerStyle={styles.threadContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {messages.map((m) => (
                <View
                  key={m.id}
                  style={[
                    styles.messageRow,
                    m.role === 'user' && styles.messageRowUser,
                  ]}
                >
                  {m.role === 'assistant' ? (
                    <View style={styles.assistantBlock}>
                      <Text style={styles.assistantLabel}>Claude</Text>
                      <Text style={styles.messageText}>{m.text}</Text>
                    </View>
                  ) : (
                    <View style={styles.userBubble}>
                      <Text style={styles.userText}>{m.text}</Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
            {voiceSessionActive && !speechPickedUp ? (
              <View style={styles.voiceCueOverlay} pointerEvents="none">
                <Text style={styles.voiceCueText}>Start Talking</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.bottomChrome}>
            <Animated.View
              style={chatChromeStyle}
              pointerEvents={voiceSessionActive ? 'none' : 'auto'}
            >
              <BottomAppCluster
                value={draft}
                onChangeText={setDraft}
                listening={listening}
                voiceAvailable={voiceAvailable}
                onVoicePress={enterVoiceMode}
                onSend={handleSendText}
                snippetState={snippetState}
                onMicSnippetPress={toggleSnippet}
              />
            </Animated.View>
            <Animated.View
              pointerEvents={voiceSessionActive ? 'box-none' : 'none'}
              style={[
                styles.voiceChromeLayer,
                voiceChromeStyle,
              ]}
            >
              <VoiceModeBottomBar
                muted={muted}
                onToggleMute={toggleMute}
                onStop={handleStopVoiceMode}
              />
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  appBackground: {
    flex: 1,
    backgroundColor: PALETTE.canvas,
  },
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  headerIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: {
    fontSize: 20,
    color: '#3A3830',
  },
  headerTitles: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1814',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#7A7260',
  },
  headerSpacer: {
    width: 44,
  },
  threadWrap: {
    flex: 1,
    position: 'relative',
  },
  voiceCueOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceCueText: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: 'rgba(26,24,20,0.55)',
  },
  bottomChrome: {
    position: 'relative',
  },
  voiceChromeLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  thread: {
    flex: 1,
  },
  threadContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  messageRow: {
    marginBottom: 20,
  },
  messageRowUser: {
    alignItems: 'flex-end',
  },
  assistantBlock: {
    maxWidth: '94%',
  },
  assistantLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: PALETTE.flame,
    marginBottom: 5,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1A1814',
  },
  userBubble: {
    maxWidth: '88%',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  userText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#1A1814',
  },
});
