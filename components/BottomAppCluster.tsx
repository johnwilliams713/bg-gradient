import { ArrowUp, AudioLines, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Space between composer and keyboard when keyboard is visible (iOS HIG–style tight gap). */
const KEYBOARD_VERTICAL_GAP_PT = 8;

/**
 * BottomAppCluster — bottom chat console.
 *
 *  Layout                Spacing source: Figma 11144:17878
 *  ────────────────────────────────────────────────────────
 *  Outer cluster         padding-x: 12; padding-bottom insets.bottom + 14 idle,
 *                          KEYBOARD_VERTICAL_GAP_PT when keyboard visible (pairs with KAV).
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
};

export function BottomAppCluster({
  value,
  onChangeText,
  listening,
  voiceAvailable,
  onVoicePress,
  onSend,
  onPlusPress,
}: Props) {
  const insets = useSafeAreaInsets();
  const hasText = value.trim().length > 0;
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (_e: KeyboardEvent) => setKeyboardOpen(true);
    const onHide = (_e: KeyboardEvent) => setKeyboardOpen(false);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  /** KeyboardAvoidingView already clears the keyboard; do not also apply full home inset. */
  const paddingBottom = keyboardOpen
    ? KEYBOARD_VERTICAL_GAP_PT
    : insets.bottom + 14;
  const paddingTop = keyboardOpen ? KEYBOARD_VERTICAL_GAP_PT : 24;

  const handlePrimary = () => {
    if (hasText) {
      onSend?.(value.trim());
    } else {
      void (async () => {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch {
          /* unavailable (e.g. web) */
        }
        onVoicePress();
      })();
    }
  };

  return (
    <View style={[styles.cluster, { paddingBottom, paddingTop }]}>
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
