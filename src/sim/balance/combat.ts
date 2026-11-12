// Derived combat stats (GDD 05 §4.1, D2.26). Rules are owned by the combat module.

/** maxHp = HP_PER_MG23 * massMg^(2/3) unless the caste has fixed stats (Lasius worker 1 mg -> 10 HP). */
export const HP_PER_MG23 = 10;
/** bite = BITE_PER_MG23 * massMg^(2/3) * mandibleFactor, damage per 1.0 s strike (Lasius worker 1.0). */
export const BITE_PER_MG23 = 1.0;
/** Carry capacity exponent: carryCap = m^CARRY_EXPONENT unless overridden. */
export const CARRY_EXPONENT = 0.6;
