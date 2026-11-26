// Gestión de la biblioteca desde OmniCaster Music: permisos, metadatos, listas, subida.
// NO existe ninguna operación que borre canciones: lo máximo es desactivar o mandar a revisión.
// Los permisos los comprueba el servidor en cada llamada; aquí solo se oculta lo que no se puede usar.
import { backend } from './backend'
import { leerEnlaces, type Enlaces } from './enlaces'
import type { Cancion, Rol } from './types'

export class ErrorOc extends Error {
  constructor(mensaje: string, public codigo = 0, public confirmar?: number) { super(mensaje) }
}

type Params = Record<string, string | number | (string | number)[] | undefined>

/** Llama a un método oc* y lanza ErrorOc si el servidor lo rechaza. */
export async function oc(metodo: string, params: Params = {}, cuerpo?: unknown): Promise<any> {
  const pares: [string, string][] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    for (const x of Array.isArray(v) ? v : [v]) pares.push([k, String(x)])
  }
  const b = await backend.llamarOc(metodo, pares, cuerpo)
  if (b?.status === 'failed') throw new ErrorOc(b.error?.message ?? 'El servidor ha rechazado la petición.', b.error?.code ?? 0, b.error?.confirmRequired)
  return b
}

export const puede = (rol: Rol, nivel: Rol) => ({ listener: 0, operator: 1, admin: 2 })[rol] >= ({ listener: 0, operator: 1, admin: 2 })[nivel]
export const ETIQUETA_ROL: Record<Rol, string> = { listener: 'Oyente', operator: 'Operario', admin: 'Administrador' }

/** Límite a partir del cual un cambio masivo pide confirmación explícita. */
export const LIMITE_MASIVO = 10

const num = (v: unknown) => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) ? null : n }

/** Ficha completa de una canción (la biblioteca guardada en el equipo no lleva los datos de edición). */
export interface Ficha {
  id: string; titulo: string; artista: string; album: string; artistaAlbum: string; anio: string; genero: string; idioma: string
  etiquetas: string[]; tipoMedio: string; energia: number; mood: string; temas: string[]; desactivada: boolean
  duracion: number; formato: string
  /** Enlaces a plataformas de streaming (ocLinks) */
  enlaces: Enlaces
}

export function aFicha(s: any): Ficha {
  const lista = (v: unknown) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  return {
    id: String(s.id), titulo: s.title ?? '', artista: s.artist ?? '', album: s.album ?? '', artistaAlbum: s.albumArtist ?? '',
    anio: s.year ? String(s.year) : '', genero: s.genre ?? '', idioma: s.language ?? '', etiquetas: lista(s.tags), tipoMedio: s.ocMediaType ?? '',
    energia: Math.max(0, Math.min(5, Math.round(num(s.energy) ?? 0))), mood: s.mood ?? '', temas: lista(s.themes), desactivada: !!s.ocDisabled,
    duracion: num(s.duration) ?? 0, formato: s.suffix ?? '', enlaces: leerEnlaces(s.ocLinks),
  }
}

export async function cargarFicha(id: string): Promise<Ficha> {
  const b = await oc('getSong', { id })
  return aFicha(b.song)
}

/** Energía como ●●●○○ (0 = sin dato). */
/**
 * Orden de una lista: el suyo, o por fecha de alta en la biblioteca. Las que no tienen fecha (o la de 1970)
 * van al final y, entre iguales, se respeta el orden de la lista.
 */
export type OrdenLista = 'lista' | 'recientes' | 'antiguas'
export function ordenarPorAlta<T extends { alta?: string | null }>(canciones: T[], orden: OrdenLista): T[] {
  if (orden === 'lista') return canciones
  const t = (c: T) => { const ms = c.alta ? Date.parse(c.alta) : NaN; return Number.isFinite(ms) && ms > 86_400_000 ? ms : 0 }
  const dir = orden === 'recientes' ? -1 : 1
  return canciones.map((c, i) => ({ c, i, t: t(c) }))
    .sort((a, b) => (!a.t !== !b.t ? (a.t ? -1 : 1) : (a.t - b.t) * dir || a.i - b.i))
    .map((x) => x.c)
}

export const energiaPuntos = (n: number) => (n > 0 ? '●'.repeat(n) + '○'.repeat(5 - n) : '—')

export function aCancion(s: any): Cancion {
  return {
    id: String(s.id), titulo: s.title || 'Sin título', artista: s.artist || 'Artista desconocido', artistaId: s.artistId ? String(s.artistId) : null,
    album: s.album || 'Álbum desconocido', albumId: s.albumId ? String(s.albumId) : null, pista: num(s.track), disco: num(s.discNumber),
    anio: num(s.year), genero: s.genre ?? null, duracion: num(s.duration) ?? 0, caratula: s.coverArt ? String(s.coverArt) : null,
    formato: s.suffix ?? null, gananciaDb: null, alta: s.created ?? null, tipoMedio: s.ocMediaType ?? '',
  }
}

export async function rolDelUsuario(usuario: string): Promise<Rol> {
  try {
    const b = await oc('getUser', { username: usuario })
    const r = b.user?.ocRole
    return r === 'admin' || r === 'operator' ? r : 'listener'
  } catch { return 'listener' }
}

// ---------------------------------------------------------------- otros medios (jingles, cuñas, programas…)
// No son música: no salen en la biblioteca y cada tipo tiene su apartado, como en el estudio. Sí salen en
// las listas y en la búsqueda, con su tipo delante del artista.

/** Tipo de medio del estudio. La música es el tipo vacío. */
export interface TipoMedio { id: string; label: string; inMusic: boolean }

/** Los de serie del estudio, por si el servidor aún no tiene ocGetMediaTypes. */
export const TIPOS_MEDIO_SERIE: TipoMedio[] = [
  { id: '', label: 'Música', inMusic: true },
  { id: 'jingle', label: 'Jingle', inMusic: false },
  { id: 'program', label: 'Programa', inMusic: false },
  { id: 'podcast', label: 'Podcast', inMusic: false },
  { id: 'commercial', label: 'Cuña', inMusic: false },
]

/** Tipos para el desplegable de la ficha: los de serie más los que use alguna canción de la emisora. */
export async function tiposDeMedio(): Promise<TipoMedio[]> {
  try {
    const l = ((await oc('ocGetMediaTypes')).mediaType ?? []) as TipoMedio[]
    return l.length ? l : TIPOS_MEDIO_SERIE
  } catch { return TIPOS_MEDIO_SERIE }
}

/** Nombre a mostrar de un tipo («music» o vacío = Música; uno desconocido, su propio id). */
export function nombreTipoMedio(id: string, tipos: TipoMedio[] = TIPOS_MEDIO_SERIE): string {
  const k = id === 'music' ? '' : id
  return tipos.find((t) => t.id === k)?.label ?? TIPOS_MEDIO_SERIE.find((t) => t.id === k)?.label ?? k
}

/** ¿Es algo que no es música (jingle, cuña, programa…)? */
export const esOtroMedio = (c: Pick<Cancion, 'tipoMedio'>) => !!c.tipoMedio && c.tipoMedio !== 'music'

/** Apartado de otros medios con algo dentro. */
export interface ApartadoMedio { id: string; label: string; count: number; duration: number }

const PLURAL: Record<string, string> = { jingle: 'Jingles', program: 'Programas', podcast: 'Podcasts', commercial: 'Cuñas' }
export const nombreApartado = (a: { id: string; label: string }) => PLURAL[a.id] ?? a.label
export const ICONO_APARTADO: Record<string, string> = { jingle: 'megaphone', program: 'mic', podcast: 'radio', commercial: 'tag' }

export async function apartadosDeMedios(): Promise<ApartadoMedio[]> {
  try { return ((await oc('ocGetMediaSections')).section ?? []) as ApartadoMedio[] } catch { return [] }
}

export async function cancionesDeMedio(tipo: string): Promise<Cancion[]> {
  return ((await oc('ocGetMediaSongs', { type: tipo })).song ?? []).map(aCancion)
}
