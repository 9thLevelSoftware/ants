// Test support (never imported by game code): writes a measurement of a test run as JSON under test-output/
// (git-ignored), so long runs (FOUNDRESS_LONG=1) leave their numbers behind for the task report. Silently does
// nothing where the file system is not available.

export async function writeReport(name: string, data: unknown): Promise<void> {
  try {
    const fs = await import(/* @vite-ignore */ 'node:' + 'fs');
    fs.mkdirSync('test-output/reports', { recursive: true });
    fs.writeFileSync(`test-output/reports/${name}.json`, JSON.stringify(data, null, 1));
  } catch {
    // no file system (browser): the report is optional
  }
}
