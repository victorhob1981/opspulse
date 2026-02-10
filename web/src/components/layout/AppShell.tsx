import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { LogOut, LayoutDashboard, ListChecks, History, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "../../lib/supabase";

export default function AppShell() {
  const nav = useNavigate();

  async function logout() {
    await supabase.auth.signOut();
    nav("/login", { replace: true });
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm transition
     ${isActive ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted"}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Topbar */}
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="text-lg font-semibold">OpsPulse</div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => nav("/routines/new")}>+ Nova rotina</Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Conta</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={logout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside className="h-fit rounded-lg border bg-card p-2">
          <nav className="grid gap-1">
            <NavLink to="/dashboard" className={linkClass} end>
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </NavLink>

            <NavLink to="/routines" className={linkClass}>
              <ListChecks className="h-4 w-4" />
              Rotinas
            </NavLink>

            <NavLink to="/executions" className={linkClass}>
              <History className="h-4 w-4" />
              Execuções
            </NavLink>

            <Separator className="my-2" />

            <NavLink to="/about" className={linkClass}>
              <Info className="h-4 w-4" />
              Sobre
            </NavLink>
          </nav>
        </aside>

        {/* Content */}
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
