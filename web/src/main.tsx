import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import RoutineDetail from "./pages/RoutineDetail";
import CreateRoutine from "./pages/CreateRoutine";
import { supabase } from "./lib/supabase";
import RoutineEdit from "./pages/RoutineEdit";


function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true);
  const [authed, setAuthed] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setAuthed(!!data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (loading) return <div style={{ padding: 20 }}>Carregando...</div>;
  if (!authed) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/routines/new"
          element={
            <ProtectedRoute>
              <CreateRoutine />
            </ProtectedRoute>
          }
        />

        <Route
          path="/routines/:id"
          element={
            <ProtectedRoute>
              <RoutineDetail />
            </ProtectedRoute>
          }
        />

        <Route 
          path="/routines/:id/edit" 
          element={
          <ProtectedRoute>
            <RoutineEdit />
            </ProtectedRoute>
          } />


        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
