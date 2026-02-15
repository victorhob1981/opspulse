// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import Login from "./pages/Login";
import Signup from "./pages/Signup";

import AppShell from "./components/layout/AppShell";
import ProtectedRoute from "./components/routing/ProtectedRoute";

import DashboardHome from "./pages/DashboardHome";
import Routines from "./pages/Routines";
import Executions from "./pages/Executions";
import About from "./pages/About";

import RoutineDetail from "./pages/RoutineDetail";
import CreateRoutine from "./pages/CreateRoutine";
import RoutineEdit from "./pages/RoutineEdit";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Público */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Área protegida com layout */}
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          {/* root -> dashboard */}
          <Route index element={<Navigate to="/dashboardhome" replace />} />

          <Route path="/dashboardhome" element={<DashboardHome />} />
          <Route path="/routines" element={<Routines />} />
          <Route path="/executions" element={<Executions />} />
          <Route path="/about" element={<About />} />

          {/* Rotinas */}
          <Route path="/routines/new" element={<CreateRoutine />} />
          <Route path="/routines/:id" element={<RoutineDetail />} />
          <Route path="/routines/:id/edit" element={<RoutineEdit />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboardhome" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
