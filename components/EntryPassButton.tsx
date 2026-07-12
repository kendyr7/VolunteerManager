'use client'

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EntryPassModal } from "./EntryPassModal";

interface EntryPassButtonProps {
  volunteerId: string;
  volunteerName: string;
  committeeName: string;
}

export function EntryPassButton({
  volunteerId,
  volunteerName,
  committeeName,
}: EntryPassButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="bg-[#4d7cfe] hover:bg-[#3b66e0] text-white rounded-full shadow-lg shadow-blue-500/10 h-9 px-4 text-xs font-bold transition-all active:scale-[0.97] flex items-center gap-1.5"
      >
        <span className="material-symbols-outlined text-[16px]">qr_code_2</span>
        <span>Pase QR</span>
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
