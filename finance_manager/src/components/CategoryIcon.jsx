import { useTranslation } from "react-i18next";
import { categoryIcon, categoryName } from "../lib/categoryIcons";
import { cn } from "../lib/utils";

const FALLBACK = "#07294d"; // brand navy

/** Round icon tinted with the category colour. */
export const CategoryIcon = ({ category, size = "md", className }) => {
  const Icon = categoryIcon(category?.icon);
  const color = category?.color || FALLBACK;
  const box = size === "sm" ? "size-7" : size === "lg" ? "size-11" : "size-9";
  const icon = size === "sm" ? "size-3.5" : size === "lg" ? "size-5" : "size-4";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full", box, className)}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
        color,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      <Icon className={icon} strokeWidth={2.2} />
    </span>
  );
};

export const CategoryLabel = ({ category, className, withIcon = true }) => {
  const { i18n } = useTranslation();
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      {withIcon ? <CategoryIcon category={category} size="sm" /> : null}
      <span className="truncate">{categoryName(category, i18n.language)}</span>
    </span>
  );
};
