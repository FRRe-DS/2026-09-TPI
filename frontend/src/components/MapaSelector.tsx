import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Ubicacion } from '../types';

interface Props {
  origen: Ubicacion | null;
  destino: Ubicacion | null;
  onCambio: (origen: Ubicacion | null, destino: Ubicacion | null) => void;
}

type Modo = 'origen' | 'destino';

interface Ruta {
  puntos: [number, number][];
  distanciaKm: number;
  porCalles: boolean;
}

// Centro de Resistencia, Chaco
const CENTRO: [number, number] = [-27.4513, -58.9867];

// Arma un texto corto a partir de los datos de una dirección
function armarTexto(partes: (string | undefined)[]): string {
  return partes.filter(Boolean).join(', ');
}

// Coordenadas -> dirección en texto (Nominatim, de OpenStreetMap)
async function buscarDireccion(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=es`,
    );
    const datos = await res.json();
    const a = datos.address ?? {};
    const calle = [a.road, a.house_number].filter(Boolean).join(' ');
    const texto = armarTexto([calle, a.city ?? a.town ?? a.village]);
    return texto || datos.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }
}

// Texto -> lista de lugares posibles (Photon, de OpenStreetMap). Prioriza resultados cerca de Resistencia.
async function buscarLugares(texto: string): Promise<Ubicacion[]> {
  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(texto)}&lat=${CENTRO[0]}&lon=${CENTRO[1]}&limit=5`,
    );
    const datos = await res.json();
    return datos.features.map(
      (f: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }) => {
        const p = f.properties;
        const calle = [p.street, p.housenumber].filter(Boolean).join(' ');
        const nombre = p.name && p.name !== p.street ? p.name : undefined;
        const [lon, lat] = f.geometry.coordinates;
        return {
          // El backend rechaza direcciones vacías: si el lugar no trae datos, usamos las coordenadas
          direccion: armarTexto([nombre, calle, p.city, p.state]) || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          latitud: lat,
          longitud: lon,
        };
      },
    );
  } catch {
    return [];
  }
}

// Distancia en línea recta (fórmula de Haversine), por si falla la ruta por calles
function distanciaRecta(a: Ubicacion, b: Ubicacion): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.latitud - a.latitud);
  const dLon = rad(b.longitud - a.longitud);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Ruta por calles entre dos puntos (OSRM)
async function buscarRuta(a: Ubicacion, b: Ubicacion): Promise<Ruta> {
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${a.longitud},${a.latitud};${b.longitud},${b.latitud}?overview=full&geometries=geojson`,
    );
    const datos = await res.json();
    const ruta = datos.routes[0];
    return {
      // OSRM devuelve [longitud, latitud] y Leaflet usa [latitud, longitud]
      puntos: ruta.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon]),
      distanciaKm: ruta.distance / 1000,
      porCalles: true,
    };
  } catch {
    return {
      puntos: [
        [a.latitud, a.longitud],
        [b.latitud, b.longitud],
      ],
      distanciaKm: distanciaRecta(a, b),
      porCalles: false,
    };
  }
}

// Escucha los clics sobre el mapa
function ClicEnMapa({ onClic }: { onClic: (lat: number, lon: number) => void }) {
  useMapEvents({
    click: (e) => onClic(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

// Mueve el mapa para que se vean los puntos marcados
function AjustarVista({ origen, destino }: { origen: Ubicacion | null; destino: Ubicacion | null }) {
  const map = useMap();
  useEffect(() => {
    if (origen && destino) {
      map.flyToBounds(
        [
          [origen.latitud, origen.longitud],
          [destino.latitud, destino.longitud],
        ],
        { padding: [40, 40] },
      );
    } else if (origen || destino) {
      const p = (origen ?? destino)!;
      map.flyTo([p.latitud, p.longitud], 15);
    }
  }, [map, origen, destino]);
  return null;
}

interface BuscadorProps {
  tipo: Modo;
  valor: Ubicacion | null;
  activo: boolean;
  onFoco: () => void;
  onElegir: (u: Ubicacion) => void;
}

// Campo de texto con sugerencias, como en las apps de viajes
function BuscadorDireccion({ tipo, valor, activo, onFoco, onElegir }: BuscadorProps) {
  const [texto, setTexto] = useState(valor?.direccion ?? '');
  const [sugerencias, setSugerencias] = useState<Ubicacion[]>([]);
  const temporizador = useRef<number | undefined>(undefined);

  function escribir(nuevo: string) {
    setTexto(nuevo);
    window.clearTimeout(temporizador.current);
    if (nuevo.trim().length < 3) {
      setSugerencias([]);
      return;
    }
    // Espera a que el usuario deje de escribir para no pedir en cada tecla
    temporizador.current = window.setTimeout(async () => {
      setSugerencias(await buscarLugares(nuevo));
    }, 400);
  }

  function elegir(u: Ubicacion) {
    setTexto(u.direccion);
    setSugerencias([]);
    onElegir(u);
  }

  return (
    <div className={`buscador ${activo ? 'activo' : ''}`}>
      <span className={`punto ${tipo}`} />
      <input
        placeholder={tipo === 'origen' ? '¿Desde dónde salís?' : '¿A dónde vas?'}
        value={texto}
        onChange={(e) => escribir(e.target.value)}
        onFocus={onFoco}
        onBlur={() => setTimeout(() => setSugerencias([]), 200)}
      />
      {sugerencias.length > 0 && (
        <ul className="sugerencias">
          {sugerencias.map((s) => (
            <li key={`${s.latitud},${s.longitud}`} onMouseDown={() => elegir(s)}>
              {s.direccion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MapaSelector({ origen, destino, onCambio }: Props) {
  const [modo, setModo] = useState<Modo>('origen');
  const [buscando, setBuscando] = useState(false);
  const [rutaCalculada, setRutaCalculada] = useState<Ruta | null>(null);

  // Solo se muestra la ruta si están marcados los dos puntos
  const ruta = origen && destino ? rutaCalculada : null;

  // Cuando están los dos puntos, calcula la ruta y la distancia
  useEffect(() => {
    if (!origen || !destino) return;
    let vigente = true;
    buscarRuta(origen, destino).then((r) => {
      if (vigente) setRutaCalculada(r);
    });
    return () => {
      vigente = false;
    };
  }, [origen, destino]);

  function marcar(tipo: Modo, punto: Ubicacion) {
    if (tipo === 'origen') {
      onCambio(punto, destino);
      setModo('destino');
    } else {
      onCambio(origen, punto);
    }
  }

  async function elegirEnMapa(lat: number, lon: number) {
    setBuscando(true);
    const direccion = await buscarDireccion(lat, lon);
    setBuscando(false);
    marcar(modo, { direccion, latitud: lat, longitud: lon });
  }

  function limpiar() {
    onCambio(null, null);
    setModo('origen');
  }

  return (
    <div className="mapa-selector">
      {/* La key hace que el campo muestre la dirección nueva cuando se marca en el mapa */}
      <BuscadorDireccion
        key={`origen-${origen?.direccion ?? ''}`}
        tipo="origen"
        valor={origen}
        activo={modo === 'origen'}
        onFoco={() => setModo('origen')}
        onElegir={(u) => marcar('origen', u)}
      />
      <BuscadorDireccion
        key={`destino-${destino?.direccion ?? ''}`}
        tipo="destino"
        valor={destino}
        activo={modo === 'destino'}
        onFoco={() => setModo('destino')}
        onElegir={(u) => marcar('destino', u)}
      />

      <div className="mapa-ayuda">
        <span>
          {buscando
            ? 'Buscando dirección…'
            : `Escribí la dirección o hacé clic en el mapa para marcar el ${modo}.`}
        </span>
        <button type="button" className="secundario" onClick={limpiar}>
          Limpiar
        </button>
      </div>

      <MapContainer center={CENTRO} zoom={13} className="mapa">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClicEnMapa onClic={elegirEnMapa} />
        <AjustarVista origen={origen} destino={destino} />

        {ruta && <Polyline positions={ruta.puntos} pathOptions={{ color: '#16a34a', weight: 5 }} />}

        {origen && (
          <CircleMarker
            center={[origen.latitud, origen.longitud]}
            radius={9}
            pathOptions={{ color: 'white', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}
          >
            <Tooltip>Origen</Tooltip>
          </CircleMarker>
        )}
        {destino && (
          <CircleMarker
            center={[destino.latitud, destino.longitud]}
            radius={9}
            pathOptions={{ color: 'white', weight: 3, fillColor: '#dc2626', fillOpacity: 1 }}
          >
            <Tooltip>Destino</Tooltip>
          </CircleMarker>
        )}
      </MapContainer>

      {ruta && (
        <p className="mapa-distancia">
          Distancia: <strong>{ruta.distanciaKm.toFixed(1)} km</strong>
          {!ruta.porCalles && ' (en línea recta)'}
        </p>
      )}
    </div>
  );
}