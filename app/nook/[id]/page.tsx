import { ArrowLeft, Wifi, Plug, Volume2, Laptop } from "lucide-react";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NookDetailPage({ params }: Props) {
  const { id } = await params;

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

        {/* Placeholder header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Nook detail</h1>
          <p className="text-muted-foreground text-sm">ID: {id}</p>
        </div>

        {/* Work signal placeholders */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: Wifi, label: "WiFi", value: "—" },
            { icon: Plug, label: "Outlets", value: "—" },
            { icon: Volume2, label: "Noise", value: "—" },
            { icon: Laptop, label: "Laptop friendly", value: "—" },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card"
            >
              <Icon className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Review highlights placeholder */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-2">
          <h2 className="text-sm font-semibold">AI-parsed review highlights</h2>
          <p className="text-sm text-muted-foreground">
            Review highlights will appear here once reviews are fetched.
          </p>
        </div>
      </div>
    </div>
  );
}
