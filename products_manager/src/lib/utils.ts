import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 12345.5 -> "12 345,50" (always Latin digits, 2 decimals) */
export function formatMoney(value: number): string {
  const amount = Number(value) || 0;
  return amount.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
