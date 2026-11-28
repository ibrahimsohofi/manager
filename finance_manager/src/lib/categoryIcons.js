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

/**
 * SOHOFI BRICO brand palette for categories: navy #07294D and orange #F76B03 first, then their tints,
 * a deep teal pair, two reds for losses / taxes and cool neutrals. Same set as the server seed
 * (server/config/financeSchema.js), which also maps the old earthy colours onto these.
 */
export const CATEGORY_COLORS = [
  "#07294d", // navy (logo)
  "#f76b03", // orange (logo)
  "#1f4e79", // steel navy
  "#ff9f43", // light orange
  "#2e77b8", // harbour blue
  "#c2410c", // burnt orange
  "#5b8db8", // sky steel
  "#f2b544", // amber
  "#0f766e", // deep teal
  "#4aa3a2", // light teal
  "#b42318", // crimson
  "#9f1239", // wine
  "#334155", // charcoal
  "#64748b", // slate
  "#94a3b8", // mist
  "#3d5a80", // dusk blue
];

export const categoryIcon = (name) => CATEGORY_ICONS[name] ?? Tag;

/** Category name in the active language. */
export const categoryName = (category, lang) => {
  if (!category) return "—";
  return (lang === "ar" ? category.name_ar : category.name_fr) || category.name_fr || category.name_ar || "—";
};
