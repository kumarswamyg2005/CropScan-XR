/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'sans-serif'],
        mono: ['"DM Mono"', 'monospace'],
      },
      colors: {
        bg:      '#F6F2EB',
        surface: '#FDFAF5',
        raised:  '#EDE8DF',
        soil:    '#1E1A14',
        taupe:   '#7A6F5E',
        border:  '#DDD6C8',
        forest:  {
          DEFAULT: '#2D6A4F',
          hover:   '#1B4D38',
          subtle:  '#D8ECD5',
          canopy:  '#40916C',
          deep:    '#1B4332',
        },
        amber: {
          DEFAULT: '#D4860B',
          subtle:  '#FDF0D5',
        },
        rust: {
          DEFAULT: '#B84C30',
          subtle:  '#FAE5DF',
        },
      },
      spacing: {
        xs:   '4px',
        sm:   '8px',
        md:   '16px',
        lg:   '24px',
        xl:   '40px',
        '2xl':'64px',
        '3xl':'96px',
      },
      boxShadow: {
        card:    '0 2px 12px rgba(30,26,20,0.07), 0 1px 3px rgba(30,26,20,0.05)',
        raised:  '0 8px 32px rgba(30,26,20,0.10), 0 2px 8px rgba(30,26,20,0.06)',
        green:   '0 4px 20px rgba(45,106,79,0.25)',
        amber:   '0 4px 20px rgba(212,134,11,0.20)',
      },
      borderRadius: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '20px',
        xl: '32px',
      },
    },
  },
  plugins: [],
}
