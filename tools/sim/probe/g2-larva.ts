// gate-sim-2 item 1 probe: larval stage length and daily food at 25 C from the constants (workedExample restatement).
import { requireSpecies } from '@/sim/species';
import { devRate, larvaFood, stageDu } from '@/sim/colony/life';
export default async function main(): Promise<void> {
  const def = requireSpecies('lasius-niger');
  for (const T of [20, 25]) {
    const gd = stageDu(def, 'larva', 'worker') / devRate(def, T);
    const f = larvaFood(def, 'worker', 1);
    console.log(`T ${T} devRate ${devRate(def, T)} larvaDu ${stageDu(def, 'larva', 'worker')} gd ${gd} food ${JSON.stringify(f)} perGd C ${f.c / gd} P ${f.p / gd}`);
  }
  console.log(JSON.stringify(def.life.stageGd), JSON.stringify(def.life.devRate));
}
