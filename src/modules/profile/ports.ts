import type { Actor } from "../identity/core";
import type {
  CareerProfile,
  CapabilityEvidence,
  EvidencePage,
  PublicEvidenceInput,
  Preferences,
  InternalEvidenceInput,
} from "./model";

export interface ProfileAuthorization {
  authorize(actor: Actor, action: string, ownerId: string): Promise<void>;
}
/** Persistence boundary: each mutation commits the aggregate revision and invalidation event together. */
export interface ProfileRepository {
  read(): Promise<CareerProfile>;
  update(input: Preferences & { expectedRevision: number }): Promise<CareerProfile>;
  list(query: { skill?: string; cursor?: string; limit: number }): Promise<EvidencePage>;
  history(id: string): Promise<CapabilityEvidence[]>;
  create(input: {
    expectedRevision: number;
    evidence: PublicEvidenceInput;
  }): Promise<{ evidence: CapabilityEvidence; revision: number }>;
  edit(
    id: string,
    input: { expectedRevision: number; expectedVersion: number; evidence: PublicEvidenceInput },
  ): Promise<{ evidence: CapabilityEvidence; revision: number }>;
  remove(
    id: string,
    input: { expectedRevision: number; expectedVersion: number },
  ): Promise<{ revision: number }>;
  importDemo(input: {
    expectedRevision: number;
    preferences: Preferences;
    skills: string[];
  }): Promise<CareerProfile>;
}
/** Trusted domain only: the producing module validates source ownership and immutable version. */
export interface InternalEvidenceWriter {
  record(
    ownerId: string,
    input: InternalEvidenceInput,
  ): Promise<{ evidence: CapabilityEvidence; revision: number }>;
}
/** Browser UI depends on this port, not a transport, database SDK or Auth provider. */
export interface ProfileClient extends ProfileRepository {}
