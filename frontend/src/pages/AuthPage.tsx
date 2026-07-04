import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Logo } from "../components/Logo";
import { useAuth } from "../auth/useAuth";

type View = "login" | "signup";

export function AuthPage() {
  const [view, setView] = useState<View>("login");
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (view === "login" && (!email || !password)) {
      setError("Ingresa tu correo y contraseña para continuar.");
      return;
    }
    if (view === "signup" && (!name || !email || !password)) {
      setError("Completa todos los campos para continuar.");
      return;
    }

    setSubmitting(true);
    try {
      if (view === "login") {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      navigate("/");
    } catch (err) {
      const detail =
        axios.isAxiosError(err) && err.response?.data
          ? extractErrorMessage(err.response.data)
          : null;
      setError(detail ?? "No se pudo completar la operación. Verifica tus datos.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="auth-badge">
          <Logo size={24} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#33415C" }}>
            abrhil.com/app
          </span>
        </div>

        <div className="auth-card">
          <div className="auth-form-side">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 26 }}>
              <Logo />
              <div style={{ fontWeight: 800, fontSize: 19, letterSpacing: "-0.01em", color: "#00318B" }}>
                abrhil
              </div>
            </div>

            {view === "login" ? (
              <>
                <div style={{ fontWeight: 800, fontSize: 24, marginBottom: 6, letterSpacing: "-0.01em" }}>
                  Bienvenida de vuelta
                </div>
                <div style={{ fontSize: 14, color: "#5B6B84", marginBottom: 24 }}>
                  Ingresa tus datos para continuar.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 800, fontSize: 24, marginBottom: 6, letterSpacing: "-0.01em" }}>
                  Crea tu cuenta
                </div>
                <div style={{ fontSize: 14, color: "#5B6B84", marginBottom: 24 }}>
                  Empieza a gestionar tus proyectos con tu equipo.
                </div>
              </>
            )}

            <form className="form-stack" onSubmit={handleSubmit}>
              {view === "signup" && (
                <div>
                  <div className="field-label">Nombre</div>
                  <input
                    className="input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre completo"
                  />
                </div>
              )}
              <div>
                <div className="field-label">Correo</div>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.com"
                />
              </div>
              <div>
                <div className="field-label">Contraseña</div>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {error && <div className="field-error">{error}</div>}

              <button className="btn btn-primary" type="submit" disabled={submitting} style={{ marginTop: 4 }}>
                {submitting
                  ? "Un momento…"
                  : view === "login"
                    ? "Iniciar sesión"
                    : "Crear cuenta"}
              </button>

              <div style={{ fontSize: 12.5, color: "#5B6B84", textAlign: "center", marginTop: 4 }}>
                {view === "login" ? (
                  <>
                    ¿No tienes cuenta?{" "}
                    <span
                      onClick={() => setView("signup")}
                      style={{ color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}
                    >
                      Regístrate
                    </span>
                  </>
                ) : (
                  <>
                    ¿Ya tienes cuenta?{" "}
                    <span
                      onClick={() => setView("login")}
                      style={{ color: "var(--accent)", fontWeight: 700, cursor: "pointer" }}
                    >
                      Inicia sesión
                    </span>
                  </>
                )}
              </div>
            </form>
          </div>

          <div className="auth-art-side">
            <div className="auth-blob" style={{ width: 220, height: 220, background: "rgba(255,255,255,0.08)", top: -60, left: -50, animation: "floatA 9s ease-in-out infinite" }} />
            <div className="auth-blob" style={{ width: 90, height: 90, background: "rgba(184,134,11,0.35)", top: "14%", right: "12%", animation: "floatB 7s ease-in-out infinite" }} />
            <div className="auth-blob" style={{ width: 140, height: 140, background: "rgba(255,255,255,0.06)", bottom: -40, right: -30, animation: "floatB 10s ease-in-out infinite" }} />

            <div className="auth-logo-mark">
              <div style={{ width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.12)", position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", filter: "blur(6px)" }} />
              <div style={{ position: "relative", filter: "drop-shadow(0 18px 30px rgba(2,12,40,0.35))" }}>
                <Logo size={150} />
              </div>
            </div>

            <div style={{ position: "absolute", bottom: 32, left: 0, right: 0, textAlign: "center", padding: "0 30px" }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: "#fff" }}>
                Gestiona tus proyectos en un solo lugar
              </div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.75)", marginTop: 6 }}>
                Equipos, tareas y actividad, siempre sincronizados.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function extractErrorMessage(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const firstValue = Object.values(data as Record<string, unknown>)[0];
    if (Array.isArray(firstValue)) return String(firstValue[0]);
    if (typeof firstValue === "string") return firstValue;
  }
  return null;
}
