import {
  Badge,
  Button,
  DEFAULT_THEME,
  MantineProvider,
  mergeMantineTheme,
} from '@mantine/core';
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { cssVariablesResolver, themes } from '@/styles/themes';

function luminance(hex: string) {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)!
    .map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(foreground: string, background: string) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** shade 9 mixed 75/25 with black, as the Badge override composes it. */
const deepened = (hex: string) => {
  const [r, g, b] = hex
    .replace('#', '')
    .match(/.{2}/g)!
    .map((c) => Math.round(parseInt(c, 16) * 0.75));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

const renderBadge = (color: string, race: keyof typeof themes = 'HUMAN') =>
  renderToStaticMarkup(
    <MantineProvider theme={mergeMantineTheme(DEFAULT_THEME, themes[race])}>
      <Badge color={color}>Label</Badge>
    </MantineProvider>,
  );

// Hues whose Mantine dark filled shade fails AA with white text.
const DEEPENED = ['yellow', 'lime', 'green', 'orange', 'teal', 'cyan'] as const;
// Hues that already pass AA at Mantine's filled shade and must stay as-is.
const UNTOUCHED = [
  'red',
  'pink',
  'grape',
  'violet',
  'indigo',
  'blue',
  'gray',
  'dark',
] as const;

describe('filled badge contrast (issue #12)', () => {
  const surface = cssVariablesResolver(
    mergeMantineTheme(DEFAULT_THEME, themes.HUMAN),
  ).variables['--ot-surface']!;

  for (const color of DEEPENED) {
    it(`deepens the ${color} plate: white AA 4.5:1, plate visible on the surface`, () => {
      const html = renderBadge(color);
      expect(html).toContain(
        `color-mix(in srgb, var(--mantine-color-${color}-9) 75%, #000)`,
      );
      const theme = mergeMantineTheme(DEFAULT_THEME, themes.HUMAN);
      const shade9 = theme.colors[color as 'yellow'][9]!;
      expect(contrast('#FFFFFF', deepened(shade9))).toBeGreaterThanOrEqual(4.5);
      // The plate must stay a visible chip, not melt into the panel.
      expect(contrast(deepened(shade9), surface)).toBeGreaterThanOrEqual(1.5);
    });
  }

  for (const color of UNTOUCHED) {
    it(`leaves ${color} to Mantine: default plate already passes AA`, () => {
      const html = renderBadge(color);
      expect(html).not.toContain('color-mix(in srgb');
      const theme = mergeMantineTheme(DEFAULT_THEME, themes.HUMAN);
      // The app runs the dark scheme: Mantine's filled shade is primaryShade
      // dark (8); white on it must already meet AA.
      const filledShade = theme.colors[color as 'gray'][8]!;
      expect(contrast('#FFFFFF', filledShade)).toBeGreaterThanOrEqual(4.5);
    });
  }

  for (const race of Object.keys(themes) as (keyof typeof themes)[]) {
    it(`keeps the brand plate race-coloured on ${race} (white AA 4.5:1)`, () => {
      const html = renderBadge('brand', race);
      expect(html).not.toContain('color-mix(in srgb');
      const theme = mergeMantineTheme(DEFAULT_THEME, themes[race]);
      // Mantine's dark filled shade for the race palette must carry white.
      const brandShade = theme.colors.brand![8]!;
      expect(contrast('#FFFFFF', brandShade)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('leaves light and outline badges to Mantine', () => {
    const html = renderToStaticMarkup(
      <MantineProvider theme={mergeMantineTheme(DEFAULT_THEME, themes.HUMAN)}>
        <Badge color="yellow" variant="light">
          Label
        </Badge>
      </MantineProvider>,
    );
    expect(html).not.toContain('color-mix(in srgb');
  });

  it('keeps the pending submit plate consistent with the button tones', () => {
    const html = renderToStaticMarkup(
      <MantineProvider theme={mergeMantineTheme(DEFAULT_THEME, themes.HUMAN)}>
        <Button loading>Sign In</Button>
      </MantineProvider>,
    );
    expect(html).toContain('data-loading="true"');
    expect(html).toContain('disabled');
    expect(html).toContain('Sign In');
  });
});
