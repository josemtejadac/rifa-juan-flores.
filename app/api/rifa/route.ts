import { BlobPreconditionFailedError, get, put } from "@vercel/blob";

export const dynamic = "force-dynamic";

const PATH = "rifa/estado.json";
const ADMIN_USER = process.env.RIFA_ADMIN_USER ?? "admin";
const ADMIN_PASS = process.env.RIFA_ADMIN_PASS ?? "12345";

type Compra = {
  id: string;
  nombre: string;
  telefono: string;
  nums: number[];
  pagado: boolean;
  t: number;
};
type Estado = { compras: Compra[] };

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function leer(): Promise<{ estado: Estado; etag: string | null }> {
  const r = await get(PATH, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200) return { estado: { compras: [] }, etag: null };
  const texto = await new Response(r.stream).text();
  try {
    const parsed = JSON.parse(texto) as Estado;
    return {
      estado: { compras: Array.isArray(parsed.compras) ? parsed.compras : [] },
      etag: r.blob.etag,
    };
  } catch {
    return { estado: { compras: [] }, etag: r.blob.etag };
  }
}

async function guardar(estado: Estado, etag: string | null) {
  await put(PATH, JSON.stringify(estado), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
    addRandomSuffix: false,
    ...(etag ? { ifMatch: etag } : {}),
  });
}

// Lee, modifica y guarda con control de versión. Reintenta si alguien guardó antes.
async function actualizar<T>(
  fn: (estado: Estado) => { resultado: T; cambio: boolean },
): Promise<T> {
  for (let intento = 0; intento < 6; intento++) {
    const { estado, etag } = await leer();
    const { resultado, cambio } = fn(estado);
    if (!cambio) return resultado;
    try {
      await guardar(estado, etag);
      return resultado;
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) continue;
      throw e;
    }
  }
  throw new Error("conflicto");
}

function ocupados(estado: Estado): number[] {
  const set = new Set<number>();
  for (const c of estado.compras) for (const n of c.nums) set.add(n);
  return [...set].sort((a, b) => a - b);
}

function esAdmin(user: unknown, pass: unknown) {
  return user === ADMIN_USER && pass === ADMIN_PASS;
}

export async function GET() {
  try {
    const { estado } = await leer();
    return json({ ocupados: ocupados(estado) });
  } catch (e) {
    console.error("rifa GET", e);
    const detalle = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return json({ error: "No se pudo leer la rifa", detalle }, 500);
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Solicitud inválida" }, 400);
  }

  try {
    if (body.action === "reservar") {
      const nombre = String(body.nombre ?? "").trim().slice(0, 80);
      const telefono = String(body.telefono ?? "").trim().slice(0, 30);
      const nums = Array.isArray(body.nums)
        ? [...new Set(body.nums.map(Number))]
        : [];
      if (nombre.length < 2) return json({ error: "Escribe tu nombre" }, 400);
      if (
        nums.length === 0 ||
        nums.length > 100 ||
        nums.some((n) => !Number.isInteger(n) || n < 0 || n > 99)
      ) {
        return json({ error: "Números inválidos" }, 400);
      }
      const r = await actualizar((estado) => {
        const tomados = new Set(ocupados(estado));
        const libres = nums.filter((n) => !tomados.has(n));
        const fallidos = nums.filter((n) => tomados.has(n));
        if (libres.length === 0) {
          return { resultado: { libres, fallidos }, cambio: false };
        }
        estado.compras.push({
          id: crypto.randomUUID(),
          nombre,
          telefono,
          nums: libres.sort((a, b) => a - b),
          pagado: false,
          t: Date.now(),
        });
        return { resultado: { libres, fallidos }, cambio: true };
      });
      return json({ ok: true, ...r });
    }

    if (!esAdmin(body.user, body.pass)) {
      await new Promise((res) => setTimeout(res, 600));
      return json({ error: "Credenciales incorrectas" }, 401);
    }

    if (body.action === "admin") {
      const { estado } = await leer();
      return json({ compras: estado.compras, ocupados: ocupados(estado) });
    }

    if (body.action === "pagado") {
      const id = String(body.id ?? "");
      const pagado = body.pagado === true;
      await actualizar((estado) => {
        const c = estado.compras.find((x) => x.id === id);
        if (!c) return { resultado: null, cambio: false };
        c.pagado = pagado;
        return { resultado: null, cambio: true };
      });
      return json({ ok: true });
    }

    if (body.action === "liberar") {
      const id = String(body.id ?? "");
      const num = Number(body.num);
      await actualizar((estado) => {
        const c = estado.compras.find((x) => x.id === id);
        if (!c) return { resultado: null, cambio: false };
        c.nums = c.nums.filter((n) => n !== num);
        if (c.nums.length === 0) {
          estado.compras = estado.compras.filter((x) => x.id !== id);
        }
        return { resultado: null, cambio: true };
      });
      return json({ ok: true });
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch {
    return json({ error: "No se pudo guardar. Intenta de nuevo." }, 500);
  }
}
