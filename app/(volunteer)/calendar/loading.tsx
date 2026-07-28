import { AnimatedLogo } from "@/components/ui/animated-logo";

export default function Loading() {
  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center">
      <AnimatedLogo isLooping className="w-16 h-16 md:w-20 md:h-20 text-text" />
    </div>
  );
}
