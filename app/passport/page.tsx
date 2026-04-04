import { ArrowLeft, Stamp } from "lucide-react";
import Link from "next/link";

export default function PassportPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          back to map
        </Link>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">my passport</h1>
          <p className="text-muted-foreground text-sm">
            Nooks you&apos;ve worked from.
          </p>
        </div>

        {/* Stamp collection placeholder */}
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
          <Stamp className="h-12 w-12 opacity-25" />
          <p className="text-sm">No stamps yet.</p>
          <p className="text-xs">Find a nook and check in to earn your first stamp.</p>
        </div>
      </div>
    </div>
  );
}
