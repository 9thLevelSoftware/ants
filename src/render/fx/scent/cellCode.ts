// Integer cell index of a coordinate on the pheromone grid (the field's cells are [i * cell, (i + 1) * cell)).
export function cellIndex(v: number, invCell: number): number {
  return Math.floor(v * invCell);
}
