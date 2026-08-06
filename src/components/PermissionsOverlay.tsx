/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, MapPin, Volume2, AlertTriangle, RefreshCw, Terminal, ArrowRight, X } from 'lucide-react';
import { GpsEnvInfo, GpsStatus, TrackingState } from '../hooks/useGpsTracker';

interface PermissionsOverlayProps {
  gpsStatus: GpsStatus;
  gpsTrackingState: TrackingState;
  gpsEnvInfo: GpsEnvInfo;
  gpsLogs: string[];
  isSensorOff?: boolean;
  onGrantGps: () => void;
  onBypass: () => void;
}

export default function PermissionsOverlay({
  gpsStatus,
  gpsTrackingState,
  gpsEnvInfo,
  gpsLogs,
  isSensorOff = false,
  onGrantGps,
  onBypass
}: PermissionsOverlayProps) {
  const [, setSoundTested] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  // Play a quick, pleasant pitch sequence to initialize the web audio context via user click
  const handleTestSoundAndStart = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.15);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
        setSoundTested(true);
      }
    } catch (e) {
      console.warn("Audio Context init fallback:", e);
    }
    
    // Trigger GPS Tracking request right on the user click interaction
    onGrantGps();
  };

  const isSocialMedia = gpsEnvInfo.isSocialMedia || gpsEnvInfo.isWebView;

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col relative my-4 max-h-[90vh]"
      >
        {/* Dynamic Header Decoration */}
        <div className="bg-gradient-to-br from-yellow-400 to-yellow-500 p-5 sm:p-6 text-slate-950 relative shrink-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="bg-white/20 text-[9px] font-bold py-1 px-2.5 rounded-full uppercase tracking-wider font-mono select-none">
              {gpsEnvInfo.mobileBrand}
            </div>

            <button
              type="button"
              onClick={onBypass}
              className="p-1.5 bg-slate-950/10 hover:bg-slate-950/25 text-slate-950 rounded-full transition-all cursor-pointer flex items-center justify-center"
              title="Cerrar y continuar sin GPS"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="bg-slate-950 text-yellow-400 p-2.5 rounded-full shadow-lg shadow-yellow-600/30">
              <Compass className="w-6 h-6 shrink-0 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">Configuración de GPS</h1>
              <p className="text-[11px] text-slate-900 font-medium leading-tight mt-0.5">
                Para el emparejamiento automático por proximidad de 15km.
              </p>
            </div>
          </div>
        </div>

        {/* Content Wizard Body */}
        <div className="p-5 flex-1 flex flex-col gap-4 text-slate-755 overflow-y-auto">
          
          {/* Conditional 1: Social Media WebView Lockout Warning */}
          {isSocialMedia && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 flex items-center gap-2 text-xs text-amber-800 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 animate-pulse" />
              <span>Navegador de WhatsApp / Redes Sociales Detectado</span>
            </div>
          )}

          {/* Core Privileges Request Explanation */}
          <div className="space-y-3.5">
            <h3 className="text-[12px] font-extrabold uppercase tracking-widest text-slate-400 font-mono">Permisos requeridos para operar:</h3>
            
            <div className="grid grid-cols-1 gap-2.5">
              <div className="flex items-start gap-3 bg-slate-50 border border-slate-100 p-3 rounded-2xl transition-all hover:bg-slate-50/70">
                <div className="bg-yellow-400/10 border border-yellow-400/20 text-yellow-600 p-2 rounded-xl mt-0.5 shrink-0">
                  <MapPin className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Ubicación Precisa por GPS y Antenas (15km)</h4>
                  <p className="text-[10.5px] text-slate-500 leading-normal mt-0.5">
                    Obligatorio para que los pasajeros y conductores se encuentren automáticamente. No comparte tu ubicación si la app está cerrada.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-slate-50 border border-slate-100 p-3 rounded-2xl transition-all hover:bg-slate-50/70">
                <div className="bg-blue-400/10 border border-blue-400/20 text-blue-600 p-2 rounded-xl mt-0.5 shrink-0">
                  <Volume2 className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Sonido de Notificaciones y Alertas</h4>
                  <p className="text-[10.5px] text-slate-500 leading-normal mt-0.5">
                    Habilita las señales sonoras "Ding-Ding" para nuevos chats de servicios cuando estés fuera de la pantalla activa.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive State Feedback card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
              <span>Estado Satelital</span>
              <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold ${
                gpsStatus === 'granted' && !isSensorOff ? 'bg-emerald-100 text-emerald-800' :
                isSensorOff ? 'bg-amber-100 text-amber-800' :
                gpsStatus === 'denied' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
              }`}>
                {gpsStatus === 'granted' && !isSensorOff ? 'CONCEDIDO' : isSensorOff ? 'GPS GENERAL APAGADO' : gpsStatus === 'denied' ? 'BLOQUEADO' : 'PENDIENTE'}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1">
              {gpsStatus === 'granted' && !isSensorOff ? (
                <>
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                  <span className="text-xs font-bold text-emerald-600">¡GPS Conectado con éxito! Cargando aplicación...</span>
                </>
              ) : isSensorOff ? (
                <>
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                  <span className="text-xs font-bold text-amber-700">El GPS de tu celular está apagado.</span>
                </>
              ) : gpsStatus === 'denied' ? (
                <>
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                  <span className="text-xs font-bold text-red-600">Permiso bloqueado o restringido por el celular.</span>
                </>
              ) : gpsTrackingState === 'searching' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-yellow-500 animate-spin shrink-0" />
                  <span className="text-xs font-bold text-yellow-600">Buscando coordenadas por satélite y red...</span>
                </>
              ) : (
                <>
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                  <span className="text-xs font-medium text-slate-600">Esperando que presiones el botón de abajo.</span>
                </>
              )}
            </div>

          </div>

          {/* Action trigger layouts */}
          <div className="flex flex-col gap-2 mt-2">
            <button
              type="button"
              onClick={handleTestSoundAndStart}
              disabled={gpsTrackingState === 'searching' && gpsStatus === 'prompt'}
              className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-extrabold rounded-2xl py-3.5 px-4 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.98] outline-none shadow-lg shadow-yellow-500/10 text-xs tracking-wider uppercase"
            >
              <Compass className="w-4.5 h-4.5 animate-spin-slow shrink-0" />
              <span>{gpsStatus === 'denied' || isSensorOff ? 'Conceder / Reintentar GPS' : 'Activar Ubicación y Permisos'}</span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>

            {/* Option to bypass if they explicitly wish to write location manually */}
            <button
              type="button"
              onClick={onBypass}
              className="text-[11px] text-slate-505 hover:text-slate-800 hover:underline p-1.5 font-bold transition-all"
            >
              Saltar e ingresar con Ubicación Manual (Langue Central)
            </button>
          </div>

          {/* Diagnostic details collapsible button */}
          <div className="mt-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setShowLogs(p => !p)}
              className="w-full justify-between flex items-center text-[9.5px] font-bold text-slate-400 uppercase tracking-widest font-mono cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                Diagnóstico de sensores
              </span>
              <span>{showLogs ? 'Ocultar' : 'Mostrar'}</span>
            </button>

            <AnimatePresence>
              {showLogs && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="bg-slate-950 text-slate-350 p-2.5 rounded-xl border border-slate-900 text-[8px] font-mono mt-2 leading-relaxed space-y-1.5 overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-1 border-b border-slate-900 pb-1.5 text-slate-400">
                    <div>PWA Standalone: <strong>{gpsEnvInfo.isStandalone ? 'Sí' : 'No'}</strong></div>
                    <div>Marca Celular: <strong>{gpsEnvInfo.mobileBrand}</strong></div>
                    <div>Android WebView: <strong>{gpsEnvInfo.isWebView ? 'Sí' : 'No'}</strong></div>
                    <div>Red Social: <strong>{gpsEnvInfo.isSocialMedia ? 'Sí' : 'No'}</strong></div>
                  </div>
                  <div className="max-h-[80px] overflow-y-auto space-y-0.5">
                    {gpsLogs.length === 0 ? (
                      <p className="text-slate-650 italic">No hay logs generados.</p>
                    ) : (
                      gpsLogs.map((log, i) => <p key={i} className="truncate">{log}</p>)
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
