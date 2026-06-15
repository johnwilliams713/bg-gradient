import { ArrowUp, AudioLines, Mic, Plus } from 'lucide-react-native';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecordingWaveform } from './RecordingWaveform';
import type { SnippetState } from '../hooks/useAudioSnippet';

/**
 * BottomAppCluster — bottom chat console.
 *
 *  Layout                Spacing source: Figma 11144:17878
 *  ────────────────────────────────────────────────────────
 *  Outer cluster         padding-x: 12, padding-bottom: insets.bottom + 14
 *  Primary console       white, radius 24, shadow (0,5,10) @ 10 % black
 *  Chat window           padding 6, gap 8 between text & controls
 *  Text area             padding-x 8, padding-y 10
 *  Chat controls row     space-between, button size 36, gap 4 (right cluster)
 *
 *  Right action button
 *  ──────────────────────
 *    • Default (no draft text):  black bg (#0a0a0a), AudioLines icon → voice mode
 *    • Draft non-empty:          orange bg (#FF5700),  ArrowUp icon  → onSend()
 *
 *  Mic button (middle-right) — Claude-style audio snippet recorder. Three
 *  visual states driven by `snippetState`:
 *    • idle       — ghost button + Mic icon
 *    • recording  — black filled bg + animated 4-bar waveform
 *    • processing — black filled bg + spinner (Whisper transcribing)
 *
 *  No background fade — the page already sits on PALETTE.canvas (#F6F6F3),
 *  so the cluster is transparent and the white pill floats directly on it.
 *
 *  No custom home indicator — iOS draws its own; we just leave room via
 *  insets.bottom.
 */

const SEND_COLOR = '#FF5700';
const VOICE_COLOR = '#0a0a0a';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  listening: boolean;
  voiceAvailable: boolean;
  onVoicePress: () => void;
  onSend?: (text: string) => void;
  onPlusPress?: () => void;
  /** Claude-style snippet recorder — pass null/undefined to hide. */
  snippetState?: SnippetState;
  onMicSnippetPress?: () => void;
};

export function BottomAppCluster({
  value,
  onChangeText,
  listening,
  voiceAvailable,
  onVoicePress,
  onSend,
  onPlusPress,
  snippetState = 'idle',
  onMicSnippetPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const hasText = value.trim().length > 0;

  const handlePrimary = () => {
    if (hasText) {
      onSend?.(value.trim());
    } else {
      onVoicePress();
    }
  };

  return (
    <View style={[styles.cluster, { paddingBottom: insets.bottom + 14 }]}>
      <View style={styles.console}>
        <View style={styles.chatWindow}>
          <View style={styles.textArea}>
            <TextInput
              value={value}
              onChangeText={onChangeText}
              placeholder="Search or ask Reba anything..."
              placeholderTextColor="rgba(10,10,10,0.4)"
              style={styles.textInput}
              multiline
              maxLength={8000}
              keyboardAppearance="light"
              returnKeyType="default"
            />
          </View>

          <View style={styles.chatControls}>
            <Pressable
              onPress={onPlusPress}
              hitSlop={6}
              accessibilityLabel="Add attachment"
              style={({ pressed }) => [styles.ghostButton, pressed && styles.pressed]}
            >
              <Plus size={20} color={VOICE_COLOR} strokeWidth={2} />
            </Pressable>

            <View style={styles.controlsRight}>
              <Pressable
                onPress={onMicSnippetPress}
                disabled={snippetState === 'processing'}
                hitSlop={6}
                accessibilityLabel={
                  snippetState === 'recording'
                    ? 'Stop recording'
                    : snippetState === 'processing'
                      ? 'Transcribing'
                      : 'Record audio snippet'
                }
                style={({ pressed }) => [
                  snippetState === 'idle' ? styles.ghostButton : styles.actionButton,
                  snippetState !== 'idle' && { backgroundColor: VOICE_COLOR },
                  pressed && styles.pressed,
                ]}
              >
                {snippetState === 'recording' ? (
                  <RecordingWaveform size={16} color="#ffffff" />
                ) : snippetState === 'processing' ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Mic size={20} color={VOICE_COLOR} strokeWidth={2} />
                )}
              </Pressable>

              <Pressable
                onPress={handlePrimary}
                disabled={!hasText && !voiceAvailable}
                hitSlop={6}
                accessibilityLabel={
                  hasText
                    ? 'Send message'
                    : listening
                      ? 'Stop voice mode'
                      : 'Start voice mode'
                }
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: hasText ? SEND_COLOR : VOICE_COLOR,
                    opacity: !hasText && !voiceAvailable ? 0.4 : 1,
                  },
                  pressed && styles.pressed,
                ]}
              >
                {hasText ? (
                  <ArrowUp size={20} color="#ffffff" strokeWidth={2.5} />
                ) : (
                  <AudioLines size={20} color="#ffffff" strokeWidth={2} />
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: {
    paddingHorizontal: 12,
    paddingTop: 24,
  },
  console: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  chatWindow: {
    padding: 6,
    gap: 8,
  },
  textArea: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  textInput: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.32,
    fontWeight: '500',
    color: VOICE_COLOR,
    padding: 0,
    margin: 0,
    minHeight: 22,
    maxHeight: 120,
  },
  chatControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ghostButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
