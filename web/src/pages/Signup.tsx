import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

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

    if (!email.trim()) return setMsg("Preencha o email.");
    if (password.length < 6) return setMsg("Senha precisa ter pelo menos 6 caracteres.");
    if (password !== confirm) return setMsg("As senhas não conferem.");

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
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

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", padding: 20 }}>
      <h1>OpsPulse</h1>
      <p>Criar conta</p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          placeholder="Senha"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <input
          placeholder="Confirmar senha"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        <button type="submit" disabled={loading}>
          {loading ? "Criando..." : "Criar conta"}
        </button>
      </form>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <p style={{ marginTop: 12 }}>
        Já tem conta? <Link to="/login">Entrar</Link>
      </p>
    </div>
  );
}
