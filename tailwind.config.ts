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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
