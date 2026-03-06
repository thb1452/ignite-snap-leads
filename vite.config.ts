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
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor: split heavy libs into their own cached chunks
          'vendor-map': ['leaflet', 'react-leaflet', 'leaflet.markercluster', 'react-leaflet-cluster'],
          'vendor-charts': ['recharts'],
          'vendor-xlsx': ['xlsx'],
          'vendor-motion': ['framer-motion'],
        },
      },
    },
  },
}));