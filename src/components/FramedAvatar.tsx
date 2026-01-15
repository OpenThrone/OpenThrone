import { Box } from '@mantine/core';
import Image from 'next/image';

type FramedAvatarProps = {
  src: string;
  alt: string;
  size?: number;
  inset?: number;
  insetX?: number;
  insetY?: number;
  cornerRadius?: number;
  frameSrc: string;
};

export function FramedAvatar({
  src,
  alt,
  size = 380,
  inset = 46,
  insetX,
  insetY,
  cornerRadius = Math.round(inset * 0.35),
  frameSrc,
}: FramedAvatarProps) {
  const resolvedInsetX = insetX ?? inset;
  const resolvedInsetY = insetY ?? inset;
  return (
    <Box
      style={{
        position: 'relative',
        width: size,
        height: size,
        margin: '0 auto',
        isolation: 'isolate', // ensures z-index behaves predictably
      }}
    >
      {/* INNER CLIP AREA (IMPORTANT: position: relative) */}
      <Box
        style={{
          position: 'absolute',
          inset: `${resolvedInsetY}px ${resolvedInsetX}px`,
          borderRadius: cornerRadius,
          overflow: 'hidden',
          zIndex: 1,
          background: '#0b0f14',
        }}
      >
        {/* IMPORTANT: parent must be position: relative for fill */}
        <Box style={{ position: 'relative', width: '100%', height: '100%' }}>
          <Image
            src={src}
            alt={alt}
            fill
            style={{
              objectFit: 'contain',
            }}
          />
        </Box>

        {/* vignette */}
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            boxShadow: 'inset 0 0 40px rgba(0,0,0,0.75)',
            pointerEvents: 'none',
          }}
        />
      </Box>

      {/* FRAME ON TOP */}
      <Box
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        <Image src={frameSrc} alt="" fill style={{ objectFit: 'contain' }} />
      </Box>
    </Box>
  );
}
