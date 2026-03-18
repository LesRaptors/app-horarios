"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_COLORS,
  SWAP_STATUS_LABELS,
  SWAP_STATUS_COLORS,
} from "@/lib/constants";

interface StatusBadgeProps {
  status: string;
  type: "request" | "swap";
}

export function StatusBadge({ status, type }: StatusBadgeProps) {
  const labels = type === "request" ? REQUEST_STATUS_LABELS : SWAP_STATUS_LABELS;
  const colors = type === "request" ? REQUEST_STATUS_COLORS : SWAP_STATUS_COLORS;

  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium", colors[status])}
    >
      {labels[status] || status}
    </Badge>
  );
}
