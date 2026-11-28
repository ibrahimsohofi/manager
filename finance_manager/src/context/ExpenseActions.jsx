// One place for every expense action, used by the overview, the list and the mobile "+" button:
// quick add / edit dialog, pay dialog, delete with an "Annuler" toast, restore from the bin.
// The categories (archived included, for labels) are loaded once here and reload after every write.
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExpenseDialog } from "../components/ExpenseDialog";
import { PayDialog } from "../components/PayDialog";
import { useResource } from "../hooks/useResource";
import { categoriesApi, expensesApi } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { emitDataChanged } from "../lib/events";

const ExpenseActionsContext = createContext(null);

let dialogSeq = 0;

export const ExpenseActionsProvider = ({ children }) => {
  const { t } = useTranslation();
  const { data, reload: reloadCategories } = useResource(() => categoriesApi.list(true), []);
  const categories = useMemo(() => data?.rows ?? [], [data]);
  const [dialog, setDialog] = useState(null);

  const open = useCallback((kind, payload = {}) => {
    dialogSeq += 1;
    setDialog({ kind, key: dialogSeq, open: true, ...payload });
  }, []);
  const close = useCallback(() => setDialog((current) => (current ? { ...current, open: false } : current)), []);

  const openAdd = useCallback((preset) => open("expense", { preset }), [open]);
  const openEdit = useCallback((expense) => open("expense", { expense }), [open]);
  const openPay = useCallback((expense) => open("pay", { expense }), [open]);

  const restore = useCallback(
    async (expense, { silent = false } = {}) => {
      try {
        await expensesApi.restore(expense.id);
        emitDataChanged({ type: "expense" });
        if (!silent) toast.success(t("expenses.restored"));
        return true;
      } catch (error) {
        toast.error(errorMessage(error));
        return false;
      }
    },
    [t],
  );

  const remove = useCallback(
    async (expense) => {
      try {
        await expensesApi.remove(expense.id);
        emitDataChanged({ type: "expense" });
        toast(t("expenses.deleted"), {
          duration: 7000,
          action: {
            label: t("common.undo"),
            onClick: () => restore(expense),
          },
        });
      } catch (error) {
        toast.error(errorMessage(error));
      }
    },
    [t, restore],
  );

  const value = useMemo(
    () => ({ categories, reloadCategories, openAdd, openEdit, openPay, remove, restore }),
    [categories, reloadCategories, openAdd, openEdit, openPay, remove, restore],
  );

  const onOpenChange = (next) => {
    if (!next) close();
  };

  return (
    <ExpenseActionsContext.Provider value={value}>
      {children}
      {dialog?.kind === "expense" ? (
        <ExpenseDialog
          key={dialog.key}
          open={dialog.open}
          onOpenChange={onOpenChange}
          expense={dialog.expense}
          preset={dialog.preset}
          categories={categories}
        />
      ) : null}
      {dialog?.kind === "pay" ? (
        <PayDialog key={dialog.key} open={dialog.open} onOpenChange={onOpenChange} expense={dialog.expense} />
      ) : null}
    </ExpenseActionsContext.Provider>
  );
};

export const useExpenseActions = () => {
  const context = useContext(ExpenseActionsContext);
  if (!context) throw new Error("useExpenseActions must be used inside <ExpenseActionsProvider>");
  return context;
};
