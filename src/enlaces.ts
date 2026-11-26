// Enlaces de una canción a plataformas de streaming (atributo Subsonic `ocLinks`).
// La validación replica la de OmniCaster Cloud (src/enlaces.ts) para avisar antes de enviar;
// la nube vuelve a validar y es quien decide.
import { ErrorOc, oc } from './oc'
import { noDisponible } from './portadas'

export const PLATAFORMAS = ['spotify', 'appleMusic', 'youtube', 'youtubeMusic', 'tidal', 'amazonMusic'] as const
export type Plataforma = (typeof PLATAFORMAS)[number]
export type Enlaces = Partial<Record<Plataforma, string>>

export const NOMBRE_PLATAFORMA: Record<Plataforma, string> = {
  spotify: 'Spotify', appleMusic: 'Apple Music', youtube: 'YouTube', youtubeMusic: 'YouTube Music', tidal: 'TIDAL', amazonMusic: 'Amazon Music',
}
/** Abreviatura del distintivo (no se usan logotipos de las marcas). */
export const SIGLA_PLATAFORMA: Record<Plataforma, string> = {
  spotify: 'SP', appleMusic: 'AM', youtube: 'YT', youtubeMusic: 'YM', tidal: 'TI', amazonMusic: 'AZ',
}
export const EJEMPLO_PLATAFORMA: Record<Plataforma, string> = {
  spotify: 'https://open.spotify.com/track/…', appleMusic: 'https://music.apple.com/es/album/…?i=…', youtube: 'https://www.youtube.com/watch?v=…',
  youtubeMusic: 'https://music.youtube.com/watch?v=…', tidal: 'https://tidal.com/browse/track/…', amazonMusic: 'https://music.amazon.es/…',
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/

/** URL normalizada si es de esa plataforma; null si no lo es. */
export function normalizarEnlace(p: Plataforma, url: string): string | null {
  let u: URL
  try { u = new URL(url.trim()) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase()
  const path = u.pathname
  switch (p) {
    case 'spotify': {
      const m = host === 'open.spotify.com' && path.match(/^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?track\/([A-Za-z0-9]{22})\/?$/i)
      return m ? `https://open.spotify.com/track/${m[1]}` : null
    }
    case 'appleMusic': {
      if (host !== 'music.apple.com' && host !== 'geo.music.apple.com') return null
      if (!/^\/[a-z]{2}\/(album|song)\/[^/]*\/?\d*\/?$/i.test(path) && !/^\/[a-z]{2}\/(album|song)\/\d+\/?$/i.test(path)) return null
      const out = new URL(`https://music.apple.com${path}`)
      const i = u.searchParams.get('i')
      if (i && /^\d+$/.test(i)) out.searchParams.set('i', i)
      return out.toString()
    }
    case 'youtube': {
      let id = ''
      if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') id = path === '/watch' ? u.searchParams.get('v') ?? '' : ''
      else if (host === 'youtu.be') id = path.slice(1)
      return YT_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : null
    }
    case 'youtubeMusic': {
      const id = host === 'music.youtube.com' && path === '/watch' ? u.searchParams.get('v') ?? '' : ''
      return YT_ID.test(id) ? `https://music.youtube.com/watch?v=${id}` : null
    }
    case 'tidal': {
      const m = (host === 'tidal.com' || host.endsWith('.tidal.com')) && path.match(/^\/(?:[a-z-]+\/)*track\/(\d+)\/?(?:u\/?)?$/i)
      return m ? `https://tidal.com/browse/track/${m[1]}` : null
    }
    case 'amazonMusic': {
      if (!/^music\.amazon\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(host) || path.length < 2) return null
      u.protocol = 'https:'
      u.hash = ''
      return u.toString()
    }
  }
}

/** `ocLinks` tal como llega (objeto o texto JSON); solo se quedan las URL válidas. */
export function leerEnlaces(v: unknown): Enlaces {
  let o: unknown = v
  if (typeof v === 'string') { try { o = JSON.parse(v) } catch { return {} } }
  if (!o || typeof o !== 'object') return {}
  const r: Enlaces = {}
  for (const p of PLATAFORMAS) {
    const url = (o as Record<string, unknown>)[p]
    if (typeof url === 'string' && url) {
      const n = normalizarEnlace(p, url)
      if (n) r[p] = n
    }
  }
  return r
}

// ---- qué sabe hacer la nube (se pregunta sin cambiar nada)

let soporte: Promise<boolean> | null = null
/** true si la nube tiene ocSetSongLinks y ocFindSongLinks. Con una canción que no existe: «no encontrada» = existe. */
export function soporteEditarEnlaces(): Promise<boolean> {
  if (soporte) return soporte
  const existe = (m: string) => oc(m, {}, { id: 'tr-sonda-inexistente' }).then(() => true, (e) => !noDisponible(e) && !(e instanceof ErrorOc && e.codigo === 50))
  soporte = Promise.all([existe('ocSetSongLinks'), existe('ocFindSongLinks')]).then(([a, b]) => a && b)
  return soporte
}
export const olvidarSoporteEnlaces = () => { soporte = null }

/** Pone los enlaces indicados; "" quita el de esa plataforma. Las que no se pasan se quedan como están. */
export async function guardarEnlaces(id: string, cambios: Partial<Record<Plataforma, string>>): Promise<Enlaces> {
  const r = await oc('ocSetSongLinks', {}, { id, links: cambios })
  return leerEnlaces(r.links)
}

/** Busca los que faltan (nunca pisa los que hay). */
export async function buscarEnlaces(id: string): Promise<{ encontrados: Plataforma[]; enlaces: Enlaces }> {
  const r = await oc('ocFindSongLinks', {}, { id })
  return { encontrados: (r.found ?? []).filter((p: string) => (PLATAFORMAS as readonly string[]).includes(p)), enlaces: leerEnlaces(r.links) }
}
