import { account } from "./account";
import { admin } from "./admin";
import { applications } from "./applications";
import { architecture } from "./architecture";
import { catalog } from "./catalog";
import { dashboard } from "./dashboard";
import { learning } from "./learning";
import { profile } from "./profile";
import { resume } from "./resume";
import { shell } from "./shell";
import type { Messages } from "./types";
import { vocabulary } from "./vocabulary";

/**
 * One file per product area keeps translation reviews small. Add a section here when a new
 * screen is localized; `npm run i18n:check` rejects missing, unused and duplicate keys.
 */
export const zhTWSections = {
  vocabulary,
  shell,
  catalog,
  dashboard,
  profile,
  learning,
  resume,
  applications,
  admin,
  account,
  architecture,
} satisfies Record<string, Messages>;

export const zhTW: Messages = Object.assign({}, ...Object.values(zhTWSections));
