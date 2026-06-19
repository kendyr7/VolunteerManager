'use client';

import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const getCommitteeColor = (committee: string) => {
  const comm = committee.toLowerCase();
  if (comm.includes('seguridad')) return { bg: 'bg-[#fe4d97]/15', text: 'text-[#fe4d97]', border: 'border-[#fe4d97]/20', bgHover: 'hover:bg-[#fe4d97]/15', activeBg: 'focus:bg-[#fe4d97]/15', activeText: 'focus:text-[#fe4d97]' };
  if (comm.includes('guía')) return { bg: 'bg-[#6dd230]/15', text: 'text-[#6dd230]', border: 'border-[#6dd230]/20', bgHover: 'hover:bg-[#6dd230]/15', activeBg: 'focus:bg-[#6dd230]/15', activeText: 'focus:text-[#6dd230]' };
  if (comm.includes('historia')) return { bg: 'bg-[#4d7cfe]/15', text: 'text-[#4d7cfe]', border: 'border-[#4d7cfe]/20', bgHover: 'hover:bg-[#4d7cfe]/15', activeBg: 'focus:bg-[#4d7cfe]/15', activeText: 'focus:text-[#4d7cfe]' };
  if (comm.includes('traducción')) return { bg: 'bg-amber-500/15', text: 'text-amber-600', border: 'border-amber-500/20', bgHover: 'hover:bg-amber-500/15', activeBg: 'focus:bg-amber-500/15', activeText: 'focus:text-amber-600' };
  if (comm.includes('transporte')) return { bg: 'bg-purple-500/15', text: 'text-purple-600', border: 'border-purple-500/20', bgHover: 'hover:bg-purple-500/25', activeBg: 'focus:bg-purple-500/15', activeText: 'focus:text-purple-600' };
  if (comm.includes('auxilios')) return { bg: 'bg-teal-500/15', text: 'text-teal-600', border: 'border-teal-500/20', bgHover: 'hover:bg-teal-500/15', activeBg: 'focus:bg-teal-500/15', activeText: 'focus:text-teal-600' };
  return { bg: 'bg-[#4d7cfe]/10', text: 'text-[#4d7cfe]', border: 'border-[#4d7cfe]/20', bgHover: 'hover:bg-[#4d7cfe]/10', activeBg: 'focus:bg-[#4d7cfe]/10', activeText: 'focus:text-[#4d7cfe]' };
};

interface DataTableFilterProps {
  title: string
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  showSearch?: boolean
  className?: string
  dropdownLabel?: string
  hideClearButton?: boolean
  hideCountBadge?: boolean
  isCommitteeFilter?: boolean
}

export function DataTableFilter({
  title,
  options,
  value,
  onChange,
  showSearch = false,
  className,
  dropdownLabel,
  hideClearButton = false,
  hideCountBadge = false,
  isCommitteeFilter: isCommitteeFilterProp,
}: DataTableFilterProps) {
  const selectedValues = new Set(value)
  const isCommitteeFilter = isCommitteeFilterProp !== undefined ? isCommitteeFilterProp : title.toLowerCase().includes('comit');
  const [searchTerm, setSearchTerm] = React.useState("");

  const filteredOptions = React.useMemo(() => {
    if (!searchTerm) return options;
    return options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [options, searchTerm]);

  // Match style of standard Select component trigger
  let triggerClasses = "bg-dark2 text-text border-border hover:bg-dark3 aria-expanded:bg-dark3 shadow-sm";
  if (selectedValues.size > 0) {
    triggerClasses = "bg-[#4d7cfe]/10 text-[#4d7cfe] border-[#4d7cfe]/30 hover:bg-[#4d7cfe]/15 hover:text-[#4d7cfe] aria-expanded:bg-[#4d7cfe]/15 aria-expanded:text-[#4d7cfe] shadow-sm";
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className={cn(
              "h-10 px-3 rounded-sm transition-all duration-200 flex items-center justify-between gap-3 border min-w-[140px]",
              triggerClasses,
              className
            )}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">filter_list</span>
              <span className="text-sm font-medium">{title}</span>
              {selectedValues.size > 0 && !hideCountBadge && (
                <Badge className="ml-1 h-5 px-1.5 rounded-full bg-[#4d7cfe] text-white border-none text-[10px]">
                  {selectedValues.size}
                </Badge>
              )}
            </div>
            <span className="material-symbols-outlined text-[16px] opacity-40">expand_more</span>
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-[240px] bg-dark2 border-border text-text rounded-sm shadow-md p-0 overflow-hidden">
        <DropdownMenuGroup>
          <div className="p-2 bg-dark3 border-b border-border">
            <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-2 px-1">
              {dropdownLabel || `Filtrar por ${title}`}
            </DropdownMenuLabel>

            {showSearch && (
              <div className="relative mb-1">
                <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-text-dim text-[16px]">search</span>
                <input
                  className="w-full h-8 pl-8 pr-2 bg-dark2 border border-border rounded-sm text-xs outline-none focus:border-[#4d7cfe] transition-all text-text"
                  placeholder={`Buscar ${title.toLowerCase()}...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        </DropdownMenuGroup>

        <DropdownMenuGroup className="max-h-[280px] overflow-y-auto p-1">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => {
              const isSelected = selectedValues.has(option)
              const colors = isCommitteeFilter ? getCommitteeColor(option) : {
                bgHover: 'focus:bg-[#4d7cfe]/10',
                activeBg: 'data-[state=checked]:bg-[#4d7cfe]/10',
                activeText: 'data-[state=checked]:text-[#4d7cfe]'
              };

              return (
                <DropdownMenuCheckboxItem
                  key={option}
                  checked={isSelected}
                  onCheckedChange={(checked) => {
                    const newSelectedValues = new Set(selectedValues)
                    if (checked) {
                      newSelectedValues.add(option)
                    } else {
                      newSelectedValues.delete(option)
                    }
                    onChange(Array.from(newSelectedValues))
                  }}
                  className={cn(
                    "cursor-pointer rounded-sm text-xs transition-colors py-2 px-2 flex items-center gap-2",
                    "focus:outline-none focus:bg-dark3",
                    colors.bgHover,
                    colors.activeBg,
                    colors.activeText,
                    !isSelected && "text-text"
                  )}
                >
                  {option}
                </DropdownMenuCheckboxItem>
              )
            })
          ) : (
            <div className="py-4 text-center text-xs text-text-dim italic">No hay resultados</div>
          )}
        </DropdownMenuGroup>

        {selectedValues.size > 0 && !hideClearButton && (
          <div className="p-1 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange([])}
              className="w-full justify-center text-[10px] font-bold uppercase tracking-widest text-text-dim hover:text-red hover:bg-red-faint rounded-sm h-8"
            >
              Limpiar filtros
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
