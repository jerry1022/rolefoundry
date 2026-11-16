import type { Actor } from "../identity/core";
import type {
  Application,
  ApplicationPage,
  EventPage,
  TrackInput,
  EditInput,
  FollowUpInput,
  FollowUpEdit,
  ResumeChoicePage,
} from "./model";
export interface ApplicationRepository {
  resumeChoices(cursor?: string): Promise<ResumeChoicePage>;
  list(cursor?: string): Promise<ApplicationPage>;
  find(id: string): Promise<Application>;
  events(id: string, cursor?: string): Promise<EventPage>;
  track(input: TrackInput, key: string): Promise<Application>;
  edit(id: string, input: EditInput): Promise<Application>;
  newCycle(id: string, expectedRevision: number, key: string): Promise<Application>;
  addFollowUp(id: string, input: FollowUpInput, key: string): Promise<Application>;
  editFollowUp(id: string, followUpId: string, input: FollowUpEdit): Promise<Application>;
  removeFollowUp(id: string, followUpId: string, expectedRevision: number): Promise<Application>;
  remove(id: string, expectedRevision: number): Promise<{ deleted: true }>;
}
export interface ApplicationAuthorization {
  authorize(actor: Actor, action: string, ownerId?: string): Promise<void>;
}
/** Browser client and persistence share use-case contracts, never a database query surface. */
export interface ApplicationClient extends ApplicationRepository {}
