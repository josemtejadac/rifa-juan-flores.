"use client";

import { useCallback, useEffect, useState } from "react";

const PRICE = 4000;

type Compra = {
  id: string;
  nombre: string;
  telefono: string;
  nums: number[];
  pagado: boolean;
  t: number;
};
type Aviso = { texto: string; tipo?: "err" | "good" } | null;

const pad = (n: number) => String(n).padStart(2, "0");
const clp = (n: number) => "$" + n.toLocaleString("es-CL");

async function llamar(body: Record<string, unknown>) {
  const r = await fetch("/api/rifa", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

export default function Home() {
  const [ocupados, setOcupados] = useState<number[]>([]);
  const [cargado, setCargado] = useState(false);
  const [sel, setSel] = useState<number[]>([]);
  const [mios, setMios] = useState<number[]>([]);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [verForm, setVerForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [verLogin, setVerLogin] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [creds, setCreds] = useState<{ user: string; pass: string } | null>(null);
  const [compras, setCompras] = useState<Compra[]>([]);

  const cargarPublico = useCallback(async () => {
    try {
      const r = await fetch("/api/rifa", { cache: "no-store" });
      const d = await r.json();
      if (r.ok && Array.isArray(d.ocupados)) {
        setOcupados(d.ocupados);
        setCargado(true);
      } else {
        setAviso({ texto: "No se pudo cargar la rifa. Recarga la página.", tipo: "err" });
      }
    } catch {
      setAviso({ texto: "Sin conexión. Recarga la página.", tipo: "err" });
    }
  }, []);

  const cargarAdmin = useCallback(async (c: { user: string; pass: string }) => {
    const r = await llamar({ action: "admin", ...c });
    if (r.ok) setCompras(r.data.compras ?? []);
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const guardado = localStorage.getItem("rifa-mios");
        if (guardado) setMios(JSON.parse(guardado));
      } catch {}
    });
    const primero = setTimeout(cargarPublico, 0);
    const t = setInterval(cargarPublico, 10000);
    return () => {
      clearTimeout(primero);
      clearInterval(t);
    };
  }, [cargarPublico]);

  useEffect(() => {
    if (!creds) return;
    const t = setInterval(() => cargarAdmin(creds), 10000);
    return () => clearInterval(t);
  }, [creds, cargarAdmin]);

  const tomados = new Set(ocupados);
  const suyos = new Set(mios);
  const elegidos = [...sel].sort((a, b) => a - b);

  function alternar(n: number) {
    if (enviando || tomados.has(n)) return;
    setVerForm(false);
    setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  }

  async function reservar() {
    if (enviando) return;
    if (nombre.trim().length < 2) {
      setAviso({ texto: "Escribe tu nombre para reservar.", tipo: "err" });
      return;
    }
    setEnviando(true);
    const r = await llamar({ action: "reservar", nums: elegidos, nombre, telefono });
    setEnviando(false);
    if (!r.ok) {
      setAviso({ texto: r.data.error ?? "No se pudo reservar. Intenta de nuevo.", tipo: "err" });
      return;
    }
    const libres: number[] = r.data.libres ?? [];
    const fallidos: number[] = r.data.fallidos ?? [];
    if (libres.length) {
      const nuevos = [...new Set([...mios, ...libres])];
      setMios(nuevos);
      try {
        localStorage.setItem("rifa-mios", JSON.stringify(nuevos));
      } catch {}
    }
    setSel([]);
    setVerForm(false);
    if (fallidos.length && libres.length) {
      setAviso({
        texto: `Reservaste ${libres.map(pad).join(", ")}. Estos ya estaban tomados: ${fallidos.map(pad).join(", ")}.`,
        tipo: "err",
      });
    } else if (fallidos.length) {
      setAviso({
        texto: `Esos números ya estaban tomados: ${fallidos.map(pad).join(", ")}. Elige otros.`,
        tipo: "err",
      });
    } else {
      setAviso({
        texto: `Listo, ${nombre.trim()}. Reservaste ${libres.map(pad).join(", ")} (${clp(libres.length * PRICE)}). Coordina el pago con Juan Flores para confirmar.`,
        tipo: "good",
      });
    }
    cargarPublico();
    if (creds) cargarAdmin(creds);
  }

  async function entrar() {
    const r = await llamar({ action: "admin", user: user.trim(), pass });
    if (r.ok) {
      setCreds({ user: user.trim(), pass });
      setCompras(r.data.compras ?? []);
      setVerLogin(false);
      setLoginErr("");
      setPass("");
    } else {
      setLoginErr("Usuario o clave incorrectos.");
    }
  }

  async function marcarPagado(c: Compra) {
    if (!creds) return;
    await llamar({ action: "pagado", id: c.id, pagado: !c.pagado, ...creds });
    cargarAdmin(creds);
  }

  async function liberar(c: Compra, n: number) {
    if (!creds) return;
    await llamar({ action: "liberar", id: c.id, num: n, ...creds });
    cargarAdmin(creds);
    cargarPublico();
  }

  const vendidos = ocupados.length;
  const numsPagados = compras.reduce((a, c) => a + (c.pagado ? c.nums.length : 0), 0);

  return (
    <>
      <main className="wrap">
        <header>
          <p className="kicker">Rifa de 100 números</p>
          <h1>A beneficio de Juan Flores</h1>
          <p className="sub">
            Premio: casco modular y headset Bluetooth para casco. Cada número cuesta <b>$4.000</b>.
          </p>
          <div className="meter">
            <div className="meter-top">
              <span>
                <strong>{vendidos}</strong> de 100 vendidos
              </span>
              <span>
                <strong>{100 - vendidos}</strong> disponibles
              </span>
            </div>
            <div className="track">
              <div className="fill" style={{ width: `${vendidos}%` }} />
            </div>
          </div>
        </header>

        <div className={`msg${aviso?.tipo ? " " + aviso.tipo : ""}`} role="status">
          {aviso?.texto ?? (cargado ? "Toca los números que quieras y confirma abajo." : "Cargando números…")}
        </div>

        <section aria-label="Números de la rifa">
          <div className="board">
            {Array.from({ length: 100 }, (_, n) => {
              const tomado = tomados.has(n);
              const mio = tomado && suyos.has(n);
              const cls = "n" + (tomado && !mio ? " taken" : "") + (mio ? " mine" : "");
              return (
                <button
                  key={n}
                  type="button"
                  className={cls}
                  aria-pressed={sel.includes(n)}
                  aria-label={`Número ${pad(n)}`}
                  disabled={tomado || !cargado}
                  onClick={() => alternar(n)}
                >
                  {pad(n)}
                </button>
              );
            })}
          </div>
        </section>
        <p className="legend">
          <span>
            <i style={{ background: "#0f0708", border: "1px solid #5a1519" }} />
            Disponible
          </span>
          <span>
            <i style={{ background: "#e5232b" }} />
            Elegido
          </span>
          <span>
            <i style={{ background: "#1b1b1e" }} />
            Vendido
          </span>
          <span>
            <i style={{ border: "1px solid #3ecf8e" }} />
            Tuyo
          </span>
        </p>

        {verForm && (
          <section className="sheet">
            <h2>Confirmar números</h2>
            <p className="sub">
              {elegidos.length} {elegidos.length === 1 ? "número" : "números"} · {clp(elegidos.length * PRICE)}
            </p>
            <label htmlFor="f-name">
              Tu nombre
              <input
                id="f-name"
                autoComplete="name"
                maxLength={80}
                placeholder="Nombre y apellido"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </label>
            <label htmlFor="f-phone">
              Teléfono (opcional)
              <input
                id="f-phone"
                autoComplete="tel"
                inputMode="tel"
                maxLength={30}
                placeholder="+56 9 1234 5678"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </label>
            <div className="row">
              <button className="btn" type="button" onClick={reservar} disabled={enviando}>
                {enviando ? "Reservando…" : "Reservar números"}
              </button>
              <button className="ghost" type="button" onClick={() => setVerForm(false)}>
                Volver
              </button>
            </div>
            <p className="sub">Después de reservar, coordina el pago con Juan Flores para confirmar tus números.</p>
          </section>
        )}

        {verLogin && !creds && (
          <section className="sheet">
            <h2>Acceso admin</h2>
            <label htmlFor="a-user">
              Usuario
              <input id="a-user" autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} />
            </label>
            <label htmlFor="a-pass">
              Clave
              <input
                id="a-pass"
                type="password"
                autoComplete="current-password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") entrar();
                }}
              />
            </label>
            {loginErr && <p className="err-text">{loginErr}</p>}
            <div className="row">
              <button className="btn" type="button" onClick={entrar}>
                Entrar
              </button>
              <button className="ghost" type="button" onClick={() => setVerLogin(false)}>
                Cancelar
              </button>
            </div>
          </section>
        )}

        {creds && (
          <section className="sheet">
            <h2>Panel admin</h2>
            <div className="stats">
              <div className="stat">
                <b>{vendidos}</b>
                <span>Números vendidos</span>
              </div>
              <div className="stat">
                <b>{clp(vendidos * PRICE)}</b>
                <span>Total vendido</span>
              </div>
              <div className="stat">
                <b>{clp(numsPagados * PRICE)}</b>
                <span>Pagado</span>
              </div>
              <div className="stat">
                <b>{clp((vendidos - numsPagados) * PRICE)}</b>
                <span>Por cobrar</span>
              </div>
            </div>
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Números</th>
                    <th>Total</th>
                    <th>Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {compras.length === 0 && (
                    <tr>
                      <td colSpan={4} className="sub">
                        Aún no hay compras.
                      </td>
                    </tr>
                  )}
                  {[...compras]
                    .sort((a, b) => (a.nums[0] ?? 0) - (b.nums[0] ?? 0))
                    .map((c) => (
                      <tr key={c.id}>
                        <td>
                          {c.nombre}
                          {c.telefono && <div className="sub">{c.telefono}</div>}
                        </td>
                        <td>
                          <div className="chips">
                            {c.nums.map((n) => (
                              <span className="chip" key={n}>
                                {pad(n)}
                                <button
                                  type="button"
                                  title={`Liberar ${pad(n)}`}
                                  aria-label={`Liberar número ${pad(n)}`}
                                  onClick={() => liberar(c, n)}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="num">{clp(c.nums.length * PRICE)}</td>
                        <td>
                          <button
                            type="button"
                            className={"ghost paid" + (c.pagado ? " yes" : "")}
                            onClick={() => marcarPagado(c)}
                          >
                            {c.pagado ? "Pagado" : "Marcar pagado"}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="row">
              <button
                className="ghost"
                type="button"
                onClick={() => {
                  setCreds(null);
                  setCompras([]);
                }}
              >
                Salir del panel
              </button>
            </div>
          </section>
        )}

        <div className="foot">
          <span>Valor por número: $4.000</span>
          {!creds && (
            <button className="ghost" type="button" onClick={() => setVerLogin(true)}>
              Admin
            </button>
          )}
        </div>
      </main>

      {elegidos.length > 0 && (
        <div className="bar">
          <div className="bar-in">
            <div className="bar-info">
              <div className="bar-total">{clp(elegidos.length * PRICE)}</div>
              <div className="bar-nums">
                {elegidos.length} {elegidos.length === 1 ? "número" : "números"}: {elegidos.map(pad).join(", ")}
              </div>
            </div>
            <button className="btn" type="button" onClick={() => setVerForm(true)}>
              Continuar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
