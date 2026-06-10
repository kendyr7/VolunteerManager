'use client';

import * as React from "react"
import { Filter } from "lucide-react"

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

interface DataTableFilterProps {
  title: string
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
}

export function DataTableFilter({
  title,
  options,
  value,
  onChange,
}: DataTableFilterProps) {
  const selectedValues = new Set(value)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button 
            variant="outline" 
            size="sm" 
            className={cn(
              "h-10 rounded-xl transition-all duration-200 outline-none",
              selectedValues.size > 0 
                ? "bg-blue-50 text-blue-700 border-blue-100 shadow-sm hover:bg-blue-100 aria-expanded:bg-blue-100" 
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900 aria-expanded:bg-slate-50 aria-expanded:text-slate-900 border-dashed"
            )}
          >
            <Filter className={cn("mr-2 h-4 w-4", selectedValues.size > 0 ? "text-blue-600" : "text-slate-400")} />
            {title}
            {selectedValues.size > 0 && (
              <>
                <DropdownMenuSeparator className={cn("mx-2 h-4 border-l", selectedValues.size > 0 ? "border-blue-200" : "border-slate-200")} />
                <Badge
                  variant="secondary"
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-xs font-bold border-none",
                    selectedValues.size > 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                  )}
                >
                  {selectedValues.size}
                </Badge>
              </>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-[200px] bg-dark border-border text-text rounded-xl shadow-md p-1">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted font-normal px-2 py-1.5">{title}</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border -mx-1" />
          <div className="max-h-[300px] overflow-y-auto p-1 space-y-0.5">
            {options.map((option) => {
              const isSelected = selectedValues.has(option)
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
                  className="cursor-pointer rounded-lg hover:bg-slate-50 focus:bg-slate-50 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700 font-medium transition-colors"
                >
                  {option}
                </DropdownMenuCheckboxItem>
              )
            })}
          </div>
        </DropdownMenuGroup>
        {selectedValues.size > 0 && (
          <>
            <DropdownMenuSeparator className="bg-border -mx-1" />
            <div className="p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange([])}
                className="w-full justify-center text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Limpiar filtros
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
