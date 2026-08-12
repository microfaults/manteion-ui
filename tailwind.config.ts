import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Core shadcn tokens — all read from CSS vars in globals.css
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
          muted: "var(--primary-muted)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
          muted: "var(--destructive-muted)",
        },
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        input: "var(--input)",
        ring: "var(--ring)",

        // Sidebar (black, matches Figma)
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          accent: "var(--sidebar-accent)",
          border: "var(--sidebar-border)",
          muted: "var(--sidebar-muted)",
        },

        // Status ramp — pair with filled dot; *-muted are soft tint backings
        status: {
          healthy: "var(--status-healthy)",
          degraded: "var(--status-degraded)",
          down: "var(--status-down)",
          unknown: "var(--status-unknown)",
          "healthy-muted": "var(--status-healthy-muted)",
          "degraded-muted": "var(--status-degraded-muted)",
          "down-muted": "var(--status-down-muted)",
        },

        // Phase pills
        "phase-baseline": "var(--phase-baseline)",
        "phase-isolation": "var(--phase-isolation)",
        "phase-combined": "var(--phase-combined)",
        "phase-failed": "var(--phase-failed)",
        "phase-pending": "var(--phase-pending)",

        // Chart series (observability trends / mini-bars)
        chart: {
          1: "var(--chart-1)",
          2: "var(--chart-2)",
          3: "var(--chart-3)",
          4: "var(--chart-4)",
          5: "var(--chart-5)",
          6: "var(--chart-6)",
        },

        // Latency thresholds
        latency: {
          good: "var(--latency-good)",
          warn: "var(--latency-warn)",
          bad: "var(--latency-bad)",
        },

        // Layered surfaces
        surface: {
          app: "var(--surface-app)",
          card: "var(--surface-card)",
          raised: "var(--surface-raised)",
          sunken: "var(--surface-sunken)",
        },

        // Mono identifier / latency text (slightly cooler than foreground)
        mono: "var(--text-mono)",
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        full: "9999px",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
