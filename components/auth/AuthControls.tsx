"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { LoaderCircle, LogOut } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type AuthControlsProps = {
  variant: "map" | "navbar";
};

function getUserInitials(user: User | null) {
  const source =
    typeof user?.user_metadata.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user?.user_metadata.name === "string"
        ? user.user_metadata.name
        : typeof user?.email === "string"
          ? user.email
          : "";

  const parts = source
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "N";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function AuthControls({ variant }: AuthControlsProps) {
  const router = useRouter();
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const emailInputId = useId();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!isMounted) return;

      if (error) {
        setStatusMessage(error.message);
        return;
      }

      setUser(data.user);
    };

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!isMounted) return;
        setUser(session?.user ?? null);
        setIsAuthModalOpen(false);
        setIsDropdownOpen(false);
        setStatusMessage(null);
        router.refresh();
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  useEffect(() => {
    if (!isAuthModalOpen) {
      setEmail("");
      setStatusMessage(null);
      setIsGoogleLoading(false);
      setIsMagicLinkLoading(false);
    }
  }, [isAuthModalOpen]);

  useEffect(() => {
    if (!isDropdownOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!isAuthModalOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAuthModalOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isAuthModalOpen]);

  const openAuthModal = () => {
    setIsDropdownOpen(false);
    setIsAuthModalOpen(true);
  };

  const handlePassportClick = () => {
    if (!user) {
      openAuthModal();
      return;
    }

    router.push("/passport");
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setStatusMessage(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatusMessage(error.message);
      setIsGoogleLoading(false);
    }
  };

  const handleSendMagicLink = async () => {
    setIsMagicLinkLoading(true);
    setStatusMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatusMessage(error.message);
      setIsMagicLinkLoading(false);
      return;
    }

    setStatusMessage("Check your email for your magic link.");
    setIsMagicLinkLoading(false);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setStatusMessage(null);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setStatusMessage(error.message);
      setIsSigningOut(false);
      return;
    }

    setIsSigningOut(false);
  };

  const avatarUrl =
    typeof user?.user_metadata.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : null;

  const passportClasses =
    variant === "map"
      ? "px-4 py-2 rounded-full text-sm font-medium bg-white/90 backdrop-blur-sm border border-white/50 shadow hover:bg-white transition-colors whitespace-nowrap"
      : buttonVariants({ variant: "ghost", size: "sm" });

  const signInClasses =
    variant === "map"
      ? "px-4 py-2 rounded-full text-sm font-semibold bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-colors whitespace-nowrap"
      : buttonVariants({ size: "sm" });

  const avatarButtonClasses =
    variant === "map"
      ? "flex size-10 items-center justify-center overflow-hidden rounded-full border border-white/60 bg-white/90 text-sm font-semibold text-foreground shadow backdrop-blur-sm transition-colors hover:bg-white"
      : "flex size-9 items-center justify-center overflow-hidden rounded-full border border-border bg-background text-sm font-semibold text-foreground transition-colors hover:bg-muted";

  const dropdownClasses =
    variant === "map"
      ? "absolute right-0 top-12 min-w-40 rounded-2xl border border-border/80 bg-background/95 p-1.5 shadow-xl backdrop-blur-sm"
      : "absolute right-0 top-11 min-w-40 rounded-2xl border border-border bg-popover p-1.5 shadow-lg";

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePassportClick}
          className={passportClasses}
        >
          my passport
        </button>

        {user ? (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen((open) => !open)}
              className={avatarButtonClasses}
              aria-expanded={isDropdownOpen}
              aria-haspopup="menu"
              aria-label="Open account menu"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span>{getUserInitials(user)}</span>
              )}
            </button>

            {isDropdownOpen && (
              <div className={dropdownClasses} role="menu">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium leading-none">
                    {user.user_metadata.full_name ?? user.email ?? "Signed in"}
                  </p>
                  {user.email && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
                >
                  {isSigningOut ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <LogOut className="size-4" />
                  )}
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={openAuthModal}
            className={signInClasses}
          >
            sign in
          </button>
        )}
      </div>

      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 px-4 backdrop-blur-[2px]">
          <div
            className="absolute inset-0"
            onClick={() => setIsAuthModalOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-sm rounded-3xl border border-border/80 bg-background/98 p-6 shadow-2xl">
            <div className="space-y-1">
              <p className="text-sm font-medium text-primary">Welcome back</p>
              <h2 className="text-2xl font-semibold tracking-tight">
                Sign in to Nook
              </h2>
              <p className="text-sm text-muted-foreground">
                Save your passport and keep your work spots synced.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || isMagicLinkLoading}
                className="h-11 w-full justify-center rounded-2xl bg-card"
              >
                {isGoogleLoading ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <span className="flex size-5 items-center justify-center rounded-full border border-border bg-background text-[11px] font-semibold">
                    G
                  </span>
                )}
                Continue with Google
              </Button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  or
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-3">
                <label
                  htmlFor={emailInputId}
                  className="text-sm font-medium text-foreground"
                >
                  Email
                </label>
                <input
                  id={emailInputId}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@somewhere.com"
                  className={cn(
                    "h-11 w-full rounded-2xl border border-input bg-card px-4 text-sm outline-none transition-colors",
                    "placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/15"
                  )}
                />
                <Button
                  type="button"
                  size="lg"
                  onClick={handleSendMagicLink}
                  disabled={!email || isGoogleLoading || isMagicLinkLoading}
                  className="h-11 w-full rounded-2xl"
                >
                  {isMagicLinkLoading && (
                    <LoaderCircle className="size-4 animate-spin" />
                  )}
                  Send magic link
                </Button>
              </div>
            </div>

            {statusMessage && (
              <p className="mt-4 text-sm text-muted-foreground">
                {statusMessage}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
