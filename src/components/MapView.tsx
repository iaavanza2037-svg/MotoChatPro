/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { APIProvider, Map, AdvancedMarker, InfoWindow, Pin, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { UserProfile } from '../types';
import { ZONAS_COORDINATES, getHaversineDistance } from '../utils/location';
import { Compass, Navigation, Phone, Star, MessageSquare, Shield, MapPin, Key, ExternalLink } from 'lucide-react';

interface MapViewProps {
  currentUserProfile: UserProfile;
  onlineUsers: UserProfile[];
  onSelectUser: (user: UserProfile) => void;
  onCloseMap?: () => void;
}

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';

const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY' && API_KEY.trim() !== '';

function getUserCoords(user: UserProfile): { lat: number; lng: number } {
  if (user.latitude !== undefined && user.longitude !== undefined) {
    return { lat: user.latitude, lng: user.longitude };
  }
  const zoneCoords = ZONAS_COORDINATES[user.zone || 'Langue (Centro)'] || ZONAS_COORDINATES['Langue (Centro)'];
  // Jitter based on UID to avoid exact pin overlap if coords are zone-based
  let hash = 0;
  for (let i = 0; i < (user.uid || '').length; i++) {
    hash = (hash << 5) - hash + user.uid.charCodeAt(i);
    hash |= 0;
  }
  const offsetLat = ((hash % 100) - 50) * 0.00015;
  const offsetLng = (((hash >> 2) % 100) - 50) * 0.00015;
  return { lat: zoneCoords.lat + offsetLat, lng: zoneCoords.lon + offsetLng };
}

function UserMarkerItem({
  user,
  isCurrentUser,
  currentUserProfile,
  onSelectUser
}: {
  key?: string;
  user: UserProfile;
  isCurrentUser: boolean;
  currentUserProfile: UserProfile;
  onSelectUser: (user: UserProfile) => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  const coords = useMemo(() => getUserCoords(user), [user]);
  const myCoords = useMemo(() => getUserCoords(currentUserProfile), [currentUserProfile]);

  const distanceInKm = useMemo(() => {
    if (isCurrentUser) return 0;
    return getHaversineDistance(myCoords.lat, myCoords.lng, coords.lat, coords.lng);
  }, [isCurrentUser, myCoords, coords]);

  const isDriver = user.role === 'moto';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={coords}
        onClick={() => setOpen(prev => !prev)}
        title={`${user.name} (${user.role === 'moto' ? 'Mototaxi' : 'Cliente'})`}
      >
        {isCurrentUser ? (
          <div className="relative group cursor-pointer">
            <span className="absolute -inset-1 rounded-full bg-emerald-400 opacity-75 animate-ping"></span>
            <div className="relative bg-emerald-600 text-white font-extrabold text-[10px] px-2 py-1 rounded-full shadow-lg border-2 border-white flex items-center gap-1">
              <span>📍</span>
              <span>Tú</span>
            </div>
          </div>
        ) : isDriver ? (
          <div className="relative cursor-pointer hover:scale-110 transition-transform">
            <div className="bg-yellow-400 text-slate-900 font-extrabold text-[10px] px-2 py-1 rounded-full shadow-lg border-2 border-slate-900 flex items-center gap-1">
              <span className="text-sm">🛵</span>
              <span className="max-w-[70px] truncate">{user.name.split(' ')[0]}</span>
            </div>
          </div>
        ) : (
          <div className="relative cursor-pointer hover:scale-110 transition-transform">
            <div className="bg-sky-500 text-white font-bold text-[10px] px-2 py-1 rounded-full shadow-lg border-2 border-white flex items-center gap-1">
              <span>👤</span>
              <span className="max-w-[70px] truncate">{user.name.split(' ')[0]}</span>
            </div>
          </div>
        )}
      </AdvancedMarker>

      {open && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)}>
          <div className="p-2 min-w-[210px] text-slate-800 font-sans">
            <div className="flex items-center gap-2 mb-1.5 border-b border-slate-100 pb-1.5">
              <span className="text-xl">{isDriver ? '🛵' : '👤'}</span>
              <div>
                <h4 className="font-extrabold text-xs text-slate-900 leading-tight">{user.name}</h4>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  {isDriver ? 'Mototaxista en línea' : 'Cliente en línea'}
                </p>
              </div>
            </div>

            <div className="space-y-1 text-[11px] text-slate-600 mb-2">
              <p className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold">{user.zone || 'Langue (Centro)'}</span>
              </p>

              {user.phone && (
                <p className="flex items-center gap-1 font-mono font-bold text-slate-700">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{user.phone}</span>
                </p>
              )}

              {isDriver && user.mototaxiNumber && (
                <p className="text-[10px] font-extrabold text-slate-800 bg-yellow-400/30 px-1.5 py-0.5 rounded w-max">
                  Mototaxi N° {user.mototaxiNumber}
                </p>
              )}

              {isDriver && (user.averageRating || 0) > 0 && (
                <p className="flex items-center gap-1 text-[10px] font-bold text-amber-600">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{user.averageRating?.toFixed(1)} / 5.0 ({user.ratingCount || 0} calificaciones)</span>
                </p>
              )}

              {!isCurrentUser && (
                <p className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded w-max mt-1">
                  📍 Distancia: {distanceInKm.toFixed(1)} km
                </p>
              )}
            </div>

            {!isCurrentUser && (
              <button
                onClick={() => {
                  setOpen(false);
                  onSelectUser(user);
                }}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[10px] uppercase tracking-wider py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-yellow-400" />
                <span>Abrir Chat / Pedir Servicio</span>
              </button>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export default function MapView({ currentUserProfile, onlineUsers, onSelectUser, onCloseMap }: MapViewProps) {
  const centerCoords = useMemo(() => getUserCoords(currentUserProfile), [currentUserProfile]);

  // If Google Maps API key is missing or not configured
  if (!hasValidKey) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center p-6 bg-slate-50 text-slate-800 relative overflow-y-auto">
        <div className="max-w-md w-full bg-white border border-slate-200 p-6 rounded-3xl shadow-xl text-center space-y-4">
          <div className="inline-flex p-3 bg-amber-100 text-amber-700 rounded-full">
            <Key className="w-8 h-8" />
          </div>

          <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Clave de Google Maps Requerida
          </h3>

          <p className="text-xs text-slate-600 leading-relaxed">
            Para ver el mapa interactivo en tiempo real con las mototaxis y clientes en MotoGo, necesitas agregar una clave de API de Google Maps Platform.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2 text-xs">
            <p className="font-extrabold text-slate-800 flex items-center gap-1.5">
              <span>1️⃣</span> Obtén tu clave en Google Cloud:
            </p>
            <a
              href="https://console.cloud.google.com/google/maps-apis/start?utm_campaign=gmp-code-assist-ais"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline font-semibold flex items-center gap-1 text-[11px] pl-5"
            >
              <span>Consola Google Maps Platform</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <p className="font-extrabold text-slate-800 flex items-center gap-1.5 pt-2">
              <span>2️⃣</span> Configúrala en AI Studio:
            </p>
            <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-1 pl-5">
              <li>Haz clic en el ícono de <strong>Ajustes ⚙️</strong> (esquina superior derecha).</li>
              <li>Abre la sección <strong>Secrets</strong>.</li>
              <li>Agrega un secreto con el nombre exacto: <code className="bg-slate-200 px-1 py-0.5 rounded font-mono font-bold text-slate-900">GOOGLE_MAPS_PLATFORM_KEY</code></li>
              <li>Pega tu clave de API y presiona <strong>Enter</strong>.</li>
            </ul>
          </div>

          <p className="text-[10px] text-slate-400 italic">
            La aplicación reconstruirá automáticamente la vista con el mapa activo tan pronto como agregues el secreto.
          </p>

          {onCloseMap && (
            <button
              onClick={onCloseMap}
              className="mt-2 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cerrar y volver a la lista
            </button>
          )}
        </div>
      </div>
    );
  }

  // Filter online mototaxis and online clients
  const allMapUsers = useMemo(() => {
    // Include current user plus other online users
    const existsInOnline = onlineUsers.some(u => u.uid === currentUserProfile.uid);
    if (!existsInOnline) {
      return [currentUserProfile, ...onlineUsers];
    }
    return onlineUsers;
  }, [currentUserProfile, onlineUsers]);

  return (
    <div className="h-full w-full relative flex flex-col bg-slate-100">
      {/* Top Floating Header Banner */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md text-white px-3.5 py-2 rounded-2xl shadow-xl border border-slate-800 flex items-center gap-2 pointer-events-auto">
          <span className="text-xl">🛵</span>
          <div>
            <h3 className="font-extrabold text-xs tracking-wide">Mapa MotoGo en Vivo</h3>
            <p className="text-[9px] text-slate-300 font-mono">
              {onlineUsers.filter(u => u.role === 'moto').length} Mototaxis en línea
            </p>
          </div>
        </div>

        {onCloseMap && (
          <button
            onClick={onCloseMap}
            className="bg-white/95 text-slate-800 hover:bg-white font-extrabold text-xs px-3 py-2 rounded-2xl shadow-xl border border-slate-200 pointer-events-auto cursor-pointer"
          >
            ❌ Cerrar
          </button>
        )}
      </div>

      {/* Map Canvas */}
      <APIProvider apiKey={API_KEY} version="weekly">
        <Map
          defaultCenter={centerCoords}
          defaultZoom={14}
          mapId="MOTOGO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
          gestureHandling="greedy"
          disableDefaultUI={false}
        >
          {allMapUsers.map((u) => (
            <UserMarkerItem
              key={u.uid}
              user={u}
              isCurrentUser={u.uid === currentUserProfile.uid}
              currentUserProfile={currentUserProfile}
              onSelectUser={onSelectUser}
            />
          ))}
        </Map>
      </APIProvider>
    </div>
  );
}
