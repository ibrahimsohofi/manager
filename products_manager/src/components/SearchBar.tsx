import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Hash, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type SearchMode = 'text' | 'id';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  searchMode?: SearchMode;
  onSearchModeChange?: (mode: SearchMode) => void;
}

// Helper to detect if input is an ID search (starts with @)
const parseSearchInput = (input: string): { mode: SearchMode; value: string } => {
  const trimmed = input.trim();

  // Check for @ID pattern (@ followed by numbers)
  if (trimmed.startsWith('@')) {
    const idPart = trimmed.slice(1).trim();
    // Extract only numeric part after @
    const numericId = idPart.replace(/[^0-9]/g, '');
    return { mode: 'id', value: numericId };
  }

  return { mode: 'text', value: trimmed };
};

export function SearchBar({
  value,
  onChange,
  placeholder,
  onFocus,
  onBlur,
  searchMode,
  onSearchModeChange
}: SearchBarProps) {
  const { t } = useTranslation();
  const [localValue, setLocalValue] = useState(value);
  const debouncedValue = useDebounce(localValue, 300);

  // Parse the current input to determine mode and actual search value
  const parsed = useMemo(() => parseSearchInput(localValue), [localValue]);
  const isIdMode = parsed.mode === 'id';

  // Update parent component when debounced value changes
  useEffect(() => {
    const { mode, value: searchValue } = parseSearchInput(debouncedValue);

    // Notify parent of mode change
    if (onSearchModeChange && mode !== searchMode) {
      onSearchModeChange(mode);
    }

    // Send the actual search value (without @ prefix)
    onChange(searchValue);
  }, [debouncedValue, onChange, onSearchModeChange, searchMode]);

  // Sync with external value changes (only if not using @ prefix internally)
  // useEffect(() => {
  //   if (!localValue.startsWith('@')) {
  //     setLocalValue(value);
  //   }
  // }, [value]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const newValue = e.target.value;
    setLocalValue(newValue);
  }, []);

  const defaultPlaceholder = t('products.searchPlaceholder', 'Rechercher par nom ou @ID...');

  return (
    <TooltipProvider>
      <div className="relative flex gap-2 items-center">
        {/* Search Input */}
        <div className="relative flex-1">
          <form onSubmit={handleSubmit} autoComplete="off" className="w-full">
            {/* Dynamic icon based on detected mode */}
            {isIdMode ? (
              <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 pointer-events-none text-amber-600 dark:text-amber-400" />
            ) : (
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 pointer-events-none text-muted-foreground" />
            )}
            <Input
              type="text"
              autoComplete="off"
              placeholder={placeholder || defaultPlaceholder}
              value={localValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={onFocus}
              onBlur={onBlur}
              className={`pl-10 pr-24 transition-all duration-200 ${
                isIdMode
                  ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-400 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700'
                  : 'border-input focus:border-primary focus:ring-primary'
              }`}
            />
          </form>

          {/* Search Mode Indicator Badge - only show when in ID mode */}
          {isIdMode && (
            <div className="absolute right-10 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-300 dark:border-amber-700">
              ID: {parsed.value || '...'}
            </div>
          )}
        </div>

        {/* Help Tooltip */}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-2 p-1">
              <p className="font-semibold">{t('search.helpTitle', 'Astuce de recherche')}</p>
              <div className="space-y-1 text-xs">
                <p>
                  <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">@123</span>
                  {' '}{t('search.helpIdSearch', '→ Rechercher par ID produit')}
                </p>
                <p>
                  <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded">texte</span>
                  {' '}{t('search.helpTextSearch', '→ Rechercher par nom')}
                </p>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
