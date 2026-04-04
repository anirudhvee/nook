export type NookType = "cafe" | "library" | "coworking" | "other";

export interface Nook {
  id: string;
  name: string;
  place_id: string;
  lat: number;
  lng: number;
  address: string;
  type: NookType;
  wifi_quality: number;       // 1–5
  outlet_availability: number; // 1–5
  noise_level: number;         // 1–5 (1=silent, 5=loud)
  laptop_friendly: boolean;
  hours: Record<string, string> | null;
  submitted_by: string | null;
  created_at: string;
}

export interface Stamp {
  id: string;
  user_id: string;
  nook_id: string;
  stamped_at: string;
  note: string | null;
}

export interface Review {
  id: string;
  nook_id: string;
  source: "google";
  review_text: string;
  rating: number;
  reviewed_at: string;
  fetched_at: string;
}

export interface WorkSignals {
  nook_id: string;
  wifi_signal: string | null;
  outlet_signal: string | null;
  noise_signal: string | null;
  laptop_signal: string | null;
  parsed_at: string;
}
