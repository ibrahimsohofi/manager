// Category icons are stored as lucide names (server/config/financeSchema.js seed). Only the icons listed
// here are bundled; an unknown name falls back to Tag.
import {
  Briefcase,
  Car,
  Coffee,
  CreditCard,
  Droplets,
  Ellipsis,
  Fuel,
  Gift,
  GraduationCap,
  Hammer,
  HeartPulse,
  House,
  Landmark,
  Lightbulb,
  Megaphone,
  Package,
  PackageX,
  PiggyBank,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  SprayCan,
  Store,
  Tag,
  Truck,
  Users,
  Utensils,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";

export const CATEGORY_ICONS = {
  store: Store,
  zap: Zap,
  droplets: Droplets,
  wifi: Wifi,
  users: Users,
  "shield-check": ShieldCheck,
  landmark: Landmark,
  truck: Truck,
  package: Package,
  wrench: Wrench,
  "credit-card": CreditCard,
  "package-x": PackageX,
  utensils: Utensils,
  house: House,
  ellipsis: Ellipsis,
  tag: Tag,
  receipt: Receipt,
  lightbulb: Lightbulb,
  hammer: Hammer,
  fuel: Fuel,
  smartphone: Smartphone,
  "spray-can": SprayCan,
  "shopping-bag": ShoppingBag,
  coffee: Coffee,
  car: Car,
  "piggy-bank": PiggyBank,
  gift: Gift,
  "heart-pulse": HeartPulse,
  "graduation-cap": GraduationCap,
  megaphone: Megaphone,
  briefcase: Briefcase,
};

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

/** Earthy palette for new categories (no blue / purple, matches the ledger theme). */
export const CATEGORY_COLORS = [
  "#b45309",
  "#ca8a04",
  "#0891b2",
  "#0d9488",
  "#16a34a",
  "#65a30d",
  "#dc2626",
  "#ea580c",
  "#a16207",
  "#57534e",
  "#475569",
  "#be123c",
  "#f97316",
  "#db2777",
  "#78716c",
  "#14532d",
];

export const categoryIcon = (name) => CATEGORY_ICONS[name] ?? Tag;

/** Category name in the active language. */
export const categoryName = (category, lang) => {
  if (!category) return "—";
  return (lang === "ar" ? category.name_ar : category.name_fr) || category.name_fr || category.name_ar || "—";
};
