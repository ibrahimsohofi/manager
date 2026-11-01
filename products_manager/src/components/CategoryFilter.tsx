import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/types";

interface CategoryFilterProps {
  categories: Category[];
  value: string;
  onChange: (value: string) => void;
}

export function CategoryFilter({
  categories,
  value,
  onChange,
}: CategoryFilterProps) {
  const { t } = useTranslation();

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="border-blue-200  focus:border-blue-400 focus:ring-blue-400">
        <SelectValue
          placeholder={t("categories.filter", "Toutes les catégories")}
        />
      </SelectTrigger>
      <SelectContent className="bg-white  dark:bg-gray-900  border-blue-200">
        <SelectItem
          value="all"
          className="hover:bg-blue-50  hover:text-gray-800 hover:font-bold font-bold text-white  focus:font-bold "
        >
          {t("categories.all", "Toutes les catégories")}
        </SelectItem>
        {categories.map((category) => (
          <SelectItem
            key={category.id}
            value={category.id.toString()}
            className="hover:bg-blue-50 dark:focus:bg-accent  hover:dark:text-white hover:text-gray-950 focus:bg-blue-50 focus:text-black"
          >
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
