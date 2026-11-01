// Einfache Zeitscheiben-Begrenzung pro Schlüssel (IP + Zweck), damit ein einzelner
// Rechner die Geräte-Codes nicht dutzendweise anlegen oder raten kann.
export function createRateLimiter({ cleanupMs = 5 * 60_000 } = {}) {
  const windows = new Map();

  function allow(key, limit, windowMs) {
    const now = Date.now();
    const entry = windows.get(key);
    if (!entry || entry.until <= now) {
      windows.set(key, { count: 1, until: now + windowMs });
      return true;
    }
    if (entry.count >= limit) return false;
    entry.count += 1;
    return true;
  }

  function sweep() {
    const now = Date.now();
    for (const [key, entry] of windows) if (entry.until <= now) windows.delete(key);
  }

  const timer = setInterval(sweep, cleanupMs);
  timer.unref?.();

  return { allow, sweep, open: () => windows.size };
}
