"use client";
import { createDeletionClient } from "@/modules/account-deletion/adapters/http-client";
import type { DeletionReceipt } from "@/modules/account-deletion/model";
import { DeletionRequest, DeletionProgress, DeletionReceiptCheck } from "./workspace";
const client = createDeletionClient();
export function DeletionRequestEntry({
  onAccepted,
}: {
  onAccepted: (receipt: DeletionReceipt) => void;
}) {
  return <DeletionRequest client={client} onAccepted={onAccepted} />;
}
export function DeletionProgressEntry({ receipt }: { receipt: DeletionReceipt }) {
  return <DeletionProgress client={client} receipt={receipt} />;
}
export function DeletionReceiptEntry() {
  return <DeletionReceiptCheck client={client} />;
}
