import { StrictMode, Suspense, lazy, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/shared/contexts/AuthContext";
import Login from "@/pages/Login";
import "./index.css";

// Mesmos paths do sistema de origem — bookmarks e TVs continuam funcionando.
const FarolHub            = lazy(() => import("@/features/farol/pages/FarolHub"));
const FarolUsg            = lazy(() => import("@/features/farol/pages/FarolUsg"));
const FarolRadioterapia   = lazy(() => import("@/features/farol/pages/FarolRadioterapia"));
const FarolTomografia     = lazy(() => import("@/features/farol/pages/FarolTomografia"));
const FarolMamografia     = lazy(() => import("@/features/farol/pages/FarolMamografia"));
const FarolDensitometria  = lazy(() => import("@/features/farol/pages/FarolDensitometria"));
const FarolRessonancia    = lazy(() => import("@/features/farol/pages/FarolRessonancia"));
const FarolEcocardiograma = lazy(() => import("@/features/farol/pages/FarolEcocardiograma"));
const FarolNeurocardio    = lazy(() => import("@/features/farol/pages/FarolNeurocardio"));
const FarolDashboard      = lazy(() => import("@/features/farol/pages/FarolDashboard"));
const FarolOcupacao       = lazy(() => import("@/features/farol/pages/FarolOcupacao"));
const PanoramaNetris      = lazy(() => import("@/features/farol/pages/PanoramaNetris"));
const PacientesChegou     = lazy(() => import("@/features/farol/pages/PacientesChegou"));
const BuscaAtendimentos   = lazy(() => import("@/features/farol/pages/BuscaAtendimentos"));
const TemposExames        = lazy(() => import("@/features/farol/pages/TemposExames"));
const TVFarol             = lazy(() => import("@/features/farol/pages/TVFarol"));

const queryClient = new QueryClient();

function CenterSpinner() {
  return (
    <div className="min-h-screen grid place-items-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <CenterSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<CenterSpinner />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              {/* TV pública — roda sem login nas TVs da clínica */}
              <Route path="/farol/tv" element={<TVFarol />} />
              <Route path="/farol" element={<RequireAuth><FarolHub /></RequireAuth>} />
              <Route path="/farol/ultrassom" element={<RequireAuth><FarolUsg /></RequireAuth>} />
              <Route path="/farol/radiografia" element={<RequireAuth><FarolRadioterapia /></RequireAuth>} />
              <Route path="/farol/tomografia" element={<RequireAuth><FarolTomografia /></RequireAuth>} />
              <Route path="/farol/mamografia" element={<RequireAuth><FarolMamografia /></RequireAuth>} />
              <Route path="/farol/densitometria" element={<RequireAuth><FarolDensitometria /></RequireAuth>} />
              <Route path="/farol/ressonancia" element={<RequireAuth><FarolRessonancia /></RequireAuth>} />
              <Route path="/farol/ecocardiograma" element={<RequireAuth><FarolEcocardiograma /></RequireAuth>} />
              <Route path="/farol/neurocardio" element={<RequireAuth><FarolNeurocardio /></RequireAuth>} />
              <Route path="/farol/dashboard" element={<RequireAuth><FarolDashboard /></RequireAuth>} />
              <Route path="/farol/relatorios" element={<RequireAuth><FarolOcupacao /></RequireAuth>} />
              <Route path="/farol/panorama" element={<RequireAuth><PanoramaNetris /></RequireAuth>} />
              <Route path="/farol/chegou" element={<RequireAuth><PacientesChegou /></RequireAuth>} />
              <Route path="/farol/busca" element={<RequireAuth><BuscaAtendimentos /></RequireAuth>} />
              <Route path="/farol/tempos" element={<RequireAuth><TemposExames /></RequireAuth>} />
              <Route path="*" element={<Navigate to="/farol" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
