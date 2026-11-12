// Shown when no WebGL2 context can be created (GDD 01 §1.1 `unsupported`): what is needed, no retry loop.
export function Unsupported() {
  return (
    <div class="fd-screen" role="alert">
      <h1 class="fd-title">FOUNDRESS</h1>
      <p>This game needs WebGL 2, which this browser or page does not provide.</p>
      <p class="fd-sub">Try a current Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p>
    </div>
  );
}
