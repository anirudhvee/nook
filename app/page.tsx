import { MapPin } from "lucide-react";
import { Navbar } from "@/components/nook/Navbar";

export default function HomePage() {
  return (
    <div className="flex flex-col h-screen">
      <Navbar />

      {/* Map area placeholder */}
      <main className="flex-1 relative bg-muted flex items-center justify-center">
        <div className="text-center space-y-2 text-muted-foreground">
          <MapPin className="h-10 w-10 mx-auto opacity-30" />
          <p className="text-sm">Map coming soon</p>
          <p className="text-xs">Mapbox discovery map will render here</p>
        </div>
      </main>
    </div>
  );
}
