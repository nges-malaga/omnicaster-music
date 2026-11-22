// Portada propia de una lista en la nube: regenerarla con IA, ponerla (imagen subida) o quitarla.
// Subir la imagen: backend.subirImagen (solo escritorio) y recorte a cuadrado en recortarImagen.
import { backend } from './backend'
import { ErrorOc, oc } from './oc'

export const noDisponible = (e: unknown) => e instanceof ErrorOc && /M[eé]todo no (disponible|implementado)/i.test(e.message)

export interface Soporte { subir: boolean; regenerar: boolean }
let cache: Promise<Soporte> | null = null

/**
 * Qué operaciones tiene la nube. Se pregunta sin cambiar nada: con una lista que no existe, una operación
 * conocida responde «la lista no existe» y una desconocida, «Método no disponible».
 */
export function soportePortadas(): Promise<Soporte> {
  if (cache) return cache
  const existe = (metodo: string) => oc(metodo, { id: 'bl-00000000000000000000000000000000' }).then(() => true, (e) => !noDisponible(e))
  cache = Promise.all([existe('ocSetListCover'), existe('ocRegenerateListCover'), existe('ocRegenerateSmartCover')])
    .then(([poner, regenerarLista, regenerarSmart]) => ({ subir: poner, regenerar: regenerarLista || regenerarSmart }))
  return cache
}
export const olvidarSoportePortadas = () => { cache = null }

/** Genera otra portada con IA (puede tardar unos segundos). Devuelve el nuevo coverArt. */
export async function regenerarPortada(listaId: string): Promise<string | null> {
  let r
  try { r = await oc('ocRegenerateListCover', { id: listaId }) } catch (e) {
    if (!noDisponible(e)) throw e
    r = await oc('ocRegenerateSmartCover', { id: listaId })
  }
  return r.coverArt ? String(r.coverArt) : null
}

/** Quita la portada propia: la lista vuelve a mostrar la carátula de su primera canción. */
export async function quitarPortada(listaId: string): Promise<void> {
  await oc('ocSetListCover', { id: listaId }, { id: listaId, hash: '', cover: '' })
}

/** Pone de portada una imagen ya subida (por su huella). Devuelve el nuevo coverArt. */
export async function ponerPortada(listaId: string, hash: string): Promise<string | null> {
  const r = await oc('ocSetListCover', { id: listaId }, { id: listaId, hash, cover: `media:${hash}.jpg` })
  return r.coverArt ? String(r.coverArt) : null
}

const LADO_MAX = 1024

/** Recorte centrado a cuadrado, como mucho 1024×1024, en JPG (lo hace el propio navegador de la aplicación). */
export async function recortarImagen(archivo: File): Promise<number[]> {
  const img = await createImageBitmap(archivo)
  const lado = Math.min(img.width, img.height)
  const salida = Math.min(lado, LADO_MAX)
  const lienzo = document.createElement('canvas')
  lienzo.width = lienzo.height = salida
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar la imagen.')
  ctx.drawImage(img, Math.floor((img.width - lado) / 2), Math.floor((img.height - lado) / 2), lado, lado, 0, 0, salida, salida)
  const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.85))
  if (!blob) throw new Error('No se pudo convertir la imagen a JPG.')
  return Array.from(new Uint8Array(await blob.arrayBuffer()))
}

/** Sube la imagen (recortada) y la pone de portada de la lista. Devuelve el nuevo coverArt. */
export async function subirPortada(listaId: string, archivo: File): Promise<string | null> {
  const hash = await backend.subirImagen(await recortarImagen(archivo))
  return ponerPortada(listaId, hash)
}

