import { defaultGameConfig } from '@/sim/createGame';
export default async function main(): Promise<void> {
  for (let s = 1; s <= 5; s++) console.log(s, defaultGameConfig('lasius-niger', s, 'naturalist').world.archetype);
}
