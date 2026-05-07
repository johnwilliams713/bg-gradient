import { StyleSheet, Text, View } from 'react-native';

/**
 * Voice overlays during an active voice session.
 *
 * • VoiceLiveTranscript — centered “Start talking” before first speech (thread area).
 * • VoiceSubtitleStrip — live caption above the bottom controls (subtitle style).
 */

const ASH_600 = '#525252';
const SUBTITLE_BG = 'rgba(0,0,0,0.3)';
/** Space between subtitle bottom and the top of the voice bottom bar (`VoiceModeBottomBar`). */
const SUBTITLE_GAP_ABOVE_VOICE_BAR = 48;

type CueProps = {
  liveText: string;
  speechPickedUp: boolean;
  visible: boolean;
  hasSpokenThisVoiceSession?: boolean;
};

/** Centered idle cue in the message area (not used for live captions). */
export function VoiceLiveTranscript({
  liveText,
  speechPickedUp,
  visible,
  hasSpokenThisVoiceSession = false,
}: CueProps) {
  if (!visible) return null;

  const trimmed = liveText.trim();
  const showCue =
    !hasSpokenThisVoiceSession && !speechPickedUp && trimmed.length === 0;

  if (!showCue) return null;

  return (
    <View style={styles.cueHost} pointerEvents="none">
      <View style={styles.cueCenter}>
        <Text style={styles.startTalking}>Start talking</Text>
      </View>
    </View>
  );
}

type SubtitleProps = {
  visible: boolean;
  text: string;
};

/**
 * Live transcription as subtitles: centered white on 30% black, bottom edge
 * {@link SUBTITLE_GAP_ABOVE_VOICE_BAR} px above the voice chrome bar.
 */
export function VoiceSubtitleStrip({ visible, text }: SubtitleProps) {
  if (!visible || !text.trim()) return null;

  return (
    <View style={styles.subtitleWrap} pointerEvents="none">
      <View style={styles.subtitlePill}>
        <Text style={styles.subtitleText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cueHost: {
    ...StyleSheet.absoluteFillObject,
  },
  cueCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  startTalking: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
    letterSpacing: -0.32,
    color: ASH_600,
  },
  subtitleWrap: {
    marginBottom: SUBTITLE_GAP_ABOVE_VOICE_BAR,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  subtitlePill: {
    backgroundColor: SUBTITLE_BG,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    maxWidth: '100%',
    alignSelf: 'center',
  },
  subtitleText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.28,
    textAlign: 'center',
  },
});
