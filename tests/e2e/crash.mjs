// Error overlay check (task F3b, criterion 6): a deliberately thrown error must show the overlay, not a blank page.
//   node tools/harness/play.mjs --root . --query "test=1&autostart=1&seed=1" --script tests/e2e/crash.mjs \
//        --ignore "FOUNDRESS deliberate test error"
// (--ignore keeps the harness from counting the deliberate page error; any other error still fails the run.)
export default async ({ page, shot, wait }) => {
  await page.evaluate(() => window.__crash());
  await wait(() => !!document.querySelector('[data-testid="error-overlay"]'));
  const text = await page.evaluate(() => document.querySelector('[data-testid="error-overlay"]').textContent);
  if (!text.includes('FOUNDRESS deliberate test error')) throw new Error(`overlay shows the wrong text: ${text}`);
  // a rejected promise too
  await page.evaluate(() => { void Promise.reject(new Error('FOUNDRESS deliberate test error (promise)')); });
  await wait(() => document.querySelector('[data-testid="error-overlay"]').textContent.includes('(promise)'));
  await shot('error-overlay');
  return { overlay: text.slice(0, 120) };
};
