/** @type {import('tailwindcss').Config} */

// Brand ramp driven by CSS variables (index.css): navy in light mode, orange in dark mode.
// Every existing `bg-blue-600`, `text-blue-400`, `ring-blue-500`, `bg-blue-900/20`… follows the theme.
const varRamp = (name) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((step) => [
      step,
      `hsl(var(--${name}-${step}) / <alpha-value>)`,
    ]),
  );

// Cool, navy-tinted neutrals (same family as finance_manager) replacing Tailwind's default gray.
// Light pages use 50-300 surfaces / 500-900 text; dark pages use 700-900 surfaces / 300-400 text.
const brandGray = {
  50: "hsl(216 33% 97% / <alpha-value>)",
  100: "hsl(215 28% 93% / <alpha-value>)",
  200: "hsl(214 24% 87% / <alpha-value>)",
  300: "hsl(214 20% 78% / <alpha-value>)",
  400: "hsl(214 15% 60% / <alpha-value>)",
  500: "hsl(214 14% 45% / <alpha-value>)",
  600: "hsl(214 22% 31% / <alpha-value>)",
  700: "hsl(213 30% 19% / <alpha-value>)",
  800: "hsl(213 42% 11% / <alpha-value>)",
  900: "hsl(213 50% 7.5% / <alpha-value>)",
  950: "hsl(213 55% 5% / <alpha-value>)",
};

module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Softer, navy-tinted elevation (paper on a desk instead of grey drop shadows).
      boxShadow: {
        sm: "0 1px 2px 0 hsl(213 60% 15% / 0.06)",
        DEFAULT: "0 1px 0 hsl(213 50% 11% / 0.04), 0 4px 12px -6px hsl(213 60% 15% / 0.16)",
        md: "0 1px 0 hsl(213 50% 11% / 0.04), 0 8px 20px -12px hsl(213 60% 15% / 0.22)",
        lg: "0 1px 0 hsl(213 50% 11% / 0.04), 0 12px 28px -18px hsl(213 60% 15% / 0.26)",
        xl: "0 2px 0 hsl(213 50% 11% / 0.03), 0 20px 40px -20px hsl(213 60% 15% / 0.32)",
        "2xl": "0 28px 60px -24px hsl(213 60% 12% / 0.42)",
      },
      colors: {
        gray: brandGray,
        blue: varRamp("blue"),
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        paper: "hsl(var(--paper) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        // SOHOFI BRICO logo colours: navy #07294D, orange #F76B03.
        navy: {
          DEFAULT: "hsl(var(--navy) / <alpha-value>)",
          deep: "hsl(var(--navy-deep) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "hsl(var(--brand) / <alpha-value>)",
          foreground: "hsl(var(--brand-foreground) / <alpha-value>)",
          soft: "hsl(var(--brand-soft) / <alpha-value>)",
        },
        // Ledger semantics: paid / profit (green), loss (crimson), due (burnt orange).
        gain: {
          DEFAULT: "hsl(var(--gain) / <alpha-value>)",
          soft: "hsl(var(--gain-soft) / <alpha-value>)",
        },
        loss: {
          DEFAULT: "hsl(var(--loss) / <alpha-value>)",
          soft: "hsl(var(--loss-soft) / <alpha-value>)",
        },
        due: {
          DEFAULT: "hsl(var(--due) / <alpha-value>)",
          soft: "hsl(var(--due-soft) / <alpha-value>)",
        },
        rule: "hsl(var(--rule) / <alpha-value>)",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "rise-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        // Slides in from the spine side: left in LTR, right in RTL (--tab-from set in index.css).
        "tab-in": {
          from: { opacity: "0", transform: "translateX(var(--tab-from, -6px))" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "rise-in": "rise-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both",
        "sheet-up": "sheet-up 0.32s cubic-bezier(0.22, 1, 0.36, 1) both",
        "tab-in": "tab-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) backwards",
      },
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '2rem',
          lg: '4rem',
          xl: '5rem',
          '2xl': '6rem',
        },
        screens: {
          sm: '640px',
          md: '768px',
          lg: '1024px',
          xl: '1280px',
          '2xl': '1536px',
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
