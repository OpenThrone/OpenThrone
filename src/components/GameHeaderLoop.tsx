import { useIdle } from '@mantine/hooks';
import { useEffect, useRef, useState } from 'react';

import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { PlayerRace } from '@/types/typings';
import { resolveArtworkSource } from '@/utils/artwork';
import type { FortDamageTier } from '@/utils/fortDamage';

type NetworkInformation = { saveData?: boolean };

/** Stop decoding after this long without input; the next interaction resumes. */
const IDLE_PAUSE_MS = 2 * 60 * 1000;

/**
 * Seamless animated wall loop laid over the header still. It mounts after
 * hydration, skips reduced motion and Save-Data, and fades in only once
 * playback starts, so a blocked or failed video leaves the still in place.
 * It pauses while scrolled out of view and after two idle minutes.
 */
export default function GameHeaderLoop({
  race,
  tier,
  className,
}: {
  race: PlayerRace;
  tier: FortDamageTier;
  className?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [width, setWidth] = useState<768 | 1536 | null>(null);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(true);
  const idle = useIdle(IDLE_PAUSE_MS, { initialState: false });
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const { connection } = navigator as Navigator & {
      connection?: NetworkInformation;
    };
    setWidth(
      reducedMotion || connection?.saveData
        ? null
        : window.matchMedia('(max-width: 640px)').matches
          ? 768
          : 1536,
    );
  }, [reducedMotion]);

  const base = width
    ? `/assets/header/${race}-wall-header-v3-d${tier}-${width}`
    : null;
  useEffect(() => setPlaying(false), [base]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(Boolean(entry?.isIntersecting)),
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [base]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (visible && !idle) video.play().catch(() => {});
    else video.pause();
  }, [base, visible, idle]);
  const av1 = base && resolveArtworkSource(`${base}.av1.mp4`);
  const h264 = base && resolveArtworkSource(`${base}.mp4`);
  if (!av1 || !h264) return null;

  return (
    <video
      key={base}
      ref={(video) => {
        // Autoplay policies read the muted property, which React leaves unset on mount.
        videoRef.current = video;
        if (!video) return;
        video.muted = true;
        video.defaultMuted = true;
      }}
      className={className}
      data-playing={playing || undefined}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      onPlaying={() => setPlaying(true)}
    >
      <source src={av1} type='video/mp4; codecs="av01.0.05M.08"' />
      <source src={h264} type='video/mp4; codecs="avc1.64001f"' />
    </video>
  );
}
