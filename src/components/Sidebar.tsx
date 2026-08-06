/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { UserProfile, ChatSession, PanicAlert } from '../types';
import { LogOut, User, Users, Shield, Compass, ChevronRight, MessageSquare, RefreshCw, Radio, Terminal, Settings, Zap, AlertTriangle, Siren } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getHaversineDistance, ZONAS_COORDINATES } from '../utils/location';
import { GpsCoordinates, GpsEnvInfo, GpsStatus, TrackingState } from '../hooks/useGpsTracker';

const ZONAS_PRESETS = [
  "Langue (Centro)",
  "Concepción de Langue",
  "San Isidro",
  "El Jícaro",
  "El Carrizal",
  "Las Mesas",
  "San Francisco",
  "Aduana El Amatillo",
  "Nacaome Centro",
  "Pespire Centro",
  "Choluteca Centro",
];

interface SidebarProps {
  currentUserProfile: UserProfile;
  onlineUsers: UserProfile[];
  activeChats: ChatSession[];
  selectedChatId: string | null;
  panicAlerts?: PanicAlert[];
  onTriggerPanic?: () => void;
  myActivePanicAlert?: PanicAlert | null;
  onSelectUser: (user: UserProfile) => void;
  onSelectChat: (chat: ChatSession) => void;
  onTransferChat: (targetDriver: UserProfile) => void;
  onLogout: () => void;
  onUpdateZone: (newZone: string) => Promise<void>;
  onToggleMap?: () => void;
  isMapActive?: boolean;
  gpsStatus?: GpsStatus;
  onRetryGps?: () => void;
  gpsTrackingState?: TrackingState;
  gpsCoords?: GpsCoordinates | null;
  gpsLogs?: string[];
  gpsEnvInfo?: GpsEnvInfo;
  onStopGps?: () => void;
  gpsIsStarted?: boolean;
  isSensorOff?: boolean;
}

export default function Sidebar({
  currentUserProfile,
  onlineUsers,
  activeChats,
  selectedChatId,
  panicAlerts = [],
  onTriggerPanic,
  myActivePanicAlert,
  onSelectUser,
  onSelectChat,
  onTransferChat,
  onLogout,
  onUpdateZone,
  onToggleMap,
  isMapActive = false,
  gpsStatus = 'prompt',
  onRetryGps,
  gpsTrackingState = 'inactive',
  gpsCoords = null,
  gpsLogs = [],
  gpsEnvInfo = { isStandalone: false, isWebView: false, isSocialMedia: false, mobileBrand: 'Generico/Otros' },
  onStopGps,
  gpsIsStarted = false,
  isSensorOff = false
}: SidebarProps) {
  const isDriver = currentUserProfile.role === 'moto';
  const [isEditingZone, setIsEditingZone] = useState(false);
  const [selectedZone, setSelectedZone] = useState(currentUserProfile.zone || 'Langue (Centro)');
  const [customZone, setCustomZone] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const getExtendedDistanceInfo = (otherUser: UserProfile) => {
    // 1. Try real GPS position (if both users have GPS coords)
    if (
      currentUserProfile.latitude !== undefined &&
      currentUserProfile.longitude !== undefined &&
      otherUser.latitude !== undefined &&
      otherUser.longitude !== undefined
    ) {
      const distance = getHaversineDistance(
        currentUserProfile.latitude,
        currentUserProfile.longitude,
        otherUser.latitude,
        otherUser.longitude
      );
      return {
        distance,
        display: `${distance.toFixed(1)} km`,
        isGps: true
      };
    }

    // 2. Fallback: Zone centroids (approximate distance)
    const getZoneCoords = (zoneName?: string) => {
      if (!zoneName) return ZONAS_COORDINATES["Langue (Centro)"];
      return ZONAS_COORDINATES[zoneName] || ZONAS_COORDINATES["Langue (Centro)"];
    };

    const myCoords = getZoneCoords(currentUserProfile.zone);
    const otherCoords = getZoneCoords(otherUser.zone);

    if (myCoords && otherCoords) {
      const distance = getHaversineDistance(
        myCoords.lat,
        myCoords.lon,
        otherCoords.lat,
        otherCoords.lon
      );
      
      if (distance === 0) {
        return {
          distance: 0.5,
          display: "Misma zona (< 1 km)",
          isGps: false
        };
      }
      return {
        distance,
        display: `~${distance.toFixed(1)} km (Zona)`,
        isGps: false
      };
    }

    return null;
  };

  const renderStars = (averageRating?: number, ratingCount?: number, darkTheme: boolean = false) => {
    const rating = averageRating || 0;
    const count = ratingCount !== undefined ? ratingCount : 0;
    if (rating === 0) {
      return (
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold ${darkTheme ? 'bg-slate-800 text-slate-400 border border-slate-700' : 'bg-slate-100 text-slate-500 border border-slate-200'}`} title="Sin calificaciones aún">
          ★ Nuevo
        </span>
      );
    }
    const rounded = Math.round(rating);
    const starSpan = [];
    for (let i = 1; i <= 5; i++) {
      starSpan.push(
        <span
          key={i}
          className={i <= rounded ? "text-yellow-400 font-extrabold" : darkTheme ? "text-slate-700 font-bold" : "text-slate-300 font-bold"}
        >
          ★
        </span>
      );
    }
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${darkTheme ? 'bg-yellow-405/20 text-yellow-400 border border-yellow-400/10' : 'bg-amber-500/10 text-amber-700'}`} title={`Calificación: ${rating.toFixed(2)} (${count} viajes)`}>
        <span className="flex gap-0.5">{starSpan}</span>
        <span>{rating.toFixed(1)}</span>
        {count > 0 && <span className={darkTheme ? "text-slate-400 font-normal" : "text-slate-500 font-normal"}>({count})</span>}
      </span>
    );
  };

  // Filter other online drivers and sort by proximity (closest first)
  const rawDrivers = onlineUsers.filter(u => u.uid !== currentUserProfile.uid && u.role === 'moto');
  const onlineDrivers = [...rawDrivers].sort((a, b) => {
    const distA = getExtendedDistanceInfo(a)?.distance ?? 9999;
    const distB = getExtendedDistanceInfo(b)?.distance ?? 9999;
    return distA - distB;
  });

  // Filter other online clients (in case driver wants to browse) and sort by proximity too
  const rawClients = onlineUsers.filter(u => u.uid !== currentUserProfile.uid && u.role === 'cliente');
  const onlineClients = [...rawClients].sort((a, b) => {
    const distA = getExtendedDistanceInfo(a)?.distance ?? 9999;
    const distB = getExtendedDistanceInfo(b)?.distance ?? 9999;
    return distA - distB;
  });

  return (
    <aside className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col h-full shrink-0 shadow-sm" id="sidebar">
      {/* Sidebar Header: Profile Information */}
      <div className="p-5 bg-slate-900 text-white flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-yellow-500 text-slate-900 rounded-full flex items-center justify-center font-bold text-sm shadow-sm">
            {currentUserProfile.name ? currentUserProfile.name.substring(0, 2).toUpperCase() : 'RM'}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-white text-sm leading-tight truncate max-w-[130px]">
              {currentUserProfile.name}
            </h3>
            <div className="flex items-center flex-wrap gap-1 mt-1">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                isDriver ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/10' : 'bg-blue-400/20 text-blue-300 border border-blue-400/10'
              }`}>
                {isDriver ? 'Mototaxista' : 'Cliente'}
              </span>
              {isDriver && renderStars(currentUserProfile.averageRating, currentUserProfile.ratingCount, true)}
            </div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
          title="Cerrar sesión"
          id="logout-btn"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Location / Geographic Zone Selector Sub-Header */}
      <div className="px-5 py-3.5 bg-slate-800 text-white border-t border-slate-700 flex flex-col justify-start gap-1">
        <div className="flex items-center justify-between w-full">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <span>📍</span> Ubicación Actual
          </span>
          <button 
            type="button"
            onClick={() => setIsEditingZone(!isEditingZone)}
            className="text-[10px] text-yellow-405 hover:text-yellow-300 font-bold bg-transparent border-none cursor-pointer p-0 select-none outline-none"
          >
            {isEditingZone ? 'Cancelar' : 'Cambiar Ubicación'}
          </button>
        </div>
        
        {isEditingZone ? (
          <div className="mt-2 flex flex-col gap-2">
            <select
              value={selectedZone}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedZone(val);
                if (val !== 'Otro') {
                  onUpdateZone(val);
                  setIsEditingZone(false);
                }
              }}
              className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-yellow-400 font-medium"
            >
              {ZONAS_PRESETS.map(z => (
                <option key={z} className="bg-slate-900" value={z}>{z}</option>
              ))}
              <option className="bg-slate-900" value="Otro">Otro (Escribir...)</option>
            </select>
            
            {selectedZone === 'Otro' && (
              <motion.div 
                initial={{ opacity: 0, y: -5 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="flex gap-1.5"
              >
                <input
                  type="text"
                  placeholder="Escribe municipio o aldea"
                  value={customZone}
                  onChange={(e) => setCustomZone(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 text-white text-xs rounded px-2.5 py-1.5 placeholder-slate-500 font-semibold focus:outline-none focus:border-yellow-450"
                />
                <button
                  type="button"
                  onClick={() => {
                    const finalZ = customZone.trim();
                    if (finalZ) {
                      onUpdateZone(finalZ);
                      setIsEditingZone(false);
                    }
                  }}
                  className="bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold text-xs rounded px-3 py-1.5 transition-colors cursor-pointer"
                >
                  Ok
                </button>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-0.5">
            {/* Location & Diagnostic Trigger */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-yellow-400 tracking-wide truncate flex items-center gap-1">
                {currentUserProfile.zone || 'Langue (Centro)'}
              </span>
              
              <button
                type="button"
                onClick={() => setShowDiagnostics(prev => !prev)}
                className={`p-1 rounded-md text-[10px] uppercase font-bold px-1.5 flex items-center gap-1 cursor-pointer transition-all ${
                  showDiagnostics 
                    ? 'bg-yellow-400 text-slate-950 font-extrabold scale-105' 
                    : 'bg-slate-800 text-slate-400 border border-slate-700/50 hover:bg-slate-700 hover:text-white'
                }`}
                title="Ver diagnósticos del GPS de tu celular"
              >
                <Terminal className="w-3 h-3" />
                <span>Diag</span>
              </button>
            </div>

            {/* Live Map Toggle Button */}
            {onToggleMap && (
              <button
                type="button"
                onClick={onToggleMap}
                className={`w-full py-2 px-3 font-extrabold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isMapActive
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold'
                    : 'bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-extrabold'
                }`}
              >
                <span>{isMapActive ? '💬' : '🗺️'}</span>
                <span>{isMapActive ? '💬 Ver Lista de Chats' : '🗺️ Ver Mapa MotoGo en Vivo'}</span>
              </button>
            )}

            {/* Emergency Panic Button for Mototaxistas */}
            {currentUserProfile.role === 'moto' && onTriggerPanic && (
              <button
                type="button"
                onClick={onTriggerPanic}
                className={`w-full py-2.5 px-3 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg border-2 ${
                  myActivePanicAlert
                    ? 'bg-red-600 hover:bg-red-700 text-white border-yellow-300 animate-bounce'
                    : 'bg-red-600 hover:bg-red-700 text-white border-yellow-400 active:scale-95'
                }`}
              >
                <Siren className="w-4 h-4 animate-pulse shrink-0 text-yellow-300" />
                <span>{myActivePanicAlert ? '🚨 PÁNICO ACTIVO (Ver / Resolver)' : '🚨 BOTÓN DE PÁNICO (SOS)'}</span>
              </button>
            )}

            {/* In-App Social Media Browser / OS Detection warning - REQUIREMENT 11 & 12 */}
            {gpsEnvInfo.isSocialMedia && gpsStatus !== 'granted' && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex flex-col gap-1.5 text-[9px] text-slate-300">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 animate-bounce" />
                  <span>Navegador de Redes Sociales Detectado</span>
                </div>
                <p className="leading-tight text-slate-400">
                  Estás viendo la app dentro de <strong className="text-white">WhatsApp, Facebook o Instagram</strong>. Estos navegadores bloquean el GPS para seguridad.
                </p>
                <div className="bg-slate-950/60 p-2 rounded border border-slate-800 text-[8.5px] space-y-1">
                  <p className="font-bold text-yellow-400">¿Cómo habilitarlo?</p>
                  <p className="text-slate-300">
                    Sigue estos pasos para solucionarlo:
                  </p>
                  <ol className="list-decimal list-inside space-y-0.5 text-slate-300">
                    <li>Toca los <strong className="text-white">3 puntos •••</strong> arriba a la derecha.</li>
                    <li>Selecciona <strong className="text-white">"Abrir en el navegador"</strong> o <strong className="text-white">"Abrir en Chrome" / "Abrir en Safari"</strong>.</li>
                  </ol>
                </div>
              </div>
            )}

            {/* GPS Interactive status indicators & guidance */}
            {isSensorOff ? (
              <div className="bg-amber-500/10 border border-amber-500/15 rounded-lg p-2.5 flex flex-col gap-2 text-[9px] text-slate-300">
                <div className="flex items-center justify-between gap-1 text-amber-400 font-bold">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                    <span>GPS del Celular Apagado</span>
                  </div>
                </div>

                {onRetryGps && (
                  <button
                    type="button"
                    onClick={onRetryGps}
                    className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold rounded-lg py-2 px-2 flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95 text-[9px] tracking-wider uppercase font-mono shadow-sm"
                  >
                    <RefreshCw className="w-3 h-3 animate-spin duration-1000" />
                    <span>Conceder / Reintentar GPS</span>
                  </button>
                )}
              </div>
            ) : gpsStatus === 'denied' || gpsTrackingState === 'error' ? (
              <div className="bg-red-500/10 border border-red-500/15 rounded-lg p-2.5 flex flex-col gap-2 text-[9px] text-slate-300">
                <div className="flex items-center justify-between gap-1 text-red-400 font-bold">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                    <span>Ubicación GPS Bloqueada</span>
                  </div>
                </div>

                {onRetryGps && (
                  <button
                    type="button"
                    onClick={onRetryGps}
                    className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold rounded-lg py-2 px-2 flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95 text-[9px] tracking-wider uppercase font-mono shadow-sm"
                  >
                    <RefreshCw className="w-3 h-3 animate-spin duration-1000" />
                    <span>Conceder / Reintentar GPS</span>
                  </button>
                )}
              </div>
            ) : gpsStatus === 'granted' && (gpsTrackingState === 'active' || gpsCoords !== null || currentUserProfile.hasGPS) ? (
              <div className="flex flex-col gap-1 bg-slate-900/40 p-2 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-emerald-400 font-bold flex items-center gap-1 font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    GPS ACTIVO ({gpsCoords ? `+/- ${gpsCoords.accuracy.toFixed(0)}m` : '15km'})
                  </span>
                  {gpsIsStarted && onStopGps && (
                    <button
                      type="button"
                      onClick={onStopGps}
                      className="text-[8px] uppercase tracking-wider text-red-400 hover:text-red-300 underline font-mono cursor-pointer"
                    >
                      Pausar
                    </button>
                  )}
                </div>
                {gpsCoords && (
                  <div className="flex justify-between items-center text-[8px] text-slate-400 font-mono">
                    <span>L: {gpsCoords.latitude.toFixed(5)}</span>
                    <span>Lon: {gpsCoords.longitude.toFixed(5)}</span>
                  </div>
                )}
              </div>
            ) : gpsTrackingState === 'searching' || gpsStatus === 'prompt' ? (
              <div className="flex flex-col gap-2 bg-slate-900/35 border border-slate-800/80 rounded-lg p-2.5">
                <span className="text-[9px] text-amber-400 font-bold flex items-center gap-1 font-mono animate-pulse">
                  <RefreshCw className="w-3 h-3 text-yellow-400 animate-spin" />
                  Buscando señal GPS ({gpsEnvInfo.mobileBrand})...
                </span>
                <p className="text-[8px] text-slate-400 leading-normal">
                  La geolocalización permite encontrarte automáticamente con personas en un radio de 15km.
                </p>
                {onRetryGps && (
                  <button
                    type="button"
                    onClick={onRetryGps}
                    className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700/60 font-bold rounded-lg py-1 px-2 flex items-center justify-center gap-1 cursor-pointer transition-all text-[9.5px]"
                  >
                    <Compass className="w-3 h-3 text-yellow-400" />
                    <span className="text-[9px] text-slate-200">Activar/Actualizar GPS</span>
                  </button>
                )}
              </div>
            ) : gpsTrackingState === 'timeout' ? (
              <div className="flex flex-col gap-2 bg-amber-500/10 border border-amber-500/15 rounded-lg p-2.5 text-[9px]">
                <div className="flex items-center gap-1 text-amber-400 font-bold font-mono">
                  <span>⏱️</span>
                  <span>Tiempo Agotado Buscando GPS</span>
                </div>
                <p className="text-[8px] text-slate-350 leading-relaxed">
                  El satélite tarda demasiado en responder. Asegúrate de estar bajo cielo descubierto o cerca de una ventana.
                </p>
                {onRetryGps && (
                  <button
                    type="button"
                    onClick={onRetryGps}
                    className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold rounded-lg py-1 px-1.5 flex items-center justify-center gap-1 cursor-pointer transition-colors font-mono"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Forzar Reintento</span>
                  </button>
                )}
              </div>
            ) : (
              // General error or fallback
              <div className="flex flex-col gap-2 bg-amber-500/15 border border-amber-500/20 rounded-lg p-2.5 text-[9px] text-slate-300">
                <span className="text-amber-400 font-bold flex items-center gap-1 font-mono">
                  ⚠️ Limitación de Señal Local
                </span>
                <p className="leading-relaxed text-slate-400">
                  El GPS no ha devuelto información todavía. Puedes fijar tu ubicación de soporte manualmente arriba.
                </p>
                {onRetryGps && (
                  <button
                    type="button"
                    onClick={onRetryGps}
                    className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold rounded-lg py-1.5 px-1.5 flex items-center justify-center gap-1 cursor-pointer transition-colors font-mono"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Habilitar Señal GPS Celular</span>
                  </button>
                )}
              </div>
            )}

            {/* Diagnostic collapsible Terminal panel - REQUIREMENT 16 */}
            <AnimatePresence>
              {showDiagnostics && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden bg-slate-950 border border-slate-800 rounded-lg"
                >
                  <div className="p-2 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
                    <span className="text-[9px] font-bold text-yellow-500 uppercase font-mono flex items-center gap-1">
                      <Terminal className="w-3 h-3 text-yellow-400" />
                      Rastreador Satelital Interno
                    </span>
                    <span className="text-[8px] bg-slate-800 text-slate-300 px-1 py-0.5 rounded font-mono font-bold">
                      {gpsEnvInfo.mobileBrand}
                    </span>
                  </div>

                  <div className="p-2 text-[8px] font-mono leading-relaxed text-slate-300 space-y-1 bg-slate-950">
                    <div className="grid grid-cols-2 gap-1.5 border-b border-slate-900 pb-1.5 text-[8.5px]">
                      <div>
                        <span className="text-slate-500">Modo: </span>
                        <strong className="text-slate-200">
                          {gpsEnvInfo.isStandalone ? 'PWA Standalone' : 'Navegador Web'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">OS/Modelo: </span>
                        <strong className="text-slate-250 font-bold text-slate-200">Android</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Estado GPS: </span>
                        <strong className={
                          gpsTrackingState === 'active' ? 'text-emerald-400' :
                          gpsTrackingState === 'searching' ? 'text-yellow-400' : 'text-red-400'
                        }>
                          {gpsTrackingState === 'active' ? 'Conectado' : 
                           gpsTrackingState === 'searching' ? 'Buscando' : 'Inactivo'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Precisión actual: </span>
                        <strong className="text-slate-100">
                          {gpsCoords ? `${gpsCoords.accuracy.toFixed(1)} m` : '--'}
                        </strong>
                      </div>
                    </div>

                    <div className="space-y-1 pt-1">
                      <p className="font-bold text-slate-400 text-[8.5px] uppercase border-b border-slate-900 pb-0.5">Logs en vivo de Android:</p>
                      <div className="max-h-[90px] overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                        {gpsLogs.length === 0 ? (
                          <p className="text-slate-600 italic">No hay logs satelitales guardados.</p>
                        ) : (
                          gpsLogs.map((logStr, idx) => (
                            <p key={idx} className="text-slate-300 whitespace-nowrap overflow-x-auto">
                              {logStr}
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Optimizations & specific brands quick hints */}
                  <div className="px-2 py-1.5 bg-slate-900/60 text-[8px] text-slate-400 space-y-1">
                    <p className="font-bold text-yellow-600 text-[8.5px]">⚙️ Ajustes recomendados para {gpsEnvInfo.mobileBrand}:</p>
                    {gpsEnvInfo.mobileBrand === 'Xiaomi' && (
                      <p className="leading-normal">Xiaomi &rarr; Mantén presionada la app &rarr; Información &rarr; Permisos &rarr; Ubicación en segundo plano &rarr; "Permitir siempre".</p>
                    )}
                    {gpsEnvInfo.mobileBrand === 'Huawei' && (
                      <p className="leading-normal">Huawei &rarr; Ajustes &rarr; Aplicaciones &rarr; Permisos de Aplicación &rarr; Localización de alta fidelidad &rarr; "Activar".</p>
                    )}
                    {gpsEnvInfo.mobileBrand === 'Samsung' && (
                      <p className="leading-normal">Samsung &rarr; Ajustes de Ubicación &rarr; Mejorar Precisión &rarr; Habilita "Búsqueda con Wi-Fi/Bluetooth".</p>
                    )}
                    {gpsEnvInfo.mobileBrand === 'Generico/Otros' && (
                      <p className="leading-normal font-sans">Habilita "Ubicación de alta precisión de Google" para que use red móvil antenas y satélites simultáneamente.</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Online Status Header banner */}
      <div className="px-4 py-2.5 bg-slate-50 text-[10px] text-emerald-600 flex items-center gap-2 border-b border-slate-100 font-mono tracking-wider font-bold">
        <div className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </div>
        <span>CONECTADO • PRESENCIA ACTIVA</span>
      </div>

      {/* Scrollable List Container */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-[#F7F9FB] p-2 space-y-3">
        
        {/* SECTION 1: ACTIVE CHATS (FOR DRIVERS - INCOMING CLIENT REQUESTS) */}
        {isDriver && (
          <div className="p-1">
            <h4 className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 mt-1 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
              <span>Solicitudes de Clientes ({activeChats.length})</span>
            </h4>
            
            {activeChats.length === 0 ? (
              <div className="px-3 py-6 bg-white border border-dashed border-slate-200 rounded-xl text-center">
                <p className="text-slate-500 text-xs font-medium">Esperando solicitudes...</p>
                <p className="text-[10px] text-slate-400 mt-1">Saldrás en la lista de los clientes online.</p>
              </div>
            ) : (
              <div className="space-y-2 font-sans text-slate-800">
                {activeChats.map((chat) => {
                  const isActive = selectedChatId === chat.id;
                  const clientUser = onlineUsers.find(u => u.uid === chat.clientId);
                  const distanceInfo = clientUser ? getExtendedDistanceInfo(clientUser) : null;
                  return (
                    <div
                      key={chat.id}
                      onClick={() => onSelectChat(chat)}
                      className={`p-3 rounded-xl cursor-pointer border transition-all shadow-sm ${
                        isActive
                          ? 'bg-yellow-400 text-slate-950 font-bold border-yellow-400 shadow-md'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-xs block truncate max-w-[120px]">
                          👤 {chat.clientName}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 select-none">
                          {distanceInfo && (
                            <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded border ${
                              isActive
                                ? 'bg-slate-950/25 text-slate-950 border-slate-950/20'
                                : 'bg-sky-50 text-sky-700 border-sky-100/80'
                            }`} title={`Distancia calculada: ${distanceInfo.display}`}>
                              📍 {distanceInfo.display}
                              {distanceInfo.distance <= 5 && (
                                <span className="ml-1 text-[7.5px] font-black uppercase text-amber-700 animate-pulse">
                                  ⚡5km
                                </span>
                              )}
                            </span>
                          )}
                          <span className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider font-mono ${
                            isActive
                              ? 'bg-slate-950/20 text-slate-950'
                              : chat.status === 'transferred'
                                ? 'bg-orange-100 text-orange-750 border border-orange-200'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {chat.status === 'transferred' ? 'Transf.' : 'Recibido'}
                          </span>
                        </div>
                      </div>
                      <p className={`text-[11px] mt-1.5 truncate ${isActive ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>
                        {chat.lastMessage || 'Inicializando servicio...'}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SECTION 2: ONLINE DRIVERS (FOR CLIENTS - TO CHOOSE AND CHAT) */}
        {!isDriver && (
          <div className="p-1">
            <h4 className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 mt-1 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-slate-500 animate-spin-slow" />
              <span>Mototaxistas en Línea ({onlineDrivers.length})</span>
            </h4>

            {onlineDrivers.length === 0 ? (
              <div className="px-3 py-6 bg-white border border-dashed border-slate-200 rounded-xl text-center">
                <p className="text-slate-500 text-xs font-semibold">No hay mototaxistas en línea</p>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">Por favor espera un momento hasta que alguno inicie sesión.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {onlineDrivers.map((driver) => {
                  const associatedChat = activeChats.find(c => c.driverId === driver.uid);
                  const isSelected = selectedChatId === `${currentUserProfile.uid}_${driver.uid}` || (associatedChat && selectedChatId === associatedChat.id);
                  const distInfo = getExtendedDistanceInfo(driver);
                  
                  return (
                    <div
                      key={driver.uid}
                      onClick={() => onSelectUser(driver)}
                      className={`p-3 rounded-xl cursor-pointer border flex justify-between items-center transition-all shadow-sm ${
                        isSelected
                          ? 'bg-yellow-450 border-yellow-405 text-slate-900 font-bold shadow-md'
                          : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <p className="font-bold text-xs truncate animate-fade-in">{driver.name}</p>
                          {renderStars(driver.averageRating, driver.ratingCount, false)}
                          {distInfo && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 flex items-center gap-1 ${
                              isSelected ? 'bg-slate-900/20 text-slate-950 font-bold' : 'bg-sky-50 text-sky-700 border border-sky-100 font-bold'
                            }`} title="Distancia aproximada">
                              📍 a {distInfo.display}
                              {distInfo.distance <= 5 && (
                                <span className={`text-[8px] px-1 py-0.2 rounded font-extrabold shrink-0 tracking-wider shadow-sm uppercase ${
                                  isSelected ? 'bg-slate-950 text-yellow-400 animate-pulse' : 'bg-emerald-105 text-emerald-800 border border-emerald-200 bg-emerald-100 animate-pulse'
                                }`}>
                                  Cercano
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 mt-1">
                          <p className={`text-[9px] truncate font-semibold font-mono ${isSelected ? 'text-slate-905/70' : 'text-slate-500'}`}>
                            {driver.email}
                          </p>
                          {driver.phone && (
                            <p className={`text-[10px] font-bold flex items-center gap-1 ${isSelected ? 'text-slate-905' : 'text-slate-700'}`}>
                              <span>📞</span> <span className="font-mono">{driver.phone}</span>
                            </p>
                          )}
                          {driver.mototaxiNumber && (
                            <p className="text-[9px] font-bold text-slate-600 bg-yellow-400/25 border border-yellow-405/20 rounded px-1.5 py-0.5 w-max">
                              🛵 N° {driver.mototaxiNumber}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? 'translate-x-1 text-white' : 'text-slate-400'}`} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: OTHER DRIVERS (FOR DRIVERS - TO DO TRANSFERS!) */}
        {isDriver && (
          <div className="p-1">
            <div className="px-2 mb-3 flex justify-between items-center mt-1">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-500" />
                <span>Colegas en Línea ({onlineDrivers.length})</span>
              </h4>
              {selectedChatId && (
                <span className="text-[9px] bg-amber-500/10 text-amber-700 border border-amber-200/50 px-2 py-0.5 rounded font-bold uppercase tracking-wider font-mono animate-pulse">
                  Traspaso de Servicio
                </span>
              )}
            </div>

            {onlineDrivers.length === 0 ? (
              <div className="px-3 py-6 bg-white border border-dashed border-slate-200 rounded-xl text-center">
                <p className="text-slate-500 text-xs font-medium">No hay colegas en línea</p>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">No se puede transferir sin otros conductores en línea.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {onlineDrivers.map((driver) => {
                  const distInfo = getExtendedDistanceInfo(driver);
                  return (
                    <div
                      key={driver.uid}
                      className="p-3 bg-white border border-slate-200 rounded-xl text-slate-800 flex justify-between items-center hover:border-slate-300 transition-colors shadow-sm"
                    >
                      <div className="min-w-0 shrink pr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <p className="font-bold text-xs truncate text-slate-800">{driver.name}</p>
                          {renderStars(driver.averageRating, driver.ratingCount, false)}
                          {distInfo && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-100 shrink-0 flex items-center gap-1" title="Distancia aproximada entre colegas">
                              📍 a {distInfo.display}
                              {distInfo.distance <= 5 && (
                                <span className="bg-emerald-100 text-emerald-800 border border-emerald-200/50 text-[8px] px-1.5 py-[1px] rounded uppercase font-black tracking-wide animate-pulse inline-block">
                                  Cercano
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col gap-0.5 mt-1">
                          <p className="text-[9px] text-slate-500 truncate font-mono">{driver.email}</p>
                          {driver.phone && (
                            <p className="text-[10px] font-bold text-slate-700 flex items-center gap-1">
                              <span>📞</span> <span className="font-mono">{driver.phone}</span>
                            </p>
                          )}
                          {driver.mototaxiNumber && (
                            <p className="text-[9px] font-bold text-slate-600 bg-yellow-400/25 border border-yellow-405/20 rounded px-1.5 py-0.5 w-[max-content]">
                              <span>🛵</span> N° {driver.mototaxiNumber}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        disabled={!selectedChatId || selectedChatId.includes(driver.uid)}
                        onClick={() => onTransferChat(driver)}
                        className={`text-[9px] font-bold px-3 py-1.5 rounded uppercase font-sans tracking-wide shrink-0 flex items-center gap-1 transition-colors cursor-pointer ${
                          selectedChatId && !selectedChatId.includes(driver.uid)
                            ? 'bg-amber-100 hover:bg-amber-200 text-amber-700 font-bold active:scale-[0.98]'
                            : 'bg-slate-100 text-slate-400 opacity-60 cursor-not-allowed border border-slate-200'
                        }`}
                        title={selectedChatId ? `Traspasar servicio activo a ${driver.name}` : "Abre un chat primero para poder transferirlo"}
                      >
                        <RefreshCw className="w-3 h-3 hover:rotate-180 transition-transform shrink-0" />
                        <span>Transferir</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SECTION 4: MY RECENT ACTIVE CHATS (FOR CLIENTS) */}
        {!isDriver && activeChats.length > 0 && (
          <div className="p-1">
            <h4 className="px-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 mt-1 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
              <span>Mis Chats Activos ({activeChats.length})</span>
            </h4>
            
            <div className="space-y-2">
              {activeChats.map((chat) => {
                const isActive = selectedChatId === chat.id;
                const driverProfile = onlineUsers.find(u => u.uid === chat.driverId);
                return (
                  <div
                    key={chat.id}
                    onClick={() => onSelectChat(chat)}
                    className={`p-3 rounded-xl cursor-pointer border transition-all shadow-sm ${
                      isActive
                        ? 'bg-blue-600 border-blue-600 text-white font-medium shadow-md'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <p className="font-bold text-xs truncate max-w-[140px] flex items-center gap-1.5">
                        <span>🛵 {chat.driverName}</span>
                        <span className="ml-1 shrink-0">
                          {renderStars(driverProfile?.averageRating, driverProfile?.ratingCount, isActive)}
                        </span>
                      </p>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider ${isActive ? 'bg-slate-950/20 text-white font-bold' : 'bg-slate-100 text-slate-500 font-bold'}`}>
                        {chat.status}
                      </span>
                    </div>
                    <p className={`text-[11px] truncate mt-1.5 ${isActive ? 'text-blue-100 font-medium' : 'text-slate-500'}`}>
                      {chat.lastMessage || 'Abriendo conversación...'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      <div className="p-4 bg-white border-t border-slate-200 shadow-inner">
         <button 
           onClick={onLogout}
           className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-lg transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5"
         >
           <LogOut className="w-4 h-4 shrink-0" />
           <span>Cerrar Sesión</span>
         </button>
      </div>
    </aside>
  );
}
