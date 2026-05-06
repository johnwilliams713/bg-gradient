import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/**
 * RecordingWaveform — 4 vertical bars that pulse while recording.
 *
 * Each bar's scaleY is driven by its own useRef-held Animated.Value, so the
 * animation runs entirely on the native driver and survives parent re-renders
 * without restarting. A one-shot delay before each bar's loop staggers them
 * by 80 ms to produce a left-to-right travelling pulse without all four bars
 * ever sharing a phase.
 */

const STAGGER_MS = 80;
const UP_MS = 360;
const DOWN_MS = 360;

const REST_SCALE = 0.35;
const PEAK_SCALE = 1.0;

type Props = {
  size?: number;
  color?: string;
};

export function RecordingWaveform({ size = 16, color = '#ffffff' }: Props) {
  const bar0 = useRef(new Animated.Value(REST_SCALE)).current;
  const bar1 = useRef(new Animated.Value(REST_SCALE)).current;
  const bar2 = useRef(new Animated.Value(REST_SCALE)).current;
  const bar3 = useRef(new Animated.Value(REST_SCALE)).current;
  const bars = [bar0, bar1, bar2, bar3];

  useEffect(() => {
    const animations = bars.map((bar, i) =>
      Animated.sequence([
        Animated.delay(i * STAGGER_MS),
        Animated.loop(
          Animated.sequence([
            Animated.timing(bar, {
              toValue: PEAK_SCALE,
              duration: UP_MS,
              useNativeDriver: true,
            }),
            Animated.timing(bar, {
              toValue: REST_SCALE,
              duration: DOWN_MS,
              useNativeDriver: true,
            }),
          ]),
        ),
      ]),
    );

    animations.forEach((a) => a.start());
    return () => {
      animations.forEach((a) => a.stop());
      bars.forEach((b) => b.setValue(REST_SCALE));
    };
    // bars array is stable (refs); intentionally only run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[styles.row, { height: size }]}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              height: size,
              backgroundColor: color,
              transform: [{ scaleY: bar }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  bar: {
    width: 2.5,
    borderRadius: 2,
  },
});
