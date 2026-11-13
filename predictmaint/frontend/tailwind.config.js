/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#E41937",
          50: "#FDE8EB",
          100: "#FBD2D9",
          200: "#F6A6B2",
          300: "#EE6C80",
          400: "#E63D57",
          500: "#E41937",
          600: "#C5112C",
          700: "#A30E24",
          800: "#7D0B1C",
          900: "#5A0814",
        },
        ink: "#111827",
        body: "#111827",
        muted: "#4B5563",
        line: "#E5E7EB",
        panel: "#FFFFFF",
        shell: "#F7F7F8",
        head: "#F3F4F6",
        normal: "#22C55E",
        watch: "#F59E0B",
        alarm: "#E41937",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,.10)",
        panel: "0 2px 8px rgba(17,24,39,.06)",
        toast: "0 12px 30px rgba(17,24,39,.18)",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(228,25,55,.35)" },
          "50%": { boxShadow: "0 0 0 6px rgba(228,25,55,0)" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: ".35" },
        },
        slideIn: {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        toastIn: {
          from: { opacity: "0", transform: "translateX(24px) scale(.98)" },
          to: { opacity: "1", transform: "translateX(0) scale(1)" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        alarmPulse: {
          "0%, 100%": { backgroundColor: "#FFFFFF", borderColor: "#E41937" },
          "50%": { backgroundColor: "#FFF5F6", borderColor: "#F6A6B2" },
        },
      },
      animation: {
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        blink: "blink 1.2s ease-in-out infinite",
        "slide-in": "slideIn .3s ease-out",
        "toast-in": "toastIn .25s ease-out",
        "fade-up": "fadeUp .3s ease-out",
        "alarm-pulse": "alarmPulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
