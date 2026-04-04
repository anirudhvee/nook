"use client";

import Link from "next/link";
import { MapPin } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-3 border-b border-border bg-background shrink-0">
      <Link href="/" className="flex items-center gap-2">
        <MapPin className="h-5 w-5 text-primary" />
        <span className="font-semibold text-lg tracking-tight">nook</span>
      </Link>
      <div className="flex items-center gap-3">
        <Link
          href="/passport"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          my passport
        </Link>
        <Button size="sm">sign in</Button>
      </div>
    </nav>
  );
}
