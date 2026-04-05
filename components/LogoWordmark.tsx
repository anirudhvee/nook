import { DM_Serif_Display } from "next/font/google";
import { cn } from "@/lib/utils";

const dmSerifDisplay = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

type LogoWordmarkProps = {
  className?: string;
};

export function LogoWordmark({ className }: LogoWordmarkProps) {
  return (
    <span
      className={cn(
        dmSerifDisplay.className,
        "inline-block text-black leading-none tracking-[-0.04em]",
        className
      )}
    >
      nook
    </span>
  );
}
