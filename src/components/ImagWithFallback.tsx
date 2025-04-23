'use client';

// Originally from https://stackoverflow.com/a/70544058

import React, { useState, useEffect, SyntheticEvent } from 'react';
import Image, { ImageProps } from 'next/image'; // Import ImageProps for better typing

interface ImageWithFallbackProps extends Omit<ImageProps, 'src' | 'onError' | 'onLoad' | 'alt'> {
  src: string;
  fallbackSrc: string;
  alt?: string;
  onLoad?: (event: SyntheticEvent<HTMLImageElement, Event>) => void;
}

const ImageWithFallback = (props: ImageWithFallbackProps) => {
  const { src, fallbackSrc, alt, ...rest } = props;
  const [currentSrc, setCurrentSrc] = useState(src);

  // Reset the source if the src prop changes
  useEffect(() => {
    // Avoid setting fallback if src is already the fallback
    // (prevents potential loops if fallback also fails)
    if (src !== fallbackSrc) {
      setCurrentSrc(src);
    }
  }, [src, fallbackSrc]); // Add fallbackSrc dependency

  const handleError = () => {
    // Only switch to fallback if the current source isn't already the fallback
    if (currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
    }
  };

  return (
    <Image
      {...rest}
      src={currentSrc}
      alt={alt}
      onError={handleError}
      onLoad={(event) => {
        // The target is the underlying <img> element
        const imgElement = event.target as HTMLImageElement;
        // Check if the image loaded but is intrinsically empty/broken
        if (imgElement.naturalWidth === 0) {
          handleError(); // Trigger fallback
        }
        // Call original onLoad if it was provided via props
        if (props.onLoad) { // Check props.onLoad directly
          props.onLoad(event);
        }
      }}
    />
  );
};

export default ImageWithFallback;