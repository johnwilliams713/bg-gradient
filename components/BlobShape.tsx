/**
 * BlobShape — three Figma blobs from node 11118:17225 ("Group 4").
 *
 * Static placement is fixed and does not depend on screen size — the Figma frame
 * is positioned absolutely at screen (-83.69, 642.47) with size 568.37 × 401.55.
 *
 * Animation:
 *   • Idle:  all three breathe at the same slow tempo (~3.5 s loop).
 *   • Voice: each shape responds to a different envelope follower derived from
 *     the same voiceEnergy signal — emulating a low/mid/high split:
 *
 *        LEFT   (coral)  → "low"   slow attack & release, smooth swell
 *        CENTER (peach)  → "mid"   tracks the speech envelope closely
 *        RIGHT  (yellow) → "high"  fast transient follower, spikes on onsets
 *
 *     This is not a real FFT — expo-speech-recognition only emits a scalar
 *     volume — but the three followers give each shape a perceptibly distinct
 *     motion profile.
 *
 * The Skia canvas is over-sized (CANVAS_PAD on every side) so shapes can scale
 * up freely without clipping at the canvas edge. An outer Group translates the
 * scene back so screen-space positioning stays identical to the Figma frame.
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  Canvas,
  Group,
  LinearGradient,
  Path,
  Skia,
  vec,
} from '@shopify/react-native-skia';

// ─── Figma source data ───────────────────────────────────────────────────────
//
// Frame "Group 4"  (568.37 × 401.55) at screen (-83.69, 642.47).
//
//   Left   frame-local top-left (0,      61.04)   viewBox 341.842 × 340.507
//          fill: linear-gradient #FF8547 → 84.4 % transparent
//   Center frame-local top-left (119.87, 0)       viewBox 328.633 × 353.268
//          fill: linear-gradient #FF5700@0.4 → transparent
//   Right  frame-local top-left (226.53, 61.04)   viewBox 341.842 × 340.507
//          fill: linear-gradient #FBBF24 → 84.4 % transparent

const FRAME_LEFT = -83.685;
const FRAME_TOP  = 642.47;
const FRAME_W    = 568.37;
const FRAME_H    = 401.55;

// Padding around the Figma frame so scaled shapes don't clip at the canvas
// edge. Sized to comfortably fit the largest expected scale (~1 + breath +
// voice peak ≈ 1.4 of the largest shape, ~353 px → grows by ~140 px).
const CANVAS_PAD = 200;

const CANVAS_LEFT = FRAME_LEFT - CANVAS_PAD;
const CANVAS_TOP  = FRAME_TOP  - CANVAS_PAD;
const CANVAS_W    = FRAME_W    + CANVAS_PAD * 2;
const CANVAS_H    = FRAME_H    + CANVAS_PAD * 2;

// Frame-local positions (top-left of each shape's bbox, inside the Figma frame)
const LEFT_X   = 0;
const LEFT_Y   = 61.04;
const CENTER_X = 119.87;
const CENTER_Y = 0;
const RIGHT_X  = 226.53;
const RIGHT_Y  = 61.04;

// Shape-local centres (centre of each shape's own viewBox), used as the pivot
// when scaling so the shape grows/shrinks around its own centre.
const LEFT_CX   = 170.921;
const LEFT_CY   = 170.254;
const CENTER_CX = 164.317;
const CENTER_CY = 176.634;
const RIGHT_CX  = 170.921;
const RIGHT_CY  = 170.254;

const LEFT_PATH =
  'M283.926 50.9652C354.746 118.055 361.563 225.849 299.152 291.73' +
  'C236.74 357.611 128.735 356.632 57.9157 289.542' +
  'C-12.9041 222.452 -19.7206 114.658 42.6905 48.777' +
  'C105.102 -17.1041 213.107 -16.1244 283.926 50.9652Z';

const CENTER_PATH =
  'M328.633 176.634C328.633 274.186 255.066 353.268 164.317 353.268' +
  'C73.567 353.268 0 274.186 0 176.634' +
  'C0 79.0818 73.567 0 164.317 0' +
  'C255.066 0 328.633 79.0818 328.633 176.634Z';

const RIGHT_PATH =
  'M57.9157 50.9652C-12.9041 118.055 -19.7206 225.849 42.6905 291.73' +
  'C105.102 357.611 213.107 356.632 283.926 289.542' +
  'C354.746 222.452 361.563 114.658 299.152 48.777' +
  'C236.74 -17.1041 128.735 -16.1244 57.9157 50.9652Z';

// ─── Animation tuning ────────────────────────────────────────────────────────

const TWO_PI = Math.PI * 2;

// Shared idle breath — all three shapes pulse together at the same tempo.
const BREATH_PERIOD = 3.5;     // seconds
const BREATH_AMP    = 0.022;   // peak deviation → range [1, 1 + 2*BREATH_AMP]

// Per-shape voice-reactive scaling, on top of the breath.
const LEFT_VOICE   = 0.22;   // low band gets a moderate swell
const CENTER_VOICE = 0.30;   // mid band gets the strongest response
const RIGHT_VOICE  = 0.26;   // high band — sharp but smaller in magnitude

// Envelope-follower coefficients (per-frame, ~60 fps assumption — fine for a
// purely visual effect; if frame-rate doubles on a 120 Hz display the followers
// just feel a touch snappier, which is acceptable).
//
//   "Low"        slow IIR low-pass → smooth swell, lags onsets/releases.
//   "Mid"        moderate IIR      → tracks speech rhythm one beat behind.
//   "High"       peak follower with fast decay, driven by positive deltas.
const LOW_LERP   = 0.07;   // lower → slower
const MID_LERP   = 0.22;
const HIGH_DECAY = 0.78;   // each frame keeps this fraction of previous peak
const HIGH_GAIN  = 4.0;    // amplifies tiny per-frame deltas into visible kicks

type Props = {
  voiceEnergy: SharedValue<number>;
};

export function BlobShape({ voiceEnergy }: Props) {
  const leftPath   = useMemo(() => Skia.Path.MakeFromSVGString(LEFT_PATH)!,   []);
  const centerPath = useMemo(() => Skia.Path.MakeFromSVGString(CENTER_PATH)!, []);
  const rightPath  = useMemo(() => Skia.Path.MakeFromSVGString(RIGHT_PATH)!,  []);

  // UI-thread clock + per-frame envelope followers.
  const time     = useSharedValue(0);
  const lowEnv   = useSharedValue(0);
  const midEnv   = useSharedValue(0);
  const highEnv  = useSharedValue(0);
  const lastE    = useSharedValue(0);

  useFrameCallback((info) => {
    'worklet';
    const e = voiceEnergy.value;

    lowEnv.value  = lowEnv.value * (1 - LOW_LERP)  + e * LOW_LERP;
    midEnv.value  = midEnv.value * (1 - MID_LERP)  + e * MID_LERP;

    const delta = Math.max(0, e - lastE.value);
    highEnv.value = Math.max(highEnv.value * HIGH_DECAY, delta * HIGH_GAIN);
    lastE.value = e;

    time.value = info.timestamp / 1000;
  });

  // Shared breathing waveform — same for all three shapes.
  const breath = useDerivedValue(() =>
    1 + BREATH_AMP + BREATH_AMP * Math.sin((TWO_PI * time.value) / BREATH_PERIOD),
  );

  // Per-shape scales: shared breath + band-specific voice response.
  const leftScale   = useDerivedValue(() => breath.value + lowEnv.value  * LEFT_VOICE);
  const centerScale = useDerivedValue(() => breath.value + midEnv.value  * CENTER_VOICE);
  const rightScale  = useDerivedValue(() => breath.value + highEnv.value * RIGHT_VOICE);

  // Skia transforms — apply in order:
  //   1. translate to (frame_x + shape_cx, frame_y + shape_cy)  (places centre)
  //   2. scale around that origin
  //   3. translate back by (-shape_cx, -shape_cy)               (so the path's
  //      local 0,0 ends up at frame_x, frame_y when scale = 1)
  const leftTransform = useDerivedValue(() => [
    { translateX: LEFT_X + LEFT_CX },
    { translateY: LEFT_Y + LEFT_CY },
    { scale: leftScale.value },
    { translateX: -LEFT_CX },
    { translateY: -LEFT_CY },
  ]);
  const centerTransform = useDerivedValue(() => [
    { translateX: CENTER_X + CENTER_CX },
    { translateY: CENTER_Y + CENTER_CY },
    { scale: centerScale.value },
    { translateX: -CENTER_CX },
    { translateY: -CENTER_CY },
  ]);
  const rightTransform = useDerivedValue(() => [
    { translateX: RIGHT_X + RIGHT_CX },
    { translateY: RIGHT_Y + RIGHT_CY },
    { scale: rightScale.value },
    { translateX: -RIGHT_CX },
    { translateY: -RIGHT_CY },
  ]);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.canvas,
        {
          left:   CANVAS_LEFT,
          top:    CANVAS_TOP,
          width:  CANVAS_W,
          height: CANVAS_H,
        },
      ]}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Outer Group offsets the Figma frame inside the padded canvas, so
            shape coordinates below stay frame-local and screen positioning
            still matches Figma. */}
        <Group transform={[
          { translateX: CANVAS_PAD },
          { translateY: CANVAS_PAD },
        ]}>
          {/* Left — coral */}
          <Group transform={leftTransform}>
            <Path path={leftPath}>
              <LinearGradient
                start={vec(217.431, -101.467)}
                end={vec(216.199, 247.604)}
                colors={['#FF8547', 'rgba(255,133,71,0)']}
                positions={[0, 0.844]}
              />
            </Path>
          </Group>

          {/* Center — peach */}
          <Group transform={centerTransform}>
            <Path path={centerPath}>
              <LinearGradient
                start={vec(33.864, 46.807)}
                end={vec(142.253, 266.343)}
                colors={['rgba(255,87,0,0.4)', 'rgba(255,87,0,0)']}
              />
            </Path>
          </Group>

          {/* Right — warm yellow */}
          <Group transform={rightTransform}>
            <Path path={rightPath}>
              <LinearGradient
                start={vec(124.411, -101.467)}
                end={vec(125.643, 247.604)}
                colors={['#FBBF24', 'rgba(251,191,36,0)']}
                positions={[0, 0.844]}
              />
            </Path>
          </Group>
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
  },
});
