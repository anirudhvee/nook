export type { FilterType, NookPlace, NookType } from "./nook";

export interface Stamp {
  id: string;
  user_id: string;
  nook_id: string;
  stamped_at: string;
  note: string | null;
}
