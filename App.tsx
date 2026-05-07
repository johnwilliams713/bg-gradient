import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
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
import {
  VOICE_CHROME_DURATION_MS,
  VOICE_CHROME_EASING,
  VOICE_SILENCE_COMMIT_MS,
} from './constants/voiceChrome';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlobShape } from './components/BlobShape';
import { RebaLogo } from './components/RebaLogo';
import { BottomAppCluster } from './components/BottomAppCluster';
import { VoiceLiveTranscript, VoiceSubtitleStrip } from './components/VoiceLiveTranscript';
import { VoiceModeBottomBar } from './components/VoiceModeBottomBar';
import { useVoiceComposer } from './hooks/useVoiceComposer';
import { PALETTE, rgba } from './constants/palette';

type Message = { id: string; role: 'user' | 'assistant'; text: string };

/** Stub assistant turn until a real model is wired (voice-continue flow + text send). */
const REBA_PLACEHOLDER =
  'Got it — this PoC does not call a real model yet, but I heard your message.';

/** After the placeholder is committed to the thread, wait before reopening the mic. */
const VOICE_REACTIVATION_DELAY_MS = 450;

/** Pixels above the thread bottom the last message should stay clear of (obstruction band). */
const THREAD_BOTTOM_CLEARANCE_PX = 260;
/** Collapsed header: padding (10+10) + 44px tap row. */
const HEADER_EXPANDED_HEIGHT = 64;
/** Voice mode: scrim height at top of thread (device top band). */
const VOICE_TOP_FADE_PX = 48;
/** Within {@link VOICE_TOP_FADE_PX}, full-opacity scrim begins ~here (px from top). */
const VOICE_TOP_FADE_OPAQUE_START_PX = 24;
/** Tiny offset so gradient stops stay strictly ordered (native linear gradient). */
const VOICE_TOP_FADE_LOCATION_EPS = 0.002;
const VOICE_TOP_FADE_MID =
  VOICE_TOP_FADE_OPAQUE_START_PX / VOICE_TOP_FADE_PX;
const VOICE_THREAD_TOP_FADE_LOCATIONS = [
  0,
  VOICE_TOP_FADE_MID - VOICE_TOP_FADE_LOCATION_EPS,
  VOICE_TOP_FADE_MID + VOICE_TOP_FADE_LOCATION_EPS,
  1,
] as const;
/** Header wordmark size (viewBox 85×33). */
const HEADER_LOGO_H = 26;
const HEADER_LOGO_W = (85 / 33) * HEADER_LOGO_H;

export default function App() {
  return (
    <SafeAreaProvider style={styles.appBackground}>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [voiceSessionActive, setVoiceSessionActive] = useState(false);
  /** After first speech in this voice session, “Start talking” stays hidden across mic restarts. */
  const [hasSpokenInVoiceSession, setHasSpokenInVoiceSession] = useState(false);
  const voiceChromeProgress = useSharedValue(0);

  const voiceSessionActiveRef = useRef(false);
  const voiceContinueAfterTurnRef = useRef(true);
  const reactivateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    voiceSessionActiveRef.current = voiceSessionActive;
  }, [voiceSessionActive]);

  useEffect(() => {
    return () => {
      if (reactivateTimerRef.current != null) {
        clearTimeout(reactivateTimerRef.current);
      }
    };
  }, []);

  const startListeningRef = useRef<() => Promise<boolean>>(async () => false);

  const handleSessionEnd = useCallback((lastTranscript: string) => {
    setDraft('');
    const t = lastTranscript.trim();
    const keepVoice =
      voiceSessionActiveRef.current && voiceContinueAfterTurnRef.current;

    if (!t) {
      if (!keepVoice) {
        setVoiceSessionActive(false);
      } else {
        void startListeningRef.current();
      }
      return;
    }

    const id = `${Date.now()}`;

    if (keepVoice) {
      if (reactivateTimerRef.current != null) {
        clearTimeout(reactivateTimerRef.current);
        reactivateTimerRef.current = null;
      }
      voiceContinueAfterTurnRef.current = true;
      setMessages((prev) => [
        ...prev,
        { id: `u-${id}`, role: 'user', text: t },
        { id: `a-${id}`, role: 'assistant', text: REBA_PLACEHOLDER },
      ]);
      reactivateTimerRef.current = setTimeout(() => {
        reactivateTimerRef.current = null;
        void startListeningRef.current().then((ok) => {
          if (!ok) {
            setVoiceSessionActive(false);
          }
        });
      }, VOICE_REACTIVATION_DELAY_MS);
      return;
    }

    setVoiceSessionActive(false);
    voiceContinueAfterTurnRef.current = true;
    setMessages((prev) => [
      ...prev,
      { id: `u-${id}`, role: 'user', text: t },
    ]);
  }, []);

  const handleSessionEndRef = useRef(handleSessionEnd);
  handleSessionEndRef.current = handleSessionEnd;

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
    onSessionEnd: (s) => handleSessionEndRef.current(s),
    silenceCommitMs: VOICE_SILENCE_COMMIT_MS,
  });

  startListeningRef.current = startListening;

  useEffect(() => {
    if (!voiceSessionActive) {
      setHasSpokenInVoiceSession(false);
    }
  }, [voiceSessionActive]);

  useEffect(() => {
    if (voiceSessionActive && speechPickedUp) {
      setHasSpokenInVoiceSession(true);
    }
  }, [voiceSessionActive, speechPickedUp]);

  useEffect(() => {
    voiceChromeProgress.value = withTiming(voiceSessionActive ? 1 : 0, {
      duration: VOICE_CHROME_DURATION_MS,
      easing: VOICE_CHROME_EASING,
    });
  }, [voiceSessionActive]);

  const enterVoiceMode = useCallback(async () => {
    voiceContinueAfterTurnRef.current = true;
    setVoiceSessionActive(true);
    const ok = await startListening();
    if (!ok) {
      setVoiceSessionActive(false);
    }
  }, [startListening]);

  const handleStopVoiceMode = useCallback(() => {
    if (reactivateTimerRef.current != null) {
      clearTimeout(reactivateTimerRef.current);
      reactivateTimerRef.current = null;
    }
    voiceContinueAfterTurnRef.current = false;
    endVoiceSession(draft);
  }, [draft, endVoiceSession]);

  /** Clip height + slide content up — same progress curve as {@link chatChromeStyle}. */
  const headerShellAnimatedStyle = useAnimatedStyle(() => {
    const p = voiceChromeProgress.value;
    return {
      height: interpolate(p, [0, 1], [HEADER_EXPANDED_HEIGHT, 0]),
    };
  });

  const headerSlideStyle = useAnimatedStyle(() => {
    const p = voiceChromeProgress.value;
    return {
      transform: [
        {
          translateY: interpolate(p, [0, 1], [0, -HEADER_EXPANDED_HEIGHT]),
        },
      ],
      opacity: interpolate(p, [0, 1], [1, 0]),
    };
  });

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

  const voiceThreadTopFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(voiceChromeProgress.value, [0, 1], [0, 1]),
  }));

  const handleSendText = useCallback((text: string) => {
    const id = `${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `u-${id}`, role: 'user', text },
      { id: `a-${id}`, role: 'assistant', text: REBA_PLACEHOLDER },
    ]);
    setDraft('');
  }, []);

  const threadScrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const scrollViewportHRef = useRef(0);
  const contentHeightRef = useRef(0);
  const lastMessageBottomRef = useRef(0);

  const bumpThreadScrollIfNeeded = useCallback(() => {
    const scroll = threadScrollRef.current;
    const H = scrollViewportHRef.current;
    const contentH = contentHeightRef.current;
    const lastBottom = lastMessageBottomRef.current;
    if (!scroll || H <= 0 || lastBottom <= 0) return;

    const maxScroll = Math.max(0, contentH - H);
    const scrollY = scrollYRef.current;
    const minY = lastBottom - H + THREAD_BOTTOM_CLEARANCE_PX;
    if (minY <= scrollY + 0.5) return;

    const y = Math.min(Math.max(0, minY), maxScroll);
    scroll.scrollTo({ y, animated: true });
    scrollYRef.current = y;
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      lastMessageBottomRef.current = 0;
      return;
    }
    const id = requestAnimationFrame(() => bumpThreadScrollIfNeeded());
    return () => cancelAnimationFrame(id);
  }, [messages, bumpThreadScrollIfNeeded]);

  return (
    <>
      {/* Skia blob — peeks 50 % above screen bottom, reacts to voice */}
      <BlobShape
        voiceEnergy={voiceEnergy}
        voiceChromeProgress={voiceChromeProgress}
      />

      <SafeAreaView
        style={styles.root}
        edges={voiceSessionActive ? [] : ['top']}
      >
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {/* Header — slides up / away in lockstep with the chat chrome transition */}
          <Animated.View
            style={[styles.headerShell, headerShellAnimatedStyle]}
            pointerEvents={voiceSessionActive ? 'none' : 'auto'}
          >
            <Animated.View style={headerSlideStyle}>
              <View style={styles.header}>
                <RebaLogo width={HEADER_LOGO_W} height={HEADER_LOGO_H} />
              </View>
            </Animated.View>
          </Animated.View>

          {/* Thread */}
          <View style={styles.threadWrap}>
            <ScrollView
              ref={threadScrollRef}
              style={styles.thread}
              contentContainerStyle={[
                styles.threadContent,
                {
                  paddingTop: voiceSessionActive
                    ? insets.top + 16
                    : 16,
                  paddingBottom: 20 + THREAD_BOTTOM_CLEARANCE_PX,
                },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                scrollYRef.current = e.nativeEvent.contentOffset.y;
              }}
              onLayout={(e) => {
                scrollViewportHRef.current = e.nativeEvent.layout.height;
                bumpThreadScrollIfNeeded();
              }}
              onContentSizeChange={(_w, h) => {
                contentHeightRef.current = h;
                bumpThreadScrollIfNeeded();
              }}
            >
              {messages.map((m, index) => (
                <View
                  key={m.id}
                  style={[
                    styles.messageRow,
                    m.role === 'user' && styles.messageRowUser,
                  ]}
                  onLayout={
                    index === messages.length - 1
                      ? (e) => {
                          const { y, height } = e.nativeEvent.layout;
                          lastMessageBottomRef.current = y + height;
                          bumpThreadScrollIfNeeded();
                        }
                      : undefined
                  }
                >
                  {m.role === 'assistant' ? (
                    <View style={styles.assistantBlock}>
                      <Text style={styles.assistantLabel}>Reba</Text>
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
            <Animated.View
              pointerEvents="none"
              style={[styles.voiceThreadTopFade, voiceThreadTopFadeStyle]}
            >
              <LinearGradient
                style={styles.voiceThreadTopFadeGradient}
                colors={[
                  rgba(PALETTE.canvas, 0),
                  rgba(PALETTE.canvas, 0),
                  rgba(PALETTE.canvas, 1),
                  rgba(PALETTE.canvas, 0),
                ]}
                locations={[...VOICE_THREAD_TOP_FADE_LOCATIONS]}
              />
            </Animated.View>
            <VoiceLiveTranscript
              visible={voiceSessionActive}
              liveText={draft}
              speechPickedUp={speechPickedUp}
              hasSpokenThisVoiceSession={hasSpokenInVoiceSession}
            />
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
              />
            </Animated.View>
            <Animated.View
              pointerEvents={voiceSessionActive ? 'box-none' : 'none'}
              style={[
                styles.voiceChromeLayer,
                voiceChromeStyle,
              ]}
            >
              <View style={styles.voiceChromeStack} pointerEvents="box-none">
                <View style={styles.voiceChromeFlexSpacer} pointerEvents="none" />
                <VoiceSubtitleStrip
                  visible={voiceSessionActive}
                  text={draft}
                />
                <VoiceModeBottomBar
                  muted={muted}
                  onToggleMute={toggleMute}
                  onStop={handleStopVoiceMode}
                />
              </View>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
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
  headerShell: {
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    minHeight: 44,
  },
  threadWrap: {
    flex: 1,
    position: 'relative',
  },
  voiceThreadTopFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: VOICE_TOP_FADE_PX,
  },
  voiceThreadTopFadeGradient: {
    ...StyleSheet.absoluteFillObject,
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
  },
  voiceChromeStack: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  voiceChromeFlexSpacer: {
    flex: 1,
  },
  thread: {
    flex: 1,
  },
  threadContent: {
    paddingHorizontal: 20,
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
