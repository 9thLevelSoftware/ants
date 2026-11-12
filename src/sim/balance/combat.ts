// Derived combat stats (GDD 07 §2.3) . Rules are owned by the combat module.

/** maxHp = HP_PER_SQRT_MG * sqrt(massMg); males x MALE_HP_MULT. */
export const HP_PER_SQRT_MG = 12;
export const MALE_HP_MULT = 0.5;
/** biteDps = BITE_PER_SQRT_MG * sqrt(massMg) * mandibleFactor. */
export const BITE_PER_SQRT_MG = 2;
/** Carry capacity exponent: carryCap = m^CARRY_EXPONENT unless overridden. */
export const CARRY_EXPONENT = 0.6;
