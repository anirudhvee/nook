import type { User, UserIdentity } from "@supabase/supabase-js";

type IdentityRecord = Record<string, unknown>;

export type GoogleIdentityProfile = {
  avatarUrl?: string;
  fullName?: string;
  name?: string;
};

function getString(
  record: IdentityRecord | undefined,
  key: string
): string | undefined {
  const value = record?.[key];
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getGoogleIdentityProfile(
  identities: UserIdentity[]
): GoogleIdentityProfile | null {
  const googleIdentity = identities.find((identity) => identity.provider === "google");
  const identityData = googleIdentity?.identity_data as IdentityRecord | undefined;

  if (!identityData) return null;

  const fullName = getString(identityData, "full_name") ?? getString(identityData, "name");
  const name = getString(identityData, "name") ?? fullName;
  const avatarUrl =
    getString(identityData, "avatar_url") ?? getString(identityData, "picture");

  if (!fullName && !name && !avatarUrl) {
    return null;
  }

  return {
    avatarUrl,
    fullName,
    name,
  };
}

export function getUserDisplayName(
  user: User | null,
  identities: UserIdentity[] = []
): string {
  const googleProfile = getGoogleIdentityProfile(identities);

  return (
    (typeof user?.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : undefined) ??
    (typeof user?.user_metadata.name === "string"
      ? user.user_metadata.name
      : undefined) ??
    googleProfile?.fullName ??
    googleProfile?.name ??
    user?.email ??
    ""
  );
}

export function getUserAvatarUrl(
  user: User | null,
  identities: UserIdentity[] = []
): string | null {
  if (typeof user?.user_metadata.avatar_url === "string") {
    return user.user_metadata.avatar_url;
  }

  return getGoogleIdentityProfile(identities)?.avatarUrl ?? null;
}

export function getUserInitials(
  user: User | null,
  identities: UserIdentity[] = []
): string {
  const source = getUserDisplayName(user, identities);
  const parts = source
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "N";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
