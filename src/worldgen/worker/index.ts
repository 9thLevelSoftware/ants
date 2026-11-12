// World generation off the main thread. entry.ts is the worker script; import only this barrel elsewhere.

export { generateWorldAsync, blobWorkerFactory, type AsyncGenerateOptions, type WorkerLike } from './client';
export { installWorldgenHost } from './host';
export type { GenerateRequest, WorkerReply, MessageEndpoint } from './protocol';
export { worldTransferables } from './protocol';
