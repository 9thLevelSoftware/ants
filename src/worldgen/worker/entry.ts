// Worker script entry: build this file as a classic (IIFE) bundle, inline its text in the game bundle and start
// it with blobWorkerFactory(source) (architecture §8: no module workers, no worker URLs). In a worker the global
// scope is the message endpoint.

import { installWorldgenHost } from './host';
import type { MessageEndpoint } from './protocol';

installWorldgenHost(globalThis as unknown as MessageEndpoint);
