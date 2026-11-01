import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import AnimatedLogo from "../AnimatedLogo";

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
    VariantProps<typeof spinnerVariants> {}

export function Spinner({ className, variant, size, ...props }: SpinnerProps) {
  return (
    <div
      className={cn(spinnerVariants({ variant, size, className }))}
      role="status"
      aria-label="Loading"
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
  text = "Loading...",
  size = "default",
  variant = "default",
  overlay = false,
}: LoadingProps) {
  if (!isLoading) {
    return <>{children}</>;
  }

  if (overlay) {
    return (
      <div className="relative">
        {children}
        <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex items-center justify-center rounded-lg">
          <div className="flex flex-col items-center space-y-2">
            <Spinner size={size} variant={variant} />
            {text && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {text}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-2 py-8">
      <Spinner size={size} variant={variant} />
      {text && (
        <span className="text-sm text-gray-600 dark:text-gray-400">{text}</span>
      )}
    </div>
  );
}

// Page Loading Component
export function PageLoading({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
      <div className="flex flex-col items-center space-y-6">
        {/* Logo Section */}
        <div className="flex flex-col items-center space-y-4">
          <AnimatedLogo/>
        </div>

        {/* Loading Spinner */}
        <div className="flex flex-col items-center space-y-3">
          <Spinner size="xl" variant="default" />
          <h2 className="text-lg font-semibold text-blue-800 dark:text-blue-400">
            {text}
          </h2>
        </div>
      </div>
    </div>
  );
}
