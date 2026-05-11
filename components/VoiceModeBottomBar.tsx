import { Mic, MicOff, Settings } from 'lucide-react-native';
import { AnimatedAudioLinesIcon } from './AnimatedAudioLinesIcon';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StyleProp, ViewStyle } from 'react-native';
import type { AnimatedStyle } from 'react-native-reanimated';
import Animated from 'react-native-reanimated';

const MIC_MUTE_BG = '#EF4444';
const STOP_BG = '#262626';
const ICON_DARK = '#0a0a0a';

type Props = {
  muted: boolean;
  onToggleMute: () => void;
  onStop: () => void;
  onSettingsPress?: () => void;
  style?: StyleProp<ViewStyle>;
  animatedStyle?: StyleProp<AnimatedStyle<ViewStyle>>;
};

/**
 * Bottom controls for active voice mode — layout aligned with Figma Reba Voice Mode
 * (settings left, mic + Stop cluster right).
 * Settings is a visual placeholder: default `onSettingsPress` is a no-op.
 */
export function VoiceModeBottomBar({
  muted,
  onToggleMute,
  onStop,
  onSettingsPress = () => {},
  style,
  animatedStyle,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { paddingBottom: insets.bottom + 14 },
        style,
        animatedStyle,
      ]}
    >
      <View style={styles.row}>
        <Pressable
          onPress={onSettingsPress}
          hitSlop={8}
          accessibilityLabel="Settings"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.iconPill,
            styles.iconPillWhite,
            pressed && styles.pressed,
          ]}
        >
          <Settings size={22} color={ICON_DARK} strokeWidth={2} />
        </Pressable>

        <View style={styles.spacer} />

        <View style={styles.rightCluster}>
          <Pressable
            onPress={() => {
              void (async () => {
                try {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } catch {
                  /* unavailable (e.g. web) */
                }
                onToggleMute();
              })();
            }}
            hitSlop={6}
            accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.iconPill,
              muted ? styles.iconPillMuted : styles.iconPillWhite,
              pressed && styles.pressed,
            ]}
          >
            {muted ? (
              <MicOff size={22} color="#ffffff" strokeWidth={2} />
            ) : (
              <Mic size={22} color={ICON_DARK} strokeWidth={2} />
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onStop();
            }}
            hitSlop={6}
            accessibilityLabel="Stop voice mode"
            accessibilityRole="button"
            style={({ pressed }) => [styles.stopPill, pressed && styles.pressed]}
          >
            <AnimatedAudioLinesIcon size={22} color="#ffffff" strokeWidth={2} />
            <Text style={styles.stopLabel}>Stop</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  spacer: {
    flex: 1,
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconPill: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillWhite: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  iconPillMuted: {
    backgroundColor: MIC_MUTE_BG,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  stopPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingLeft: 20,
    paddingRight: 24,
    borderRadius: 999,
    backgroundColor: STOP_BG,
  },
  stopLabel: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.32,
    lineHeight: 24,
    color: '#ffffff',
  },
  pressed: {
    opacity: 0.85,
  },
});
