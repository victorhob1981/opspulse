import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Signup() {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) return setMsg("Preencha o email.");
    if (password.length < 6) return setMsg("Senha precisa ter pelo menos 6 caracteres.");
    if (password !== confirm) return setMsg("As senhas não conferem.");

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      // Se você configurar redirect URL no Supabase, pode usar:
      // options: { emailRedirectTo: `${window.location.origin}/login` }
    });

    if (error) {
      setLoading(false);
      setMsg(error.message);
      return;
    }

    // Se sua config exigir confirmação de email, session costuma vir null
    if (!data.session) {
      setMsg("Conta criada! Agora confirme o email (olha a caixa de entrada). Depois volte e faça login.");
      setLoading(false);
      return;
    }

    // Se não exigir confirmação, já entra direto
    setMsg("Conta criada! Redirecionando...");
    nav("/", { replace: true });
    setLoading(false);
  }

  const okMsg = msg?.toLowerCase().includes("conta criada");

  return (
    <div className="min-h-[calc(100vh-1px)] bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-14">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">OpsPulse</h1>
          <p className="mt-2 text-sm text-muted-foreground">Crie sua conta</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Criar conta</CardTitle>
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
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo de 6 caracteres.
                </p>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">Confirmar senha</label>
                <Input
                  placeholder="••••••••"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              <Button type="submit" disabled={loading}>
                {loading ? "Criando..." : "Criar conta"}
              </Button>

              <p className="text-sm text-muted-foreground">
                Já tem conta?{" "}
                <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
                  Entrar
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>

        {msg && (
          <Alert variant={okMsg ? "default" : "destructive"}>
            <AlertTitle>{okMsg ? "Ok" : "Erro"}</AlertTitle>
            <AlertDescription>{msg}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
