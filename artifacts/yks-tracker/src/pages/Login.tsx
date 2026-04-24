import { FormEvent, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Sparkles,
  User,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { getRememberDefault, type AuthSession } from "@/lib/auth-session";
import { desktopBridgeFetch } from "@/lib/desktop-api-fetch";

type LoginPageProps = {
  onAuthenticated: (session: AuthSession) => void;
};

type AuthMode = "login" | "register";

type AuthResponse = {
  user: {
    id: number;
    name: string;
    email: string;
  };
  token: string;
  expiresAt: string;
};

const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").toString().trim();
const apiBaseUrl = rawApiBaseUrl ? rawApiBaseUrl.replace(/\/+$/, "") : "";

function resolveApiUrl(path: string) {
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Ä°ÅŸlem tamamlanamadÄ±.";
}

async function submitAuth(
  mode: AuthMode,
  payload: { name: string; email: string; password: string; remember: boolean },
) {
  const response = await desktopBridgeFetch(
    resolveApiUrl(`/api/auth/${mode === "register" ? "register" : "login"}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || "Sunucu iÅŸlemi tamamlayamadÄ±.");
  }

  return data as AuthResponse;
}

export default function Login({ onAuthenticated }: LoginPageProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(getRememberDefault);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === "register";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    const cleanName = name.trim();

    if (isRegister && cleanName.length < 2) {
      setError("Ad alanÄ± en az 2 karakter olmalÄ±.");
      return;
    }
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("GeÃ§erli bir e-posta girin.");
      return;
    }
    if (cleanPassword.length < 6) {
      setError("Åžifre en az 6 karakter olmalÄ±.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await submitAuth(mode, {
        name: cleanName,
        email: cleanEmail,
        password: cleanPassword,
        remember,
      });
      onAuthenticated({
        userId: result.user.id,
        name: result.user.name,
        email: result.user.email,
        token: result.token,
        expiresAt: result.expiresAt,
        remember,
        loginAt: Date.now(),
      });
    } catch (authError) {
      setError(extractErrorMessage(authError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_15%_20%,hsl(var(--primary)/0.18),transparent_45%),radial-gradient(circle_at_82%_18%,hsl(199_92%_52%/0.16),transparent_42%),hsl(var(--background))] px-4 py-8">
      <div className="login-overlay pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,transparent_20%,hsl(var(--primary)/0.04)_42%,transparent_75%)]" />
      <div className="login-card relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-border/60 bg-card/88 shadow-[0_45px_100px_-45px_rgba(15,23,42,0.7)] backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="login-info hidden h-full flex-col justify-between border-r border-border/50 bg-[linear-gradient(150deg,hsl(var(--primary)/0.22)_0%,hsl(var(--primary)/0.03)_58%,transparent_100%)] p-10 lg:flex">
          <div className="login-pill inline-flex w-fit items-center gap-2 rounded-full border border-primary/35 bg-primary/12 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Exam Duck
          </div>
          <div className="login-copy space-y-4">
            <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground">
              OdaklÄ± Ã§alÄ±ÅŸ, akÄ±llÄ± tekrar et.
            </h1>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Not akÄ±ÅŸÄ±, soru tekrarÄ± ve test merkezine tek panelden eriÅŸ.
              HesabÄ±nla giriÅŸ yap, verilerin aynÄ± sunucu Ã¼zerinden dÃ¼zenli
              Ã§alÄ±ÅŸsÄ±n.
            </p>
          </div>
          <div className="login-benefits grid gap-3 text-sm text-muted-foreground">
            <p className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Yapay zeka destekli koÃ§luk sistemi
            </p>
            <p className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Beni hatÄ±rla ile kalÄ±cÄ± oturum
            </p>
            <p className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Mac ve Windows uyumlu Ã§alÄ±ÅŸma
            </p>
          </div>
        </section>

        <section className="login-form-panel p-6 sm:p-10">
          <div className="mx-auto w-full max-w-md">
            <div className="login-heading mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
                {isRegister ? "Yeni hesap" : "HoÅŸ geldin"}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
                {isRegister ? "Hesap oluÅŸtur" : "GiriÅŸ yap"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {isRegister
                  ? "Ä°lk hesabÄ±nÄ± oluÅŸturup Ã§alÄ±ÅŸma paneline geÃ§ebilirsin."
                  : "Ã‡alÄ±ÅŸma paneline geÃ§mek iÃ§in hesabÄ±nla giriÅŸ yap."}
              </p>
            </div>

            <div className="login-tabs mb-5 grid grid-cols-2 rounded-2xl border border-border/60 bg-background/70 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  !isRegister
                    ? "login-tab-active bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                GiriÅŸ yap
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  isRegister
                    ? "login-tab-active bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                KayÄ±t ol
              </button>
            </div>

            <form className="login-form space-y-4" onSubmit={handleSubmit}>
              {isRegister && (
                <div className="space-y-2">
                  <Label htmlFor="login-name">Ad Soyad</Label>
                  <div className="relative">
                    <User className="login-input-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="login-name"
                      autoComplete="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Bora TaÅŸkÄ±n"
                      className="h-12 rounded-xl border-border/70 bg-background/82 pl-10"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="login-email">E-posta</Label>
                <div className="relative">
                  <Mail className="login-input-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="ornek@examduck.app"
                    className="h-12 rounded-xl border-border/70 bg-background/82 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">Åžifre</Label>
                <div className="relative">
                  <Lock className="login-input-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="En az 6 karakter"
                    className="h-12 rounded-xl border-border/70 bg-background/82 pl-10"
                  />
                </div>
              </div>

              <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
                <Checkbox
                  checked={remember}
                  onCheckedChange={(checked) => setRemember(Boolean(checked))}
                />
                Beni hatÄ±rla
              </label>

              {error ? (
                <p className="rounded-xl border border-rose-300/60 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-100">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="login-submit h-12 w-full rounded-xl text-sm font-semibold"
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : isRegister ? (
                  <UserPlus className="mr-2 h-4 w-4" />
                ) : (
                  <LogIn className="mr-2 h-4 w-4" />
                )}
                {isRegister ? "Hesap OluÅŸtur" : "GiriÅŸ Yap"}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
