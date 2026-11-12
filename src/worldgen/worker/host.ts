// Worker side: answers 'worldgen.generate' requests on a message endpoint (the worker's global scope).

import { generateWorldReport } from '../pipeline';
import { worldTransferables, type GenerateRequest, type MessageEndpoint, type WorkerReply } from './protocol';

function isRequest(d: unknown): d is GenerateRequest {
  return typeof d === 'object' && d !== null && (d as { type?: unknown }).type === 'worldgen.generate';
}

/** Installs the request handler; returns a function that removes it. */
export function installWorldgenHost(scope: MessageEndpoint): () => void {
  const onMessage = (ev: { data: unknown }) => {
    const req = ev.data;
    if (!isRequest(req)) return;
    const reply = (r: WorkerReply, transfer?: ArrayBuffer[]) => scope.postMessage(r, transfer);
    try {
      const report = generateWorldReport(req.params, {
        forceFail: req.forceFail,
        onProgress: (progress) => reply({ type: 'worldgen.progress', id: req.id, progress }),
      });
      reply({ type: 'worldgen.done', id: req.id, world: report.world }, worldTransferables(report.world));
    } catch (e) {
      reply({ type: 'worldgen.error', id: req.id, message: e instanceof Error ? e.message : String(e) });
    }
  };
  scope.addEventListener('message', onMessage);
  return () => scope.removeEventListener('message', onMessage);
}
