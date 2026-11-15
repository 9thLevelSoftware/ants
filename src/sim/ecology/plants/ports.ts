// Every function of another module the plants code calls for an effect or a reading, in one place (the pattern of
// src/sim/ecology/creatures/ports.ts). Tests replace a port (`vi.spyOn(ports, 'airTemp')`) and restore it.
// Each port resolves the owning module's export when CALLED, so import cycles (ecology <-> colony / progression)
// cannot leave a half-built module behind.

import * as environment from '@/sim/environment';
import * as progression from '@/sim/progression';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function late<F extends (...args: any[]) => any>(get: () => F): F {
  return ((...args: Parameters<F>) => get()(...args)) as F;
}

export const ports = {
  /** Air temperature, °C (the sky is global; a plant reads the air). */
  airTemp: late(() => environment.airTemp),
  /** Whether it rains (at a point when given). */
  isRaining: late(() => environment.isRaining),
  /** Rain intensity factor: 0 dry, drizzle 0.1, shower 0.4, downpour 0.7, storm 1.0. */
  rainIntensityAt: late(() => environment.rainIntensityAt),
  publishDiagnostic: late(() => progression.publishDiagnostic),
};

export type PlantPorts = typeof ports;
