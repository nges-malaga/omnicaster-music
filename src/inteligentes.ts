// Listas inteligentes: las mismas que el panel de OmniCaster Cloud. Son listas normales cuya pertenencia
// mantiene la nube cada pocos minutos según unas reglas; Studio las usa en el AutoDJ y en los eventos.
// Verlas: operario. Crearlas o cambiarlas: administrador.
import { oc } from './oc'

export type Campo =
  | 'genre' | 'mood' | 'language' | 'mediaType' | 'artist' | 'title' | 'album'
  | 'tags' | 'themes' | 'blocks'
  | 'energy' | 'durationSecs' | 'year' | 'popularity' | 'addedDays'

export type Op = 'is' | 'isnot' | 'contains' | 'notcontains' | 'has' | 'hasnot' | 'gte' | 'lte' | 'between' | 'empty' | 'notempty'
export type Orden = 'popularity' | 'added_desc' | 'added_asc' | 'energy_desc' | 'energy_asc' | 'title' | 'random'
type Tipo = 'texto' | 'lista' | 'numero'

export interface Regla { field: Campo; op: Op; value?: string | number | [number, number] }
export interface Reglas { match: 'all' | 'any'; rules: Regla[]; sort: Orden; limit: number }

export const CAMPOS: Record<Campo, { tipo: Tipo; nombre: string }> = {
  genre: { tipo: 'texto', nombre: 'Género' },
  mood: { tipo: 'texto', nombre: 'Ánimo' },
  language: { tipo: 'texto', nombre: 'Idioma' },
  mediaType: { tipo: 'texto', nombre: 'Tipo de medio' },
  artist: { tipo: 'texto', nombre: 'Artista' },
  title: { tipo: 'texto', nombre: 'Título' },
  album: { tipo: 'texto', nombre: 'Álbum' },
  tags: { tipo: 'lista', nombre: 'Etiquetas' },
  themes: { tipo: 'lista', nombre: 'Temas' },
  blocks: { tipo: 'lista', nombre: 'Está en la lista' },
  energy: { tipo: 'numero', nombre: 'Energía (1–5)' },
  durationSecs: { tipo: 'numero', nombre: 'Duración (s)' },
  year: { tipo: 'numero', nombre: 'Año' },
  popularity: { tipo: 'numero', nombre: 'Popularidad (0–100)' },
  addedDays: { tipo: 'numero', nombre: 'Días desde el alta' },
}

export const OPS: Record<Tipo, Op[]> = {
  texto: ['is', 'isnot', 'contains', 'notcontains', 'empty', 'notempty'],
  lista: ['has', 'hasnot', 'empty', 'notempty'],
  numero: ['is', 'gte', 'lte', 'between', 'empty', 'notempty'],
}

export const NOMBRE_OP: Record<Op, string> = {
  is: 'es', isnot: 'no es', contains: 'contiene', notcontains: 'no contiene', has: 'incluye', hasnot: 'no incluye',
  gte: '≥', lte: '≤', between: 'entre', empty: 'vacío', notempty: 'con dato',
}

export const NOMBRE_ORDEN: Record<Orden, string> = {
  popularity: 'Más populares', added_desc: 'Más recientes', added_asc: 'Más antiguas',
  energy_desc: 'Más energía', energy_asc: 'Menos energía', title: 'Por título', random: 'Al azar (cambia cada día)',
}

export const sinValor = (op: Op) => op === 'empty' || op === 'notempty'

/** Regla nueva para un campo: la primera condición que admite y sin valor. */
export function reglaNueva(field: Campo): Regla {
  return { field, op: OPS[CAMPOS[field].tipo][0] }
}

/** Al cambiar de campo, se conserva la condición si vale para el nuevo; el valor se vacía. */
export function cambiarCampo(r: Regla, field: Campo): Regla {
  const ops = OPS[CAMPOS[field].tipo]
  return { field, op: ops.includes(r.op) ? r.op : ops[0] }
}

/** Motivo por el que aún no se puede guardar (o null si está bien). Lo mismo que comprueba la nube. */
export function problema(nombre: string, r: Reglas): string | null {
  if (!nombre.trim()) return 'Falta el nombre de la lista.'
  if (!r.rules.length) return 'Añade al menos una regla.'
  for (const [i, x] of r.rules.entries()) {
    if (sinValor(x.op)) continue
    if (x.op === 'between') {
      const v = Array.isArray(x.value) ? x.value : []
      if (v.length !== 2 || !v.every((n) => Number.isFinite(Number(n)))) return `Regla ${i + 1}: «entre» necesita dos números.`
      continue
    }
    const numerico = CAMPOS[x.field].tipo === 'numero'
    if (numerico ? !Number.isFinite(Number(x.value)) || x.value === '' || x.value === undefined : !String(x.value ?? '').trim() && x.field !== 'mediaType') {
      return `Regla ${i + 1}: falta el valor.`
    }
  }
  return null
}

/** Quita los valores que no aplican (vacío / con dato) y pasa los números a número. */
export function limpiar(r: Reglas): Reglas {
  return {
    ...r,
    rules: r.rules.map((x) => {
      if (sinValor(x.op)) return { field: x.field, op: x.op }
      if (x.op === 'between') return { ...x, value: (x.value as [number, number]).map(Number) as [number, number] }
      if (CAMPOS[x.field].tipo === 'numero') return { ...x, value: Number(x.value) }
      return { ...x, value: String(x.value ?? '').trim() }
    }),
  }
}

export interface ListaInteligente { id: string; name: string; rules: Reglas; summary: string; count: number; updatedAt: number; runAt: number; by: string }
export interface OpcionesInteligentes {
  genre: string[]; mood: string[]; language: string[]; artist: string[]; mediaType: string[]; tags: string[]; themes: string[]
  blocks: { id: string; name: string }[]
}

/** Id de Subsonic («bl-…») de una lista inteligente. */
export const idSubsonic = (id: string) => (id.startsWith('bl-') ? id : `bl-${id}`)

export async function listasInteligentes(): Promise<{ listas: ListaInteligente[]; opciones: OpcionesInteligentes }> {
  const b = await oc('ocGetSmartLists')
  const o = (b.options ?? {}) as Partial<OpcionesInteligentes>
  return {
    listas: (b.lists ?? []) as ListaInteligente[],
    opciones: {
      genre: o.genre ?? [], mood: o.mood ?? [], language: o.language ?? [], artist: o.artist ?? [], mediaType: o.mediaType ?? [],
      tags: o.tags ?? [], themes: o.themes ?? [], blocks: o.blocks ?? [],
    },
  }
}

export interface Vista { total: number; summary: string; sample: { id: string; title: string; artist: string; energy: number; popularity: number | null; addedAt: number }[] }

export const previsualizar = async (rules: Reglas, id = ''): Promise<Vista> => (await oc('ocPreviewSmartList', {}, { rules, id })) as Vista

/** Crea o cambia una lista inteligente. Devuelve el id de Subsonic de la lista. */
export async function guardarInteligente(datos: { id?: string; name: string; rules: Reglas }): Promise<string> {
  const b = await oc('ocSaveSmartList', {}, datos)
  return idSubsonic(String(b.id ?? ''))
}

/** Deja de mantenerla: la lista se queda como una lista normal, con las canciones que tenga. */
export async function dejarDeMantener(id: string): Promise<void> {
  await oc('ocStopSmartList', { id })
}
