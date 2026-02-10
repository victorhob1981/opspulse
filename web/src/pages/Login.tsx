import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Se já estiver logado, manda pro dashboard
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) nav("/", { replace: true });
    });
    return () => {
      mounted = false;
    };
  }, [nav]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setLoading(false);
      setMsg(error.message);
      return;
    }

    setMsg("Logado! Redirecionando...");

    // garante que a sessão existe
    if (data.session?.access_token) {
      nav("/", { replace: true });
    } else {
      const sess = await supabase.auth.getSession();
      if (sess.data.session) nav("/", { replace: true });
      else setMsg("Não foi possível obter sessão. Tenta novamente.");
    }

    setLoading(false);
  }

  return (
    <div className="min-h-[calc(100vh-1px)] bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-14">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">OpsPulse</h1>
          <p className="mt-2 text-sm text-muted-foreground">Entre com sua conta</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Login</CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={onSubmit} className="grid gap-3">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  placeholder="seuemail@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Senha</label>
                <Input
                  placeholder="••••••••"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <Button type="submit" disabled={loading}>
                {loading ? "Entrando..." : "Entrar"}
              </Button>

              <p className="text-sm text-muted-foreground">
                Não tem conta?{" "}
                <Link to="/signup" className="font-medium text-foreground underline underline-offset-4">
                  Criar conta
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>

        {msg && (
          <Alert variant={msg.toLowerCase().includes("logado") ? "default" : "destructive"}>
            <AlertTitle>{msg.toLowerCase().includes("logado") ? "Ok" : "Erro"}</AlertTitle>
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
