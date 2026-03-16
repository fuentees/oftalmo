import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, Mail, User } from "lucide-react";

export default function Login() {
  const allowPublicSignup =
    String(import.meta.env.VITE_ALLOW_PUBLIC_SIGNUP || "").toLowerCase() ===
    "true";
  const [mode, setMode] = useState("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoadingAuth } = useAuth();

  const redirectTarget = useMemo(() => {
    const redirect = params.get("redirect");
    return redirect || "/";
  }, [params]);

  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated) {
      navigate(redirectTarget, { replace: true });
    }
  }, [isAuthenticated, isLoadingAuth, navigate, redirectTarget]);

  useEffect(() => {
    if (!allowPublicSignup && mode === "signup") {
      setMode("login");
    }
  }, [allowPublicSignup, mode]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (mode === "signup") {
        if (!allowPublicSignup) {
          throw new Error(
            "Cadastro público desativado. Solicite acesso ao administrador."
          );
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        });
        if (signUpError) throw signUpError;

        if (!data.session) {
          setInfo("Conta criada! Verifique seu email para confirmar acesso.");
        } else {
          navigate(redirectTarget, { replace: true });
        }
      } else {
        const { error: signInError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });
        if (signInError) throw signInError;
        navigate(redirectTarget, { replace: true });
      }
    } catch (err) {
      setError(err.message || "Não foi possível autenticar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-xl border-slate-200">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg">
              <Lock className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-semibold text-slate-800">
                {mode === "signup" && allowPublicSignup
                  ? "Criar conta"
                  : "Entrar no sistema"}
              </CardTitle>
              <p className="text-sm text-slate-500">
                Acesse seus treinamentos e dados
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!allowPublicSignup && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertDescription className="text-amber-800">
                  Cadastro público desativado. Solicite criação de conta ao
                  administrador.
                </AlertDescription>
              </Alert>
            )}

            {mode === "signup" && allowPublicSignup && (
              <div className="space-y-2">
                <Label htmlFor="full_name">Nome completo</Label>
                <div className="relative">
                  <User className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="full_name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome"
                    className="pl-9"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9"
                  minLength={6}
                  required
                />
              </div>
            </div>

            {error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertDescription className="text-red-700">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {info && (
              <Alert className="border-blue-200 bg-blue-50">
                <AlertDescription className="text-blue-700">
                  {info}
                </AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "signup" && allowPublicSignup ? "Criar conta" : "Entrar"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            {allowPublicSignup ? (
              mode === "signup" ? (
                <>
                  Já tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    Entrar
                  </button>
                </>
              ) : (
                <>
                  Ainda não tem conta?{" "}
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    Criar agora
                  </button>
                </>
              )
            ) : (
              "A criação de novas contas é feita somente pela administração."
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
