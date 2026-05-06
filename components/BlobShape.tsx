/**
 * BlobShape — three-layer procedural wave visualiser.
 *
 * Three stacked sine-summed wave layers (back / mid / fore) anchored to the
 * bottom of the screen.
 *
 * Style reference: Figma node 11144:17634 ("waves"). Geometry is generated in
 * code so it can react live to voice; visual style is a single shared FF5700
 * linear gradient (50% alpha at the wave crest, 10% alpha at canvas bottom).
 *
 * Animation:
 *   • Idle:  each layer is a sum of TWO low-freq sub-harmonics (H1a + H1b)
 *            whose unequal temporal speeds make peaks and troughs drift in
 *            place — a slow ocean-swell feel with no horizontal scroll. Full
 *            screen width.
 *   • Voice: each layer adds a centred, strictly non-negative "swell" on top
 *            of the ambient surface:
 *
 *              voiceShape(u) = bell(u) · (1 + RIPPLE_AMP · cos(2πk·(u − ½)))
 *
 *            bell(u) = sin(π·u)^BELL_POWER is zero at the edges, peaks at
 *            u = ½. The cosine ripple is centred on u = ½ so the result is
 *            automatically left-right symmetric, and (1 + amp·cos) stays
 *            positive while RIPPLE_AMP < 1, so the swell only ever pushes
 *            the wave UPWARD — no center-sinking. Each layer's swell is
 *            scaled by its assigned voice band envelope:
 *
 *               BACK  ←  low envelope   (slow attack/release)
 *               MID   ←  mid envelope   (rhythm-tracking)
 *               FORE  ←  high envelope  (transient spikes on word onsets)
 *
 *            voiceEnergy is a single scalar from expo-speech-recognition; the
 *            three "bands" are envelope followers on that signal, not a real
 *            FFT. They give perceptibly distinct timing per layer regardless.
 *
 * Path smoothing: each layer's wave is built as a cubic Bezier spline using
 * Catmull-Rom-to-Bezier conversion on the sampled (x, y) points, so the curve
 * stays visually smooth even with a moderate sample count.
 */

import { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  BlurMask,
  Canvas,
  Group,
  LinearGradient,
  Path,
  Skia,
  vec,
} from '@shopify/react-native-skia';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Geometry ────────────────────────────────────────────────────────────────
//
// The component sits absolutely at the bottom of the screen. All wave coords
// below are in canvas-local pixels: y = 0 is the canvas top, y = WAVE_HEIGHT
// is the canvas bottom (= screen bottom).
//
// Per-layer "height" matches the Figma node spec — the at-rest distance from
// each wave's mean line (baseline) down to the canvas bottom. So a layer with
// height 300 has its baseline 300 px above the screen bottom.

const WAVE_HEIGHT = 400; // canvas height; gives ~100 px headroom above tallest baseline for voice ripples

// In ambient mode the whole canvas sits this many px lower so waves read as
// hiding behind the bottom chat cluster; voice mode eases back to 0 (current
// placement). 25 % of canvas height matches the design brief.
const AMBIENT_VERTICAL_NUDGE = WAVE_HEIGHT * 0.25;
/** ms — slightly longer than opacity/blur so the motion feels gentle */
const POSITION_SLIDE_MS = 700;

const BACK_HEIGHT = 260;
const MID_HEIGHT  = 240;
const FORE_HEIGHT = 200;

const BACK_BASELINE_Y = WAVE_HEIGHT - BACK_HEIGHT; // 140
const MID_BASELINE_Y  = WAVE_HEIGHT - MID_HEIGHT;  // 160
const FORE_BASELINE_Y = WAVE_HEIGHT - FORE_HEIGHT; // 200

// Path resolution. With cubic-Bezier smoothing, even modest sample counts read
// as fully smooth; 48 leaves plenty of headroom for the voice H3 ripples
// (max k ≈ 9.5 cycles per screen).
const SAMPLE_COUNT = 48;

// ─── Audio envelope follower coefficients ───────────────────────────────────
const LOW_LERP   = 0.07;
const MID_LERP   = 0.22;
const HIGH_DECAY = 0.78;
const HIGH_GAIN  = 4.0;

// ─── Wave model ──────────────────────────────────────────────────────────────
//
//    y(x, t) = baseline
//             − a1a · sin(2π·k1a·u + ω1a·t + φ1a)        (H1a — ambient)
//             − a1b · sin(2π·k1b·u + ω1b·t + φ1b)        (H1b — ambient)
//             − bandEnv · voiceGain · voiceShape(u)      (centred voice swell)
//
// H1a, H1b carry the "rolling hill" ambient — full-width, slow morphing,
// untouched in voice mode. The voice contribution is a centred non-negative
// swell that only adds height; it never pulls the wave below the H1 surface.

const TWO_PI = Math.PI * 2;

// ─── Voice swell shape ───────────────────────────────────────────────────────
//
//    voiceShape(u) = bell(u) · (1 + VOICE_RIPPLE_AMP · cos(2πk·(u − 0.5)))
//
// • bell(u) = sin(π·u)^BELL_POWER — zero at u=0,1, peaks 1.0 at u=0.5.
// • cos(2π·k·(u − 0.5)) is centred on u=0.5, so the entire shape is
//   automatically symmetric across the screen midline.
// • Keeping VOICE_RIPPLE_AMP < 1 guarantees the (1 + amp·cos) factor stays
//   ≥ 0, so voiceShape ≥ 0 everywhere — the wave only ever rises in voice
//   mode, never sinks below its ambient surface.

// BELL_POWER tunes the central swell width:
//   1.0 — broad arch
//   2.0 — Hanning window (classic; chosen here)
//   3.0+ — narrow central swell, very flat edges
const BELL_POWER = 2.0;

// Number of cosine cycles across the full width. Visible peaks land at
// u = 0.5, 0.5 ± 1/k, 0.5 ± 2/k, …; only the central few are amplified by
// bell(u) — the rest fade to zero before they reach the screen edges.
//   1 — pure central peak, no modulation
//   2 — central peak with broad shoulders (smooth single hump)
//   3 — central peak + one symmetric side bump on each flank (Siri-like)
//   4 — central peak + two side bumps on each flank
const VOICE_RIPPLE_K = 2;

// Ripple depth (0..1). Larger = more pronounced side peaks vs. central peak.
// Must be < 1 to keep voiceShape non-negative.
const VOICE_RIPPLE_AMP = 0.20;

type Harmonic = { k: number; omega: number; phase: number };

type LayerHarmonics = {
  h1a: Harmonic;
  h1b: Harmonic;
};

const BACK_HARMONICS: LayerHarmonics = {
  h1a: { k: 1.0, omega: 0.200, phase: 0           },
  h1b: { k: 1.3, omega: 0.330, phase: Math.PI / 5 },
};

const MID_HARMONICS: LayerHarmonics = {
  h1a: { k: 1.1, omega: 0.250, phase: Math.PI / 7 },
  h1b: { k: 1.4, omega: 0.175, phase: Math.PI / 3 },
};

const FORE_HARMONICS: LayerHarmonics = {
  h1a: { k: 1.2, omega: 0.300, phase: Math.PI / 11 },
  h1b: { k: 1.5, omega: 0.400, phase: Math.PI / 2  },
};

// H1 (rolling-hill) amplitudes per layer in px. H1a / H1b are split 55 / 45:
// nearly even — H1a is the slow carrier, H1b the visible morphing component,
// so giving H1b real weight is what makes peaks "shift" instead of just sit.
const BACK_H1_AMP = 46;
const MID_H1_AMP  = 35;
const FORE_H1_AMP = 27;

const H1_SPLIT_A = 0.55;
const H1_SPLIT_B = 0.45;

// Per-layer voice swell amplitude (px). At bandEnv = 1 and the voice shape's
// peak (u = 0.5), the wave is pushed up by VOICE_GAIN · (1 + VOICE_RIPPLE_AMP)
// pixels. With BACK_VOICE_GAIN = 50 and RIPPLE_AMP = 0.35, that's ~67 px max
// — comfortably within the canvas headroom above each baseline.
const BACK_VOICE_GAIN = 57.5;
const MID_VOICE_GAIN  = 46;
const FORE_VOICE_GAIN = 34.5;

// ─── Bloom + edge softening ──────────────────────────────────────────────────
//
// Each wave is rendered in two passes:
//   1. A wider, heavily-blurred copy at reduced opacity, drawn first as a
//      soft halo extending past the wave's edges (bloom).
//   2. The main wave on top, with a small blur for softened edges.
//
// Standard alpha blending (no blendMode change) — additive blends would just
// clamp to white against the app's white background and disappear, so we rely
// on the gradient's own translucency for the halo to read.
//
// Blur amounts crossfade with the listening state: ambient renders 50 % more
// diffuse so the waves read as a soft backdrop, then sharpen back to their
// "design" values when the mic is engaged so the audio-reactive swell is
// crisper and easier to read.
const EDGE_BLUR_ACTIVE   = 6.4;   // px — main-wave edge softening (mic on)
const EDGE_BLUR_IDLE     = 12;    // px — main-wave edge softening (ambient)
const BLOOM_BLUR_ACTIVE  = 48;    // px — halo width (mic on)
const BLOOM_BLUR_IDLE    = 90;    // px — halo width (ambient)
const BLOOM_OPACITY      = 0.4;   // halo strength (0..1)

// ─── Gradient ────────────────────────────────────────────────────────────────
//
// Two-stop warm gradient shared by all three layers (Figma node 11144:17634):
// FF5700 (orange-red) at the wave's crest, fading to FDE68A (warm yellow) at
// the canvas bottom. Per-stop alphas (15 % top, 40 % bottom) match the Figma
// fill exactly, so the layer Group itself runs at full opacity. Each layer is
// drawn with the "multiply" blend mode so overlapping waves darken naturally
// against the cream page background — visually close to Figma's "Plus Darker"
// for our warm-on-cream palette. (Skia ≥ 2.5 supports a true `plusDarker`
// blend mode but Expo SDK 54 currently blesses Skia 2.2.x, which doesn't.)

const GRAD_COLORS = ['rgba(255,87,0,0.15)', 'rgba(253,230,138,0.40)'];

// Mid layer is the visual counter-tone — its gradient stops are inverted
// (yellow on top, orange on the bottom) in BOTH idle and listening states.
// Blur and bloom on mid follow the same idle/active animation as the other
// layers; only the colour stops are flipped.
const GRAD_COLORS_INVERTED = ['rgba(253,230,138,0.40)', 'rgba(255,87,0,0.15)'];

// Container opacity animates between IDLE (ambient) and ACTIVE (mic engaged).
// The gradient stops already carry their target alpha; this knob fades the
// whole stack further back when the user isn't talking, then lifts to full
// strength when listening starts so the audio-reactive swell really pops.
const LAYER_OPACITY_IDLE   = 0.5;
const LAYER_OPACITY_ACTIVE = 1.0;
const LISTENING_FADE_MS    = 400; // crossfade duration for opacity + blur

const BACK_GRAD_TOP = BACK_BASELINE_Y - BACK_H1_AMP; // = 94
const MID_GRAD_TOP  = MID_BASELINE_Y  - MID_H1_AMP;  // = 125
const FORE_GRAD_TOP = FORE_BASELINE_Y - FORE_H1_AMP; // = 173

type Props = {
  voiceEnergy: SharedValue<number>;
  /** When true, the wave stack fades up to full opacity for emphasis. */
  listening: boolean;
};

export function BlobShape({ voiceEnergy, listening }: Props) {
  // UI-thread clock + per-frame envelope followers.
  const time    = useSharedValue(0);
  const lowEnv  = useSharedValue(0);
  const midEnv  = useSharedValue(0);
  const highEnv = useSharedValue(0);
  const lastE   = useSharedValue(0);

  // Reanimated-driven container opacity + per-pass blur, fed straight to
  // their respective Skia props. All three crossfade together when the
  // listening state changes.
  const layerOpacity = useSharedValue(LAYER_OPACITY_IDLE);
  const edgeBlur     = useSharedValue(EDGE_BLUR_IDLE);
  const bloomBlur    = useSharedValue(BLOOM_BLUR_IDLE);

  // Vertical slide: ambient = shifted down behind the composer; listening =
  // slides up to the established voice-mode framing.
  const translateY = useSharedValue(listening ? 0 : AMBIENT_VERTICAL_NUDGE);

  useEffect(() => {
    const opts = { duration: LISTENING_FADE_MS, easing: Easing.inOut(Easing.cubic) };
    layerOpacity.value = withTiming(
      listening ? LAYER_OPACITY_ACTIVE : LAYER_OPACITY_IDLE, opts,
    );
    edgeBlur.value = withTiming(
      listening ? EDGE_BLUR_ACTIVE : EDGE_BLUR_IDLE, opts,
    );
    bloomBlur.value = withTiming(
      listening ? BLOOM_BLUR_ACTIVE : BLOOM_BLUR_IDLE, opts,
    );
  }, [listening, layerOpacity, edgeBlur, bloomBlur]);

  useEffect(() => {
    translateY.value = withTiming(listening ? 0 : AMBIENT_VERTICAL_NUDGE, {
      duration: POSITION_SLIDE_MS,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [listening, translateY]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  useFrameCallback((info) => {
    'worklet';
    const e = voiceEnergy.value;

    lowEnv.value = lowEnv.value * (1 - LOW_LERP) + e * LOW_LERP;
    midEnv.value = midEnv.value * (1 - MID_LERP) + e * MID_LERP;

    const delta = Math.max(0, e - lastE.value);
    highEnv.value = Math.max(highEnv.value * HIGH_DECAY, delta * HIGH_GAIN);
    lastE.value = e;

    time.value = info.timestamp / 1000;
  });

  // One fresh SkPath per layer per frame, built procedurally on the UI thread.
  const backPath = useDerivedValue(() => {
    'worklet';
    return buildWavePath(
      time.value, lowEnv.value, BACK_BASELINE_Y, BACK_HARMONICS,
      BACK_H1_AMP, BACK_VOICE_GAIN,
    );
  });

  const midPath = useDerivedValue(() => {
    'worklet';
    return buildWavePath(
      time.value, midEnv.value, MID_BASELINE_Y, MID_HARMONICS,
      MID_H1_AMP, MID_VOICE_GAIN,
    );
  });

  const forePath = useDerivedValue(() => {
    'worklet';
    return buildWavePath(
      time.value, highEnv.value, FORE_BASELINE_Y, FORE_HARMONICS,
      FORE_H1_AMP, FORE_VOICE_GAIN,
    );
  });

  // Per-layer gradient endpoints — wave crest (50% alpha) → canvas bottom (10%).
  const backGradStart  = useMemo(() => vec(0, BACK_GRAD_TOP),  []);
  const midGradStart   = useMemo(() => vec(0, MID_GRAD_TOP),   []);
  const foreGradStart  = useMemo(() => vec(0, FORE_GRAD_TOP),  []);
  const gradEnd        = useMemo(() => vec(0, WAVE_HEIGHT),    []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, containerStyle]}
    >
      <Canvas style={styles.canvas}>
        <Group opacity={layerOpacity}>
          {/* Back — bloom halo, then main wave (multiply blend) */}
          <Group blendMode="multiply">
            <Group opacity={BLOOM_OPACITY}>
              <Path path={backPath}>
                <LinearGradient start={backGradStart} end={gradEnd} colors={GRAD_COLORS} />
                <BlurMask blur={bloomBlur} style="normal" />
              </Path>
            </Group>
            <Path path={backPath}>
              <LinearGradient start={backGradStart} end={gradEnd} colors={GRAD_COLORS} />
              <BlurMask blur={edgeBlur} style="normal" />
            </Path>
          </Group>

          {/* Mid — inverted gradient, otherwise identical bloom+edge blur
              treatment as the other layers (multiply blend) */}
          <Group blendMode="multiply">
            <Group opacity={BLOOM_OPACITY}>
              <Path path={midPath}>
                <LinearGradient start={midGradStart} end={gradEnd} colors={GRAD_COLORS_INVERTED} />
                <BlurMask blur={bloomBlur} style="normal" />
              </Path>
            </Group>
            <Path path={midPath}>
              <LinearGradient start={midGradStart} end={gradEnd} colors={GRAD_COLORS_INVERTED} />
              <BlurMask blur={edgeBlur} style="normal" />
            </Path>
          </Group>

          {/* Fore — bloom halo, then main wave (multiply blend) */}
          <Group blendMode="multiply">
            <Group opacity={BLOOM_OPACITY}>
              <Path path={forePath}>
                <LinearGradient start={foreGradStart} end={gradEnd} colors={GRAD_COLORS} />
                <BlurMask blur={bloomBlur} style="normal" />
              </Path>
            </Group>
            <Path path={forePath}>
              <LinearGradient start={foreGradStart} end={gradEnd} colors={GRAD_COLORS} />
              <BlurMask blur={edgeBlur} style="normal" />
            </Path>
          </Group>
        </Group>
      </Canvas>
    </Animated.View>
  );
}

/**
 * Pure worklet helper — builds a closed Skia path for one wave layer using
 * cubic Bezier segments derived from sampled wave points (Catmull-Rom-style
 * tangents). At even spacing dx, the conversion is:
 *
 *    c1 = P[i]   + ( P[i+1] - P[i-1] ) / 6
 *    c2 = P[i+1] - ( P[i+2] - P[i]   ) / 6
 *
 * Endpoint tangents reuse the boundary point (zero-derivative falloff), which
 * is visually indistinguishable from a true natural spline at the screen
 * edges.
 */
function buildWavePath(
  t: number,
  bandEnv: number,
  baseline: number,
  H: LayerHarmonics,
  h1Amp: number,
  voiceGain: number,
) {
  'worklet';
  const a1a = h1Amp * H1_SPLIT_A;
  const a1b = h1Amp * H1_SPLIT_B;

  const W = SCREEN_W;
  const dx = W / (SAMPLE_COUNT - 1);

  // Sample y(x, t) across the screen.
  const ys: number[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const u = i / (SAMPLE_COUNT - 1);

    // Centred non-negative voice swell. bell goes 0→1→0 across the width;
    // the cosine ripple is centred on u = 0.5 so the whole shape is symmetric.
    // (1 + amp·cos) stays > 0 for amp < 1, so voiceLift is ≥ 0 everywhere.
    const bell      = Math.pow(Math.sin(Math.PI * u), BELL_POWER);
    const ripple    = Math.cos(TWO_PI * VOICE_RIPPLE_K * (u - 0.5));
    const voiceLift = bandEnv * voiceGain * bell * (1 + VOICE_RIPPLE_AMP * ripple);

    const y = baseline
      - a1a * Math.sin(TWO_PI * H.h1a.k * u + H.h1a.omega * t + H.h1a.phase)
      - a1b * Math.sin(TWO_PI * H.h1b.k * u + H.h1b.omega * t + H.h1b.phase)
      - voiceLift;
    ys.push(y);
  }

  const path = Skia.Path.Make();
  path.moveTo(0, ys[0]);

  // Catmull-Rom-to-Bezier between every adjacent pair of sample points.
  for (let i = 0; i < SAMPLE_COUNT - 1; i++) {
    const xCurr = i * dx;
    const xNext = (i + 1) * dx;

    const yPrev  = i > 0                     ? ys[i - 1] : ys[i];
    const yCurr  = ys[i];
    const yNext  = ys[i + 1];
    const yAfter = (i + 2 < SAMPLE_COUNT)    ? ys[i + 2] : ys[i + 1];

    const c1x = xCurr + dx / 3;
    const c1y = yCurr + (yNext - yPrev) / 6;
    const c2x = xNext - dx / 3;
    const c2y = yNext - (yAfter - yCurr) / 6;

    path.cubicTo(c1x, c1y, c2x, c2y, xNext, yNext);
  }

  // Close down the right edge, across the bottom, and back up the left.
  path.lineTo(W, WAVE_HEIGHT);
  path.lineTo(0, WAVE_HEIGHT);
  path.close();

  return path;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left:   0,
    right:  0,
    bottom: 0,
    height: WAVE_HEIGHT,
  },
  canvas: {
    flex: 1,
  },
});
