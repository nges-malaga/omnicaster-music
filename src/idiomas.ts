// Idiomas de las canciones, igual que en el estudio (radio-automation-software, src/languages.ts):
// se guarda el código ISO 639 y se muestra con su nombre y bandera.
export interface Idioma { codigo: string; nombre: string; bandera: string }

export const CATALOGO_IDIOMAS: Idioma[] = [
  { codigo: 'es', nombre: 'Español', bandera: '🇪🇸' },
  { codigo: 'en', nombre: 'Inglés', bandera: '🇬🇧' },
  { codigo: 'pt', nombre: 'Portugués', bandera: '🇵🇹' },
  { codigo: 'de', nombre: 'Alemán', bandera: '🇩🇪' },
  { codigo: 'fr', nombre: 'Francés', bandera: '🇫🇷' },
  { codigo: 'it', nombre: 'Italiano', bandera: '🇮🇹' },
  { codigo: 'ca', nombre: 'Catalán', bandera: '🇦🇩' },
  { codigo: 'gl', nombre: 'Gallego', bandera: '🇪🇸' },
  { codigo: 'eu', nombre: 'Euskera', bandera: '🇪🇸' },
  { codigo: 'nl', nombre: 'Neerlandés', bandera: '🇳🇱' },
  { codigo: 'sv', nombre: 'Sueco', bandera: '🇸🇪' },
  { codigo: 'no', nombre: 'Noruego', bandera: '🇳🇴' },
  { codigo: 'da', nombre: 'Danés', bandera: '🇩🇰' },
  { codigo: 'fi', nombre: 'Finés', bandera: '🇫🇮' },
  { codigo: 'pl', nombre: 'Polaco', bandera: '🇵🇱' },
  { codigo: 'ru', nombre: 'Ruso', bandera: '🇷🇺' },
  { codigo: 'uk', nombre: 'Ucraniano', bandera: '🇺🇦' },
  { codigo: 'el', nombre: 'Griego', bandera: '🇬🇷' },
  { codigo: 'tr', nombre: 'Turco', bandera: '🇹🇷' },
  { codigo: 'ro', nombre: 'Rumano', bandera: '🇷🇴' },
  { codigo: 'ja', nombre: 'Japonés', bandera: '🇯🇵' },
  { codigo: 'ko', nombre: 'Coreano', bandera: '🇰🇷' },
  { codigo: 'zh', nombre: 'Chino', bandera: '🇨🇳' },
  { codigo: 'ar', nombre: 'Árabe', bandera: '🇸🇦' },
  { codigo: 'he', nombre: 'Hebreo', bandera: '🇮🇱' },
  { codigo: 'hi', nombre: 'Hindi', bandera: '🇮🇳' },
  { codigo: 'la', nombre: 'Latín', bandera: '🇻🇦' },
]

/** Los que el estudio ofrece de serie. */
export const IDIOMAS_SERIE = ['es', 'en', 'pt', 'de', 'fr']

/** «🇪🇸 Español»; vacío = «Sin indicar»; un código desconocido, en mayúsculas. */
export function nombreIdioma(codigo: string): string {
  const c = codigo.trim().toLowerCase()
  if (!c) return 'Sin indicar'
  const i = CATALOGO_IDIOMAS.find((x) => x.codigo === c)
  return i ? `${i.bandera} ${i.nombre}` : c.toUpperCase()
}

/** Opciones del desplegable: sin indicar, los de serie y, si la canción tiene otro, también ese. */
export function opcionesIdioma(actual: string): { id: string; label: string }[] {
  const c = actual.trim().toLowerCase()
  const codigos = [...new Set(['', ...IDIOMAS_SERIE, ...(c ? [c] : [])])]
  return codigos.map((id) => ({ id, label: nombreIdioma(id) }))
}
