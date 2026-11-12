// Reviewer tests (phero task). The two eviction-floor tests FAIL on purpose: they show that once a layer has hit
// its cap, the persisted floors (cellFloor / chunkFloor) refuse every new deposit one by one, so a heavily
// reinforced NEW trail or newly walked home range can never build up, while faint old cells keep their slots for
// game days. "Eviction of the weakest" (task spec deliverable 3) should let the reinforced newcomer win.
import { describe, expect, it } from 'vitest';
import { HOME_DEPOSIT_PER_BU, PHERO_MAX_CELLS, PHERO_MAX_CHUNKS, TRAIL_DAB, TRAIL_DETECT } from './balance';
import { newField, TEST_CELL } from './testkit';

const CHUNK_MM = 16 * TEST_CELL;

describe('eviction floors (reviewer)', () => {
  it('a new trail reinforced every 6 s becomes followable within 600 s even when the trail chunk cap is full', () => {
    const f = newField();
    // Old, faint trails: a 16-cell segment at 0.5 ph in each of 193 chunks (content 8 ph per chunk). The 193rd
    // chunk triggers the first chunk eviction; then the freed headroom is used up by other ordinary deposits.
    for (let c = 0; c <= PHERO_MAX_CHUNKS.trail; c++) {
      const cx = c % 20, cz = Math.floor(c / 20);
      for (let i = 0; i < 16; i++) {
        f.deposit(1, 'trail', { x: cx * CHUNK_MM + (i + 0.5) * TEST_CELL, y: 8, z: cz * CHUNK_MM + 8 }, 0.5);
      }
    }
    for (let c = 0; c < 40; c++) f.deposit(1, 'trail', { x: (30 + c) * CHUNK_MM + 8, y: 8, z: 8 }, 0.5);
    expect(f.stats().chunks).toBe(PHERO_MAX_CHUNKS.trail);

    // A new source far away: every 6 s a forager lays 40 dabs along the same 60 BU route (heavy recruitment).
    const route = (k: number) => ({ x: 50000 + k * 6, y: 8, z: 50000 });
    let followableAt = -1;
    for (let s = 0; s < 600 && followableAt < 0; s++) {
      if (s % 6 === 0) for (let k = 0; k < 40; k++) f.deposit(1, 'trail', route(k), TRAIL_DAB);
      f.step(1);
      for (let k = 0; k < 40; k++) if (f.sampleCell(1, 'trail', route(k)) >= TRAIL_DETECT) { followableAt = s; break; }
    }
    // Measured: refused until t = 4506 s (the chunk floor, 8 ph, must decay below the single dab of 0.25 ph).
    expect(followableAt).toBeGreaterThanOrEqual(0);
    expect(f.validate()).toEqual([]);
  });

  it('ants walking new ground can mark home range within 600 s when the home cell cap is full', () => {
    const f = newField();
    // Old home range: 64,000 deposits of 0.1 ph (the cap is 60,000 cells, so one eviction has happened).
    for (let i = 0; i < PHERO_MAX_CELLS.home + 4000; i++) {
      f.deposit(1, 'home', { x: ((i % 300) + 0.5) * TEST_CELL, y: 8, z: (Math.floor(i / 300) + 0.5) * TEST_CELL }, 0.1);
    }
    // 50 ants walk new ground at 6 BU/s for 600 s, each laying HOME_DEPOSIT 0.04 ph per BU (0.024 ph per tick).
    let accepted = 0;
    for (let s = 0; s < 600; s++) {
      for (let t = 0; t < 10; t++) for (let a = 0; a < 50; a++) {
        const before = f.activeCellCount(1, 'home');
        f.deposit(1, 'home', { x: 6000 + a * 40, y: 8, z: 6000 + (s * 10 + t) * 2.4 }, HOME_DEPOSIT_PER_BU * 0.6);
        if (f.activeCellCount(1, 'home') !== before) accepted++;
      }
      f.step(1);
    }
    // Measured: 0 new cells (cellFloor 0.1 ph > 0.024 ph per deposit; it takes 2 half-lives = 4 game days to clear).
    expect(accepted).toBeGreaterThan(0);
  }, 60000);
});

describe('coordinate range (reviewer)', () => {
  it('a finite position far outside the chunk-key range is refused, not aliased onto a real cell', () => {
    const f = newField();
    // ix = 2^32 + 6 wraps to 6 in the int32 shifts of LayerRuntime.add, landing in cell (6, 0, 0).
    f.deposit(1, 'trail', { x: 2 ** 32 * TEST_CELL + 100, y: 8, z: 8 }, 5);
    expect(f.sampleCell(1, 'trail', { x: 100, y: 8, z: 8 })).toBe(0);
  });
});
