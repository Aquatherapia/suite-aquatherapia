import { NextRequest, NextResponse } from "next/server";

// Seguimiento de los pedidos a las marcas: uno por marca y día, con su estado (esperando, llegó mal,
// no enviaron el correcto). Al marcarlo como recibido se borra. Se guarda en Vercel KV, en un hash: id → pedido.
const CLAVE = "pedidos-marcas-pedidos";
const ESTADOS = ["esperando", "mal", "incorrecto"];
// Email y WhatsApp de cada marca, para mandarle el pedido desde la Suite
const CONTACTOS = "pedidos-marcas-contactos";
type Contacto = { email: string; whatsapp: string };

// compras: IDs de las compras de clientes que cubre este pedido (las que lleguen después vuelven a salir)
type Producto = { id: string; producto: string; propiedad: string; ean: string; compras?: string[] };
export type Pedido = { marca: string; fecha: string; estado: string; productos: Producto[] };

async function kv() {
  return (await import("@vercel/kv")).kv;
}

async function todos() {
  const db = await kv();
  const [pedidos, contactos] = await Promise.all([db.hgetall<Record<string, Pedido>>(CLAVE), db.hgetall<Record<string, Contacto>>(CONTACTOS)]);
  return { pedidos: (pedidos ?? {}) as Record<string, Pedido>, contactos: (contactos ?? {}) as Record<string, Contacto> };
}

const txt = (v: unknown, n: number) => String(v ?? "").slice(0, n);

export async function GET() {
  try {
    return NextResponse.json(await todos());
  } catch (e) {
    return NextResponse.json({ error: `No se pudo leer el seguimiento: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}

// POST { accion: "crear", marca, productos: [{id, producto, propiedad, ean}] }
// POST { accion: "contacto", marca, email, whatsapp }  (los dos vacíos = se borra)
// POST { accion: "estado", id, estado: "esperando"|"mal"|"incorrecto"|"recibido" }  (recibido = se borra)
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  try {
    const db = await kv();
    if (b.accion === "crear") {
      const productos: Producto[] = (Array.isArray(b.productos) ? b.productos : []).slice(0, 500).map((p: Partial<Producto>) => ({
        id: txt(p.id, 300), producto: txt(p.producto, 300), propiedad: txt(p.propiedad, 120), ean: txt(p.ean, 40),
        compras: Array.isArray(p.compras) ? p.compras.slice(0, 200).map(c => txt(c, 40)).filter(Boolean) : undefined,
      })).filter((p: Producto) => p.id);
      if (!b.marca || !productos.length) return NextResponse.json({ error: "Faltan la marca o los productos" }, { status: 400 });
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      await db.hset(CLAVE, { [id]: { marca: txt(b.marca, 120), fecha: new Date().toISOString(), estado: "esperando", productos } satisfies Pedido });
    } else if (b.accion === "estado") {
      const id = txt(b.id, 60);
      if (b.estado === "recibido") await db.hdel(CLAVE, id);
      else if (ESTADOS.includes(b.estado)) {
        const p = await db.hget<Pedido>(CLAVE, id);
        if (p) await db.hset(CLAVE, { [id]: { ...p, estado: b.estado } });
      } else return NextResponse.json({ error: "Estado desconocido" }, { status: 400 });
    } else if (b.accion === "contacto") {
      const marca = txt(b.marca, 120);
      if (!marca) return NextResponse.json({ error: "Falta la marca" }, { status: 400 });
      const email = txt(b.email, 200).trim();
      const whatsapp = txt(b.whatsapp, 30).replace(/[^\d+]/g, "");
      if (!email && !whatsapp) await db.hdel(CONTACTOS, marca);
      else await db.hset(CONTACTOS, { [marca]: { email, whatsapp } satisfies Contacto });
    } else return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
    return NextResponse.json(await todos());
  } catch (e) {
    return NextResponse.json({ error: `No se pudo guardar: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
