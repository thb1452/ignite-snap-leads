import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const productionSupabase = {
  url: "https://ojyxblegxpdgaqiscxpz.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qeXhibGVneHBkZ2FxaXNjeHB6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgzMTQ5NTMsImV4cCI6MjA3Mzg5MDk1M30.r9TsZsdtHiYVyyNXpeKB8iHumb3ZZfdDUHN4g8twGrU",
};

function supabaseBuildConfig(mode: string) {
  const loaded = loadEnv(mode, process.cwd(), "VITE_");
  const urlName = "VITE_SUPABASE_URL", keyName = "VITE_SUPABASE_PUBLISHABLE_KEY";
  // A deployment override is one pair: never combine its URL with a key left in
  // a lower-priority .env file. Vite's normal mode-file precedence still applies.
  const deploymentPair = process.env[urlName] !== undefined || process.env[keyName] !== undefined;
  const values = deploymentPair ? process.env : loaded;
  const supplied = values[urlName] !== undefined || values[keyName] !== undefined || values.VITE_SUPABASE_PROJECT_ID !== undefined;
  if (!supplied && process.env.VERCEL_ENV === "preview") {
    throw new Error("Preview builds require an explicit Supabase URL and public key pair.");
  }
  if (supplied && (!values[urlName]?.trim() || !values[keyName]?.trim())) {
    throw new Error("Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY together.");
  }
  const url = supplied ? values[urlName]!.trim() : productionSupabase.url;
  const key = supplied ? values[keyName]!.trim() : productionSupabase.key;
  let endpoint: URL;
  try { endpoint = new URL(url); } catch { throw new Error("Invalid Supabase URL."); }
  const projectId = /^([a-z0-9]{20})\.supabase\.(?:co|in)$/.exec(endpoint.hostname)?.[1];
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/" ||
      (!local && (!projectId || endpoint.protocol !== "https:" || endpoint.port)) ||
      (local && !["http:", "https:"].includes(endpoint.protocol))) {
    throw new Error("Supabase URL must be a hosted HTTPS project origin or a local development origin.");
  }
  const declaredProject = values.VITE_SUPABASE_PROJECT_ID?.trim();
  if (declaredProject !== undefined && (!declaredProject || (projectId && declaredProject !== projectId))) {
    throw new Error("VITE_SUPABASE_PROJECT_ID must match the Supabase URL.");
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    // Legacy public keys carry a project ref. This catches configuration mixups,
    // not JWT authenticity. Modern publishable keys are opaque; their project
    // binding additionally needs an actual request to the configured backend.
    try {
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) throw new Error();
      const header = JSON.parse(Buffer.from(key.split(".")[0], "base64url").toString());
      const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
      if (header.alg !== "HS256" || claims.role !== "anon" || (projectId && claims.ref !== projectId)) throw new Error();
    } catch {
      throw new Error("Supabase client key must be publishable or an anon JWT matching the project; secret/service keys are forbidden.");
    }
  }
  return { url: endpoint.origin, key, projectId: projectId ?? declaredProject ?? "local" };
}

// https://vite.dev/config/#using-environment-variables-in-config
export default defineConfig(({ mode }) => {
  const supabase = supabaseBuildConfig(mode);
  return ({
  // Keep asset URLs correct in both root and subpath deployments.
  // Example subpath value: "/app/"
  base: process.env.VITE_BASE_PATH || "/",
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabase.url),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabase.key),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabase.projectId),
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
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@tanstack/react-query",
      "@tanstack/react-virtual",
      "leaflet",
      "leaflet.markercluster",
    ],
  },
  build: {
    // Rely on Vite/Rollup's default chunking.
    // Custom `manualChunks` here was creating circular chunk dependencies that caused React imports
    // to be `undefined` at runtime (e.g. `createContext` errors in vendor bundles).
    // Optimize chunk size warnings
    chunkSizeWarningLimit: 1000,
  },
  });
});
