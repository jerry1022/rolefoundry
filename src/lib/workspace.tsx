"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { initialWorkspace, workspaceSchema, type Workspace } from "./domain";
const KEY = "rolefoundry.workspace.v1";
type Context = {
  state: Workspace;
  ready: boolean;
  update: (fn: (current: Workspace) => Workspace) => void;
  reset: () => void;
  storageWarning: boolean;
};
const WorkspaceContext = createContext<Context | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Workspace>(initialWorkspace);
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = workspaceSchema.safeParse(JSON.parse(raw));
        if (parsed.success) setState(parsed.data);
        else setStorageWarning(true);
      }
    } catch {
      setStorageWarning(true);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        setStorageWarning(true);
      }
    }
  }, [state, ready]);
  return (
    <WorkspaceContext.Provider
      value={{
        state,
        ready,
        update: (fn) => setState((s) => workspaceSchema.parse(fn(s))),
        reset: () => setState(structuredClone(initialWorkspace)),
        storageWarning,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider missing");
  return value;
}
