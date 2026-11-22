// Portada propia de una lista (administrador): subir una imagen, regenerarla con IA o quitarla.
// La nube la guarda en la ficha de la lista y Studio y las apps la usan. Si la nube no tiene una operación,
// o esta versión no puede elegir imágenes (modo navegador), esa acción no se ofrece.
import { useEffect, useRef, useState } from 'react'
import { backend } from '../backend'
import { quitarPortada, regenerarPortada, soportePortadas, subirPortada, type Soporte } from '../portadas'
import { aviso, refrescarListasServidor } from '../store'
import type { Lista } from '../types'
import { Icono } from './common'

export function BotonPortada({ lista }: { lista: Lista }) {
  const [soporte, setSoporte] = useState<Soporte>({ subir: false, regenerar: false })
  const [abierto, setAbierto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const fichero = useRef<HTMLInputElement>(null)
  useEffect(() => { void soportePortadas().then(setSoporte, () => undefined) }, [])
  const puedeSubir = soporte.subir && backend.kind === 'tauri'
  const puedeQuitar = soporte.subir && lista.portadaPropia === true
  if (!puedeSubir && !soporte.regenerar && !puedeQuitar) return null

  const hacer = async (accion: () => Promise<unknown>, correcto: string) => {
    setAbierto(false)
    setOcupado(true)
    try {
      await accion()
      await refrescarListasServidor()
      aviso(correcto)
    } catch (e) { aviso(String((e as Error)?.message ?? e), 'error') } finally { setOcupado(false) }
  }
  const id = lista.servidorId!
  return (
    <div className="portada-accion">
      <button type="button" className="boton" onClick={() => setAbierto(!abierto)} disabled={ocupado} aria-expanded={abierto}>
        <Icono n="image" tam={16} /> {ocupado ? 'Generando…' : 'Portada'}
      </button>
      {abierto && (
        <div className="menu portada-menu" role="menu" aria-label="Portada de la lista">
          <p className="nota">Imagen cuadrada, como mucho 1024×1024 en JPG. Studio y las apps la usan.</p>
          {puedeSubir && <button role="menuitem" className="menu-item" onClick={() => fichero.current?.click()}>Subir una imagen…</button>}
          {soporte.regenerar && <button role="menuitem" className="menu-item" onClick={() => void hacer(() => regenerarPortada(id), 'Portada generada')}>Regenerar con IA</button>}
          {puedeQuitar && <button role="menuitem" className="menu-item peligro" onClick={() => void hacer(() => quitarPortada(id), 'Portada quitada')}>Quitar portada</button>}
        </div>
      )}
      <input
        ref={fichero} type="file" accept="image/*" hidden aria-label="Imagen de portada"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void hacer(() => subirPortada(id, f), 'Portada actualizada')
        }}
      />
    </div>
  )
}
