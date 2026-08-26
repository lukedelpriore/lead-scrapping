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
 * Demo dataset: 10 demo groups, 50 demo venues, 1 demo request, 1 demo run,
 * and 200 demo candidates. Everything is clearly fake (Demo prefix,
 * example.com domains, 555 phones) so it never mixes with real data. Runs the
 * whole UI and pipeline with no external calls.
 */
async function seedDemo() {
  const rng = makeRng(42);

  // Clean any previous demo rows so the demo stays exactly 50/10/200.
  await prisma.candidate.deleteMany({ where: { name: { startsWith: "Demo Contact" } } });
  await prisma.venue.deleteMany({ where: { name: { startsWith: "Demo Club" } } });
  await prisma.group.deleteMany({ where: { name: { startsWith: "Demo Group" } } });
  await prisma.request.deleteMany({ where: { name: { startsWith: "Demo " } } });

  const owner = await prisma.user.findFirst({ where: { role: "owner" } });
  if (!owner) throw new Error("owner user missing, seed users first");

  const demoGroups = [];
  for (let i = 1; i <= 10; i++) {
    const name = `Demo Group ${String(i).padStart(2, "0")}`;
    const state = DEMO_STATES[i % DEMO_STATES.length]!;
    const g = await prisma.group.create({
      data: {
        name,
        nameNormalized: normalizeName(name),
        status: "open",
        domain: `demogroup${i}.example.com`,
        states: [state] as unknown as Prisma.InputJsonValue,
        venueCount: 0,
      },
    });
    demoGroups.push(g);
  }

  const demoVenues = [];
  for (let i = 1; i <= 50; i++) {
    const name = `Demo Club ${String(i).padStart(2, "0")}`;
    const state = DEMO_STATES[i % DEMO_STATES.length]!;
    const ownership = DEMO_OWNERSHIP[i % DEMO_OWNERSHIP.length]!;
    const inGroup = i % 3 === 0; // a third belong to a demo group
    const group = inGroup ? demoGroups[i % demoGroups.length]! : null;
    const tier = ((i % 3) + 1) as 1 | 2 | 3;
    const v = await prisma.venue.create({
      data: {
        name,
        nameNormalized: normalizeName(name),
        city: `Demo City ${i}`,
        state,
        website: `https://democlub${i}.example.com`,
        domain: `democlub${i}.example.com`,
        mainLine: `+1305555${String(1000 + i).slice(-4)}`,
        ownershipType: ownership,
        groupId: group?.id ?? null,
        tier,
        hostsWeddings: rng() > 0.3 ? "yes" : "unclear",
        hostsCorporate: rng() > 0.4 ? "yes" : "unclear",
        nonmemberEvents: rng() > 0.5 ? "yes" : "unclear",
        evidenceUrl: `https://democlub${i}.example.com/weddings`,
        evidencePhrase: "membership not required",
        capacity: 120 + (i % 5) * 40,
        classifierConfidence: 0.6 + rng() * 0.35,
        status: "open",
        qualifiedAt: new Date("2026-08-20T12:00:00Z"),
      },
    });
    demoVenues.push(v);
    if (group) {
      await prisma.group.update({
        where: { id: group.id },
        data: { venueCount: { increment: 1 } },
      });
    }
  }

  const request = await prisma.request.create({
    data: {
      name: "Demo Florida Tier 1",
      createdById: owner.id,
      states: ["FL"] as unknown as Prisma.InputJsonValue,
      groupIds: [] as unknown as Prisma.InputJsonValue,
      tiers: [1, 2] as unknown as Prisma.InputJsonValue,
      targetCount: 100,
      creditCap: 120,
      revealMode: "ask",
      status: "needs_review",
      creditsUsed: 0,
      notes: "Seeded demo request. No external calls, no credits spent.",
    },
  });

  const run = await prisma.run.create({
    data: {
      requestId: request.id,
      startedAt: new Date("2026-08-25T09:00:00Z"),
      status: "needs_review",
      stageCounts: {
        discover: 50,
        dedupe: 44,
        qualify: 44,
        map: 10,
        find: 200,
        gate: 168,
        reveal: 0,
        deliver: 0,
      } as unknown as Prisma.InputJsonValue,
      warnings: [] as unknown as Prisma.InputJsonValue,
    },
  });

  for (let i = 1; i <= 200; i++) {
    const venue = demoVenues[i % demoVenues.length]!;
    const name = `Demo Contact ${String(i).padStart(3, "0")}`;
    const title = DEMO_TITLES[i % DEMO_TITLES.length]!;
    const employer = venue.name;
    const isDup = i % 6 === 0; // some land in Already have
    await prisma.candidate.create({
      data: {
        runId: run.id,
        requestId: request.id,
        targetType: venue.groupId ? "group" : "venue",
        venueId: venue.id,
        groupId: venue.groupId,
        rrProfileId: `demo-${100000 + i}`,
        name,
        nameNormalized: normalizeName(name),
        title,
        employer,
        employerNormalized: normalizeName(employer),
        linkedinUrl: `https://linkedin.com/in/demo-contact-${i}`,
        linkedinNormalized: `linkedin.com/in/demo-contact-${i}`,
        location: `${venue.city}, ${venue.state}`,
        rank: i % 4 === 0 ? "alternate" : "primary",
        confidence: 0.5 + rng() * 0.5,
        reason: "Seeded demo candidate.",
        dedupeStatus: isDup ? "duplicate" : "ready",
        dedupeKey: isDup ? `demo-dup-${i}` : null,
        dedupeSource: isDup ? "delivered" : null,
        reviewStatus: isDup ? "none" : "pending",
      },
    });
  }

  console.log("  Seeded demo dataset: 10 groups, 50 venues, 1 request, 1 run, 200 candidates.");
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
