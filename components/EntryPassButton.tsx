'use client'

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EntryPassModal } from "./EntryPassModal";
import { cn } from "@/lib/utils";

interface EntryPassButtonProps {
  volunteerId: string;
  volunteerName: string;
  committeeName: string;
  className?: string;
}

export function EntryPassButton({
  volunteerId,
  volunteerName,
  committeeName,
  className,
}: EntryPassButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className={cn(
          "bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-10 px-4 text-xs font-bold transition-all active:scale-[0.97] flex items-center justify-center gap-2 w-full",
          className
        )}
      >
        <span className="material-symbols-outlined text-[18px]">qr_code_2</span>
        <span>PASE QR</span>
      </Button>

      <EntryPassModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        volunteerId={volunteerId}
        volunteerName={volunteerName}
        committeeName={committeeName}
      />
    </>
  );
}
