/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, InfoWindow, Pin, useAdvancedMarkerRef, useMap } from '@vis.gl/react-google-maps';
import { UserProfile, ChatSession, TrafficAlert } from '../types';
import { ZONAS_COORDINATES, getHaversineDistance } from '../utils/location';
import { Compass, Navigation, Phone, Star, MessageSquare, Shield, MapPin, Key, ExternalLink, AlertTriangle } from 'lucide-react';
import { collection, onSnapshot, query, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface MapViewProps {
  currentUserProfile: UserProfile;
  onlineUsers: UserProfile[];
  activeChats?: ChatSession[];
  onSelectUser: (user: UserProfile, initialMessage?: string) => void;
  onCloseMap?: () => void;
}

// Hook for smooth LERP position animation when coordinates update from Firebase
function useSmoothPosition(targetCoords: { lat: number; lng: number }) {
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number }>(targetCoords);

  useEffect(() => {
    const startLat = currentCoords.lat;
    const startLng = currentCoords.lng;
    const endLat = targetCoords.lat;
    const endLng = targetCoords.lng;

    // Skip animation if movement is imperceptible
    if (Math.abs(startLat - endLat) < 0.0000001 && Math.abs(startLng - endLng) < 0.0000001) {
      return;
    }

    let animationFrameId: number;
    let startTime: number | null = null;
    const duration = 800; // 800ms smooth transition

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth ease-out cubic curve
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const lat = startLat + (endLat - startLat) * easeProgress;
      const lng = startLng + (endLng - startLng) * easeProgress;

      setCurrentCoords({ lat, lng });

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [targetCoords.lat, targetCoords.lng]);

  return currentCoords;
}

// Visual 1 km Radius Circle Overlay on the map
function Radius1KmCircle({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const circle = new google.maps.Circle({
      strokeColor: '#EAB308', // yellow-500
      strokeOpacity: 0.85,
      strokeWeight: 2,
      fillColor: '#EAB308',
      fillOpacity: 0.12,
      map,
      center,
      radius: 1000, // 1000 meters = 1 km radius
      clickable: false,
    });

    return () => {
      circle.setMap(null);
    };
  }, [map, center.lat, center.lng]);

  return null;
}

// Render shortest route directions between active mototaxista & client
function ShortestRouteDirections({
  origin,
  destination,
  label
}: {
  key?: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  label?: string;
}) {
  const map = useMap();
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);

  useEffect(() => {
    if (!map || !origin || !destination) return;

    let polylineFallback: google.maps.Polyline | null = null;
    let directionsRenderer: google.maps.DirectionsRenderer | null = null;

    if (window.google?.maps?.DirectionsService) {
      const directionsService = new google.maps.DirectionsService();
      directionsRenderer = new google.maps.DirectionsRenderer({
        map,
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: '#EAB308', // MotoGo Yellow-500
          strokeOpacity: 0.9,
          strokeWeight: 6,
        },
      });

      directionsService.route(
        {
          origin,
          destination,
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === google.maps.DirectionsStatus.OK && result) {
            directionsRenderer?.setDirections(result);
            const route = result.routes[0];
            if (route && route.legs && route.legs[0]) {
              setRouteInfo({
                distance: route.legs[0].distance?.text || '',
                duration: route.legs[0].duration?.text || '',
              });
            }
          } else {
            // Fallback to custom Polyline if Directions API is unavailable or route unnavigable
            polylineFallback = new google.maps.Polyline({
              path: [origin, destination],
              geodesic: true,
              strokeColor: '#EAB308',
              strokeOpacity: 0.85,
              strokeWeight: 5,
              map,
            });
          }
        }
      );
    } else {
      polylineFallback = new google.maps.Polyline({
        path: [origin, destination],
        geodesic: true,
        strokeColor: '#EAB308',
        strokeOpacity: 0.85,
        strokeWeight: 5,
        map,
      });
    }

    return () => {
      if (directionsRenderer) directionsRenderer.setMap(null);
      if (polylineFallback) polylineFallback.setMap(null);
    };
  }, [map, origin.lat, origin.lng, destination.lat, destination.lng]);

  if (!routeInfo) return null;

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 bg-slate-900/90 text-white px-4 py-2 rounded-2xl shadow-2xl border border-amber-400 flex items-center gap-2 text-xs font-bold pointer-events-auto">
      <span className="text-amber-400">🛣️</span>
      <span>
        {label || 'Ruta activa'}: <span className="text-amber-400 font-extrabold">{routeInfo.distance}</span> (~{routeInfo.duration})
      </span>
    </div>
  );
}

// Map Double-Click Listener for traffic alerts
function MapEventsListener({ onMapDblClick }: { onMapDblClick: (latLng: { lat: number; lng: number }) => void }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const listener = map.addListener('dblclick', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        onMapDblClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      }
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map, onMapDblClick]);

  return null;
}

// Marker item for Traffic Alert Checkpoints ("Operativos de Tránsito")
function TrafficAlertMarkerItem({
  alert,
  currentUserId
}: {
  key?: string;
  alert: TrafficAlert;
  currentUserId: string;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  const minutesAgo = Math.max(1, Math.floor((Date.now() - alert.timestamp) / 60000));
  const remainingMin = Math.max(0, 60 - minutesAgo);

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'alerts', alert.id));
    } catch (err) {
      console.error('Error deleting alert:', err);
    }
  };

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: alert.latitude, lng: alert.longitude }}
        onClick={() => setOpen(prev => !prev)}
        title="Operativo de Tránsito"
      >
        <div className="relative cursor-pointer group">
          <span className="absolute -inset-1.5 rounded-full bg-red-500 opacity-75 animate-ping"></span>
          <div className="relative bg-red-600 text-white font-black text-[10px] px-2.5 py-1 rounded-full shadow-2xl border-2 border-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
            <span className="text-sm">🚨</span>
            <span>Operativo</span>
          </div>
        </div>
      </AdvancedMarker>

      {open && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)}>
          <div className="p-2.5 max-w-[230px] text-slate-800 font-sans space-y-1.5">
            <div className="flex items-center gap-1.5 text-red-600 font-extrabold text-xs">
              <span className="text-base">🚨</span>
              <span>Operativo de Tránsito</span>
            </div>
            <p className="text-[10px] text-slate-600">
              Reportado por: <strong className="text-slate-900">{alert.reportedByName}</strong>
            </p>
            <p className="text-[10px] font-mono text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              ⏱️ Hace {minutesAgo} min (Expira en {remainingMin} min)
            </p>

            {alert.reportedBy === currentUserId && (
              <button
                type="button"
                onClick={handleDelete}
                className="w-full mt-1 bg-red-100 hover:bg-red-200 text-red-700 font-bold text-[10px] py-1 px-2 rounded-lg transition-colors cursor-pointer"
              >
                🗑️ Eliminar Reporte
              </button>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
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
  onSelectUser: (user: UserProfile, initialMessage?: string) => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  const rawCoords = useMemo(() => getUserCoords(user), [user]);
  // Smooth position interpolation
  const animatedCoords = useSmoothPosition(rawCoords);

  const myRawCoords = useMemo(() => getUserCoords(currentUserProfile), [currentUserProfile]);

  const distanceInKm = useMemo(() => {
    if (isCurrentUser) return 0;
    return getHaversineDistance(myRawCoords.lat, myRawCoords.lng, rawCoords.lat, rawCoords.lng);
  }, [isCurrentUser, myRawCoords, rawCoords]);

  const isDriver = user.role === 'moto';
  const myZone = currentUserProfile.zone || 'Langue (Centro)';

  const defaultAutoMsg = `¡Hola ${user.name.split(' ')[0]}! Estoy en ${myZone}. ¿Estás disponible para un servicio de mototaxi?`;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={animatedCoords}
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
          <div className="p-2 min-w-[230px] max-w-[270px] text-slate-800 font-sans">
            <div className="flex items-center gap-2 mb-1.5 border-b border-slate-100 pb-1.5">
              <span className="text-xl shrink-0">{isDriver ? '🛵' : '👤'}</span>
              <div className="overflow-hidden">
                <h4 className="font-extrabold text-xs text-slate-900 leading-tight truncate">{user.name}</h4>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  {isDriver ? 'Mototaxista en línea' : 'Cliente en línea'}
                </p>
              </div>
            </div>

            <div className="space-y-1 text-[11px] text-slate-600 mb-2.5">
              <p className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold truncate">{user.zone || 'Langue (Centro)'}</span>
              </p>

              {user.phone && (
                <p className="flex items-center gap-1 font-mono font-bold text-slate-700">
                  <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
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
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                  <span>{user.averageRating?.toFixed(1)} / 5.0 ({user.ratingCount || 0} res)</span>
                </p>
              )}

              {!isCurrentUser && (
                <p className="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded w-max mt-1">
                  📍 Distancia: {distanceInKm.toFixed(1)} km
                </p>
              )}
            </div>

            {!isCurrentUser && (
              <div className="space-y-1.5 border-t border-slate-100 pt-2">
                {/* Auto Service Request Button - ONLY shown to Clients requesting a Mototaxi */}
                {currentUserProfile.role === 'cliente' && isDriver && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onSelectUser(user, defaultAutoMsg);
                    }}
                    className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-extrabold text-[10px] uppercase tracking-wider py-2 px-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5 fill-slate-950" />
                    <span>🚀 Solicitar Servicio Automático</span>
                  </button>
                )}

                {/* Direct Chat / Continue Chat Button */}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSelectUser(user);
                  }}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[10px] uppercase tracking-wider py-2 px-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-yellow-400" />
                  <span>{currentUserProfile.role === 'moto' ? '💬 Continuar Chat / Ver Servicio' : '💬 Abrir Chat Directo'}</span>
                </button>
              </div>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export default function MapView({ currentUserProfile, onlineUsers, activeChats, onSelectUser, onCloseMap }: MapViewProps) {
  const centerCoords = useMemo(() => getUserCoords(currentUserProfile), [currentUserProfile]);

  const [trafficAlerts, setTrafficAlerts] = useState<TrafficAlert[]>([]);
  const [pendingAlertCoords, setPendingAlertCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isSavingAlert, setIsSavingAlert] = useState(false);

  // Subscribe to real-time Traffic Alerts ("Operativos de Tránsito") from Firestore
  useEffect(() => {
    const q = query(collection(db, 'alerts'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const now = Date.now();
        const loadedAlerts: TrafficAlert[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as TrafficAlert;
          // Only show alerts created within the last 1 hour (3600000 ms)
          if (data.timestamp && now - data.timestamp < 3600000) {
            loadedAlerts.push(data);
          }
        });
        setTrafficAlerts(loadedAlerts);
      },
      (error) => {
        console.warn('Error fetching traffic alerts:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Handle saving new traffic alert
  const handleSaveAlert = async () => {
    if (!pendingAlertCoords || isSavingAlert) return;

    setIsSavingAlert(true);
    try {
      const alertId = `alert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await setDoc(doc(db, 'alerts', alertId), {
        id: alertId,
        latitude: pendingAlertCoords.lat,
        longitude: pendingAlertCoords.lng,
        reportedBy: currentUserProfile.uid,
        reportedByName: currentUserProfile.name,
        timestamp: Date.now(),
      });
      setPendingAlertCoords(null);
    } catch (err) {
      console.error('Error saving traffic alert:', err);
    } finally {
      setIsSavingAlert(false);
    }
  };

  // Set of client UIDs who currently have an active (open, non-deleted) chat/service with this driver
  const activeClientIdsForDriver = useMemo(() => {
    if (currentUserProfile.role !== 'moto' || !activeChats) return new Set<string>();

    const clientIds = new Set<string>();
    activeChats.forEach(chat => {
      if (
        chat.driverId === currentUserProfile.uid &&
        chat.status === 'open' &&
        !chat.driverDeleted &&
        !chat.clientDeleted
      ) {
        clientIds.add(chat.clientId);
      }
    });
    return clientIds;
  }, [currentUserProfile, activeChats]);

  // Extract active driver-client pairs with open service chats for rendering short route directions
  const activeRoutePairs = useMemo(() => {
    if (!activeChats || activeChats.length === 0) return [];

    const pairs: Array<{ driver: UserProfile; client: UserProfile; chat: ChatSession }> = [];

    activeChats.forEach(chat => {
      if (chat.status === 'open' && !chat.clientDeleted && !chat.driverDeleted) {
        // Find driver and client in onlineUsers or currentUserProfile
        const driver = onlineUsers.find(u => u.uid === chat.driverId) ||
          (currentUserProfile.uid === chat.driverId ? currentUserProfile : null);
        const client = onlineUsers.find(u => u.uid === chat.clientId) ||
          (currentUserProfile.uid === chat.clientId ? currentUserProfile : null);

        if (driver && client) {
          pairs.push({ driver, client, chat });
        }
      }
    });

    return pairs;
  }, [activeChats, onlineUsers, currentUserProfile]);

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

  // Filter online mototaxis and online clients according to exact user role & active service rules:
  // 1. CLIENTS ('cliente'): See ALL online mototaxis ('moto') + themselves. NEVER see other clients.
  // 2. MOTOTAXISTAS ('moto'): See ALL online colleague mototaxis ('moto') + themselves.
  //    ONLY see a client ('cliente') if that client currently has an active, open chat/service with this mototaxista.
  const allMapUsers = useMemo(() => {
    const isClient = currentUserProfile.role === 'cliente';

    // Ensure current user is included
    const existsInOnline = onlineUsers.some(u => u.uid === currentUserProfile.uid);
    const baseList = existsInOnline ? onlineUsers : [currentUserProfile, ...onlineUsers];

    if (isClient) {
      // Clients see themselves and all online mototaxistas ('moto'), but NO other clients
      return baseList.filter(u => u.uid === currentUserProfile.uid || u.role === 'moto');
    } else {
      // Mototaxistas see themselves and all online colleagues ('moto'), and ONLY clients with active chat/service
      return baseList.filter(u => {
        if (u.uid === currentUserProfile.uid) return true; // Self
        if (u.role === 'moto') return true; // Colleague mototaxistas
        if (u.role === 'cliente') {
          return activeClientIdsForDriver.has(u.uid); // Active client in chat
        }
        return false;
      });
    }
  }, [currentUserProfile, onlineUsers, activeClientIdsForDriver]);

  const activeMototaxisCount = useMemo(() => {
    return onlineUsers.filter(u => u.role === 'moto').length;
  }, [onlineUsers]);

  return (
    <div className="h-full w-full relative flex flex-col bg-slate-100">
      {/* Top Floating Header Banner */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md text-white px-3.5 py-2 rounded-2xl shadow-xl border border-slate-800 flex items-center gap-2 pointer-events-auto">
          <span className="text-xl">🛵</span>
          <div>
            <h3 className="font-extrabold text-xs tracking-wide">Mapa MotoGo en Vivo</h3>
            <p className="text-[9px] text-yellow-400 font-mono font-bold flex items-center gap-1">
              <span>📍 Radio 1km</span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-200">
                {currentUserProfile.role === 'cliente'
                  ? `${activeMototaxisCount} Mototaxis disponibles`
                  : activeClientIdsForDriver.size > 0
                    ? `${activeClientIdsForDriver.size} Servicio(s) activo(s) en mapa`
                    : `${activeMototaxisCount} Colegas mototaxis`}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="hidden sm:flex bg-red-600/90 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-2xl shadow-lg border border-red-500 items-center gap-1">
            <span>🚨</span>
            <span>Doble clic para Operativo</span>
          </div>

          {onCloseMap && (
            <button
              onClick={onCloseMap}
              className="bg-white/95 text-slate-800 hover:bg-white font-extrabold text-xs px-3 py-2 rounded-2xl shadow-xl border border-slate-200 cursor-pointer"
            >
              ❌ Cerrar
            </button>
          )}
        </div>
      </div>

      {/* Map Canvas */}
      <APIProvider apiKey={API_KEY} version="weekly">
        <Map
          defaultCenter={centerCoords}
          defaultZoom={15}
          mapId="MOTOGO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
          gestureHandling="greedy"
          disableDefaultUI={false}
          disableDoubleClickZoom={true}
        >
          {/* Double Click Listener */}
          <MapEventsListener onMapDblClick={(coords) => setPendingAlertCoords(coords)} />

          {/* Visual 1 km Coverage Radius Indicator */}
          <Radius1KmCircle center={centerCoords} />

          {/* Active Shortest Routes between Drivers & Clients */}
          {activeRoutePairs.map((pair) => (
            <ShortestRouteDirections
              key={pair.chat.id}
              origin={getUserCoords(pair.driver)}
              destination={getUserCoords(pair.client)}
              label={`Servicio: ${pair.driver.name.split(' ')[0]} ↔ ${pair.client.name.split(' ')[0]}`}
            />
          ))}

          {/* User Markers */}
          {allMapUsers.map((u) => (
            <UserMarkerItem
              key={u.uid}
              user={u}
              isCurrentUser={u.uid === currentUserProfile.uid}
              currentUserProfile={currentUserProfile}
              onSelectUser={onSelectUser}
            />
          ))}

          {/* Traffic Alert Markers ("Operativos de Tránsito") */}
          {trafficAlerts.map((alert) => (
            <TrafficAlertMarkerItem
              key={alert.id}
              alert={alert}
              currentUserId={currentUserProfile.uid}
            />
          ))}
        </Map>
      </APIProvider>

      {/* Confirmation Modal for Reporting Traffic Checkpoints */}
      {pendingAlertCoords && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-xs w-full shadow-2xl border border-slate-200 text-center space-y-3 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto text-2xl animate-pulse">
              🚨
            </div>
            <h3 className="font-extrabold text-slate-900 text-base">¿Marcar Operativo de Tránsito?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Se publicará esta alerta en el mapa para todos los mototaxistas y usuarios en tiempo real. Permanecerá visible durante <strong>1 hora</strong>.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSaveAlert}
                disabled={isSavingAlert}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs py-2.5 rounded-xl shadow-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                {isSavingAlert ? 'Guardando...' : '🚨 Confirmar Reporte de Operativo'}
              </button>
              <button
                type="button"
                onClick={() => setPendingAlertCoords(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

