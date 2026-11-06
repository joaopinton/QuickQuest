// Confini del campo del golf (paletti bianchi del fuori limite), senza dipendenze: li usano
// il terreno (dove finisce la griglia), gli ostacoli e la scena.

/** Paletti bianchi ai lati: oltre questo |x| si è fuori limite. */
export const OOB_HALF_WIDTH_M = 48;
/** Fuori limite dietro il tee e oltre il green. */
export const OOB_BEHIND_TEE_M = -20;
export const OOB_PAST_GREEN_M = 35;
