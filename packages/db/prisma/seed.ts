import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  PIPELINE_DEFAULTS,
  STATE_ORDER,
  STATE_NAMES,
  SEED_GROUPS,
  TITLE_LISTS,
} from "@dph/config";
import { normalizeName } from "@dph/pipeline";

const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Deterministic pseudo random generator so the demo dataset is stable across
 * runs. Seeded, no Math.random, so a re-seed produces the same fixtures.
 */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const DEMO_STATES = ["FL", "TX", "CA", "NJ", "NY"];
const DEMO_OWNERSHIP = ["group", "private_owner", "member_owned", "municipal"] as const;
const DEMO_TITLES = [
  "Director of Catering",
  "Director of Private Events",
  "General Manager",
  "Director of Sales",
  "Membership Director",
  "Owner",
  "President",
];

async function seedUsers() {
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const luke = allowed.find((e) => e.startsWith("luke")) ?? "luke@delpriorehospitality.com";
  const hashir = allowed.find((e) => e.startsWith("hashir")) ?? "hashir@delpriorehospitality.com";

  let password = process.env.SEED_PASSWORD;
  let generated = false;
  if (!password) {
    password = randomBytes(9).toString("base64url");
    generated = true;
  }
  const hash = await bcrypt.hash(password, 10);

  // When SEED_PASSWORD is provided, it is authoritative: set the hash on both
  // create and update so a re seed with a new password applies. When the
  // password was generated, only set it on create so a re seed does not silently
  // change a working login.
  const setHashOnUpdate = !generated;
  await prisma.user.upsert({
    where: { email: luke },
    update: { role: "owner", name: "Luke Del Priore", ...(setHashOnUpdate ? { passwordHash: hash } : {}) },
    create: { email: luke, name: "Luke Del Priore", role: "owner", passwordHash: hash },
  });
  await prisma.user.upsert({
    where: { email: hashir },
    update: { role: "operator", name: "Hashir Faiz", ...(setHashOnUpdate ? { passwordHash: hash } : {}) },
    create: { email: hashir, name: "Hashir Faiz", role: "operator", passwordHash: hash },
  });

  if (generated) {
    // Printed once so the operator can sign in before OAuth is configured.
    console.log("\n  Seeded login password (shown once):", password, "\n");
  } else {
    console.log("  Seeded users with the provided SEED_PASSWORD.");
  }
}

async function seedSettings() {
  await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: {
      id: SETTINGS_ID,
      reserveCredits: PIPELINE_DEFAULTS.reserve_credits,
      maxCreditsPerRequest: PIPELINE_DEFAULTS.max_credits_per_request,
      maxCreditsPerDay: PIPELINE_DEFAULTS.max_credits_per_day,
      autoRevealMinConfidence: PIPELINE_DEFAULTS.auto_reveal_min_confidence,
      maxContactsPerVenue: PIPELINE_DEFAULTS.max_contacts_per_venue,
      maxContactsPerGroup: PIPELINE_DEFAULTS.max_contacts_per_group,
      searchQuotaHeadroom: PIPELINE_DEFAULTS.search_quota_headroom,
      titleLists: TITLE_LISTS as unknown as Prisma.InputJsonValue,
      stateOrder: STATE_ORDER as unknown as Prisma.InputJsonValue,
      notificationEmails: (process.env.ALLOWED_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) as unknown as Prisma.InputJsonValue,
      timezone: PIPELINE_DEFAULTS.timezone,
      placesEnabled: false,
      companyLookupEnabled: false,
    },
  });
  console.log("  Seeded settings row.");
}

async function seedStates() {
  for (let i = 0; i < STATE_ORDER.length; i++) {
    const code = STATE_ORDER[i]!;
    await prisma.state.upsert({
      where: { code },
      update: { sortOrder: i, name: STATE_NAMES[code] ?? code },
      create: { code, name: STATE_NAMES[code] ?? code, sortOrder: i },
    });
  }
  console.log(`  Seeded ${STATE_ORDER.length} states.`);
}

async function seedCounties() {
  const path = join(here, "..", "data", "counties.sample.json");
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    counties: Record<string, string[]>;
  };
  let count = 0;
  for (const [state, names] of Object.entries(parsed.counties)) {
    for (const name of names) {
      await prisma.county.upsert({
        where: { stateCode_name: { stateCode: state, name } },
        update: {},
        create: { stateCode: state, name },
      });
      count++;
    }
  }
  console.log(`  Seeded ${count} counties (sample set, full list loads in M2).`);
}

async function seedGroups() {
  for (const g of SEED_GROUPS) {
    await prisma.group.upsert({
      where: { nameNormalized: normalizeName(g.name) },
      update: { status: g.status },
      create: {
        name: g.name,
        nameNormalized: normalizeName(g.name),
        status: g.status,
      },
    });
    // A group marked in_play also suppresses the whole group.
    if (g.status === "in_play") {
      await prisma.suppression.upsert({
        where: {
          keyType_keyValue: { keyType: "group", keyValue: normalizeName(g.name) },
        },
        update: {},
        create: {
          keyType: "group",
          keyValue: normalizeName(g.name),
          displayName: g.name,
          source: "in_play",
          notes: "Seeded in play group.",
        },
      });
    }
  }
  console.log(`  Seeded ${SEED_GROUPS.length} groups.`);
}

/**
 * Demo search: a general business search ("roofing companies in Ohio and
 * Michigan") with example businesses, owner names, and a couple already
 * verified, so the app is clickable with no external calls. Everything is
 * clearly fake (example.com, 555 numbers) so it never mixes with real data.
 */
const DEMO = [
  { biz: "Summit Roofing Co", owner: "Marcus Hale", city: "Columbus", st: "OH", verified: true },
  { biz: "Buckeye Exteriors", owner: "Dana Reyes", city: "Dayton", st: "OH", verified: true },
  { biz: "Maple Ridge Roofing", owner: "Tom Alcott", city: "Toledo", st: "OH", have: true },
  { biz: "Great Lakes Roof and Siding", owner: "Priya Nair", city: "Detroit", st: "MI" },
  { biz: "Northline Roofing", owner: "Kevin Boyd", city: "Grand Rapids", st: "MI" },
  { biz: "Cardinal Roof Systems", owner: "Alan Wu", city: "Cincinnati", st: "OH" },
  { biz: "Lakeshore Roofing", owner: "Erica Sol", city: "Ann Arbor", st: "MI" },
  { biz: "Ironwood Roofing", owner: "Sam Ford", city: "Akron", st: "OH", have: true },
  { biz: "Riverbend Exteriors", owner: "Lena Ortiz", city: "Lansing", st: "MI" },
  { biz: "Sterling Roof Pros", owner: "Chris Vale", city: "Cleveland", st: "OH" },
  { biz: "Copper Creek Roofing", owner: "Nina Park", city: "Flint", st: "MI" },
  { biz: "Evergreen Roofing Co", owner: "Paul Reed", city: "Warren", st: "MI" },
];

async function seedDemo() {
  // Clean any previous demo rows.
  await prisma.candidate.deleteMany({ where: { name: { in: DEMO.map((d) => d.owner) } } });
  await prisma.venue.deleteMany({ where: { domain: { endsWith: ".roofdemo.example.com" } } });
  await prisma.request.deleteMany({ where: { name: { startsWith: "Roofing companies" } } });

  const owner = await prisma.user.findFirst({ where: { role: "owner" } });
  if (!owner) throw new Error("owner user missing, seed users first");

  const request = await prisma.request.create({
    data: {
      name: "Roofing companies in Ohio, Michigan",
      createdById: owner.id,
      command: "Find roofing company owners in Ohio and Michigan, about 200 businesses",
      businessType: "Roofing companies",
      keywords: ["roofing company", "roofing contractor"] as unknown as Prisma.InputJsonValue,
      states: ["OH", "MI"] as unknown as Prisma.InputJsonValue,
      groupIds: [] as unknown as Prisma.InputJsonValue,
      tiers: [] as unknown as Prisma.InputJsonValue,
      targetCount: 200,
      creditCap: 200,
      revealMode: "ask",
      status: "needs_review",
      creditsUsed: 2,
    },
  });

  const run = await prisma.run.create({
    data: {
      requestId: request.id,
      startedAt: new Date("2026-08-27T09:00:00Z"),
      finishedAt: new Date("2026-08-27T09:04:00Z"),
      status: "needs_review",
      stageCounts: { discover: 214, dedupe: 200, find: DEMO.length, reveal: 2 } as unknown as Prisma.InputJsonValue,
      warnings: [] as unknown as Prisma.InputJsonValue,
    },
  });

  let slug = 0;
  for (const d of DEMO) {
    slug += 1;
    const domain = `biz${slug}.roofdemo.example.com`;
    const venue = await prisma.venue.create({
      data: {
        name: d.biz,
        nameNormalized: normalizeName(d.biz),
        city: d.city,
        state: d.st,
        website: `https://${domain}`,
        domain,
        status: "open",
        qualifiedAt: new Date("2026-08-27T09:02:00Z"),
      },
    });
    const first = d.owner.split(" ")[0]!.toLowerCase();
    const candidate = await prisma.candidate.create({
      data: {
        runId: run.id,
        requestId: request.id,
        targetType: "venue",
        venueId: venue.id,
        rrProfileId: `demo-${1000 + slug}`,
        name: d.owner,
        nameNormalized: normalizeName(d.owner),
        title: "Owner",
        employer: d.biz,
        employerNormalized: normalizeName(d.biz),
        linkedinUrl: `https://linkedin.com/in/${first}-${slug}`,
        linkedinNormalized: `linkedin.com/in/${first}-${slug}`,
        location: `${d.city}, ${d.st}`,
        rank: "primary",
        confidence: 0.9,
        reason: "Seeded demo owner.",
        dedupeStatus: d.have ? "duplicate" : "ready",
        dedupeKey: d.have ? `demo-dup-${slug}` : null,
        dedupeSource: d.have ? "delivered" : null,
        reviewStatus: "pending",
      },
    });
    if (d.verified) {
      await prisma.contact.create({
        data: {
          candidateId: candidate.id,
          rrProfileId: candidate.rrProfileId,
          name: d.owner,
          title: "Owner",
          employer: d.biz,
          emails: [{ address: `${first}@${domain}`, type: "work", grade: "A" }] as unknown as Prisma.InputJsonValue,
          phones: [
            { number: `+1555921${String(3000 + slug).slice(-4)}`, type: "mobile", valid: true },
            { number: `+1555010${String(4000 + slug).slice(-4)}`, type: "work", valid: true },
          ] as unknown as Prisma.InputJsonValue,
          hasMobile: true,
          hasVerifiedEmail: true,
          creditCharged: true,
          lookedUpAt: new Date("2026-08-27T09:03:00Z"),
        },
      });
    }
  }

  console.log(`  Seeded demo search with ${DEMO.length} businesses and owners.`);
}

async function main() {
  console.log("Seeding Del Priore Hospitality Lead Engine");
  await seedUsers();
  await seedSettings();
  await seedStates();
  await seedCounties();
  await seedGroups();
  await seedDemo();
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
