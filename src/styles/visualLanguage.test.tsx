import { faShield } from '@fortawesome/free-solid-svg-icons';
import {
  Button,
  DEFAULT_THEME,
  MantineProvider,
  mergeMantineTheme,
} from '@mantine/core';
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { GameCard } from '@/components/game/GameCard';
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

for (const [race, definition] of Object.entries(themes)) {
  const theme = mergeMantineTheme(DEFAULT_THEME, definition);
  describe(`${race} visual contracts`, () => {
    it('keeps body, muted, placeholder, heading and accent text readable on shared surfaces', () => {
      const tokens = cssVariablesResolver(theme);
      const backgrounds = ['--ot-surface', '--ot-surface-2', '--ot-inset'];
      const foregrounds = [
        '--ot-body',
        '--ot-muted',
        '--ot-heading',
        '--ot-accent',
        '--ot-brand-text',
      ];
      for (const background of backgrounds) {
        for (const foreground of foregrounds) {
          expect(
            contrast(
              tokens.variables[foreground]!,
              tokens.variables[background]!,
            ),
          ).toBeGreaterThanOrEqual(4.5);
        }
        expect(
          contrast(
            tokens.dark['--mantine-color-placeholder']!,
            tokens.variables[background]!,
          ),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(theme.colors.secondary[1]!, tokens.variables[background]!),
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    for (const goldAccent of [true, false]) {
      it(`renders content once and preserves actions and caller props (accent: ${goldAccent})`, () => {
        let renders = 0;
        function Content() {
          renders += 1;
          return <input name="unique-card-input" />;
        }
        const html = renderToStaticMarkup(
          <MantineProvider
            theme={theme}
            cssVariablesResolver={cssVariablesResolver}
            defaultColorScheme="dark"
          >
            <GameCard
              title="A long translated heading"
              icon={faShield}
              goldAccent={goldAccent}
              className="caller-card"
              id="caller-id"
              style={{ maxWidth: 400 }}
              action={<Button>Header action</Button>}
            >
              <Content />
            </GameCard>
          </MantineProvider>,
        );
        expect(renders).toBe(1);
        expect(html.match(/name="unique-card-input"/g)).toHaveLength(1);
        expect(html).toContain('Header action');
        expect(html).toContain('caller-card');
        expect(html).toContain('id="caller-id"');
        expect(html).toContain('max-width:400px');
        expect(html).not.toContain('data-impeccable');
      });
    }
  });
}
