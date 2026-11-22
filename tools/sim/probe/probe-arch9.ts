import { defaultGameConfig } from '@/sim/createGame';
import { seedFromText } from '@/worldgen';
export default async function main(): Promise<void> {
  for (const t of ['00000002', '00000001']) { const s = seedFromText(t); console.log(t, s, defaultGameConfig('lasius-niger', s, 'naturalist').world.archetype); }
}
