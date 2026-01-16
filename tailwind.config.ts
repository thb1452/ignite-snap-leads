import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0E6FFF',
          50:'#eef4ff',100:'#d9e6ff',200:'#b3ccff',300:'#86adff',
          400:'#5c8cff',500:'#0E6FFF',600:'#0b58cc',700:'#0a49a8',
          800:'#083a86',900:'#062c66'
        },
        ink: {
          900:'#0B1220', 700:'#1C2433', 600:'#334155', 500:'#475569', 400:'#64748B', 300:'#94A3B8'
        },
        // Landing page color palette
        landing: {
          primary: '#1A365D',
          secondary: '#2D3748',
          accent: '#38B2AC',
          success: '#48BB78',
          warning: '#ED8936',
          bg: '#0D1117',
          'bg-alt': '#1A202C',
          surface: '#2D3748',
          text: '#F7FAFC',
          'text-muted': '#A0AEC0',
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        score: {
          blue: "hsl(var(--score-blue))",
          "blue-foreground": "hsl(var(--score-blue-foreground))",
          yellow: "hsl(var(--score-yellow))",
          "yellow-foreground": "hsl(var(--score-yellow-foreground))",
          orange: "hsl(var(--score-orange))",
          "orange-foreground": "hsl(var(--score-orange-foreground))",
          red: "hsl(var(--score-red))",
          "red-foreground": "hsl(var(--score-red-foreground))",
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
      fontFamily: {
        display: ['Inter', 'ui-sans-serif', 'system-ui'],
        ui: ['Inter', 'ui-sans-serif', 'system-ui']
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "14px",
        "2xl": "20px"
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.06), 0 8px 24px rgba(16,24,40,.08)',
        elevate: '0 12px 28px rgba(16,24,40,.14)'
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
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "count-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(56, 178, 172, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(56, 178, 172, 0.6)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-soft": "pulse-soft 3s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.6s ease-out forwards",
        "count-up": "count-up 0.5s ease-out forwards",
        "float": "float 6s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
