// Minimal placeholder styles for the boot screens and HUD line (the ui-shell task brings the design system).
export const BOOT_CSS = `
.fd-screen { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; background: rgba(20, 17, 13, 0.82); pointer-events: auto; text-align: center; }
.fd-title { font-size: 44px; letter-spacing: 0.18em; margin: 0; }
.fd-sub { opacity: 0.8; margin: 0; }
.fd-btn { font: inherit; color: #f2e9da; background: #4a3b2a; border: 1px solid #8a7458; border-radius: 6px; padding: 8px 22px;
  cursor: pointer; pointer-events: auto; }
.fd-btn:focus-visible { outline: 2px solid #f0c27a; outline-offset: 2px; }
.fd-bar { width: 320px; height: 8px; background: #3a3024; border-radius: 4px; overflow: hidden; }
.fd-bar > div { height: 100%; background: #c9a46a; }
.fd-hud { position: absolute; left: 12px; top: 10px; padding: 4px 10px; background: rgba(20, 17, 13, 0.55); border-radius: 6px;
  text-shadow: 0 1px 2px #000; font-variant-numeric: tabular-nums; }
.fd-prompt { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); padding: 4px 12px;
  background: rgba(20, 17, 13, 0.55); border-radius: 6px; }
.fd-toasts { position: absolute; right: 12px; top: 10px; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.fd-toast { padding: 4px 10px; background: rgba(60, 45, 28, 0.85); border-radius: 6px; pointer-events: auto; cursor: pointer; }
.fd-error { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  background: rgba(30, 8, 6, 0.92); pointer-events: auto; padding: 24px; }
.fd-error pre { max-width: 80vw; max-height: 50vh; overflow: auto; white-space: pre-wrap; text-align: left; font-size: 12px; }
`;
