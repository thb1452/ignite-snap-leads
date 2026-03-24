const CHUNK_RECOVERY_KEY = "snap_chunk_recovery";
const CHUNK_RECOVERY_QUERY = "__chunk_reload";
const RECOVERY_COOLDOWN_MS = 60_000;

type RecoveryRecord = {
  path: string;
  timestamp: number;
};

function readRecoveryRecord(): RecoveryRecord | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(CHUNK_RECOVERY_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RecoveryRecord;
  } catch {
    return null;
  }
}

function writeRecoveryRecord(record: RecoveryRecord) {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(CHUNK_RECOVERY_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage failures
  }
}

export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : "";

  return [
    "Failed to fetch dynamically imported module",
    "Importing a module script failed",
    "Unable to preload CSS",
    "ChunkLoadError",
    "Loading chunk",
    "Failed to load module script",
  ].some((pattern) => message.includes(pattern));
}

export function attemptChunkRecovery(reason: string, error?: unknown): boolean {
  if (typeof window === "undefined") return false;
  if (!isChunkLoadError(error)) return false;

  const currentPath = `${window.location.pathname}${window.location.search}`;
  const lastAttempt = readRecoveryRecord();
  const now = Date.now();

  if (
    lastAttempt &&
    lastAttempt.path === currentPath &&
    now - lastAttempt.timestamp < RECOVERY_COOLDOWN_MS
  ) {
    console.error("[chunkRecovery] Reload already attempted recently; skipping", {
      reason,
      currentPath,
      error,
    });
    return false;
  }

  writeRecoveryRecord({ path: currentPath, timestamp: now });

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set(CHUNK_RECOVERY_QUERY, String(now));

  console.warn("[chunkRecovery] Reloading app after chunk failure", {
    reason,
    nextUrl: nextUrl.toString(),
    error,
  });

  window.location.replace(nextUrl.toString());
  return true;
}

export function installChunkRecoveryHandlers(): void {
  if (typeof window === "undefined") return;

  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.has(CHUNK_RECOVERY_QUERY)) {
    currentUrl.searchParams.delete(CHUNK_RECOVERY_QUERY);
    window.history.replaceState({}, "", currentUrl.toString());
  }

  window.addEventListener("vite:preloadError", (event: Event) => {
    const payload = (event as CustomEvent).detail;
    if (attemptChunkRecovery("vite:preloadError", payload)) {
      event.preventDefault();
    }
  });

  window.addEventListener(
    "error",
    (event) => {
      attemptChunkRecovery("window.error", event.error ?? event.message);
    },
    true,
  );

  window.addEventListener("unhandledrejection", (event) => {
    if (attemptChunkRecovery("unhandledrejection", event.reason)) {
      event.preventDefault();
    }
  });
}