"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import { AuthControls } from "@/components/auth/AuthControls";

export function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-3 border-b border-border bg-background shrink-0">
      <Link href="/" className="flex items-center gap-2">
        <MapPin className="h-5 w-5 text-primary" />
        <span className="font-semibold text-lg tracking-tight">nook</span>
      </Link>
      <AuthControls variant="navbar" />
    </nav>
  );
}
