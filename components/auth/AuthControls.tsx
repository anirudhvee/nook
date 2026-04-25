"use client";

import Image from "next/image";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import type {
  AuthChangeEvent,
  Session,
  User,
  UserIdentity,
} from "@supabase/supabase-js";
import { LoaderCircle, LogOut } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  getUserAvatarUrl,
  getUserDisplayName,
  getUserInitials,
} from "@/lib/auth-profile";
import { OPEN_AUTH_MODAL_EVENT } from "@/lib/auth-modal";
import { getPassportUrl, isPassportPath } from "@/components/map/passportRoute";
import { usePathname } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type AuthControlsProps = {
  variant: "map" | "navbar";
  showPassport?: boolean;
  passportIcon?: boolean;
};

function getIdentityProviders(user: User | null, identities: UserIdentity[]) {
  const fromIdentities = identities.map((identity) => identity.provider);
  const fromMetadata = user?.app_metadata.providers ?? [];
  const primaryProvider =
    typeof user?.app_metadata.provider === "string"
      ? [user.app_metadata.provider]
      : [];

  return Array.from(
    new Set(
      [...fromIdentities, ...fromMetadata, ...primaryProvider]
        .filter(Boolean)
        .map((provider) => provider.toLowerCase())
    )
  );
}

export function AuthControls({ variant, showPassport = true, passportIcon = false }: AuthControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const emailInputId = useId();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const trimmedEmail = email.trim();

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
      setIdentities(data.user?.identities ?? []);
    };

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!isMounted) return;
        setEmail("");
        setIsAuthModalOpen(false);
        setIsDropdownOpen(false);
        setStatusMessage(null);
        setIsGoogleLoading(false);
        setIsMagicLinkLoading(false);
        setUser(session?.user ?? null);
        setIdentities(session?.user?.identities ?? []);

        if (session?.user) {
          void loadUser();
        }

        router.refresh();
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router, supabase]);

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

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setEmail("");
        setStatusMessage(null);
        setIsGoogleLoading(false);
        setIsMagicLinkLoading(false);
        setIsAuthModalOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isAuthModalOpen]);

  useEffect(() => {
    const handleOpenAuthModal = () => {
      setIsDropdownOpen(false);
      setEmail("");
      setStatusMessage(null);
      setIsGoogleLoading(false);
      setIsMagicLinkLoading(false);
      setIsAuthModalOpen(true);
    };

    window.addEventListener(OPEN_AUTH_MODAL_EVENT, handleOpenAuthModal);

    return () => {
      window.removeEventListener(OPEN_AUTH_MODAL_EVENT, handleOpenAuthModal);
    };
  }, []);

  const closeAuthModal = () => {
    setEmail("");
    setStatusMessage(null);
    setIsGoogleLoading(false);
    setIsMagicLinkLoading(false);
    setIsAuthModalOpen(false);
  };

  const openAuthModal = () => {
    setIsDropdownOpen(false);
    setEmail("");
    setStatusMessage(null);
    setIsGoogleLoading(false);
    setIsMagicLinkLoading(false);
    setIsAuthModalOpen(true);
  };

  const handlePassportClick = () => {
    if (!user) {
      openAuthModal();
      return;
    }

    if (variant === "map") {
      if (isPassportPath(pathname)) {
        window.history.replaceState(null, "", "/");
      } else {
        window.history.pushState(null, "", getPassportUrl());
      }
      return;
    }

    router.push("/passport");
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setStatusMessage(null);

    const authAction = user
      ? supabase.auth.linkIdentity({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        })
      : supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        });

    const { error } = await authAction;

    if (error) {
      setStatusMessage(error.message);
      setIsGoogleLoading(false);
    }
  };

  const handleSendMagicLink = async () => {
    if (!trimmedEmail || isGoogleLoading || isMagicLinkLoading) {
      return;
    }

    setIsMagicLinkLoading(true);
    setStatusMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
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

  const handleMagicLinkFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!event.currentTarget.reportValidity()) {
      return;
    }

    void handleSendMagicLink();
  };

  const handleEmailInputKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    const form = event.currentTarget.form;
    if (!form) {
      return;
    }

    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    form.requestSubmit();
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

  const avatarUrl = getUserAvatarUrl(user, identities);
  const displayName = getUserDisplayName(user, identities);
  const linkedProviders = getIdentityProviders(user, identities);
  const hasGoogleIdentity = linkedProviders.includes("google");

  const passportClasses =
    variant === "map"
      ? "inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium bg-white/90 backdrop-blur-sm border border-white/50 shadow transition-all duration-200 ease-out hover:bg-white hover:scale-105 active:scale-95 whitespace-nowrap"
      : buttonVariants({ variant: "ghost", size: "sm" });

  const signInClasses =
    variant === "map"
      ? "inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-semibold bg-primary text-primary-foreground shadow transition-all duration-200 ease-out hover:bg-primary/90 hover:scale-105 active:scale-95 whitespace-nowrap"
      : buttonVariants({ size: "sm" });

  const avatarButtonClasses =
    variant === "map"
      ? "flex size-10 items-center justify-center overflow-hidden rounded-full border border-white/60 bg-white/90 text-sm font-semibold text-foreground shadow backdrop-blur-sm transition-all duration-200 ease-out hover:bg-white hover:scale-105 active:scale-95"
      : "flex size-9 items-center justify-center overflow-hidden rounded-full border border-border bg-background text-sm font-semibold text-foreground transition-all duration-200 ease-out hover:bg-muted hover:scale-105 active:scale-95";
  const avatarImageSize = variant === "map" ? 40 : 36;

  const dropdownClasses =
    variant === "map"
      ? "absolute right-0 top-12 z-10 min-w-40 rounded-2xl border border-border/80 bg-background/95 p-1.5 shadow-xl backdrop-blur-sm"
      : "absolute right-0 top-11 z-10 min-w-40 rounded-2xl border border-border bg-popover p-1.5 shadow-lg";

  return (
    <>
      <div className="flex items-center gap-2">
        {passportIcon ? (
          <button
            type="button"
            onClick={handlePassportClick}
            className="flex size-10 items-center justify-center rounded-full border border-white/60 bg-white/90 shadow backdrop-blur-sm transition-all duration-200 ease-out hover:bg-white hover:scale-105 active:scale-95"
            aria-label="My passport"
          >
            <Image
              src="/icons/passport.png"
              alt=""
              width={22}
              height={22}
              className="object-contain"
            />
          </button>
        ) : showPassport && (
          <button
            type="button"
            onClick={handlePassportClick}
            className={passportClasses}
          >
            my passport
          </button>
        )}

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
                <Image
                  src={avatarUrl}
                  alt=""
                  width={avatarImageSize}
                  height={avatarImageSize}
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span>{getUserInitials(user, identities)}</span>
              )}
            </button>

            {isDropdownOpen && (
              <div className={dropdownClasses} role="menu">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium leading-none">
                    {displayName || user.email || "Signed in"}
                  </p>
                  {user.email && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  )}
                </div>
                {!hasGoogleIdentity && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleGoogleSignIn}
                    disabled={isGoogleLoading || isSigningOut}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60"
                  >
                    {isGoogleLoading ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <span className="flex size-4 items-center justify-center rounded-full border border-border text-[10px] font-semibold">
                        G
                      </span>
                    )}
                    Link Google account
                  </button>
                )}
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
                {statusMessage && (
                  <p className="px-3 pb-2 pt-1 text-xs text-muted-foreground">
                    {statusMessage}
                  </p>
                )}
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
            onClick={closeAuthModal}
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
              <p className="text-xs text-muted-foreground">
                Use the same email for Google and magic link to keep one Nook
                account.
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

              <form
                className="space-y-3"
                onSubmit={handleMagicLinkFormSubmit}
              >
                <label
                  htmlFor={emailInputId}
                  className="text-sm font-medium text-foreground"
                >
                  Email
                </label>
                <input
                  id={emailInputId}
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={handleEmailInputKeyDown}
                  placeholder="you@somewhere.com"
                  autoComplete="email"
                  className={cn(
                    "h-11 w-full rounded-2xl border border-input bg-card px-4 text-sm outline-none transition-colors",
                    "placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/15"
                  )}
                />
                <Button
                  type="submit"
                  size="lg"
                  disabled={
                    !trimmedEmail || isGoogleLoading || isMagicLinkLoading
                  }
                  className="h-11 w-full rounded-2xl"
                >
                  {isMagicLinkLoading && (
                    <LoaderCircle className="size-4 animate-spin" />
                  )}
                  Send magic link
                </Button>
              </form>
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
