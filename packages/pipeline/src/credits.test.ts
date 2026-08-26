import { describe, it, expect } from "vitest";
import {
  batchCap,
  availableAfterReserve,
  suggestedCreditCap,
  reconcile,
} from "./credits";

describe("availableAfterReserve", () => {
  it("subtracts the reserve", () => {
    expect(availableAfterReserve(3600, 200)).toBe(3400);
  });

  it("never goes negative", () => {
    expect(availableAfterReserve(100, 200)).toBe(0);
  });
});

describe("batchCap", () => {
  it("is the minimum of the three limits", () => {
    expect(
      batchCap({ requestRemaining: 80, dayRemaining: 300, availableAfterReserve: 3400 }),
    ).toBe(80);
    expect(
      batchCap({ requestRemaining: 80, dayRemaining: 40, availableAfterReserve: 3400 }),
    ).toBe(40);
    expect(
      batchCap({ requestRemaining: 80, dayRemaining: 300, availableAfterReserve: 10 }),
    ).toBe(10);
  });

  it("never goes negative", () => {
    expect(
      batchCap({ requestRemaining: -5, dayRemaining: 300, availableAfterReserve: 3400 }),
    ).toBe(0);
  });
});

describe("suggestedCreditCap", () => {
  it("is ceil of target times 1.2", () => {
    expect(suggestedCreditCap(100)).toBe(120);
    expect(suggestedCreditCap(83)).toBe(100); // 99.6 -> 100
    expect(suggestedCreditCap(0)).toBe(0);
  });
});

describe("reconcile", () => {
  it("reports no drift when ledger and provider agree", () => {
    const r = reconcile({
      ledgerChargeTotal: -12,
      remainingBefore: 3400,
      remainingAfter: 3388,
    });
    expect(r.ledgerSpent).toBe(12);
    expect(r.providerSpent).toBe(12);
    expect(r.drift).toBe(0);
    expect(r.ok).toBe(true);
  });

  it("reports positive drift when the provider spent more than the ledger", () => {
    const r = reconcile({
      ledgerChargeTotal: -10,
      remainingBefore: 3400,
      remainingAfter: 3388,
    });
    expect(r.providerSpent).toBe(12);
    expect(r.ledgerSpent).toBe(10);
    expect(r.drift).toBe(2);
    expect(r.ok).toBe(false);
  });
});
