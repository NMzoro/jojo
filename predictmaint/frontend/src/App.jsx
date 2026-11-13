import React, { useEffect, useRef } from "react";
import { Route, Routes, useLocation, Link } from "react-router-dom";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { LiveProvider, useLive } from "./context/LiveContext";
import { Layout } from "./components/Layout";
import { ToastStack } from "./components/ToastStack";
import Supervision from "./pages/Supervision";
import Machines from "./pages/Machines";
import Prediction from "./pages/Prediction";
import Modeles from "./pages/Modeles";
import Alarmes from "./pages/Alarmes";
import Rapports from "./pages/Rapports";
import Parametres from "./pages/Parametres";

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <p className="num text-5xl font-semibold text-brand">404</p>
      <p className="text-sm font-bold text-ink">Page introuvable</p>
      <Link to="/" className="btn btn-primary">
        Retour à la supervision
      </Link>
    </div>
  );
}

function AppRoutes() {
  const live = useLive();
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Supervision />} />
          <Route path="/machines" element={<Machines />} />
          <Route path="/prediction" element={<Prediction />} />
          <Route path="/modeles" element={<Modeles />} />
          <Route path="/alarmes" element={<Alarmes />} />
          <Route path="/rapports" element={<Rapports />} />
          <Route path="/parametres" element={<Parametres />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <ToastStack toasts={live.toasts} onDismiss={live.dismissToast} />
    </>
  );
}

export default function App() {
  const location = useLocation();
  const lenisRef = useRef(null);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.05,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
    });
    lenisRef.current = lenis;
    let frame;
    const raf = (time) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(0, { immediate: true });
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.pathname]);

  return (
    <LiveProvider>
      <AppRoutes />
    </LiveProvider>
  );
}
