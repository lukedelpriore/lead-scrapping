"use server";

import { auth } from "@/auth";
import {
  testRocketReach,
  testSheets,
  testBrevo,
  pingClaude,
  type TestResult,
} from "@/lib/integrations";

async function guard(): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("not authorized");
}

export async function runRocketReachTest(): Promise<TestResult> {
  await guard();
  return testRocketReach();
}

export async function runSheetsTest(): Promise<TestResult> {
  await guard();
  return testSheets();
}

export async function runBrevoTest(): Promise<TestResult> {
  await guard();
  return testBrevo();
}

export async function runClaudePing(): Promise<TestResult> {
  await guard();
  return pingClaude();
}
