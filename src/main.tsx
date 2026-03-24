import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installGlobalErrorHandlers } from "@/services/errorLogger";
import { installChunkRecoveryHandlers } from "@/services/chunkRecovery";
import App from "./App.tsx";
import "./index.css";

installChunkRecoveryHandlers();
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
