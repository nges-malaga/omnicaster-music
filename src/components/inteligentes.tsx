// Crear o cambiar una lista inteligente (administrador): nombre, reglas, orden y máximo, con vista previa.
// Es la misma lista que en el panel de OmniCaster Cloud: la nube la recalcula cada pocos minutos.
import { useEffect, useRef, useState } from 'react'
import { nombreIdioma } from '../idiomas'
import {
  CAMPOS, NOMBRE_OP, NOMBRE_ORDEN, OPS, cambiarCampo, dejarDeMantener, guardarInteligente, limpiar, previsualizar, problema, reglaNueva, sinValor,
  type Campo, type Op, type OpcionesInteligentes, type Orden, type Regla, type Reglas, type Vista,
} from '../inteligentes'
import { nombreTipoMedio, puede, type TipoMedio } from '../oc'
import { atras, aviso, cargarInteligentes, navegar, refrescarListasServidor, useApp } from '../store'
import { Cabecera, Icono } from './common'

const REGLAS_INICIALES: Reglas = { match: 'all', rules: [reglaNueva('genre')], sort: 'popularity', limit: 0 }
const mensaje = (e: unknown) => String((e as Error)?.message ?? e)

export function EditorInteligente({ id }: { id: string }) {
  const nueva = id === 'nueva'
  const rol = useApp((s) => s.rol)
  const existente = useApp((s) => (nueva ? undefined : s.inteligentes[id]))
  const opciones = useApp((s) => s.opcionesInteligentes)
  const tipos = useApp((s) => s.tipos)
  const [nombre, setNombre] = useState('')
  const [reglas, setReglas] = useState<Reglas>(REGLAS_INICIALES)
  const [vista, setVista] = useState<Vista | null>(null)
  const [errorVista, setErrorVista] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cargada = useRef(false)

  // Al abrir una existente se rellena con sus reglas (una sola vez, cuando llegan).
  useEffect(() => {
    if (existente && !cargada.current) { cargada.current = true; setNombre(existente.name); setReglas(existente.rules) }
  }, [existente])
  useEffect(() => { if (!opciones) void cargarInteligentes() /* eslint-disable-next-line */ }, [])

  // Vista previa: medio segundo después del último cambio, si las reglas están completas.
  const falta = problema(nombre || 'x', reglas)
  const ultima = useRef(0)
  useEffect(() => {
    if (falta) { setVista(null); setErrorVista(''); return }
    const n = ++ultima.current
    const t = setTimeout(() => {
      previsualizar(reglas, nueva ? '' : id)
        .then((v) => { if (n === ultima.current) { setVista(v); setErrorVista('') } })
        .catch((e) => { if (n === ultima.current) { setVista(null); setErrorVista(mensaje(e)) } })
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(reglas), falta])

  if (!puede(rol, 'admin')) return <p className="vacio">Crear o cambiar listas inteligentes es cosa del administrador de la emisora.</p>
  if (!nueva && !existente) return <p className="vacio">Esta lista ya no es inteligente o no existe.</p>

  const cambiarRegla = (i: number, r: Regla) => setReglas((x) => ({ ...x, rules: x.rules.map((y, j) => (j === i ? r : y)) }))
  const quitarRegla = (i: number) => setReglas((x) => ({ ...x, rules: x.rules.filter((_, j) => j !== i) }))

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault()
    const p = problema(nombre, reglas)
    if (p) return aviso(p, 'error')
    setGuardando(true)
    try {
      const nuevoId = await guardarInteligente({ id: nueva ? undefined : id, name: nombre.trim(), rules: limpiar(reglas) })
      await Promise.all([cargarInteligentes(), refrescarListasServidor()])
      aviso(nueva ? `Lista inteligente «${nombre.trim()}» creada` : 'Reglas guardadas')
      if (nueva) navegar({ t: 'lista', id: `s-${nuevoId}` })
      else atras()
    } catch (e) { aviso(mensaje(e), 'error') } finally { setGuardando(false) }
  }

  const dejar = async () => {
    if (!window.confirm('La lista se queda como una lista normal, con las canciones que tenga ahora. No se borra nada. ¿Dejar de actualizarla?')) return
    try {
      await dejarDeMantener(id)
      await Promise.all([cargarInteligentes(), refrescarListasServidor()])
      aviso('Ahora es una lista normal')
      atras()
    } catch (e) { aviso(mensaje(e), 'error') }
  }

  return (
    <form className="editor-inteligente" onSubmit={guardar}>
      <Cabecera titulo={nueva ? 'Nueva lista inteligente' : 'Reglas de la lista'} />
      <p className="nota">
        Se llena sola con las canciones que cumplen las reglas. La nube la recalcula cada pocos minutos; lo que se meta o saque a mano se corrige en el siguiente recálculo. Studio la usa en el AutoDJ y en los eventos.
      </p>
      <label className="campo">Nombre
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} placeholder="p. ej. Éxitos en español" aria-label="Nombre de la lista inteligente" />
      </label>

      <h2>Reglas</h2>
      {reglas.rules.length > 1 && (
        <label className="campo">Se tiene que
          <select value={reglas.match} onChange={(e) => setReglas((x) => ({ ...x, match: e.target.value as 'all' | 'any' }))}>
            <option value="all">Cumplir todas</option><option value="any">Cumplir alguna</option>
          </select>
        </label>
      )}
      {reglas.rules.map((r, i) => (
        <EditorRegla key={i} n={i + 1} regla={r} opciones={opciones} tipos={tipos} onCambio={(x) => cambiarRegla(i, x)} onQuitar={reglas.rules.length > 1 ? () => quitarRegla(i) : undefined} />
      ))}
      {reglas.rules.length < 20 && (
        <div className="botones"><button type="button" className="boton" onClick={() => setReglas((x) => ({ ...x, rules: [...x.rules, reglaNueva('genre')] }))}><Icono n="plus" tam={16} /> Añadir regla</button></div>
      )}

      <h2>Orden y máximo</h2>
      <label className="campo">Orden
        <select value={reglas.sort} onChange={(e) => setReglas((x) => ({ ...x, sort: e.target.value as Orden }))}>
          {(Object.keys(NOMBRE_ORDEN) as Orden[]).map((o) => <option key={o} value={o}>{NOMBRE_ORDEN[o]}</option>)}
        </select>
      </label>
      <label className="campo">Máximo de canciones
        <input
          inputMode="numeric" placeholder="Sin límite" value={reglas.limit ? String(reglas.limit) : ''}
          onChange={(e) => setReglas((x) => ({ ...x, limit: Math.max(0, Math.min(5000, Number(e.target.value.replace(/\D/g, '')) || 0)) }))}
        />
      </label>

      <h2>Vista previa</h2>
      <VistaPrevia vista={vista} aviso={falta} error={errorVista} />

      <div className="botones">
        <button type="button" className="boton" onClick={atras}>Cancelar</button>
        <button type="submit" className="boton principal" disabled={guardando || !!falta}><Icono n="sparkle" tam={16} /> {guardando ? 'Guardando…' : nueva ? 'Crear lista inteligente' : 'Guardar reglas'}</button>
        {!nueva && <button type="button" className="boton peligro" onClick={() => void dejar()}>Dejar de actualizarla</button>}
      </div>
    </form>
  )
}

type Opciones = OpcionesInteligentes | null

function EditorRegla({ n, regla, opciones, tipos, onCambio, onQuitar }: {
  n: number; regla: Regla; opciones: Opciones; tipos: TipoMedio[]; onCambio: (r: Regla) => void; onQuitar?: () => void
}) {
  const tipo = CAMPOS[regla.field].tipo
  return (
    <fieldset className="regla" aria-label={`Regla ${n}`}>
      <legend>Regla {n}</legend>
      <div className="regla-fila">
        <label className="campo">Campo
          <select aria-label="Campo" value={regla.field} onChange={(e) => onCambio(cambiarCampo(regla, e.target.value as Campo))}>
            {(Object.keys(CAMPOS) as Campo[]).map((c) => <option key={c} value={c}>{CAMPOS[c].nombre}</option>)}
          </select>
        </label>
        <label className="campo">Condición
          <select aria-label="Condición" value={regla.op} onChange={(e) => { const op = e.target.value as Op; onCambio({ ...regla, op, value: op === 'between' ? [0, 0] : sinValor(op) ? undefined : regla.value }) }}>
            {OPS[tipo].map((o) => <option key={o} value={o}>{NOMBRE_OP[o]}</option>)}
          </select>
        </label>
        {!sinValor(regla.op) && <ValorRegla regla={regla} opciones={opciones} tipos={tipos} onCambio={onCambio} />}
        {onQuitar && <button type="button" className="btn-icono" onClick={onQuitar} aria-label={`Quitar la regla ${n}`}><Icono n="trash" tam={16} /></button>}
      </div>
    </fieldset>
  )
}

function ValorRegla({ regla, opciones, tipos, onCambio }: { regla: Regla; opciones: Opciones; tipos: TipoMedio[]; onCambio: (r: Regla) => void }) {
  const tipo = CAMPOS[regla.field].tipo
  if (tipo === 'numero') {
    const num = (t: string) => Number(t.replace(',', '.').replace(/[^\d.]/g, '')) || 0
    if (regla.op === 'between') {
      const [a, b] = (regla.value as [number, number]) ?? [0, 0]
      return (
        <div className="campo">Valores
          <div className="entre">
            <input aria-label="Desde" inputMode="decimal" value={String(a)} onChange={(e) => onCambio({ ...regla, value: [num(e.target.value), b] })} />
            <span>y</span>
            <input aria-label="Hasta" inputMode="decimal" value={String(b)} onChange={(e) => onCambio({ ...regla, value: [a, num(e.target.value)] })} />
          </div>
        </div>
      )
    }
    return (
      <label className="campo">Valor
        <input inputMode="decimal" value={regla.value === undefined ? '' : String(regla.value)} onChange={(e) => onCambio({ ...regla, value: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })} />
      </label>
    )
  }
  // Listas de la emisora y tipos de medio: desplegable. El resto: texto con sugerencias de la biblioteca.
  if (regla.field === 'blocks') {
    return (
      <label className="campo">Lista
        <select aria-label="Lista" value={String(regla.value ?? '')} onChange={(e) => onCambio({ ...regla, value: e.target.value })}>
          <option value="">Elige una lista</option>
          {(opciones?.blocks ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
    )
  }
  if (regla.field === 'mediaType') {
    const ids = [...new Set([...tipos.map((t) => t.id), ...(opciones?.mediaType ?? [])])]
    return (
      <label className="campo">Tipo
        <select aria-label="Tipo" value={String(regla.value ?? '')} onChange={(e) => onCambio({ ...regla, value: e.target.value })}>
          {ids.map((i) => <option key={i || 'musica'} value={i}>{nombreTipoMedio(i, tipos)}</option>)}
        </select>
      </label>
    )
  }
  const sugerencias = (opciones?.[regla.field as keyof OpcionesInteligentes] as string[] | undefined) ?? []
  const lista = `sugerencias-${regla.field}`
  return (
    <label className="campo">Valor
      <input value={String(regla.value ?? '')} list={lista} autoComplete="off" spellCheck={false} onChange={(e) => onCambio({ ...regla, value: e.target.value })} />
      <datalist id={lista}>
        {sugerencias.slice(0, 80).map((s) => <option key={s} value={s} label={regla.field === 'language' ? nombreIdioma(s) : undefined} />)}
      </datalist>
    </label>
  )
}

function VistaPrevia({ vista, aviso, error }: { vista: Vista | null; aviso: string | null; error: string }) {
  if (aviso) return <p className="nota">{aviso}</p>
  if (error) return <p className="error">{error}</p>
  if (!vista) return <p className="nota">Calculando…</p>
  return (
    <div className="vista-previa" role="status">
      <strong>{vista.total} {vista.total === 1 ? 'canción' : 'canciones'}</strong>
      <span className="nota">{vista.summary}</span>
      {vista.sample.slice(0, 10).map((s) => <span key={s.id}>{s.title} <span className="nota">· {s.artist}</span></span>)}
      {vista.total > 10 && <span className="nota">y {vista.total - 10} más</span>}
    </div>
  )
}
