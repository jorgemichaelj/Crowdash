/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './popup.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        stone: {
          100: '#f6f2e9', 200: '#eee8dc', 300: '#cec7b8', 400: '#b1ac9e',
          500: '#918b7d', 600: '#555348', 700: '#3e3c34', 800: '#2c2c27',
          900: '#191917', 950: '#151512',
        },
        brand: { 400: '#ddc99b', 500: '#cbb582', 600: '#cbb582' },
      },
    },
  },
  plugins: [],
};
