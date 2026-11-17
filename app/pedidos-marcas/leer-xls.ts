// Lector mínimo de .xls (Excel 97-2003, BIFF8) para el informe de ventas de la tienda.
// Se hace a mano para no añadir dependencias: lee la primera hoja y devuelve sus celdas como texto.
// El programa de la tienda genera el archivo con una pequeña incoherencia interna que hace fallar
// a otros lectores estrictos; aquí solo se sigue la cadena del flujo «Workbook», que está bien.

const FIN = -2;

function leerFlujoWorkbook(buf: Uint8Array): Uint8Array {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const firma = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (!firma.every((b, i) => buf[i] === b)) throw new Error("El archivo de ventas no es un .xls de Excel. Sube el «COMPRAS_….xls» tal cual sale de la tienda.");
  const ss = 1 << dv.getUint16(0x1e, true);
  const mss = 1 << dv.getUint16(0x20, true);
  const nFat = dv.getUint32(0x2c, true);
  const dirIni = dv.getInt32(0x30, true);
  const corte = dv.getUint32(0x38, true);
  const miniFatIni = dv.getInt32(0x3c, true);
  let difatSig = dv.getInt32(0x44, true);
  const off = (s: number) => 512 + s * ss;

  // Sectores de la FAT (109 en la cabecera y el resto en la cadena DIFAT)
  const fatSect: number[] = [];
  for (let i = 0; i < 109 && fatSect.length < nFat; i++) fatSect.push(dv.getInt32(0x4c + i * 4, true));
  let vueltas = 0;
  while (fatSect.length < nFat && difatSig >= 0 && vueltas++ < 10000) {
    for (let i = 0; i < ss / 4 - 1 && fatSect.length < nFat; i++) fatSect.push(dv.getInt32(off(difatSig) + i * 4, true));
    difatSig = dv.getInt32(off(difatSig) + ss - 4, true);
  }
  const fat: number[] = [];
  for (const s of fatSect) for (let i = 0; i < ss / 4; i++) fat.push(off(s) + i * 4 + 4 <= buf.length ? dv.getInt32(off(s) + i * 4, true) : FIN);

  const cadena = (ini: number, tabla: number[]) => {
    const out: number[] = [];
    const visto = new Set<number>();
    for (let s = ini; s >= 0 && s < tabla.length && !visto.has(s); s = tabla[s]) { visto.add(s); out.push(s); }
    return out;
  };
  const leerCadena = (ini: number, tam: number) => {
    const out = new Uint8Array(tam);
    let p = 0;
    for (const s of cadena(ini, fat)) {
      if (p >= tam) break;
      const trozo = buf.subarray(off(s), Math.min(off(s) + ss, buf.length));
      const n = Math.min(trozo.length, tam - p);
      out.set(trozo.subarray(0, n), p);
      p += n;
    }
    return out;
  };

  // Directorio
  const dirSects = cadena(dirIni, fat);
  const dir = new Uint8Array(dirSects.length * ss);
  dirSects.forEach((s, i) => dir.set(buf.subarray(off(s), off(s) + ss), i * ss));
  const ddv = new DataView(dir.buffer);
  type Entrada = { nombre: string; tipo: number; ini: number; tam: number };
  const entradas: Entrada[] = [];
  for (let i = 0; i + 128 <= dir.length; i += 128) {
    const nl = ddv.getUint16(i + 0x40, true);
    if (nl < 2) continue;
    let nombre = "";
    for (let j = 0; j < nl - 2; j += 2) nombre += String.fromCharCode(ddv.getUint16(i + j, true));
    entradas.push({ nombre, tipo: dir[i + 0x42], ini: ddv.getInt32(i + 0x74, true), tam: ddv.getUint32(i + 0x78, true) });
  }
  const wb = entradas.find(e => e.nombre === "Workbook" || e.nombre === "Book");
  if (!wb) throw new Error("No encuentro la hoja dentro del .xls de ventas.");
  if (wb.tam >= corte) return leerCadena(wb.ini, wb.tam);

  // Flujo pequeño: va en el «mini stream» de la entrada raíz
  const raiz = entradas.find(e => e.tipo === 5);
  if (!raiz) throw new Error("El .xls de ventas está dañado (sin entrada raíz).");
  const mini = leerCadena(raiz.ini, raiz.tam);
  const miniFatBytes = leerCadena(miniFatIni, cadena(miniFatIni, fat).length * ss);
  const mdv = new DataView(miniFatBytes.buffer);
  const miniFat: number[] = [];
  for (let i = 0; i + 4 <= miniFatBytes.length; i += 4) miniFat.push(mdv.getInt32(i, true));
  const out = new Uint8Array(wb.tam);
  let p = 0;
  for (const s of cadena(wb.ini, miniFat)) {
    if (p >= wb.tam) break;
    const n = Math.min(mss, wb.tam - p);
    out.set(mini.subarray(s * mss, s * mss + n), p);
    p += n;
  }
  return out;
}

// Lee una cadena BIFF8 que puede partirse entre registros CONTINUE
class Lector {
  private seg = 0;
  private pos = 0;
  constructor(private segs: Uint8Array[]) {}
  private actual() {
    while (this.seg < this.segs.length && this.pos >= this.segs[this.seg].length) { this.seg++; this.pos = 0; }
    return this.segs[this.seg];
  }
  u8() { const s = this.actual(); if (!s) throw new Error("fin"); return s[this.pos++]; }
  u16() { return this.u8() | (this.u8() << 8); }
  u32() { return (this.u16() | (this.u16() << 16)) >>> 0; }
  saltar(n: number) { for (let i = 0; i < n; i++) this.u8(); }
  cadena(): string {
    const n = this.u16();
    let flags = this.u8();
    const runs = flags & 0x08 ? this.u16() : 0;
    const ext = flags & 0x04 ? this.u32() : 0;
    let txt = "";
    while (txt.length < n) {
      const s = this.actual();
      if (!s) break;
      const ancho = flags & 0x01 ? 2 : 1;
      while (txt.length < n && this.pos + ancho <= s.length) {
        txt += String.fromCharCode(ancho === 2 ? s[this.pos] | (s[this.pos + 1] << 8) : s[this.pos]);
        this.pos += ancho;
      }
      if (txt.length < n) { this.seg++; this.pos = 0; if (this.seg >= this.segs.length) break; flags = this.u8(); } // el CONTINUE empieza con su propio byte de opciones
    }
    this.saltar(runs * 4 + ext);
    return txt;
  }
}

function rk(v: number): number {
  let n: number;
  if (v & 0x02) n = v >> 2;
  else {
    const b = new DataView(new ArrayBuffer(8));
    b.setUint32(4, v & 0xfffffffc, true);
    n = b.getFloat64(0, true);
  }
  return v & 0x01 ? n / 100 : n;
}

const numTxt = (n: number) => Number.isInteger(n) ? String(n) : String(n).replace(".", ",");

function cadenaSimple(d: Uint8Array, p: number, dv: DataView): string {
  const n = dv.getUint16(p, true);
  const flags = d[p + 2];
  let s = "";
  for (let i = 0; i < n; i++) s += String.fromCharCode(flags & 1 ? dv.getUint16(p + 3 + i * 2, true) : d[p + 3 + i]);
  return s;
}

/** Devuelve la primera hoja del .xls como filas de texto. */
export function leerXls(buf: ArrayBuffer): string[][] {
  const wb = leerFlujoWorkbook(new Uint8Array(buf));
  const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
  const recs: { tipo: number; datos: Uint8Array }[] = [];
  for (let p = 0; p + 4 <= wb.length;) {
    const tipo = dv.getUint16(p, true);
    const len = dv.getUint16(p + 2, true);
    recs.push({ tipo, datos: wb.subarray(p + 4, p + 4 + len) });
    p += 4 + len;
  }

  let sst: string[] = [];
  let i = 0;
  let bofs = 0;
  // Libro global: hasta el primer EOF
  for (; i < recs.length; i++) {
    const r = recs[i];
    if (r.tipo === 0x0809) bofs++;
    if (r.tipo === 0x00fc) {
      const segs = [r.datos];
      for (let j = i + 1; j < recs.length && recs[j].tipo === 0x003c; j++) segs.push(recs[j].datos);
      const l = new Lector(segs);
      l.u32();
      const unicos = l.u32();
      sst = [];
      try { for (let k = 0; k < unicos; k++) sst.push(l.cadena()); } catch { /* fin de datos */ }
    }
    if (r.tipo === 0x000a) { i++; break; }
  }
  if (!bofs) throw new Error("El archivo de ventas no tiene el formato de Excel esperado.");

  // Primera hoja
  const filas: string[][] = [];
  const poner = (f: number, c: number, v: string) => { (filas[f] ??= [])[c] = v; };
  let formulaPendiente: [number, number] | null = null;
  for (; i < recs.length; i++) {
    const { tipo, datos: d } = recs[i];
    const r = new DataView(d.buffer, d.byteOffset, d.byteLength);
    if (tipo === 0x000a) break;
    if (d.length < 6 && tipo !== 0x0207) continue;
    switch (tipo) {
      case 0x00fd: poner(r.getUint16(0, true), r.getUint16(2, true), sst[r.getUint32(6, true)] ?? ""); break;
      case 0x0203: poner(r.getUint16(0, true), r.getUint16(2, true), numTxt(r.getFloat64(6, true))); break;
      case 0x027e: poner(r.getUint16(0, true), r.getUint16(2, true), numTxt(rk(r.getUint32(6, true)))); break;
      case 0x00bd: {
        const f = r.getUint16(0, true);
        const c0 = r.getUint16(2, true);
        const n = (d.length - 6) / 6;
        for (let k = 0; k < n; k++) poner(f, c0 + k, numTxt(rk(r.getUint32(4 + k * 6 + 2, true))));
        break;
      }
      case 0x0204: poner(r.getUint16(0, true), r.getUint16(2, true), cadenaSimple(d, 6, r)); break;
      case 0x0006: {
        const f = r.getUint16(0, true), c = r.getUint16(2, true);
        if (r.getUint16(12, true) === 0xffff) { if (d[6] === 0) formulaPendiente = [f, c]; }
        else poner(f, c, numTxt(r.getFloat64(6, true)));
        break;
      }
      case 0x0207: if (formulaPendiente) { poner(formulaPendiente[0], formulaPendiente[1], cadenaSimple(d, 0, r)); formulaPendiente = null; } break;
    }
  }
  return Array.from(filas, f => Array.from(f ?? [], v => v ?? ""));
}
