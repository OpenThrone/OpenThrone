/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
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
    },
    extend: {
      colors: {
        elfBG: '#0B2012',
        elfLink: {
          current: 'rgb(13, 97, 46)',
          hover: 'rgb(13, 97, 46)',
          link: 'rgb(253,226,101)',
        },
        elf: {
          menu: {
            primary: 'rgb(10,61,31)',
            secondary: 'rgb(13,97,46)',
          },
          sidebar: {
            bgcolor: 'rgb(11,32,18)',
            color: 'yellow',
          },
          header: {
            bgcolor: 'rgb(11,32,18)',
          },
        },
        title: 'rgb(221, 149, 63)',
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
  plugins: [],
};
