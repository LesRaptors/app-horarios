import Image from "next/image";
import { cn } from "@/lib/utils";

interface AppLogoProps {
  size?: number;
  className?: string;
}

export function AppLogo({ size = 32, className }: AppLogoProps) {
  return (
    <Image
      src="/icono-transparente.png"
      alt="Horarios"
      width={size}
      height={size}
      priority
      className={cn("object-contain", className)}
    />
  );
}
