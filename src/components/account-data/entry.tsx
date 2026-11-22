"use client";
import { createAccountDataClient } from "@/modules/account-data/adapters/http-client";
import { AccountDataWorkspace } from "./workspace";
const client = createAccountDataClient();
export function AccountDataEntry() {
  return <AccountDataWorkspace client={client} />;
}
