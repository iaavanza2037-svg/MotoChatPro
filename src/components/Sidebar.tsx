/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { UserProfile, ChatSession } from '../types';
import { LogOut, User, Users, Shield, Compass, ChevronRight, MessageSquare, RefreshCw, Radio } from 'lucide-react';
import { motion } from 'motion/react';

interface SidebarProps {
  currentUserProfile: UserProfile;
  onlineUsers: UserProfile[];
  activeChats: ChatSession[];
  selectedChatId: string | null;
  onSelectUser: (user: UserProfile) => void;
  onSelectChat: (chat: ChatSession) => void;
  onTransferChat: (targetDriver: UserProfile) => void;
  onLogout: () => void;
}

export default function Sidebar({
  currentUserProfile,
  onlineUsers,
  activeChats,
  selectedChatId,
  onSelectUser,
  onSelectChat,
  onTransferChat,
  onLogout
}: SidebarProps) {
  const isDriver = currentUserProfile.role === 'moto';

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

  // Filter other online drivers
  const onlineDrivers = onlineUsers.filter(u => u.uid !== currentUserProfile.uid && u.role === 'moto');
  // Filter other online clients (incase driver wants to browse, but mostly for listing, standard users)
  const onlineClients = onlineUsers.filter(u => u.uid !== currentUserProfile.uid && u.role === 'cliente');

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
              <div className="space-y-2">
                {activeChats.map((chat) => {
                  const isActive = selectedChatId === chat.id;
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
                        <span className="font-bold text-xs block truncate max-w-[150px]">
                          👤 {chat.clientName}
                        </span>
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
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <p className="font-bold text-xs truncate">{driver.name}</p>
                          {renderStars(driver.averageRating, driver.ratingCount, false)}
                        </div>
                        <p className={`text-[10px] truncate mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-500 font-mono'}`}>
                          {driver.email}
                        </p>
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
                {onlineDrivers.map((driver) => (
                  <div
                    key={driver.uid}
                    className="p-3 bg-white border border-slate-200 rounded-xl text-slate-800 flex justify-between items-center hover:border-slate-300 transition-colors shadow-sm"
                  >
                    <div className="min-w-0 shrink pr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <p className="font-bold text-xs truncate text-slate-800">{driver.name}</p>
                        {renderStars(driver.averageRating, driver.ratingCount, false)}
                      </div>
                      <p className="text-[9px] text-slate-500 truncate mt-0.5 font-mono">{driver.email}</p>
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
                ))}
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
