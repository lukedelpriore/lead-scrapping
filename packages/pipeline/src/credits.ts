/**
 * Credit cap math and ledger reconciliation. Sections 6.7 and 6.8.
 * Pure functions so the money path is fully unit tested.
 */

export interface BatchCapInput {
  /** request.credit_cap minus request.credits_used */
  requestRemaining: number;
  /** settings.max_credits_per_day minus credits_used_today */
  dayRemaining: number;
  /** person_exports_remaining minus settings.reserve_credits */
  availableAfterReserve: number;
}

/**
 * batch_cap = min(request remaining, day remaining, available after reserve),
 * never negative. When this is 0 or less the caller pauses the request.
 */
export function batchCap(input: BatchCapInput): number {
  const cap = Math.min(
    input.requestRemaining,
    input.dayRemaining,
    input.availableAfterReserve,
  );
  return Math.max(0, cap);
}

/**
 * available = person_exports_remaining - reserve_credits, never negative.
 */
export function availableAfterReserve(
  personExportsRemaining: number,
  reserveCredits: number,
): number {
  return Math.max(0, personExportsRemaining - reserveCredits);
}

/**
 * Default credit cap suggested on the request form: ceil(target * 1.2).
 */
export function suggestedCreditCap(targetCount: number): number {
  return Math.ceil(targetCount * 1.2);
}

export interface ReconcileInput {
  /** Sum of ledger charge deltas for the run, a negative number. */
  ledgerChargeTotal: number;
  /** person_exports_remaining before the batch, from the account endpoint. */
  remainingBefore: number;
  /** person_exports_remaining after the batch, from the account endpoint. */
  remainingAfter: number;
}

export interface ReconcileResult {
  /** Credits the ledger says were spent (positive). */
  ledgerSpent: number;
  /** Credits RocketReach says were spent (positive). */
  providerSpent: number;
  /** providerSpent - ledgerSpent. Nonzero means drift. */
  drift: number;
  ok: boolean;
}

/**
 * Reconcile the local ledger against RocketReach's own balance movement.
 * A nonzero drift flags the run with a warning.
 */
export function reconcile(input: ReconcileInput): ReconcileResult {
  const ledgerSpent = Math.abs(input.ledgerChargeTotal);
  const providerSpent = input.remainingBefore - input.remainingAfter;
  const drift = providerSpent - ledgerSpent;
  return {
    ledgerSpent,
    providerSpent,
    drift,
    ok: drift === 0,
  };
}
