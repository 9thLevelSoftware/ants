// Boot checks (GDD 01 §1.1 `boot`): WebGL2 availability and the global error traps that feed the error overlay.

/** True when a WebGL2 context can be created (on a throwaway canvas). */
export function webgl2Available(doc: Document = document): boolean {
  try {
    const c = doc.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function describe(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}${e.stack ? `\n${e.stack}` : ''}`;
  return String(e);
}

/** Routes uncaught errors and unhandled rejections to `show` (the error overlay). Returns an uninstaller. */
export function installErrorTraps(win: Window, show: (text: string) => void): () => void {
  const onError = (ev: ErrorEvent) => show(describe(ev.error ?? ev.message));
  const onRejection = (ev: PromiseRejectionEvent) => show(describe(ev.reason));
  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  return () => {
    win.removeEventListener('error', onError);
    win.removeEventListener('unhandledrejection', onRejection);
  };
}
