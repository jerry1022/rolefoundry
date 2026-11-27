"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserTransport } from "@/modules/platform/browser-http";
/** Presentation gating only: every domain API independently verifies the current role. */
export function useAdminAccess() {
  const [access, setAccess] = useState<"checking" | "allowed" | "denied" | "unavailable">(
    "checking",
  );
  const generation = useRef(0),
    mounted = useRef(false);
  const verify = useCallback(async () => {
    const current = ++generation.current;
    try {
      const role = (
        await createBrowserTransport((input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
        )("identity/session")
      ).data.role;
      const admin = role === "admin";
      if (mounted.current && generation.current === current)
        setAccess(admin ? "allowed" : "denied");
      return admin;
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (mounted.current && generation.current === current)
        setAccess(status === 401 || status === 403 ? "denied" : "unavailable");
      return false;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void verify();
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [verify]);
  const fetcher = useMemo<typeof fetch>(
    () => async (input, init) => {
      const response = await fetch(input, init);
      if (response.status === 401 || response.status === 403) await verify();
      return response;
    },
    [verify],
  );
  return { access, verify, fetcher };
}
