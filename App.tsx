import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BlobShape } from './components/BlobShape';
import { AnimatedMeshFooter } from './components/AnimatedMeshFooter';
import { useVoiceComposer } from './hooks/useVoiceComposer';
import { PALETTE } from './constants/palette';

type Message = { id: string; role: 'user' | 'assistant'; text: string };

const VOICE_ACK =
  'Got it — this PoC does not call a real model yet, but your voice message was captured.';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');

  const handleSessionEnd = useCallback((lastTranscript: string) => {
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

  const { listening, voiceEnergy, toggleMic, voiceAvailable } = useVoiceComposer({
    onTranscript: setDraft,
    onSessionEnd: handleSessionEnd,
  });

  return (
    <SafeAreaProvider>
      {/* Skia blob — peeks 50 % above screen bottom, reacts to voice */}
      <BlobShape voiceEnergy={voiceEnergy} />

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

          {/* Frosted-glass composer */}
          <AnimatedMeshFooter
            value={draft}
            onChangeText={setDraft}
            voiceEnergy={voiceEnergy}
            listening={listening}
            onMicPress={toggleMic}
            voiceAvailable={voiceAvailable}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
