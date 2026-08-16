import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101828",
        muted: "#667085",
        primary: "#155EEF",
        soft: "#F5F8FF"
      }
    }
  },
  plugins: []
};

export default config;