/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/app/**/*.{js,ts,jsx,tsx}', './src/components/**/*.{js,ts,jsx,tsx}', './src/lib/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0D1B2A',
        slate: '#1B263B',
        steel: '#415A77',
        mist: '#E0E7EF',
        cloud: '#F5F7FA',
        mint: '#0F766E',
        amber: '#B45309',
        rose: '#B91C1C'
      },
      boxShadow: {
        soft: '0 8px 20px rgba(13, 27, 42, 0.08)'
      }
    }
  },
  plugins: []
};
