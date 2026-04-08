import { NextResponse } from "next/server";
import { getGoogleIdentityProfile } from "@/lib/auth-profile";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const googleProfile = getGoogleIdentityProfile(user.identities ?? []);

        if (googleProfile) {
          const nextUserMetadata = {
            ...user.user_metadata,
            ...(googleProfile.fullName ? { full_name: googleProfile.fullName } : {}),
            ...(googleProfile.name ? { name: googleProfile.name } : {}),
            ...(googleProfile.avatarUrl
              ? {
                  avatar_url: googleProfile.avatarUrl,
                  picture: googleProfile.avatarUrl,
                }
              : {}),
          };

          const metadataChanged =
            nextUserMetadata.full_name !== user.user_metadata.full_name ||
            nextUserMetadata.name !== user.user_metadata.name ||
            nextUserMetadata.avatar_url !== user.user_metadata.avatar_url ||
            nextUserMetadata.picture !== user.user_metadata.picture;

          if (metadataChanged) {
            await supabase.auth.updateUser({
              data: nextUserMetadata,
            });
          }
        }
      }
    }
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
