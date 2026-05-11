import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg from 'react-native-svg';
import { Line } from 'react-native-svg';

const AnimatedLine = Animated.createAnimatedComponent(Line);

/**
 * Port of [Animate UI audio-lines](https://animate-ui.com/docs/icons?search=audio+lines&icon=audio-lines)
 * keyframes — DOM `motion/react` is not usable in React Native.
 */
const LINES: readonly {
  readonly x: number;
  readonly y1: readonly number[];
  readonly y2: readonly number[];
}[] = [
  { x: 2, y1: [10, 5, 8, 6, 10], y2: [13, 18, 15, 17, 13] },
  { x: 6, y1: [6, 2, 10, 6], y2: [17, 22, 13, 17] },
  { x: 10, y1: [3, 6, 3, 8, 3], y2: [21, 17, 21, 15, 21] },
  { x: 14, y1: [8, 4, 7, 2, 8], y2: [15, 19, 16, 22, 15] },
  { x: 18, y1: [5, 10, 4, 8, 5], y2: [18, 13, 19, 15, 18] },
  { x: 22, y1: [10, 8, 5, 10], y2: [13, 15, 18, 13] },
] as const;

const CYCLE_MS = 1500;

function keyframeAt(keyframes: readonly number[], t01: number): number {
  'worklet';
  const n = keyframes.length;
  if (n <= 1) {
    return keyframes[0] ?? 0;
  }
  const t = Math.min(Math.max(t01, 0), 1) * (n - 1);
  const i = Math.min(Math.floor(t), n - 2);
  const f = t - i;
  return keyframes[i] + (keyframes[i + 1] - keyframes[i]) * f;
}

type LineAnimProps = {
  x: number;
  y1Keys: readonly number[];
  y2Keys: readonly number[];
  progress: SharedValue<number>;
  color: string;
  strokeWidth: number;
};

function AnimatedEqualizerLine({
  x,
  y1Keys,
  y2Keys,
  progress,
  color,
  strokeWidth,
}: LineAnimProps) {
  const y1 = useDerivedValue(() => keyframeAt(y1Keys, progress.value));
  const y2 = useDerivedValue(() => keyframeAt(y2Keys, progress.value));

  const animatedProps = useAnimatedProps(() => ({
    x1: x,
    y1: y1.value,
    x2: x,
    y2: y2.value,
  }));

  return (
    <AnimatedLine
      animatedProps={animatedProps}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  );
}

type Props = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function AnimatedAudioLinesIcon({
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
}: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: CYCLE_MS,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [progress]);

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {LINES.map((line) => (
        <AnimatedEqualizerLine
          key={line.x}
          x={line.x}
          y1Keys={line.y1}
          y2Keys={line.y2}
          progress={progress}
          color={color}
          strokeWidth={strokeWidth}
        />
      ))}
    </Svg>
  );
}
