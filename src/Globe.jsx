import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { geoOrthographic, geoPath, geoGraticule10, geoDistance } from 'd3-geo';
import { feature } from 'topojson-client';
import worldTopology from './data/countries-50m.json';

const SIZE = 300;
const MIN_ZOOM = 1.6;
const MAX_ZOOM = 5;
const DEFAULT_ZOOM = 2.6;
const GERMANY_ID = '276';

const allCountries = feature(worldTopology, worldTopology.objects.countries).features;
const land = feature(worldTopology, worldTopology.objects.land);
const germany = allCountries.find(country => country.id === GERMANY_ID);
const otherCountries = { type: 'FeatureCollection', features: allCountries.filter(country => country.id !== GERMANY_ID) };

function isFrontFacing(rotation, lon, lat) {
  // Center of the visible hemisphere, given the current rotation.
  const centerLon = -rotation[0];
  const centerLat = -rotation[1];
  const distance = geoDistance([lon, lat], [centerLon, centerLat]);
  return distance < Math.PI / 2;
}

export default function Globe({ points, routes, selected, onSelectPoint, onHoverPoint, onLeave }) {
  const [rotation, setRotation] = useState([-10.4, -51.1]);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const dragState = useRef(null);
  const canvasRef = useRef(null);

  const zoomIn = useCallback(() => setZoom(z => Math.min(MAX_ZOOM, +(z + 0.4).toFixed(2))), []);
  const zoomOut = useCallback(() => setZoom(z => Math.max(MIN_ZOOM, +(z - 0.4).toFixed(2))), []);

  // Native wheel/trackpad zoom, like a map app.
  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const onWheel = (event) => {
      event.preventDefault();
      setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z - event.deltaY * 0.0025).toFixed(2))));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const projection = useMemo(() => geoOrthographic()
    .scale((SIZE / 2 - 4) * zoom)
    .translate([SIZE / 2, SIZE / 2])
    .rotate(rotation)
    .clipAngle(90), [rotation, zoom]);

  const path = useMemo(() => geoPath(projection), [projection]);
  const graticule = useMemo(() => geoGraticule10(), []);

  const projected = useMemo(() => points
    .map(point => ({ ...point, visible: isFrontFacing(rotation, point.lon, point.lat), screen: projection([point.lon, point.lat]) }))
    .filter(point => point.screen), [points, rotation, projection]);

  const visibleRoutes = useMemo(() => routes
    .map((route, index) => {
      const fromVisible = isFrontFacing(rotation, route.from.lon, route.from.lat);
      const toVisible = isFrontFacing(rotation, route.to.lon, route.to.lat);
      if (!fromVisible || !toVisible) return null;
      const lineGeo = { type: 'LineString', coordinates: [[route.from.lon, route.from.lat], [route.to.lon, route.to.lat]] };
      return { ...route, d: path(lineGeo), delay: index * -0.6 };
    })
    .filter(Boolean), [routes, rotation, path]);

  const onPointerDown = useCallback((event) => {
    dragState.current = { startX: event.clientX, startY: event.clientY, startRotation: rotation };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [rotation]);

  const onPointerMove = useCallback((event) => {
    if (!dragState.current) return;
    const dx = event.clientX - dragState.current.startX;
    const dy = event.clientY - dragState.current.startY;
    const [startLon, startLat] = dragState.current.startRotation;
    const nextLon = startLon + dx * 0.4;
    const nextLat = Math.max(-80, Math.min(80, startLat - dy * 0.4));
    setRotation([nextLon, nextLat]);
  }, []);

  const onPointerUp = useCallback((event) => {
    dragState.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  return (
    <div
      className="globe-canvas"
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onLeave}
      style={{ touchAction: 'none' }}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="globe-svg">
        <defs>
          <radialGradient id="oceanGradient" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#6fb8e0" />
            <stop offset="55%" stopColor="#2f7ab0" />
            <stop offset="100%" stopColor="#123c66" />
          </radialGradient>
          <radialGradient id="sphereShade" cx="32%" cy="26%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#02182e" stopOpacity="0.55" />
          </radialGradient>
          <clipPath id="sphereClip">
            <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 4} />
          </clipPath>
        </defs>

        <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 4} fill="url(#oceanGradient)" />

        <g clipPath="url(#sphereClip)">
          <path d={path(land)} className="globe-land" />
          <path d={path(otherCountries)} className="globe-country-border" />
          <path d={path(graticule)} className="globe-graticule" />
          {germany && <path d={path(germany)} className="globe-germany" />}
          {visibleRoutes.map(route => (
            <path
              key={route.from.id + route.to.id}
              d={route.d}
              className={'globe-route ' + (selected && selected.id !== route.from.id && selected.id !== route.to.id ? 'muted-route' : '')}
              style={{ animationDelay: `${route.delay}s` }}
            />
          ))}
        </g>

        <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 4} fill="url(#sphereShade)" />
        <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 2} className="globe-rim" />
      </svg>

      <div className="globe-zoom-controls" onPointerDown={event => event.stopPropagation()}>
        <button type="button" className="globe-zoom-btn" onClick={zoomIn} disabled={zoom >= MAX_ZOOM} aria-label="Globus vergrößern">+</button>
        <button type="button" className="globe-zoom-btn" onClick={zoomOut} disabled={zoom <= MIN_ZOOM} aria-label="Globus verkleinern">−</button>
      </div>

      {projected.filter(p => p.visible).map(point => (
        <button
          key={point.id}
          className={'hub-marker ' + point.type.toLowerCase() + (selected?.id === point.id ? ' selected' : '')}
          style={{ left: point.screen[0], top: point.screen[1] }}
          onMouseEnter={() => onHoverPoint(point)}
          onClick={() => onSelectPoint(point)}
          title={`${point.city} · ${point.type}`}
        >
          <span>{point.type === 'Wind' ? '♨' : '☀'}</span>
        </button>
      ))}

      {selected && (() => {
        const activePoint = projected.find(p => p.id === selected.id);
        if (!activePoint || !activePoint.visible) return null;
        return (
          <div className="hub-tooltip" style={{ left: activePoint.screen[0], top: activePoint.screen[1] + 16 }}>
            <b>{activePoint.city}</b>
            <span>{activePoint.type} · {activePoint.participants} Teilnehmer</span>
            <small>{activePoint.id}</small>
          </div>
        );
      })()}
    </div>
  );
}
