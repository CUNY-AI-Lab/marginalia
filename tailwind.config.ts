import type { Config } from "tailwindcss";

// CUNY AI Lab tool palette: navy ink neutrals and CUNY blue, shared with the Lab's other tools.
// Remapping gray and blue keeps every existing utility on-palette in both themes.
const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          50: '#F7F8FA',
          100: '#EEF0F4',
          200: '#DFE2E9',
          300: '#C5CAD6',
          400: '#959CAD',
          500: '#697084',
          600: '#4C5366',
          700: '#363C4E',
          800: '#1E2333',
          900: '#141826',
          950: '#0D1019',
        },
        blue: {
          50: '#EEF3FC',
          100: '#DCE6F8',
          200: '#B5CAF0',
          300: '#86A6E3',
          400: '#5E86D8',
          500: '#2F5FC4',
          600: '#003DA5',
          700: '#002D72',
          800: '#00245C',
          900: '#001F4C',
        },
        paper: 'var(--paper)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
export default config;
