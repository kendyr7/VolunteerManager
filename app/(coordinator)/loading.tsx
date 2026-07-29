import { AnimatedLogo } from "@/components/ui/animated-logo";

export default function CoordinatorLoading() {
  return (
    <div className="w-full min-h-[75vh] flex flex-col items-center justify-center p-8 text-center animate-fadeIn">
      <div className="relative flex items-center justify-center mb-5">
        {/* Glow backdrop */}
        <div className="absolute w-24 h-24 rounded-full bg-[#4d7cfe]/10 blur-xl animate-pulse" />
        <AnimatedLogo isLooping className="w-16 h-16 md:w-20 md:h-20 text-text relative z-10" />
      </div>
      
      <div className="space-y-2 max-w-xs mx-auto">
        <div className="h-3.5 w-28 mx-auto rounded-full bg-dark3 animate-pulse" />
        <div className="h-2.5 w-40 mx-auto rounded-full bg-dark3/60 animate-pulse" />
      </div>
    </div>
  );
}
