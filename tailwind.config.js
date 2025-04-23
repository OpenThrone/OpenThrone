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
    backgroundImage: {
      'link-gradient': 'linear-gradient(90deg, rgb(253, 226, 101), rgb(253, 226, 101))',
      'orange-gradient': 'linear-gradient(360deg, orange, darkorange)',
    },
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
      menu: '24px', // Custom font size for menu
    },
    extend: {
      fontFamily: {
        medieval: ['MedievalSharp', 'cursive'],
      },
      // Note: We remove color values from textShadow definitions here.
      // Just define offset and blur. The color will be set via a separate variable.
      textShadow: {
        DEFAULT: '1px 2px 4px',
        xs: '1px 1px 1px',
        sm: '1px 2px 2px',
        md: '1px 3px 6px',
        lg: '1px 1px 1px',
        xl: '1px 12px 24px',
        xxl: '1px 20px 40px',
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
      keyframes: {
        'pulse-slow': {  // Use quotes for the property name with hyphen
          '0%, 100%': {
            opacity: 1,
            boxShadow: '0 0 10px rgba(234, 179, 8, 0.3)',
          },
          '50%': {
            opacity: 0.9,
            boxShadow: '0 0 15px rgba(234, 179, 8, 0.5)',
          },
        },
      },
      animation: {
        'pulse-slow': 'pulse-slow 3s infinite',
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities, theme }) {
      const textShadows = theme('textShadow', {});
      const textShadowColors = theme('colors', {});

      // Base .text-shadow class that uses CSS vars
      const baseUtilities = {
        '.text-shadow': {
          '--ts-offsets': textShadows.DEFAULT || '1px 2px 4px',
          '--ts-color': 'rgba(0,0,0,0.25)', // default color
          textShadow: 'var(--ts-offsets) var(--ts-color)',
        },
      };

      // Generate offset utilities like .text-shadow-md that only set --ts-offsets
      const textShadowOffsetUtilities = Object.entries(textShadows).reduce((acc, [key, value]) => {
        acc[`.text-shadow-${key}`] = {
          '--ts-offsets': value,
        };
        return acc;
      }, {});

      // Generate color utilities like .text-shadow-color-blue-500 that only set --ts-color
      const textShadowColorUtilities = {};
      function addColorUtilities(obj, prefix = '') {
        for (const [colorName, colorValue] of Object.entries(obj)) {
          if (typeof colorValue === 'string') {
            textShadowColorUtilities[`.text-shadow-color-${prefix}${colorName}`] = {
              '--ts-color': colorValue,
            };
          } else if (typeof colorValue === 'object') {
            addColorUtilities(colorValue, `${prefix}${colorName}-`);
          }
        }
      }
      addColorUtilities(textShadowColors);

      // Add the combined utilities
      addUtilities(baseUtilities, ['responsive', 'hover']);
      addUtilities(textShadowOffsetUtilities, ['responsive', 'hover']);
      addUtilities(textShadowColorUtilities, ['responsive', 'hover']);

      // Adding the text-uppercase-menu utility
      addUtilities(
        {
          '.text-uppercase-menu': {
            fontSize: theme('fontSize.menu'), // Custom font size
            // Here we rely on the inherited text-shadow from `.text-shadow`
            // combined with a chosen offset if desired.
            // For a thicker drop shadow, you can use .text-shadow-md or another offset class
            textTransform: 'uppercase',
          },
        },
        ['responsive', 'hover']
      );

      // Gradient text utilities
      addUtilities({
        '.text-gradient-link': {
          '-webkit-background-clip': 'text',
          '-moz-background-clip': 'text',
          '-webkit-text-fill-color': 'transparent',
          '-moz-text-fill-color': 'transparent',
        },
        '.text-gradient-orange': {
          '-webkit-background-clip': 'text',
          '-moz-background-clip': 'text',
          '-webkit-text-fill-color': 'transparent',
          '-moz-text-fill-color': 'transparent',
        },
      });
    }),
  ],
};
