/** Compose / slideshow duration policy: picture track is primary. */

/** Final muxed clip length follows the picture, never the TTS length. */
export function resolvePicturePrimaryDurationSec(videoDurationSec: number): number {
  return Math.max(0.1, Number(videoDurationSec) || 0)
}

/** Ken Burns / slideshow length follows the storyboard plan, not TTS. */
export function resolveSlideshowPictureDurationSec(storyboardDuration?: number | null): number {
  return Math.max(3, Number(storyboardDuration) || 10)
}

/** Upstream design issue: dialogue audio longer than the picture track. */
export function audioExceedsPicture(
  audioDurationSec: number,
  pictureDurationSec: number,
  toleranceSec = 0.05,
): boolean {
  return audioDurationSec > pictureDurationSec + toleranceSec
}

/** Subtitles must not outlive the picture when TTS overruns. */
export function resolveSubtitleDurationSec(
  audioDurationSec: number,
  pictureDurationSec: number,
): number {
  return Math.max(0.1, Math.min(audioDurationSec, pictureDurationSec))
}
