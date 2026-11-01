import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { useTranslation } from "react-i18next";

const spinnerVariants = cva(
  "animate-spin rounded-full border-solid border-t-transparent",
  {
    variants: {
      variant: {
        default: "border-blue-600 dark:border-blue-400",
        secondary: "border-gray-400 dark:border-gray-600",
        success: "border-green-600 dark:border-green-400",
        warning: "border-orange-600 dark:border-orange-400",
        destructive: "border-red-600 dark:border-red-400",
      },
      size: {
        xs: "h-3 w-3 border-2",
        sm: "h-4 w-4 border-2",
        default: "h-6 w-6 border-2",
        lg: "h-8 w-8 border-3",
        xl: "h-12 w-12 border-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof spinnerVariants> {
  ariaLabel?: string;
}

export function Spinner({ className, variant, size, ariaLabel, ...props }: SpinnerProps) {
  return (
    <div
      className={cn(spinnerVariants({ variant, size, className }))}
      role="status"
      aria-label={ariaLabel}
      {...props}
    />
  );
}

// Loading Wrapper Component
interface LoadingProps {
  isLoading: boolean;
  children: React.ReactNode;
  text?: string;
  size?: "xs" | "sm" | "default" | "lg" | "xl";
  variant?: "default" | "secondary" | "success" | "warning" | "destructive";
  overlay?: boolean;
}

export function Loading({
  isLoading,
  children,
  text,
  size = "default",
  variant = "default",
  overlay = false,
}: LoadingProps) {
  const { t } = useTranslation();
  const loadingText = text ?? t('common.loading');

  if (!isLoading) {
    return <>{children}</>;
  }

  if (overlay) {
    return (
      <div className="relative">
        {children}
        <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex items-center justify-center rounded-lg">
          <div className="flex flex-col items-center space-y-2">
            <Spinner size={size} variant={variant} ariaLabel={loadingText} />
            {loadingText && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {loadingText}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-2 py-8">
      <Spinner size={size} variant={variant} ariaLabel={loadingText} />
      {loadingText && (
        <span className="text-sm text-gray-600 dark:text-gray-400">{loadingText}</span>
      )}
    </div>
  );
}

// Page Loading Component
export function PageLoading({ text }: { text?: string }) {
  const { t } = useTranslation();
  const loadingText = text ?? t('common.loading');

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
      <div className="flex flex-col items-center space-y-6">
        {/* Logo Section */}
        <div className="flex flex-col items-center space-y-4">
          <img
            src="/jamalbrico-logo.svg"
            alt={t('app.title')}
            className="h-16 w-auto animate-pulse"
          />
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
            {t('app.title')}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('app.subtitle')}
          </p>
        </div>

        {/* Loading Spinner */}
        <div className="flex flex-col items-center space-y-3">
          <Spinner size="xl" variant="default" ariaLabel={loadingText} />
          <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-400">
            {loadingText}
          </h2>
        </div>
      </div>
    </div>
  );
}
