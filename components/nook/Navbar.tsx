"use client";

import Link from "next/link";
import { AuthControls } from "@/components/auth/AuthControls";
import { LogoWordmark } from "@/components/LogoWordmark";

export function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-3 border-b border-border bg-background shrink-0">
      <Link href="/" className="inline-flex items-center">
        <LogoWordmark className="text-[1.7rem]" />
      </Link>
      <AuthControls variant="navbar" />
    </nav>
  );
}
