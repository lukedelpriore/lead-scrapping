import { describe, it, expect } from "vitest";
import { candidateKeys, venueKeys } from "./keys";

describe("candidateKeys", () => {
  it("produces profile, linkedin, name_employer, email, and phone keys", () => {
    const keys = candidateKeys({
      rrProfileId: "12345",
      linkedinUrl: "https://www.linkedin.com/in/jane-doe/",
      name: "Jane Doe",
      employer: "Boca CC",
      emails: ["Jane.Doe@Example.com"],
      phones: ["(305) 555-0134"],
    });
    const byType = Object.fromEntries(keys.map((k) => [k.keyType, k.keyValue]));
    expect(byType.profile_id).toBe("12345");
    expect(byType.linkedin).toBe("linkedin.com/in/jane-doe");
    expect(byType.name_employer).toBe("jane doe::boca country club");
    expect(byType.email).toBe("jane.doe@example.com");
    expect(byType.phone).toBe("+13055550134");
  });

  it("skips blank fields so no wildcard key is produced", () => {
    const keys = candidateKeys({
      rrProfileId: null,
      linkedinUrl: "",
      name: "Jane Doe",
      employer: null,
      emails: ["", null],
      phones: ["junk"],
    });
    expect(keys).toHaveLength(0);
  });

  it("deduplicates repeated keys", () => {
    const keys = candidateKeys({
      emails: ["a@b.com", "A@B.com"],
    });
    expect(keys).toHaveLength(1);
  });

  it("requires both name and employer for a name_employer key", () => {
    const keys = candidateKeys({ name: "Jane Doe" });
    expect(keys.find((k) => k.keyType === "name_employer")).toBeUndefined();
  });
});

describe("venueKeys", () => {
  it("produces a domain key and a name plus state key", () => {
    const keys = venueKeys({
      website: "https://www.bocacc.com",
      name: "The Boca CC",
      state: "FL",
    });
    const byType = Object.fromEntries(keys.map((k) => [k.keyType, k.keyValue]));
    expect(byType.domain).toBe("bocacc.com");
    expect(byType.venue_name_state).toBe("boca country club::fl");
  });

  it("skips the name key when state is missing", () => {
    const keys = venueKeys({ name: "Boca CC" });
    expect(keys.find((k) => k.keyType === "venue_name_state")).toBeUndefined();
  });
});
