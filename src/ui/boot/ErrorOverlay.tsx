// Error overlay for uncaught errors and rejected promises: the message instead of a blank page.
export function ErrorOverlay({ text }: { text: string }) {
  return (
    <div class="fd-error" role="alert" data-testid="error-overlay">
      <h2>Something went wrong</h2>
      <pre>{text}</pre>
      <button class="fd-btn" type="button" onClick={() => location.reload()}>Reload</button>
    </div>
  );
}
