// Root of the finance app. Nothing of the shop's figures is mounted before the PIN (FINANCE_PLAN.md §4 #13):
// until the session is "unlocked" only <PinGate> renders. After that: the shell + the four pages.
import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "./components/AppShell";
import { PinGate } from "./components/PinGate";
import { TooltipProvider } from "./components/ui/tooltip";
import { ExpenseActionsProvider } from "./context/ExpenseActions";
import { usePreferences } from "./context/PreferencesContext";
import { useSession } from "./context/SessionContext";
import Expenses from "./pages/Expenses";
import Overview from "./pages/Overview";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

const toasterStyle = {
  "--normal-bg": "hsl(var(--paper))",
  "--normal-text": "hsl(var(--foreground))",
  "--normal-border": "hsl(var(--border))",
  "--success-bg": "hsl(var(--paper))",
  "--success-text": "hsl(var(--gain))",
  "--success-border": "hsl(var(--gain) / 0.35)",
  "--error-bg": "hsl(var(--paper))",
  "--error-text": "hsl(var(--loss))",
  "--error-border": "hsl(var(--loss) / 0.35)",
  fontFamily: "var(--font-sans)",
};

export default function App() {
  const { status } = useSession();
  const { theme, isRtl } = usePreferences();

  return (
    <TooltipProvider delayDuration={250}>
      <div className="grain min-h-dvh">
        {status === "unlocked" ? (
          <ExpenseActionsProvider>
            <AppShell>
              <Routes>
                <Route index element={<Overview />} />
                <Route path="expenses" element={<Expenses />} />
                <Route path="reports" element={<Reports />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </ExpenseActionsProvider>
        ) : (
          <PinGate />
        )}
      </div>
      <Toaster
        theme={theme}
        dir={isRtl ? "rtl" : "ltr"}
        position="bottom-center"
        offset={88}
        mobileOffset={96}
        style={toasterStyle}
        toastOptions={{
          classNames: {
            toast: "!rounded-lg !shadow-[0_18px_40px_-16px_hsl(213_60%_12%/0.4)]",
            actionButton: "!bg-primary !text-primary-foreground !font-semibold",
          },
        }}
      />
    </TooltipProvider>
  );
}
