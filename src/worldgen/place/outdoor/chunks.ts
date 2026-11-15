// Carve-chunk keys of a pre-carve operation: the kit's own (kit/records.ts opChunkKeys, the cells addPreCarve counts
// against PRECARVE_CHUNK_MAX). The outdoor placers need them to admit a cavity as a whole (all its carves or none)
// within their share of the budget, and to give a removed object's chunks back.
export { opChunkKeys } from '../../kit/records';
