// Servidor Subsonic falso para desarrollo y pruebas. 50 canciones, audio de tono generado en código.
// Credenciales de ejemplo (no reales): usuario «demo», contraseña «demo».
import http from 'node:http'
import crypto from 'node:crypto'
import zlib from 'node:zlib'

const PORT = Number(process.env.PORT || 4533)
const USER = 'demo'
const PASS = 'demo'

const generos = ['Pop', 'Rock', 'Jazz', 'Electrónica', 'Clásica']
const artistasN = ['Aurora Norte', 'Los Faroles', 'Marea Baja', 'Cobalto', 'Violeta Roja']
const palabras = ['Luz', 'Noche', 'Camino', 'Mar', 'Fuego', 'Sueño', 'Ciudad', 'Viento', 'Sombra', 'Tierra']

const artistas = artistasN.map((nombre, i) => ({ id: `ar-${i + 1}`, name: nombre, albumCount: 2 }))
const albumes = []
const canciones = []
for (let a = 0; a < 10; a++) {
  const artista = artistas[a % 5]
  const album = {
    id: `al-${a + 1}`,
    name: `${palabras[a]} ${['I', 'II', 'Live', 'Acústico'][a % 4]}`,
    artist: artista.name,
    artistId: artista.id,
    genre: generos[a % 5],
    coverArt: `al-${a + 1}`,
    created: new Date(Date.UTC(2026, 0, 1 + a * 20)).toISOString(),
    songCount: 5,
    duration: 0,
  }
  if (a !== 3) album.year = 2005 + a * 2 // el álbum 4 no trae año
  for (let t = 0; t < 5; t++) {
    const n = a * 5 + t
    const s = {
      id: `s-${n + 1}`,
      title: `${palabras[(n + 3) % 10]} ${palabras[(n * 7) % 10].toLowerCase()}`,
      album: album.name,
      albumId: album.id,
      artist: artista.name,
      artistId: artista.id,
      genre: album.genre,
      duration: 20 + (n % 5) * 4,
      suffix: 'wav',
      contentType: 'audio/wav',
      coverArt: album.coverArt,
      track: t + 1,
      year: album.year,
      size: 0,
    }
    // Para probar robustez: algunas canciones sin pista, año ni carátula.
    if (n % 9 === 4) delete s.track
    if (n % 11 === 7) delete s.year
    if (n % 13 === 12) delete s.coverArt
    album.duration += s.duration
    canciones.push(s)
  }
  albumes.push(album)
}
// Otros medios (no son música): no salen en la biblioteca; cada tipo tiene su apartado y salen en las listas.
const otros = [
  ['o-1', 'Indicativo mañana', 'jingle'], ['o-2', 'Indicativo noche', 'jingle'], ['o-3', 'Ráfaga deportes', 'jingle'],
  ['o-4', 'Cuña Panadería La Espiga', 'commercial'], ['o-5', 'Cuña Taller Ruiz', 'commercial'],
  ['o-6', 'Programa: Buenos días', 'program'],
].map(([id, title, mediaType], n) => ({
  id, title, mediaType, artist: 'NG Radio', artistId: 'ar-ng', album: 'Continuidad', albumId: 'al-ng', genre: undefined,
  duration: 10 + n * 3, suffix: 'wav', contentType: 'audio/wav', size: 0,
}))
const porId = Object.fromEntries([...canciones, ...otros].map((c) => [c.id, c]))
const estrellas = new Set(['s-2'])

// ---- audio: tono senoidal WAV 16 bits mono 22050 Hz
const wavCache = new Map()
function wav(id) {
  if (wavCache.has(id)) return wavCache.get(id)
  const s = porId[id]
  const sr = 22050
  const n = sr * s.duration
  const f = 220 * Math.pow(2, (Number(id.slice(2)) % 12) / 12)
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / 500, (n - i) / 500)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * f * i) / sr) * 9000 * env), i * 2)
  }
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22)
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(data.length, 40)
  const b = Buffer.concat([h, data])
  s.size = b.length
  wavCache.set(id, b)
  return b
}
canciones.forEach((c) => wav(c.id))
otros.forEach((c) => wav(c.id))

// ---- carátulas: PNG degradado
function crc32(buf) {
  let c, crc = ~0
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return ~crc >>> 0
}
function chunk(tipo, datos) {
  const l = Buffer.alloc(4); l.writeUInt32LE(0); l.writeUInt32BE(datos.length)
  const t = Buffer.from(tipo)
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, datos])))
  return Buffer.concat([l, t, datos, c])
}
function png(seed, tam = 120) {
  const filas = []
  const h1 = (seed * 47) % 360
  for (let y = 0; y < tam; y++) {
    const fila = Buffer.alloc(1 + tam * 3)
    for (let x = 0; x < tam; x++) {
      const t = (x + y) / (2 * tam)
      const hue = (h1 + t * 60) % 360
      const [r, g, b] = hsl(hue, 0.6, 0.35 + 0.25 * (1 - t))
      fila[1 + x * 3] = r; fila[2 + x * 3] = g; fila[3 + x * 3] = b
    }
    filas.push(fila)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(tam, 0); ihdr.writeUInt32BE(tam, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(filas))), chunk('IEND', Buffer.alloc(0)),
  ])
}
function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l)
  const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))) }
  return [f(0), f(8), f(4)]
}

// ---- respuestas
const resp = (extra = {}) => ({ 'subsonic-response': { status: 'ok', version: '1.16.1', type: 'mock', serverVersion: '0.1', openSubsonic: true, ...extra } })
const fallo = (code, message) => ({ 'subsonic-response': { status: 'failed', version: '1.16.1', error: { code, message } } })
const cancionOut = (s) => ({ ...s, isDir: false, type: 'music', ...(s.mediaType ? { ocMediaType: s.mediaType } : {}), ...(estrellas.has(s.id) ? { starred: '2026-01-01T00:00:00Z' } : {}) })
const albumOut = (a) => ({ id: a.id, name: a.name, artist: a.artist, artistId: a.artistId, year: a.year, genre: a.genre, coverArt: a.coverArt, songCount: a.songCount, duration: a.duration, created: a.created })

// Usuarios de prueba: demo (oyente), operario y admin. Contraseña: demo
const ROLES = { demo: 'listener', operario: 'operator', admin: 'admin' }
function autenticado(q) {
  if (!(q.get('u') in ROLES)) return false
  if (q.get('t') && q.get('s')) return q.get('t') === crypto.createHash('md5').update(PASS + q.get('s')).digest('hex')
  return q.get('p') === PASS
}

function pagina(lista, q, tam = 'size', off = 'offset') {
  const o = Number(q.get(off) || 0), n = Math.min(Number(q.get(tam) || 10), 500)
  return lista.slice(o, o + n)
}

const desactivadas = new Set()
const revision = new Set()
const extras = {} // datos de edición por canción
const cambios = [] // registro de ediciones
const listas = [
  { id: 'bl-1', nombre: 'Favoritas de la casa', ids: ['s-1', 's-2', 's-3', 'o-1'], air: false },
  { id: 'pl-1', nombre: 'Emisión · Mezcla de ejemplo', ids: ['s-4', 's-5', 's-6'], air: true },
]
const inteligentes = new Map() // listas inteligentes por id (sin «bl-»)
const medios = new Set() // huellas de imágenes subidas
// Enlaces a plataformas por canción (todas empiezan con Spotify y YouTube)
const ENLACES_INICIALES = { spotify: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', youtube: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
const enlaces = {}
const enlacesDe = (id) => (enlaces[id] ??= { ...ENLACES_INICIALES })
const fichaOut = (s) => ({ ...cancionOut(s), ocLinks: enlacesDe(s.id), energy: 3, mood: 'alegre', themes: 'verano, playa', language: 'es', tags: revision.has(s.id) ? 'revisar' : undefined, ocDisabled: desactivadas.has(s.id) || undefined, ...(extras[s.id] ?? {}) })
const ROL_MIN = {
  ocEditSongs: 1, ocSetDisabled: 2, ocListSongs: 1, ocHistory: 1, ocUndo: 1, createPlaylist: 1, updatePlaylist: 1, deletePlaylist: 2,
  ocGetMediaTypes: 1, ocGetSmartLists: 1, ocPreviewSmartList: 2, ocSaveSmartList: 2, ocStopSmartList: 2, ocSetListCover: 1, ocRegenerateSmartCover: 2, ocSetSongLinks: 1, ocFindSongLinks: 1,
}
const NIVEL = { listener: 0, operator: 1, admin: 2 }

// ---- listas inteligentes (versión reducida de la nube: texto, listas y números; orden y máximo)
const OPN = { is: 'es', isnot: 'no es', contains: 'contiene', notcontains: 'no contiene', has: 'incluye', hasnot: 'no incluye', gte: '≥', lte: '≤', between: 'entre', empty: 'vacío', notempty: 'con dato' }
const datosRegla = (c) => ({
  genre: c.genre, mood: extras[c.id]?.mood ?? 'alegre', language: extras[c.id]?.language ?? 'es', artist: c.artist, title: c.title, album: c.album,
  tags: revision.has(c.id) ? ['revisar'] : [], themes: ['verano', 'playa'], energy: extras[c.id]?.energy ?? 3, durationSecs: c.duration, year: c.year, mediaType: c.mediaType ?? '',
})
function evaluarReglas(r) {
  if (!r || !Array.isArray(r.rules) || !r.rules.length) throw new Error('Añade al menos una regla.')
  const cumple = (c, x) => {
    const v = datosRegla(c)[x.field]
    const t = (z) => String(z ?? '').toLowerCase()
    switch (x.op) {
      case 'is': return typeof v === 'number' ? v === Number(x.value) : t(v) === t(x.value)
      case 'isnot': return t(v) !== t(x.value)
      case 'contains': return t(v).includes(t(x.value))
      case 'notcontains': return !t(v).includes(t(x.value))
      case 'has': return (v ?? []).map(t).includes(t(x.value))
      case 'hasnot': return !(v ?? []).map(t).includes(t(x.value))
      case 'gte': return Number(v) >= Number(x.value)
      case 'lte': return Number(v) <= Number(x.value)
      case 'between': return Number(v) >= x.value[0] && Number(v) <= x.value[1]
      case 'empty': return Array.isArray(v) ? !v.length : !v
      case 'notempty': return Array.isArray(v) ? !!v.length : !!v
      default: return false
    }
  }
  let l = [...canciones, ...otros].filter((c) => (r.match === 'any' ? r.rules.some((x) => cumple(c, x)) : r.rules.every((x) => cumple(c, x))))
  if (r.sort === 'title') l.sort((a, b) => a.title.localeCompare(b.title, 'es'))
  if (r.limit > 0) l = l.slice(0, r.limit)
  return l.map((c) => c.id)
}
const resumenReglas = (r) => r.rules.map((x) => `${x.field} ${OPN[x.op]}${x.value !== undefined ? ' ' + x.value : ''}`).join(r.match === 'any' ? ' o ' : ' y ')
const listaOut = (l) => ({
  id: l.id, name: l.nombre, ocKind: l.air ? 'air' : 'list', songCount: l.ids.length, owner: 'OmniCaster', public: true,
  coverArt: l.portada ? `cv-${l.portada}` : porId[l.ids[0]]?.coverArt, ...(l.air ? {} : { ocCoverOwn: !!l.portada }),
})

function manejar(metodo, q, cuerpo = {}) {
  const rol = ROLES[q.get('u')]
  if (metodo in ROL_MIN && NIVEL[rol] < ROL_MIN[metodo]) return fallo(50, 'No tienes permiso para hacer esto con tu usuario.')
  switch (metodo) {
    case 'getUser': return resp({ user: { username: q.get('u'), ocRole: rol, adminRole: rol === 'admin' } })
    case 'ocEditSongs': {
      const ids = cuerpo.ids ?? []
      if (ids.length > 10 && Number(cuerpo.confirm) !== ids.length) return { 'subsonic-response': { status: 'failed', version: '1.16.1', error: { code: 0, message: 'Cambio masivo: hace falta confirmarlo', confirmRequired: ids.length } } }
      for (const id of ids) {
        const c = porId[id]
        if (!c) return fallo(70, `Canción no encontrada: ${id}`)
        const set = cuerpo.set ?? {}
        if (set.title) c.title = set.title
        if (set.artist) c.artist = set.artist
        if (set.album) c.album = set.album
        if (set.energy !== undefined) (extras[id] ??= {}).energy = set.energy
        if (set.mood !== undefined) (extras[id] ??= {}).mood = set.mood
        if (set.language !== undefined) (extras[id] ??= {}).language = set.language
        if (set.mediaType !== undefined) (extras[id] ??= {}).ocMediaType = set.mediaType
        if (cuerpo.review === true) revision.add(id)
        if (cuerpo.review === false) revision.delete(id)
        cambios.push({ n: cambios.length + 1, id, by: q.get('u') })
      }
      return resp({ changed: ids.length, unchanged: 0, batch: 'b1', song: ids.map((i) => fichaOut(porId[i])) })
    }
    case 'ocSetDisabled': {
      for (const id of cuerpo.ids ?? []) cuerpo.disabled ? desactivadas.add(id) : desactivadas.delete(id)
      return resp({ changed: (cuerpo.ids ?? []).length, unchanged: 0, batch: 'b2' })
    }
    case 'ocSetSongLinks': {
      if (!porId[cuerpo.id]) return fallo(70, 'Canción no encontrada')
      const actual = { ...enlacesDe(cuerpo.id) }
      for (const [p, url] of Object.entries(cuerpo.links ?? {})) {
        if (!url) delete actual[p]
        else if (p === 'spotify' && !/^https:\/\/open\.spotify\.com\/track\//.test(url)) return fallo(0, 'Enlaces: spotify no es un enlace de Spotify')
        else actual[p] = url
      }
      enlaces[cuerpo.id] = actual
      return resp({ id: cuerpo.id, changed: 1, links: actual })
    }
    case 'ocFindSongLinks': {
      if (!porId[cuerpo.id]) return fallo(70, 'Canción no encontrada')
      const actual = enlacesDe(cuerpo.id)
      const found = actual.tidal ? [] : ['tidal']
      enlaces[cuerpo.id] = { ...actual, tidal: actual.tidal ?? 'https://tidal.com/browse/track/12345' }
      return resp({ id: cuerpo.id, found, links: enlaces[cuerpo.id] })
    }
    case 'ocListSongs': return resp({ song: (q.get('filter') === 'disabled' ? [...desactivadas] : [...revision]).map((i) => fichaOut(porId[i])) })
    case 'ocHistory': return resp({ entry: [] })
    case 'createPlaylist': {
      const nombre = String(q.get('name') ?? '').trim()
      if (!nombre) return fallo(10, 'Falta el nombre de la lista.')
      const l = { id: `bl-${crypto.randomUUID().replace(/-/g, '')}`, nombre, ids: q.getAll('songId'), air: false }
      listas.push(l)
      return resp({ playlist: { ...listaOut(l), entry: l.ids.map((i) => cancionOut(porId[i])) } })
    }
    case 'updatePlaylist': {
      const l = listas.find((x) => x.id === q.get('playlistId') && !x.air)
      if (!l) return fallo(70, 'La lista no existe o es de solo lectura.')
      if (q.get('name')) l.nombre = q.get('name')
      for (const i of q.getAll('songIdToAdd')) if (porId[i] && !l.ids.includes(i)) l.ids.push(i)
      const quitar = q.getAll('songIndexToRemove').map(Number)
      if (quitar.length) l.ids = l.ids.filter((_, n) => !quitar.includes(n))
      return resp({ playlist: { ...listaOut(l), entry: l.ids.map((i) => cancionOut(porId[i])) } })
    }
    case 'deletePlaylist': {
      const n = listas.findIndex((x) => x.id === q.get('id') && !x.air)
      if (n < 0) return fallo(70, 'La lista no existe o es de solo lectura.')
      listas.splice(n, 1)
      return resp()
    }
    // ---- otros medios
    case 'ocGetMediaTypes': {
      const serie = [['', 'Música', true], ['jingle', 'Jingle', false], ['program', 'Programa', false], ['podcast', 'Podcast', false], ['commercial', 'Cuña', false]]
      return resp({ mediaType: serie.map(([id, label, inMusic]) => ({ id, label, inMusic })) })
    }
    case 'ocGetMediaSections': {
      const nombres = { jingle: 'Jingle', program: 'Programa', podcast: 'Podcast', commercial: 'Cuña' }
      const tipos = [...new Set(otros.map((o) => o.mediaType))]
      return resp({ section: tipos.map((id) => { const l = otros.filter((o) => o.mediaType === id); return { id, label: nombres[id] ?? id, count: l.length, duration: l.reduce((a, o) => a + o.duration, 0) } }) })
    }
    case 'ocGetMediaSongs': {
      const l = otros.filter((o) => o.mediaType === q.get('type'))
      return l.length ? resp({ song: l.map(cancionOut) }) : fallo(70, 'No encontrado')
    }
    // ---- listas inteligentes
    case 'ocGetSmartLists': {
      const top = (k) => [...new Set(canciones.map((c) => datosRegla(c)[k]).flat().filter(Boolean))].slice(0, 80)
      const propia = (x) => listas.find((l) => l.id === 'bl-' + x.id)
      return resp({
        lists: [...inteligentes.values()].filter(propia).map((x) => ({ ...x, name: propia(x).nombre, count: propia(x).ids.length })),
        options: { genre: top('genre'), mood: top('mood'), language: top('language'), artist: top('artist'), mediaType: ['jingle', 'commercial', 'program'], tags: top('tags'), themes: top('themes'), blocks: listas.filter((l) => l.id.startsWith('bl-')).map((l) => ({ id: l.id.slice(3), name: l.nombre })) },
      })
    }
    case 'ocPreviewSmartList': {
      try {
        const ids = evaluarReglas(cuerpo.rules)
        return resp({ total: ids.length, summary: resumenReglas(cuerpo.rules), sample: ids.slice(0, 25).map((id) => { const c = porId[id]; return { id, title: c.title, artist: c.artist, energy: 3, popularity: null, addedAt: 0 } }) })
      } catch (e) { return fallo(10, e.message) }
    }
    case 'ocSaveSmartList': {
      const nombre = String(cuerpo.name ?? '').trim()
      if (!nombre) return fallo(10, 'Falta el nombre de la lista.')
      let ids
      try { ids = evaluarReglas(cuerpo.rules) } catch (e) { return fallo(10, e.message) }
      let id = String(cuerpo.id ?? '').replace(/^bl-/, '')
      if (listas.some((l) => l.nombre.toLowerCase() === nombre.toLowerCase() && l.id !== 'bl-' + id)) return fallo(10, 'Ya existe una lista con ese nombre.')
      if (!id) { id = crypto.randomUUID().replace(/-/g, ''); listas.push({ id: 'bl-' + id, nombre, ids, air: false }) }
      else { const l = listas.find((x) => x.id === 'bl-' + id); if (!l) return fallo(70, 'La lista ya no existe.'); l.nombre = nombre; l.ids = ids }
      inteligentes.set(id, { id, rules: cuerpo.rules, summary: resumenReglas(cuerpo.rules), updatedAt: Date.now(), runAt: Date.now(), by: q.get('u') })
      return resp({ id })
    }
    case 'ocStopSmartList': {
      inteligentes.delete(String(q.get('id') ?? '').replace(/^bl-/, ''))
      return resp({ ok: true })
    }
    // ---- portadas de lista
    case 'ocSetListCover':
    case 'ocRegenerateSmartCover': {
      const id = String(q.get('id') ?? cuerpo.id ?? '')
      const l = listas.find((x) => x.id === id && x.id.startsWith('bl-'))
      if (!l) return fallo(70, 'La lista no existe.')
      if (metodo === 'ocRegenerateSmartCover') { l.portada = crypto.createHash('sha256').update(id + Date.now()).digest('hex'); return resp({ id, cover: `media:${l.portada}.jpg`, coverArt: `cv-${l.portada}` }) }
      const hash = String(cuerpo.hash ?? '').toLowerCase()
      if (!hash) { delete l.portada; return resp({ id, cover: '' }) }
      l.portada = hash
      return resp({ id, cover: `media:${hash}.jpg`, coverArt: `cv-${hash}` })
    }
    case 'ping': return resp()
    case 'getLicense': return resp({ license: { valid: true } })
    case 'getOpenSubsonicExtensions': return resp({ openSubsonicExtensions: [{ name: 'formPost', versions: [1] }] })
    case 'getMusicFolders': return resp({ musicFolders: { musicFolder: [{ id: 1, name: 'Música' }] } })
    case 'getIndexes':
    case 'getArtists': {
      const idx = {}
      for (const a of artistas) (idx[a.name[0]] ||= []).push(a)
      return resp({ [metodo === 'getArtists' ? 'artists' : 'indexes']: { index: Object.entries(idx).map(([name, artist]) => ({ name, artist })) } })
    }
    case 'getArtist': {
      const a = artistas.find((x) => x.id === q.get('id'))
      if (!a) return fallo(70, 'Artista no encontrado')
      return resp({ artist: { ...a, album: albumes.filter((x) => x.artistId === a.id).map(albumOut) } })
    }
    case 'getAlbum': {
      const a = albumes.find((x) => x.id === q.get('id'))
      if (!a) return fallo(70, 'Álbum no encontrado')
      return resp({ album: { ...albumOut(a), song: canciones.filter((s) => s.albumId === a.id).map(cancionOut) } })
    }
    case 'getSong': {
      if (porId[q.get('id')]) return resp({ song: fichaOut(porId[q.get('id')]) })
      const s = porId[q.get('id')]
      return s ? resp({ song: cancionOut(s) }) : fallo(70, 'Canción no encontrada')
    }
    case 'getMusicDirectory': return resp({ directory: { id: q.get('id'), child: [] } })
    case 'getAlbumList2': {
      const tipo = q.get('type') || 'alphabeticalByName'
      let l = [...albumes]
      if (tipo === 'newest') l.sort((a, b) => b.created.localeCompare(a.created))
      else if (tipo === 'alphabeticalByArtist') l.sort((a, b) => a.artist.localeCompare(b.artist))
      else if (tipo === 'alphabeticalByName') l.sort((a, b) => a.name.localeCompare(b.name))
      else if (tipo === 'random') l.sort(() => Math.random() - 0.5)
      else if (tipo === 'byYear') l = l.filter((a) => a.year >= Number(q.get('fromYear') || 0) && a.year <= Number(q.get('toYear') || 9999))
      else if (tipo === 'byGenre') l = l.filter((a) => a.genre === q.get('genre'))
      return resp({ albumList2: { album: pagina(l, q).map(albumOut) } })
    }
    case 'getRandomSongs': {
      let l = canciones.filter((s) => !q.get('genre') || s.genre === q.get('genre')).sort(() => Math.random() - 0.5)
      return resp({ randomSongs: { song: l.slice(0, Number(q.get('size') || 10)).map(cancionOut) } })
    }
    case 'getGenres': return resp({ genres: { genre: generos.map((g) => ({ value: g, songCount: 10, albumCount: 2 })) } })
    case 'getSongsByGenre': return resp({ songsByGenre: { song: pagina(canciones.filter((s) => s.genre === q.get('genre')), q, 'count').map(cancionOut) } })
    case 'search3': {
      const t = (q.get('query') || '').replace(/"/g, '').toLowerCase()
      const ok = (...c) => !t || c.some((x) => (x || '').toLowerCase().includes(t))
      return resp({
        searchResult3: {
          artist: pagina(artistas.filter((a) => ok(a.name)), q, 'artistCount', 'artistOffset'),
          album: pagina(albumes.filter((a) => ok(a.name, a.artist)), q, 'albumCount', 'albumOffset').map(albumOut),
          // Los otros medios solo salen con texto: la sincronización de la biblioteca (consulta vacía) no los ve.
          song: pagina((t ? [...canciones, ...otros] : canciones).filter((s) => ok(s.title, s.artist, s.album)), q, 'songCount', 'songOffset').map(cancionOut),
        },
      })
    }
    case 'getPlaylists': return resp({ playlists: { playlist: listas.map(listaOut) } })
    case 'getPlaylist': {
      const l = listas.find((x) => x.id === q.get('id'))
      return l ? resp({ playlist: { ...listaOut(l), entry: l.ids.map((i) => cancionOut(porId[i])) } }) : fallo(70, 'Lista no encontrada')
    }
    case 'getStarred2': return resp({ starred2: { song: [...estrellas].map((i) => cancionOut(porId[i])), album: [], artist: [] } })
    // star, unstar, scrobble: el servidor real puede no hacer nada; aquí tampoco.
    case 'star': case 'unstar': case 'scrobble': return resp()
    default: return fallo(0, `Método no implementado: ${metodo}`)
  }
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
    const m = url.pathname.match(/^\/rest\/([A-Za-z0-9]+?)(?:\.view)?$/)
    if (!m) { res.writeHead(404, cors); return res.end('No encontrado') }
    const q = url.searchParams
    const json = (o) => { res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)) }
    if (!autenticado(q)) return json(fallo(40, 'Wrong username or password'))
    const metodo = m[1]
    if (metodo === 'stream' || metodo === 'download') {
      const s = porId[q.get('id')]
      if (!s) return json(fallo(70, 'Canción no encontrada'))
      const b = wav(s.id)
      const r = (req.headers.range || '').match(/bytes=(\d+)-(\d*)/)
      if (r) {
        const a = Number(r[1]), z = Math.min(r[2] ? Number(r[2]) : b.length - 1, b.length - 1)
        if (a >= b.length) { res.writeHead(416, { ...cors, 'Content-Range': `bytes */${b.length}` }); return res.end() }
        res.writeHead(206, { ...cors, 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${a}-${z}/${b.length}`, 'Content-Length': z - a + 1 })
        return res.end(b.subarray(a, z + 1))
      }
      res.writeHead(200, { ...cors, 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': b.length })
      return res.end(b)
    }
    if (metodo === 'getCoverArt') {
      const id = q.get('id') || ''
      const semilla = /^al-\d+$/.test(id) ? Number(id.slice(3)) : /^cv-[a-f0-9]+$/.test(id) ? parseInt(id.slice(3, 9), 16) % 997 : null
      if (semilla === null) return json(fallo(70, 'Carátula no encontrada'))
      res.writeHead(200, { ...cors, 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' })
      return res.end(png(semilla, Math.min(Number(q.get('size') || 120), 240)))
    }
    if (req.method === 'POST') {
      let datos = ''
      req.on('data', (d) => (datos += d))
      req.on('end', () => { let c = {}; try { c = JSON.parse(datos || '{}') } catch { /* sin cuerpo */ } json(manejar(metodo, q, c)) })
      return
    }
    json(manejar(metodo, q))
  })
  .listen(PORT, () => console.log(`Servidor Subsonic falso en http://localhost:${PORT} (usuario: ${USER}, contraseña: ${PASS})`))
