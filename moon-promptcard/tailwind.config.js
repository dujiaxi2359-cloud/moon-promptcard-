/** @type {import('tailwindcss').Config} */
export default {
  content: ['./popup.html', './options.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Eclipse — near-black graphite scale, three deliberate elevations.
        ink: '#0B0C0E', // app background
        'ink-deep': '#060708', // vignette / gradient floor
        card: '#15161A', // raised card
        surface: '#101114', // mid elevation (inputs, segment track)
        // Hairlines & translucent fills are warm ivory, not pure white.
        line: 'rgba(234,230,221,0.10)',
        'line-strong': 'rgba(234,230,221,0.20)',
        // Ivory — primary text and primary-button fill. The "moonlight".
        paper: { DEFAULT: '#EAE6DD', dim: 'rgba(234,230,221,0.62)' },
        // Ember — the single warm accent, used with strict restraint.
        brand: {
          DEFAULT: '#FF5A1F',
          bright: '#FF6B33',
          deep: '#C73C0E',
        },
        // Light-glass result card (floats over any page) — warmed to ivory.
        glass: 'rgba(243,241,236,0.82)',
      },
      fontFamily: {
        sans: ['"Inter"', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        eyebrow: '0.14em',
      },
      borderRadius: { xl2: '18px', xl3: '22px', card: '26px' },
      boxShadow: {
        // Ember glow ring (focus / active accent).
        glow: '0 0 0 1px rgba(255,90,31,0.35), 0 8px 30px rgba(255,90,31,0.16)',
        // Floating panels lifted off the page.
        float: '0 24px 64px -16px rgba(0,0,0,0.6), 0 4px 14px -6px rgba(0,0,0,0.45)',
        // Dark card: faint ivory top highlight — "lit from above" glass feel.
        card: 'inset 0 1px 0 0 rgba(234,230,221,0.05)',
        // Ivory primary button: soft neutral lift + bright inner top sheen.
        btn: '0 10px 24px -12px rgba(0,0,0,0.7), inset 0 1px 0 0 rgba(255,255,255,0.55)',
        // Ember accent button (the single page action): warm cast + inner sheen.
        ember: '0 6px 18px -6px rgba(255,90,31,0.5), inset 0 1px 0 0 rgba(255,255,255,0.22)',
        // Light glass result card: deep soft shadow + bright inner rim.
        glass: '0 28px 70px -20px rgba(0,0,0,0.5), inset 0 1px 0 0 rgba(255,255,255,0.65)',
      },
    },
  },
  plugins: [],
};
