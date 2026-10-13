"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { MapPin, Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    if (await login(String(data.get("email")), String(data.get("password")))) {
      router.replace("/");
      router.refresh();
    } else {
      setError("Invalid email or password. Please check your credentials.");
      setPending(false);
    }
  }

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "linear-gradient(135deg, #fff8f5 0%, #fff 50%, #fff5f0 100%)" }}
    >
      {/* Decorative background accent */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{ zIndex: 0 }}
      >
        <div
          style={{
            position: "absolute",
            top: "-120px",
            right: "-120px",
            width: "420px",
            height: "420px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,69,0,0.07) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-100px",
            left: "-80px",
            width: "340px",
            height: "340px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,100,0,0.05) 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="relative w-full max-w-sm space-y-7" style={{ zIndex: 1 }}>

        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-1 shadow-lg"
            style={{ background: "linear-gradient(135deg, #ff4500 0%, #ff6a00 100%)" }}
          >
            <MapPin className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight" style={{ color: "#ff4500" }}>
              FLORZY B2B
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-1 tracking-wide">
              Lead-to-Store · Geo-Assignment · Ground Funnel
            </p>
          </div>
        </div>

        {/* Sign-in Card */}
        <div
          className="rounded-3xl bg-white p-7 space-y-5"
          style={{
            border: "1px solid rgba(255,69,0,0.12)",
            boxShadow: "0 8px 40px rgba(255,69,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div>
            <h2 className="text-base font-bold text-slate-800">Welcome back</h2>
            <p className="text-xs text-slate-400 mt-0.5">Sign in to continue to your workspace</p>
          </div>

          <form onSubmit={submit} className="space-y-4" id="login-form">
            {/* Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="login-email"
                className="text-xs font-semibold text-slate-600 block"
              >
                Email address
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="you@example.com"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-300 transition-all outline-none focus:border-[#ff4500] focus:ring-2 focus:ring-[#ff4500]/10"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="login-password"
                className="text-xs font-semibold text-slate-600 block"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-11 text-sm text-slate-900 placeholder-slate-300 transition-all outline-none focus:border-[#ff4500] focus:ring-2 focus:ring-[#ff4500]/10"
                />
                <button
                  type="button"
                  id="toggle-password"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-xs font-medium"
                style={{
                  background: "#fff1f1",
                  border: "1px solid #fecaca",
                  color: "#dc2626",
                }}
              >
                <span className="mt-px shrink-0">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              id="login-submit"
              disabled={pending}
              type="submit"
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: pending
                  ? "#ff6b35"
                  : "linear-gradient(135deg, #ff4500 0%, #ff6a00 100%)",
                boxShadow: "0 4px 16px rgba(255,69,0,0.25)",
              }}
            >
              {pending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Role Hint Panel */}
        <div
          className="rounded-2xl p-4 space-y-2"
          style={{
            background: "rgba(255,245,240,0.7)",
            border: "1px solid rgba(255,69,0,0.1)",
          }}
        >
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Role-based access
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: "Super Admin", desc: "Full access + persona switcher", color: "#f59e0b" },
              { label: "B2B Head", desc: "All leads, partners & imports", color: "#ff4500" },
              { label: "Store Lead", desc: "Region leads, route planner", color: "#7c3aed" },
              { label: "Ground Rep", desc: "My visits & assigned leads", color: "#0891b2" },
              { label: "Store Associate", desc: "Walk-ins, calls & warm leads", color: "#059669" },
              { label: "Analyst", desc: "Read-only funnel & maps", color: "#64748b" },
            ].map((r) => (
              <div
                key={r.label}
                className="flex items-start gap-2 px-3 py-2 rounded-xl bg-white"
                style={{ border: `1px solid ${r.color}20` }}
              >
                <span
                  className="mt-0.5 shrink-0 w-2 h-2 rounded-full"
                  style={{ background: r.color }}
                />
                <div>
                  <p className="text-[10px] font-bold" style={{ color: r.color }}>
                    {r.label}
                  </p>
                  <p className="text-[10px] text-slate-400 leading-tight">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-300 pb-2">
          Florzy B2B · Internal Platform · {new Date().getFullYear()}
        </p>
      </div>
    </main>
  );
}
