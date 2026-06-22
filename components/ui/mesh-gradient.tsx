"use client"

import { cn } from "@/lib/utils"

export interface MeshGradientBackgroundProps {
  className?: string
  children?: React.ReactNode
  /** Gradient colors */
  colors?: string[]
  /** Animation speed multiplier */
  speed?: number
  /** Background color */
  backgroundColor?: string
}

export function MeshGradientBackground({
  className,
  children,
  colors = ["#7c3aed", "#2563eb", "#06b6d4", "#8b5cf6"],
  speed = 1,
  backgroundColor = "#030014",
}: MeshGradientBackgroundProps) {
  const duration1 = 15 / speed
  const duration2 = 20 / speed
  const duration3 = 25 / speed
  const duration4 = 18 / speed

  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)} style={{ backgroundColor }}>
      {/* Gradient orbs */}
      <div className="absolute inset-0">
        {/* Orb 1 - Top left */}
        <div
          className="absolute h-[60%] w-[60%] rounded-full"
          style={{
            left: "-10%",
            top: "-10%",
            background: `radial-gradient(circle, ${colors[0]}90 0%, transparent 70%)`,
            filter: "blur(80px)",
            animation: `meshMove1 ${duration1}s ease-in-out infinite`,
          }}
        />

        {/* Orb 2 - Top right */}
        <div
          className="absolute h-[50%] w-[50%] rounded-full"
          style={{
            right: "-5%",
            top: "10%",
            background: `radial-gradient(circle, ${colors[1]}80 0%, transparent 70%)`,
            filter: "blur(100px)",
            animation: `meshMove2 ${duration2}s ease-in-out infinite`,
          }}
        />

        {/* Orb 3 - Bottom center */}
        <div
          className="absolute h-[55%] w-[70%] rounded-full"
          style={{
            left: "20%",
            bottom: "-15%",
            background: `radial-gradient(circle, ${colors[2]}70 0%, transparent 70%)`,
            filter: "blur(120px)",
            animation: `meshMove3 ${duration3}s ease-in-out infinite`,
          }}
        />

        {/* Orb 4 - Center accent */}
        <div
          className="absolute h-[40%] w-[40%] rounded-full"
          style={{
            left: "40%",
            top: "30%",
            background: `radial-gradient(circle, ${colors[3] || colors[0]}60 0%, transparent 70%)`,
            filter: "blur(90px)",
            animation: `meshMove4 ${duration4}s ease-in-out infinite`,
          }}
        />
      </div>

      {/* Subtle noise texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Content layer */}
      {children && <div className="relative z-10 h-full w-full">{children}</div>}

      <style jsx>{`
        @keyframes meshMove1 {
          0%, 100% {
            transform: translate(0%, 0%) scale(1);
          }
          25% {
            transform: translate(15%, 20%) scale(1.1);
          }
          50% {
            transform: translate(25%, 10%) scale(0.9);
          }
          75% {
            transform: translate(10%, -15%) scale(1.05);
          }
        }
        @keyframes meshMove2 {
          0%, 100% {
            transform: translate(0%, 0%) scale(1);
          }
          33% {
            transform: translate(-20%, 15%) scale(1.15);
          }
          66% {
            transform: translate(-10%, -15%) scale(0.9);
          }
        }
        @keyframes meshMove3 {
          0%, 100% {
            transform: translate(0%, 0%) scale(1);
          }
          50% {
            transform: translate(-15%, -20%) scale(1.2);
          }
        }
        @keyframes meshMove4 {
          0%, 100% {
            transform: translate(0%, 0%) scale(1);
          }
          25% {
            transform: translate(25%, -20%) scale(0.85);
          }
          50% {
            transform: translate(-20%, 25%) scale(1.15);
          }
          75% {
            transform: translate(-25%, -10%) scale(0.9);
          }
        }
      `}</style>
    </div>
  )
}
