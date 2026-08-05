import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wrench } from "lucide-react";
import { FAROL_MAINTENANCE, isFarolUnderMaintenance } from "@/config/farolMaintenance";

type Ctx = {
  active: boolean;
  show: () => void;
};

const FarolMaintenanceCtx = createContext<Ctx | null>(null);

function pad(n: number) { return n.toString().padStart(2, "0"); }

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const msLeft = Math.max(0, target.getTime() - now.getTime());
  const totalSec = Math.floor(msLeft / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { msLeft, label: `${pad(h)}:${pad(m)}:${pad(s)}`, done: msLeft <= 0 };
}

export function FarolMaintenanceProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const active = useMemo(() => isFarolUnderMaintenance(), []);

  const show = useCallback(() => {
    if (active) setOpen(true);
  }, [active]);

  const value = useMemo(() => ({ active, show }), [active, show]);

  return (
    <FarolMaintenanceCtx.Provider value={value}>
      {children}
      {active && <MaintenanceDialog open={open} onOpenChange={setOpen} />}
    </FarolMaintenanceCtx.Provider>
  );
}

export function useFarolMaintenance(): Ctx {
  const ctx = useContext(FarolMaintenanceCtx);
  if (!ctx) return { active: false, show: () => {} };
  return ctx;
}

function MaintenanceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { label, done } = useCountdown(FAROL_MAINTENANCE.endsAt);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center mb-2">
            <Wrench className="h-6 w-6 text-amber-600" />
          </div>
          <DialogTitle className="text-center">{FAROL_MAINTENANCE.title}</DialogTitle>
          <DialogDescription className="text-center">
            {FAROL_MAINTENANCE.message}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-amber-700">
            {done ? "Manutenção encerrada" : "Previsão para voltar em"}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-amber-900">
            {label}
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Término previsto às {FAROL_MAINTENANCE.endsAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
