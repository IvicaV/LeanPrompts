/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./popup.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // WICHTIG: Damit Dark Mode via Klasse 'dark' auf dem HTML-Tag gesteuert wird
  darkMode: 'class',
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            'code::before': {
              content: '""',
            },
            'code::after': {
              content: '""',
            },
          },
        },
      },
      colors: {
        // Mapping auf CSS Variablen für dynamisches Theming
        bg: {
          DEFAULT: "var(--bg-main)",
          surface: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
          secondary: "var(--bg-secondary)",
          pinned: "var(--bg-pinned)",
          hover: "var(--bg-hover)" // NEU: Explizite Hover Farbe
        },
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          faint: "var(--primary-faint)",
          subtle: "var(--primary-subtle)"
        },
        text: {
          main: "var(--text-main)",
          muted: "var(--text-muted)",
          faint: "var(--text-faint)"
        },
        border: {
          DEFAULT: "var(--border-main)",
          subtle: "var(--border-subtle)",
          focus: "var(--border-focus)"
        },
        // Akzent für Pinned Items
        accent: {
          pinned: "var(--accent-pinned)"
        },
        // SOFT FOCUS Semantic Colors
        snippet: {
          accent: "var(--snippet-accent)",
          bg: "var(--snippet-bg-subtle)"
        },
        prompt: {
          accent: "var(--prompt-accent)",
          bg: "var(--prompt-bg-subtle)"
        },
        code: {
          bg: "var(--code-bg)"
        }
      },
      fontFamily: {
        // System-First Font Stack für "Clean/Native" Look
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif"
        ],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}