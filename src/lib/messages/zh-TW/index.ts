import { account } from "./account";
import { admin } from "./admin";
import { applications } from "./applications";
import { architecture } from "./architecture";
import { assessmentMatching } from "./assessment-matching";
import { catalog } from "./catalog";
import { common } from "./common";
import { dashboard } from "./dashboard";
import { learning } from "./learning";
import { learningWorkspace } from "./learning-workspace";
import { profile } from "./profile";
import { profileWorkspace } from "./profile-workspace";
import { resume } from "./resume";
import { resumeTracking } from "./resume-tracking";
import { shell } from "./shell";
import type { Messages } from "./types";
import { vocabulary } from "./vocabulary";

/**
 * One file per product area keeps translation reviews small. Add a section here when a new
 * screen is localized; `npm run i18n:check` rejects missing, unused and duplicate keys.
 */
export const zhTWSections = {
  vocabulary,
  common,
  shell,
  catalog,
  dashboard,
  profile,
  learning,
  learningWorkspace,
  resume,
  applications,
  resumeTracking,
  admin,
  account,
  architecture,
  assessmentMatching,
  profileWorkspace,
} satisfies Record<string, Messages>;

export const zhTW: Messages = Object.assign({}, ...Object.values(zhTWSections));
