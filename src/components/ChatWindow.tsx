/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import { ChatSession, ChatMessage, UserProfile } from '../types';
import { Send, MapPin, DollarSign, Clock, AlertTriangle, ShieldCheck, CheckCircle2, Navigation, MessageSquare, Plus, RefreshCw, Car, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { getHaversineDistance, ZONAS_COORDINATES } from '../utils/location';

interface ChatWindowProps {
  currentUserProfile: UserProfile;
  activeChat: ChatSession;
  messages: ChatMessage[];
  inputText: string;
  onInputChange: (value: string) => void;
  onSendMessage: (text: string) => void;
  onDeleteChat: (chatId: string) => void;
  onCollapse: () => void;
  onCloseChat: (chatId: string) => void;
  onRateDriver: (chatId: string, driverId: string, stars: number) => Promise<void>;
  partnerProfile?: UserProfile;
}

export default function ChatWindow({
  currentUserProfile,
  activeChat,
  messages,
  inputText,
  onInputChange,
  onSendMessage,
  onDeleteChat,
  onCollapse,
  onCloseChat,
  onRateDriver,
  partnerProfile
}: ChatWindowProps) {
  const isDriver = currentUserProfile.role === 'moto';
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef(messages.length);
  const lastMessageIdRef = useRef<string | null>(null);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedStar, setSelectedStar] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [isRatingSubmitting, setIsRatingSubmitting] = useState(false);

  // Check if scroll position is within 150px of the bottom margin
  const isNearBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    const threshold = 150;
    const difference = el.scrollHeight - el.scrollTop - el.clientHeight;
    return difference <= threshold;
  };

  // Smart conditional scroll-to-bottom on messages change
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const lastMsg = messages[messages.length - 1];
    const lastMsgId = lastMsg?.id || null;

    const messagesCountChanged = messages.length > prevMessagesLengthRef.current;
    const lastIdChanged = lastMsgId !== null && lastMsgId !== lastMessageIdRef.current;
    const isNewMessage = messagesCountChanged || lastIdChanged;

    if (isNewMessage) {
      const isMe = lastMsg?.senderId === currentUserProfile.uid;
      const userIsNearBottom = isNearBottom();

      // Scroll smoothly only if the current user sent the message, or they are already viewing the bottom
      if (isMe || userIsNearBottom || prevMessagesLengthRef.current === 0) {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }

    // Keep state values in refs
    prevMessagesLengthRef.current = messages.length;
    lastMessageIdRef.current = lastMsgId;
  }, [messages, currentUserProfile.uid]);

  // Reset rating states and jump to bottom immediately when active Chat Session changes
  useEffect(() => {
    setSelectedStar(0);
    setHoveredStar(0);
    setIsRatingSubmitting(false);

    // Initial load scroll
    const timer = setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }, 60);

    return () => clearTimeout(timer);
  }, [activeChat.id]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      triggerSend();
    }
  };

  const triggerSend = () => {
    if (inputText.trim()) {
      onSendMessage(inputText);
    }
  };

  // Keyboard Accessory / Helper: appending special helper character to input
  const appendCharacter = (char: string) => {
    onInputChange(inputText + char);
  };

  // Quick reply option: directly trigger sendMessage with payload
  const handleQuickReply = (text: string) => {
    onSendMessage(text);
  };

  // Quick Buttons arrays
  const clientQuickButtons = [
    { label: '🛵 ¿Disponible?', text: '¿Disponible?' },
    { label: '💵 ¿Cuánto cuesta?', text: '¿Cuánto cuesta?' },
    { label: '🙋 ¿Podría venir?', text: '¿Podría venir a traerme, por favor?' },
    { label: '📍 Estoy en...', text: 'Hola, estoy en: ' },
    { label: '👚 Visto con...', text: 'Tengo camisa o vestido de color ' },
    { label: '🙏 ¡Muchas gracias!', text: '¡Muchas gracias!' },
    // Additional quick responses at the end
    { label: '📍 Ya en el punto', text: 'Ya me encuentro en el punto de partida esperándolo.' },
    { label: '❓ ¿Por dónde viene?', text: 'Hola, ¿por dónde viene el viaje?' },
    { label: '⚡ Con prisa', text: 'Por favor, si es posible, agradecería cierta rapidez.' },
    { label: '👍 Recibido', text: 'Excelente, comprendido.' },
  ];

  const driverQuickButtons = [
    { label: '✅ Sí, disponible!', text: 'Sí, ¡disponible!' },
    { label: '💵 Cuesta...', text: 'Cuesta: ' },
    { label: '🏍️ Sí, voy saliendo', text: 'Sí, voy saliendo' },
    { label: '👕 ¿Cómo viste?', text: '¿Cómo anda vestido(a)?' },
    { label: '👍 OK, a la orden', text: 'OK, estoy a la orden.' },
    // Additional quick responses at the end
    { label: '🛵 Voy en camino', text: 'Entendido, voy en camino a su ubicación.' },
    { label: '📍 Ya llegué', text: 'Ya llegué a la ubicación, estoy esperando en el exterior.' },
    { label: '⏳ Demoro 5 min', text: 'Hola, disculpe, demoro unos 5 minutos en llegar.' },
    { label: '🗺️ ¿Ubicación?', text: '¿Podría enviarme o confirmarme su ubicación exacta por favor?' },
    { label: '🚦 Hay tráfico', text: 'Disculpe la demora, hay bastante tráfico en la zona.' },
    { label: '👍 Comprendido', text: 'Listo, entendido.' },
  ];

  const specialCharacters = ['⚠', '🚧', '🚲', '📞', '⭐', '⌚', '🛵', '🗺', '💰', '⌛'];

  const renderHeaderStars = (rating?: number) => {
    const avg = rating || 0;
    if (avg === 0) return null;
    const rounded = Math.round(avg);
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <span key={i} className={i <= rounded ? "text-yellow-450 font-black text-xs" : "text-slate-300 font-bold text-xs"}>
          ★
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 bg-amber-500/10 px-1.5 py-0.5 rounded ml-1" title={`Promedio: ${avg.toFixed(1)}`}>
        <span className="flex gap-0.5">{stars}</span>
        <span className="text-[10px] text-amber-700 font-extrabold ml-1">{avg.toFixed(1)}</span>
      </span>
    );
  };

  // Determine displayed partner name
  const partnerName = isDriver ? activeChat.clientName : activeChat.driverName;
  const partnerRole = isDriver ? 'CLIENTE' : 'MOTOTAXISTA';

  // Calculate distance info
  const getExtendedDistanceInfo = () => {
    if (!partnerProfile) return null;
    
    if (
      currentUserProfile.latitude !== undefined &&
      currentUserProfile.longitude !== undefined &&
      partnerProfile.latitude !== undefined &&
      partnerProfile.longitude !== undefined
    ) {
      const distance = getHaversineDistance(
        currentUserProfile.latitude,
        currentUserProfile.longitude,
        partnerProfile.latitude,
        partnerProfile.longitude
      );
      return {
        distance,
        display: `${distance.toFixed(1)} km`,
        isGps: true
      };
    }

    const getZoneCoords = (zoneName?: string) => {
      if (!zoneName) return ZONAS_COORDINATES["Langue (Centro)"];
      return ZONAS_COORDINATES[zoneName] || ZONAS_COORDINATES["Langue (Centro)"];
    };

    const myCoords = getZoneCoords(currentUserProfile.zone);
    const partnerCoords = getZoneCoords(partnerProfile.zone);

    if (myCoords && partnerCoords) {
      const distance = getHaversineDistance(
        myCoords.lat,
        myCoords.lon,
        partnerCoords.lat,
        partnerCoords.lon
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

  const distanceInfo = getExtendedDistanceInfo();

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F7F9FB] border-l border-slate-200" id="chat-window">
      {/* Upper Chat Header */}
      <div className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center font-bold text-base shadow-sm border border-slate-200">
            {isDriver ? '👤' : '🛵'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-800 text-sm md:text-base leading-none">{partnerName}</span>
              {!isDriver && renderHeaderStars(partnerProfile?.averageRating)}
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <div className="flex items-center gap-2 mt-[3px] flex-wrap">
              <span className={`text-[9px] font-mono tracking-wider font-extrabold uppercase ${activeChat.status === 'closed' ? 'text-red-500 animate-pulse' : 'text-green-550 border-0'}`}>
                {partnerRole} • {activeChat.status === 'closed' ? 'SERVICIO FINALIZADO' : 'SERVICIO ACTIVO'}
              </span>
              {distanceInfo && (
                <span className="text-[9px] font-extrabold text-slate-500 flex items-center gap-0.5 bg-slate-100 hover:bg-slate-200/80 px-1.5 py-[1px] rounded transition-colors select-none" title="Distancia aproximada entre ustedes">
                  📍 a {distanceInfo.display}
                  {distanceInfo.distance <= 5 && (
                    <span className="text-[7.5px] bg-emerald-100 text-emerald-800 font-extrabold px-1 rounded animate-pulse">
                      Cercano
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Chat Status and Controls Indicator bar */}
        <div className="flex items-center gap-1.5 md:gap-2.5">
          {activeChat.status === 'open' && (
            <button
              onClick={() => {
                if (confirm("¿Estás seguro de que deseas dar por finalizado este servicio de mototaxi? El cliente podrá calificar la atención.")) {
                  onCloseChat(activeChat.id);
                }
              }}
              className="p-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold border-0 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer text-[11px] shadow-sm active:scale-[0.98]"
              title="Finalizar Servicio"
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-white" />
              <span className="hidden sm:inline">Finalizar</span>
            </button>
          )}

          {/* Collapse/Expand toggle button */}
          <button
            onClick={onCollapse}
            className="p-1.5 hover:bg-slate-100 rounded-lg flex items-center gap-1 text-slate-600 border border-slate-200 transition-colors cursor-pointer text-[11px] font-bold"
            title="Colapsar chat y volver al inicio"
          >
            <ChevronDown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="hidden leading-none sm:inline">Colapsar</span>
          </button>

          {/* Complete Delete button */}
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-lg flex items-center gap-1 text-slate-500 border border-slate-200 transition-colors cursor-pointer text-[11px] font-bold"
              title="Eliminar Chat Completamente"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span className="hidden leading-none sm:inline">Eliminar</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 bg-red-50 border border-red-200 p-1 rounded-lg text-xs">
              <span className="text-[9px] font-bold text-red-700 px-1 hidden md:inline">¿Borrar todo?</span>
              <button
                onClick={() => {
                  onDeleteChat(activeChat.id);
                  setShowDeleteConfirm(false);
                }}
                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-[9px] rounded uppercase cursor-pointer"
              >
                Sí, borrar
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[9px] rounded uppercase cursor-pointer"
              >
                No
              </button>
            </div>
          )}

          <span className="hidden md:inline-block text-[9px] font-bold px-2 py-1 rounded bg-slate-50 border border-slate-200 text-slate-500 uppercase tracking-wider font-mono">
            REF: {activeChat.id.substring(0, 8).toUpperCase()}
          </span>
          <span className={`text-[9px] font-extrabold px-2.5 py-1 rounded uppercase tracking-wider font-mono border ${
            activeChat.status === 'transferred'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}>
            {activeChat.status === 'transferred' ? 'Transf.' : 'Activo'}
          </span>
        </div>
      </div>

      {/* Messages Feed panel */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-5 md:p-8 space-y-6 bg-[#F7F9FB] relative"
      >
        {/* Background Watermark/Map */}
        <div 
          className="absolute inset-0 pointer-events-none z-0 opacity-[0.06] bg-center bg-no-repeat"
          style={{ 
            backgroundImage: 'url(/src/assets/images/langue_map_bg_1779504965708.png)',
            backgroundSize: '420px',
          }}
        />
        
        {/* Connection Notice / Guard info */}
        <div className="flex justify-center my-1 text-center">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 max-w-md shadow-sm">
            <p className="text-slate-800 text-xs font-bold">¡Bienvenido al chat seguro de Moto-Chat! 🤝</p>
            <p className="text-[10px] text-slate-400 mt-1 lines-normal leading-relaxed">
              Usa los botones de escritura rápida para agilizar tu solicitud de mototaxi. El canal está protegido por reglas de integridad seguras. El servicio se procesa en tiempo real de forma instantánea.
            </p>
          </div>
        </div>

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <MessageSquare className="w-12 h-12 text-slate-300 opacity-60 mb-3 animate-pulse" />
            <p className="text-xs font-bold text-slate-500">No hay mensajes anteriores en este servicio.</p>
            <p className="text-[10px] text-slate-400 mt-1">¡Escribe tu mensaje o presiona un botón rápido para iniciar la ruta!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isMe = message.senderId === currentUserProfile.uid;
            const isSystem = message.type === 'system';

            if (isSystem) {
              return (
                <div key={message.id} className="flex justify-center" id={`msg-${message.id}`}>
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-2.5 text-center text-[10px] max-w-md flex items-center justify-center gap-2 font-mono font-bold uppercase shadow-sm">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin-slow shrink-0" />
                    <span>{message.text}</span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={message.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                id={`msg-${message.id}`}
              >
                <div className={`${
                  isMe
                    ? 'bg-blue-600 rounded-2xl rounded-tr-none text-white shadow-lg shadow-blue-200/10'
                    : 'bg-white border border-slate-200 rounded-2xl rounded-tl-none text-slate-700 shadow-sm'
                } p-4 max-w-md relative`}>
                  
                  {!isMe && (
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                      {message.senderName}
                    </span>
                  )}
                  
                  <p className="text-sm leading-relaxed whitespace-pre-wrap font-sans break-words font-medium">
                    {message.text}
                  </p>
                  
                  <span className={`text-[8px] font-mono font-bold mt-2.5 block text-right ${
                    isMe ? 'text-blue-105' : 'text-slate-400'
                  }`}>
                    {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* RATING WIDGET (Only for clients when the service is closed and not rated yet) */}
      {!isDriver && activeChat.status === 'closed' && !activeChat.isRated && (
        <div className="p-4 bg-amber-50 border-t border-b border-amber-200 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 shadow-sm z-10" id="service-finalized-client-rating-form">
          <div className="text-center md:text-left">
            <h4 className="text-[10px] font-extrabold text-amber-800 uppercase tracking-widest font-mono">
              Calificación de Servicio
            </h4>
            <h3 className="text-xs font-bold text-slate-800 mt-1">
              ¿Cómo calificarías tu viaje con {activeChat.driverName}?
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5 max-w-sm">
              Tu valoración promueve la seguridad y el respeto en nuestra comunidad.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* STAR RATING INTERACTIVE */}
            <div className="flex gap-1 select-none">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setSelectedStar(star)}
                  onMouseEnter={() => setHoveredStar(star)}
                  onMouseLeave={() => setHoveredStar(0)}
                  className="p-1 border-0 bg-transparent shrink-0 outline-none transform active:scale-95 transition-all cursor-pointer"
                >
                  <span className="text-2xl transition-colors duration-150">
                    {star <= (hoveredStar || selectedStar) ? '⭐' : '☆'}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={async () => {
                if (selectedStar === 0) {
                  alert("Por favor selecciona al menos una estrella para calificar.");
                  return;
                }
                setIsRatingSubmitting(true);
                try {
                  await onRateDriver(activeChat.id, activeChat.driverId, selectedStar);
                } catch(err) {
                  console.error(err);
                } finally {
                  setIsRatingSubmitting(false);
                }
              }}
              disabled={selectedStar === 0 || isRatingSubmitting}
              className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide uppercase transition-all flex items-center gap-1.5 cursor-pointer shadow-md ${
                selectedStar > 0 && !isRatingSubmitting
                  ? 'bg-yellow-405 hover:bg-yellow-500 text-slate-900 shadow-yellow-100'
                  : 'bg-slate-100 text-slate-300 border border-slate-205 cursor-not-allowed shadow-none'
              }`}
            >
              {isRatingSubmitting ? (
                <span className="w-3.5 h-3.5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin shrink-0" />
              ) : (
                <span>Enviar ⭐</span>
              )}
            </button>
          </div>
        </div>
      )}

      {/* REGULAR CHAT INPUT FOOTER (Saves command bars & standard inputs - ALWAYS VISIBLE!) */}
      <div className="p-4 bg-white border-t border-slate-200 shadow-inner shrink-0 z-10">
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3.5 scrollbar-thin" id="quick-action-bar">
          {/* Logistic Quick responses based on user role */}
          {isDriver ? (
            driverQuickButtons.map((btn, index) => (
              <button
                key={index}
                onClick={() => handleQuickReply(btn.text)}
                className="bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-800 text-xs font-bold rounded-full px-4 py-2 shadow-sm whitespace-nowrap active:scale-[0.98] transition-all shrink-0 cursor-pointer"
              >
                {btn.label}
              </button>
            ))
          ) : (
            clientQuickButtons.map((btn, index) => (
              <button
                key={index}
                onClick={() => handleQuickReply(btn.text)}
                className="bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-800 text-xs font-bold rounded-full px-4 py-2 shadow-sm whitespace-nowrap active:scale-[0.98] transition-all shrink-0 cursor-pointer"
              >
                {btn.label}
              </button>
            ))
          )}
        </div>

        {/* SPECIAL CHARACTERS KEYBOARD BAR */}
        <div className="flex gap-1 overflow-x-auto pt-2 pb-2 border-t border-slate-100" id="special-char-bar">
          <span className="text-[9px] text-slate-400 uppercase font-black shrink-0 flex items-center px-1.5 font-mono tracking-widest mr-1">
            SÍMBOLS:
          </span>
          {specialCharacters.map((char) => (
            <button
              key={char}
              onClick={() => appendCharacter(char)}
              className="bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-50 text-xs font-black font-mono rounded-lg w-8 h-8 flex items-center justify-center shrink-0 active:scale-95 transition-all cursor-pointer"
            >
              {char}
            </button>
          ))}
        </div>

        {/* STANDARD TEXT TYPING BAR */}
        <div className="flex gap-3 mt-2.5">
          <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 shadow-inner">
            <input
              type="text"
              className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 placeholder-slate-405 font-medium font-sans"
              placeholder="Escribe un mensaje aquí..."
              value={inputText}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyPress}
              id="chat-input-field"
            />
          </div>
          <button
            onClick={triggerSend}
            disabled={!inputText.trim()}
            className={`h-12 w-12 rounded-xl text-white font-black flex items-center justify-center shadow-lg transition-all cursor-pointer shrink-0 ${
              inputText.trim()
                ? 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98] shadow-blue-200/50'
                : 'bg-slate-200 text-slate-405 cursor-not-allowed border border-slate-300 shadow-none'
            }`}
            id="chat-send-btn"
          >
            <Send className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
