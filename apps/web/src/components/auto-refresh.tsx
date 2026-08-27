"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refreshes the current route on an interval while work is in progress, so the
 * results fill in without the operator reloading. Stops when live is false.
 */
export function AutoRefresh({ live, ms = 5000 }: { live: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [live, ms, router]);
  return null;
}
