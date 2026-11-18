// Round 7 probe (deleted at the end of the round): a game created by a module that imports only createGame equals
// one created with the sim loaded (rival nests built at creation either way). Arg "sim" loads the sim first.
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
export default async function main(args: string[]): Promise<void> {
  if (args[0] === 'sim') await import('@/sim/sim');
  const { state } = createNewGame(defaultGameConfig('lasius-niger', 1, 'naturalist'));
  const ext = (state.rivals as unknown as { colonies?: Record<string, { setupDone?: boolean }> });
  const s = JSON.stringify(state, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array).reduce((a, x) => (a * 31 + x) >>> 0, 7) : v));
  let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  console.log(JSON.stringify({ loaded: args[0] ?? 'createGame only', rivals: state.colonies.filter((c) => c.rival).length, nests: state.nests.length, ants: state.ants.length, hash: h, ext: Object.keys(ext).slice(0, 5) }));
}
