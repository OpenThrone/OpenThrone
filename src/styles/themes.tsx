import { Button, createTheme, Input, Paper, TextInput } from '@mantine/core';

const rpgComponentOverrides = {
  Paper: Paper.extend({
    defaultProps: { radius: 'sm' },
    styles: {
      root: {
        background:
          'linear-gradient(180deg, rgba(13, 19, 28, 0.95) 0%, rgba(6, 8, 12, 0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.8), 0 12px 24px -10px rgba(0,0,0,0.9)',
      },
    },
  }),
  TextInput: TextInput.extend({
    styles: () => ({
      input: {
        backgroundColor: '#05070a',
        border: '1px solid #1f2937',
        color: '#e5e7eb',
        boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.6)',
        fontFamily: 'MedievalSharp, serif',
        transition: 'border 0.2s ease, box-shadow 0.2s ease',
        '&:focus': {
          border: '1px solid rgba(255,255,255,0.6)',
          boxShadow:
            'inset 0 2px 6px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,255,255,0.15)',
        },
      },
    }),
  }),
  Button: Button.extend({
    styles: (_, props) =>
      props.variant === 'filled'
        ? {
            root: {
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.25), 0 6px 0 rgba(0,0,0,0.35)',
              border: '1px solid rgba(0,0,0,0.35)',
              transform: 'translateY(0)',
              transition: 'transform 0.1s ease, box-shadow 0.1s ease',
              '&:active': {
                transform: 'translateY(2px)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
              },
            },
          }
        : {},
  }),
};

export const themes = {
  ELF: createTheme({
    fontFamily: 'Inter, system-ui, sans-serif',
    headings: { fontFamily: 'Chomsky, MedievalSharp, serif' },
    colors: {
      brand: [
        '#e0ffe5',
        '#b3ffcc',
        '#80ffb3',
        '#4dff99',
        '#1aff80',
        '#00e673',
        '#00b35a',
        '#008040',
        '#004d26',
        '#001a0d',
      ],
      secondary: [
        '#fff4e0',
        '#ffe8b3',
        '#ffdc80',
        '#ffd04d',
        '#ffc31a',
        '#e6b200',
        '#b38a00',
        '#806300',
        '#4d3c00',
        '#1a1500',
      ],
    },
    primaryColor: 'brand',
    components: {
      ...rpgComponentOverrides,
      InputWrapper: Input.Wrapper.extend({
        defaultProps: {
          inputWrapperOrder: ['label', 'input', 'description', 'error'],
        },
      }),
    },
  }),
  HUMAN: createTheme({
    fontFamily: 'Inter, system-ui, sans-serif',
    headings: { fontFamily: 'Chomsky, MedievalSharp, serif' },
    colors: {
      brand: [
        '#e0f4ff',
        '#b3e0ff',
        '#80ccff',
        '#4db8ff',
        '#1aa3ff',
        '#0088e6',
        '#006bb3',
        '#004d80',
        '#002f4d',
        '#00121a',
      ],
      secondary: [
        '#f0f0f0',
        '#d9d9d9',
        '#c2c2c2',
        '#ababab',
        '#949494',
        '#7d7d7d',
        '#666666',
        '#4f4f4f',
        '#383838',
        '#212121',
      ],
    },
    primaryColor: 'brand',
    components: rpgComponentOverrides,
  }),
  UNDEAD: createTheme({
    fontFamily: 'Inter, system-ui, sans-serif',
    headings: { fontFamily: 'Chomsky, MedievalSharp, serif' },
    colors: {
      brand: [
        '#d9d9d9',
        '#bfbfbf',
        '#a6a6a6',
        '#8c8c8c',
        '#737373',
        '#595959',
        '#404040',
        '#262626',
        '#0d0d0d',
        '#000000',
      ],
      secondary: [
        '#e0e0e0',
        '#b3b3b3',
        '#808080',
        '#4d4d4d',
        '#ababab',
        '#949494',
        '#7d7d7d',
        '#666666',
        '#4f4f4f',
        '#383838',
        '#212121',
      ],
    },
    primaryColor: 'brand',
    components: rpgComponentOverrides,
  }),
  GOBLIN: createTheme({
    fontFamily: 'Inter, system-ui, sans-serif',
    headings: { fontFamily: 'Chomsky, MedievalSharp, serif' },
    colors: {
      brand: [
        '#ffe0e0',
        '#ffb3b3',
        '#ff8080',
        '#ff4d4d',
        '#ff1a1a',
        '#e60000',
        '#b30000',
        '#800000',
        '#4d0000',
        '#1a0000',
      ],
      secondary: [
        '#e6ccb3',
        '#cc9966',
        '#b36d00',
        '#995200',
        '#804000',
        '#663300',
        '#4d2600',
        '#331a00',
        '#1a0d00',
        '#000000',
      ],
    },
    primaryColor: 'brand',
    components: rpgComponentOverrides,
  }),
};
