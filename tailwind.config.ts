import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#13201c",
        field: "#f5f3ec",
        line: "#d9d3c2",
        palm: "#1f6f5b",
        amber: "#b66b14",
        danger: "#b42318",
        skyglass: "#e7f2f0"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"]
      },
      boxShadow: {
        panel: "0 16px 50px rgba(19, 32, 28, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

