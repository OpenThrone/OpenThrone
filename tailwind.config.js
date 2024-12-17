/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin');
const navLinkColor = 'rgb(253, 226, 101)';
const titleColor = 'rgb(221, 149, 63)';

function generateRaceColors(
  navActive,
  navHover,
  bg,
  menuPrimary,
  menuSecondary,
  sidebarBg,
  heading,
  bodyBg,
  footer
) {
  return {
    link: {
      current: navActive,
      hover: navHover,
      link: navLinkColor,
    },
    bg,
    menu: {
      primary: menuPrimary,
      secondary: menuSecondary,
    },
    sidebar: {
      bgcolor: sidebarBg,
      color: 'yellow',
    },
    header: {
      bgcolor: heading,
    },
    advisorColor: 'black',
    mainAreaBg: 'black',
    mainAreaColor: 'rgb(255, 255, 92)',
    bodyBg,
    footer,
    title: titleColor,
    border: menuSecondary,
  };
}

module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  safelist: {
    pattern: [
      /text-(elf|goblin|human|undead)-link-(current|hover|link)/,
      /bg-(elf|goblin|human|undead)-(header-bgcolor|menu-(primary|secondary)|sidebar-bgcolor|bodyBg|footer)/,
      /border-(elf|goblin|human|undead)/,
    ],
    variants: ['sm', 'md', 'lg', 'xl', '2xl'],
  },
  theme: {
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
      '5xl': '3rem',
      '6xl': '4rem',
      menu: '24px', // Added custom font size for menu
    },
    extend: {
      fontFamily: {
        medieval: ['MedievalSharp', 'cursive'],
      },
      textShadow: {
        DEFAULT: '0 2px 4px var(--tw-shadow-color)',
        xs: '0 1px 1px var(--tw-shadow-color)',
        sm: '0 1px 2px var(--tw-shadow-color)',
        md: '0 3px 6px var(--tw-shadow-color)',
        lg: '0 8px 16px var(--tw-shadow-color)',
        xl: '0 12px 24px var(--tw-shadow-color)',
        xxl: '0 20px 40px var(--tw-shadow-color)',
        bevel: [
          '0px 4px 4px rgba(0, 0, 0, 0.25)',
          '1px 1px 4px rgba(253, 226, 101, 0.25)',
          '0px 4px 4px rgba(0, 0, 0, 0.25)',
          '1px 1px 2px rgba(0, 0, 0, 0.25)',
        ].join(', '),
      },
      colors: {
        elf: generateRaceColors(
          'rgb(236,155,0)',
          'rgb(236,155,0)',
          '#0B2012',
          'rgb(10,61,31)',
          'rgb(13,97,46)',
          'rgb(11,32,18)',
          'rgb(11,32,18)',
          'rgb(11,32,18)',
          'rgb(11,32,18)'
        ),
        goblin: generateRaceColors(
          'rgb(236,155,0)',
          'rgb(236,155,0)',
          'rgb(45, 12, 12)',
          '#70301a',
          'rgb(46, 12, 12)',
          '#70301a',
          'rgb(45, 12, 12)',
          'rgb(45, 12, 12)',
          'rgb(11,32,18)'
        ),
        human: generateRaceColors(
          'rgb(236,155,0)',
          'rgb(236,155,0)',
          'rgb(14, 31, 53)',
          'rgb(14, 31, 53)',
          'rgb(26, 55, 93)',
          'rgb(14, 31, 53)',
          'rgb(26, 55, 93)',
          'rgb(26, 55, 93)',
          'rgb(11,32,18)'
        ),
        undead: generateRaceColors(
          'rgb(236,155,0)',
          'rgb(236,155,0)',
          'rgb(33, 33, 33)',
          'rgb(77, 77, 77)',
          'rgb(33, 33, 33)',
          'rgb(77, 77, 77)',
          'rgb(33, 33, 33)',
          'rgb(77, 77, 77)',
          'rgb(11,32,18)'
        ),
        table: {
          odd: '#2c3034',
          even: '#212529',
        },
        gray: {
          100: '#f7fafc',
          200: '#edf2f7',
          300: '#e2e8f0',
          400: '#cbd5e0',
          500: '#a0aec0',
          600: '#718096',
          700: '#4a5568',
          800: '#2d3748',
          900: '#1a202c',
        },
        blue: {
          100: '#ebf8ff',
          200: '#bee3f8',
          300: '#90cdf4',
          400: '#63b3ed',
          500: '#4299e1',
          600: '#3182ce',
          700: '#2b6cb0',
          800: '#2c5282',
          900: '#2a4365',
        },
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities, theme }) {
      const textShadows = theme('textShadow', {});
      const textShadowUtilities = Object.entries(textShadows).reduce(
        (acc, [key, value]) => {
          acc[`.text-shadow-${key}`] = { textShadow: value };
          return acc;
        },
        {}
      );

      // Adding the `text-uppercase-menu` utility
      addUtilities(
        {
          '.text-uppercase-menu': {
            fontSize: theme('fontSize.menu'), // Custom font size
            textShadow: theme('textShadow.lg'), // Thick drop shadow
            textTransform: 'uppercase', // Uppercase transformation
          },
        },
        ['responsive', 'hover']
      );

      addUtilities(textShadowUtilities, ['responsive', 'hover']);
    }),
  ],
};
