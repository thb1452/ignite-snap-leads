import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://ojyxblegxpdgaqiscxpz.supabase.co"),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qeXhibGVneHBkZ2FxaXNjeHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzMTQ5NTMsImV4cCI6MjA3Mzg5MDk1M30.r9TsZsdtHiYVyyNXpeKB8iHumb3ZZfdDUHN4g8twGrU"),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify("ojyxblegxpdgaqiscxpz"),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Keep React in a single shared chunk to prevent duplicate instances
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react/jsx-runtime')) {
            return 'vendor-react';
          }
          // Supabase and React Query - frequently used together
          if (id.includes('node_modules/@supabase') || id.includes('node_modules/@tanstack/react-query')) {
            return 'vendor-data';
          }
          // Radix UI components - large library, split separately
          if (id.includes('node_modules/@radix-ui')) {
            return 'vendor-radix';
          }
          // Map libraries
          if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet') || id.includes('node_modules/react-leaflet-cluster')) {
            return 'vendor-map';
          }
          // Chart library
          if (id.includes('node_modules/recharts')) {
            return 'vendor-charts';
          }
          // Excel/CSV processing
          if (id.includes('node_modules/xlsx') || id.includes('node_modules/papaparse')) {
            return 'vendor-export';
          }
          // Animation library
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-motion';
          }
          // Date utilities
          if (id.includes('node_modules/date-fns')) {
            return 'vendor-dates';
          }
          // Virtualization
          if (id.includes('node_modules/@tanstack/react-virtual')) {
            return 'vendor-virtual';
          }
        },
      },
    },
    // Optimize chunk size warnings
    chunkSizeWarningLimit: 1000,
  },
}));