import { BlurView } from 'expo-blur';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type SharedValue } from 'react-native-reanimated';
import { PALETTE, rgba } from '../constants/palette';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  voiceEnergy: SharedValue<number>;
  listening: boolean;
  onMicPress: () => void;
  voiceAvailable: boolean;
};

export function AnimatedMeshFooter({
  value,
  onChangeText,
  listening,
  onMicPress,
  voiceAvailable,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.pill}>
        {/* Frosted glass — lets the mesh background bleed through */}
        <BlurView
          pointerEvents="none"
          intensity={Platform.OS === 'ios' ? 68 : 40}
          tint="light"
          style={StyleSheet.absoluteFill}
        />
        {/* Very light tint so it feels like frosted glass, not opaque white */}
        <View style={styles.pillTint} pointerEvents="none" />

        <View style={styles.inputRow}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder="How can I help you today?"
            placeholderTextColor="rgba(60,56,48,0.4)"
            style={styles.input}
            multiline
            maxLength={8000}
          />

          <Pressable
            onPress={onMicPress}
            style={({ pressed }) => [
              styles.iconBtn,
              listening && styles.iconBtnRecording,
              !voiceAvailable && styles.iconBtnDisabled,
              pressed && styles.iconBtnPressed,
            ]}
            accessibilityLabel={
              !voiceAvailable
                ? 'Voice unavailable in Expo Go'
                : listening
                ? 'Stop voice input'
                : 'Start voice input'
            }
            hitSlop={8}
          >
            <Text
              style={[
                styles.iconGlyph,
                listening && styles.iconGlyphRecording,
                !voiceAvailable && styles.iconGlyphDisabled,
              ]}
            >
              {listening ? '●' : '◎'}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.iconBtn,
              styles.sendBtn,
              pressed && styles.iconBtnPressed,
            ]}
            accessibilityLabel="Send message"
            hitSlop={8}
          >
            <Text style={styles.sendGlyph}>↑</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  pill: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.7)',
    minHeight: 54,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 4,
  },
  pillTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 20,
    paddingRight: 10,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    fontSize: 17,
    lineHeight: 22,
    maxHeight: 120,
    color: '#1A1814',
    paddingTop: 2,
    paddingBottom: 2,
    backgroundColor: 'transparent',
    minWidth: 0,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
    marginLeft: 6,
  },
  iconBtnRecording: {
    backgroundColor: rgba(PALETTE.flame, 0.12),
  },
  iconBtnDisabled: {
    opacity: 0.35,
  },
  iconBtnPressed: {
    opacity: 0.7,
  },
  sendBtn: {
    backgroundColor: rgba(PALETTE.flame, 0.18),
  },
  iconGlyph: {
    fontSize: 15,
    color: '#5C5A54',
  },
  iconGlyphRecording: {
    color: PALETTE.flame,
    fontSize: 14,
  },
  iconGlyphDisabled: {
    color: '#B0ACA4',
  },
  sendGlyph: {
    fontSize: 17,
    color: PALETTE.flame,
    fontWeight: '600',
    lineHeight: 20,
  },
});
