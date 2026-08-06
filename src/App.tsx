/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { onAuthStateChanged, signOut, getRedirectResult } from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  getDoc,
  getDocFromServer,
  deleteDoc,
  getDocs
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { UserProfile, ChatSession, ChatMessage } from './types';
import { getHaversineDistance, getNearestPresetZone } from './utils/location';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import MapView from './components/MapView';
import PermissionsOverlay from './components/PermissionsOverlay';
import { useGpsTracker } from './hooks/useGpsTracker';
import { Compass, ShieldAlert, CircleAlert, ChevronLeft, Send, CheckCircle2 } from 'lucide-react';

// Helper to play synthesized alarm sound for 1.5 seconds (Ding-Ding! Ding-Ding!)
function playLoudAlarmSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const startTime = ctx.currentTime;

    // Plays a clean, high-pitched double-beep (C7 + E7) using pure sine waves
    const playDoubleBeep = (startOffset: number) => {
      // First beep: High C7 (2048 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(2048, startTime + startOffset);
      
      gain1.gain.setValueAtTime(0.001, startTime + startOffset);
      gain1.gain.linearRampToValueAtTime(0.8, startTime + startOffset + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, startTime + startOffset + 0.22);
      
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(startTime + startOffset);
      osc1.stop(startTime + startOffset + 0.25);

      // Second beep: Even higher E7 (2560 Hz) for a bright, clean notice
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(2560, startTime + startOffset + 0.15);
      
      gain2.gain.setValueAtTime(0.001, startTime + startOffset + 0.15);
      gain2.gain.linearRampToValueAtTime(0.8, startTime + startOffset + 0.17);
      gain2.gain.exponentialRampToValueAtTime(0.001, startTime + startOffset + 0.38);
      
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(startTime + startOffset + 0.15);
      osc2.stop(startTime + startOffset + 0.4);
    };

    // Repeat the double-beep pattern 2 times (approx 1.2s - 1.5s total)
    playDoubleBeep(0.0);
    playDoubleBeep(0.8);
  } catch (error) {
    console.warn("Could not play synthesized alarm:", error);
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<UserProfile[]>([]);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [authChecking, setAuthChecking] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [redirectResultChecked, setRedirectResultChecked] = useState(false);
  const [bypassOverlay, setBypassOverlay] = useState(() => {
    return localStorage.getItem('motogo_gps_bypassed') === 'true';
  });

  const handleBypassOverlay = () => {
    localStorage.setItem('motogo_gps_bypassed', 'true');
    setBypassOverlay(true);
  };
  const [isMapActive, setIsMapActive] = useState(false);

  // Integrated Robust GPS tracker module (Requirements 1, 2, 7, 8, 13, 17, 18)
  const {
    gpsStatus,
    trackingState: gpsTrackingState,
    coords: gpsCoords,
    isSensorOff: gpsIsSensorOff,
    logs: gpsLogs,
    envInfo: gpsEnvInfo,
    startTracking: handleRetryGps,
    stopTracking: handleStopGps,
    isStarted: gpsIsStarted
  } = useGpsTracker({
    userId: currentUser?.uid,
    onLocationUpdate: async (lat, lon, accuracy) => {
      if (!currentUser || !userProfile) return;
      // Only write update if coords changed or hasGPS wasn't set to prevent infinite loop
      if (
        !userProfile.hasGPS ||
        userProfile.latitude !== lat ||
        userProfile.longitude !== lon
      ) {
        try {
          // Identify nearest community to automatically map text-based zones
          const nearestZone = getNearestPresetZone(lat, lon);
          
          const userDocRef = doc(db, 'users', currentUser.uid);
          await updateDoc(userDocRef, {
            latitude: lat,
            longitude: lon,
            hasGPS: true,
            zone: nearestZone,
            lastActive: Date.now()
          });
          console.log(`[GPS API Callback] Ubicación actualizada: ${lat}, ${lon} (${nearestZone})`);
        } catch (err) {
          console.warn("[GPS API Callback] Error actualizando firestore con coordenadas:", err);
        }
      }
    }
  });

  useEffect(() => {
    if (gpsStatus === 'granted') {
      localStorage.removeItem('motogo_gps_bypassed');
      setBypassOverlay(false);
    }
  }, [gpsStatus]);

  // React to GPS loss, disablement, or revoking by turning off hasGPS flag in Firestore
  useEffect(() => {
    if (!currentUser || !userProfile) return;
    const isLocalGpsUnavailable = 
      gpsStatus !== 'granted' || 
      gpsTrackingState === 'error' || 
      gpsTrackingState === 'timeout' || 
      gpsTrackingState === 'inactive';
      
    if (isLocalGpsUnavailable && userProfile.hasGPS) {
      const userDocRef = doc(db, 'users', currentUser.uid);
      updateDoc(userDocRef, {
        hasGPS: false
      }).catch(err => {
        console.warn("[GPS Loss Cleanup] Error actualizando hasGPS en Firestore:", err);
      });
    }
  }, [gpsStatus, gpsTrackingState, currentUser, userProfile]);

  // Sound notification tracking refs
  const lastSessionMessageTimeRef = useRef<{ [chatId: string]: number }>({});
  const lastSentByMeTimeRef = useRef<{ [chatId: string]: number }>({});
  const isFirstLoadRef = useRef<boolean>(true);

  // Connection tester
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, '_test_connection_path_', 'initial'));
      } catch (error: any) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          setConnectionError("La base de datos está desconectada. Por favor verifica la red.");
        }
      }
    }
    testConnection();
  }, []);

  // Track Firebase Authentication State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (userInstance) => {
      setCurrentUser(userInstance);
      if (!userInstance) {
        setUserProfile(null);
        setChats([]);
        setMessages([]);
        setSelectedChatId(null);
        setAuthChecking(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Handle Google Sign-In redirect result asynchronously in the background
  useEffect(() => {
    async function handleGoogleRedirectResult() {
      try {
        const result = await getRedirectResult(auth);
        
        // El usuario puede haber iniciado sesión, ya sea a través de getRedirectResult o porque ya estaba en auth
        const user = result?.user || auth.currentUser;
        if (user) {
          console.log("Sesión activa detectada en redirección de Google:", user.uid);
          
          const userProfileRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userProfileRef);
          
          const savedRole = localStorage.getItem('moto_chat_pending_registration');
          const savedName = localStorage.getItem('moto_chat_saved_name') || '';
          const savedZone = localStorage.getItem('moto_chat_saved_zone');
          const savedCustomZone = localStorage.getItem('moto_chat_saved_custom_zone') || '';

          const displayName = savedName.trim() || userDocSnap.data()?.name || user.displayName || user.email?.split('@')[0] || 'Usuario';
          const finalZone = savedZone ? (savedZone === 'Otro' ? (savedCustomZone.trim() || 'Langue (Centro)') : savedZone) : (userDocSnap.data()?.zone || 'Langue (Centro)');
          const finalRole = (savedRole === 'moto' || savedRole === 'cliente') ? savedRole : (userDocSnap.data()?.role || 'cliente');

          await setDoc(userProfileRef, {
            uid: user.uid,
            email: user.email || userDocSnap.data()?.email || '',
            name: displayName,
            role: finalRole,
            zone: finalZone,
            isOnline: true,
            lastActive: Date.now()
          }, { merge: true });
          console.log("Perfil del usuario guardado/actualizado correctamente.");
          
          // Limpiar datos temporales de registro
          localStorage.removeItem('moto_chat_pending_registration');
          localStorage.removeItem('moto_chat_saved_name');
          localStorage.removeItem('moto_chat_saved_zone');
          localStorage.removeItem('moto_chat_saved_custom_zone');
          localStorage.removeItem('moto_chat_redirect_active');
        }
      } catch (err: any) {
        console.error("Error al procesar el resultado de la redirección de Google:", err);
        
        // Soporte robusto en caso de error de cookies o de sesión sessionStorage inaccesible en sandbox/celular
        // pero donde la autenticación REAL sí se completó y onAuthStateChanged recuperó el currentUser
        const user = auth.currentUser;
        if (user) {
          try {
            console.log("Error de redirección detectado, pero auth de Firebase está logueado. Creando perfil con datos guardados.");
            const userProfileRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userProfileRef);
            
            const savedRole = localStorage.getItem('moto_chat_pending_registration');
            const savedName = localStorage.getItem('moto_chat_saved_name') || '';
            const savedZone = localStorage.getItem('moto_chat_saved_zone');
            const savedCustomZone = localStorage.getItem('moto_chat_saved_custom_zone') || '';

            const displayName = savedName.trim() || userDocSnap.data()?.name || user.displayName || user.email?.split('@')[0] || 'Usuario';
            const finalZone = savedZone ? (savedZone === 'Otro' ? (savedCustomZone.trim() || 'Langue (Centro)') : savedZone) : (userDocSnap.data()?.zone || 'Langue (Centro)');
            const finalRole = (savedRole === 'moto' || savedRole === 'cliente') ? savedRole : (userDocSnap.data()?.role || 'cliente');

            await setDoc(userProfileRef, {
              uid: user.uid,
              email: user.email || userDocSnap.data()?.email || '',
              name: displayName,
              role: finalRole,
              zone: finalZone,
              isOnline: true,
              lastActive: Date.now()
            }, { merge: true });
            console.log("Perfil de respaldo creado/actualizado con éxito después del error.");
            
            localStorage.removeItem('moto_chat_pending_registration');
            localStorage.removeItem('moto_chat_saved_name');
            localStorage.removeItem('moto_chat_saved_zone');
            localStorage.removeItem('moto_chat_saved_custom_zone');
            localStorage.removeItem('moto_chat_redirect_active');
          } catch (innerErr) {
            console.error("Error al crear perfil de respaldo:", innerErr);
          }
        }
      } finally {
        setRedirectResultChecked(true);
      }
    }

    handleGoogleRedirectResult();
  }, []);

  // Listen to User Profile changes and manage dynamic Presence Heartbeat
  useEffect(() => {
    if (!currentUser) return;

    const userProfileRef = doc(db, 'users', currentUser.uid);

    // Watch profile doc
    const unsubProfile = onSnapshot(userProfileRef, (snapshot) => {
      if (snapshot.exists()) {
        setUserProfile(snapshot.data() as UserProfile);
        setAuthChecking(false);
      } else {
        // If a registration is explicitly in progress, do NOT write fallback profile.
        // Doing so would race with Login.tsx and freeze the user's role choice under immutable rules.
        const isPending = localStorage.getItem('moto_chat_pending_registration');
        if (isPending) {
          const isRedirectActive = localStorage.getItem('moto_chat_redirect_active') === 'true';
          
          if (isRedirectActive && !redirectResultChecked) {
            console.log("Chequeo de redirección de Google activo en progreso. Manteniendo indicador de carga...");
            return; // Esperar a que se complete getRedirectResult
          }
          
          if (isRedirectActive && redirectResultChecked) {
            console.log("Redirect check finished, but profile does not exist. Writing fallback using registration values.");
            
            const savedRole = (isPending === 'moto' || isPending === 'cliente') ? isPending : 'cliente';
            const savedName = localStorage.getItem('moto_chat_saved_name') || '';
            const savedZone = localStorage.getItem('moto_chat_saved_zone') || 'Langue (Centro)';
            const savedCustomZone = localStorage.getItem('moto_chat_saved_custom_zone') || '';

            const displayName = savedName.trim() || currentUser.displayName || currentUser.email?.split('@')[0] || 'Usuario';
            const finalZone = savedZone === 'Otro' ? (savedCustomZone.trim() || 'Langue (Centro)') : savedZone;

            const initialProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              name: displayName,
              role: savedRole as 'cliente' | 'moto',
              zone: finalZone,
              isOnline: true,
              lastActive: Date.now()
            };

            setDoc(userProfileRef, initialProfile, { merge: true })
              .then(() => {
                setUserProfile(initialProfile);
                setAuthChecking(false);
                // Clean temporary flags once saved
                localStorage.removeItem('moto_chat_pending_registration');
                localStorage.removeItem('moto_chat_saved_name');
                localStorage.removeItem('moto_chat_saved_zone');
                localStorage.removeItem('moto_chat_saved_custom_zone');
                localStorage.removeItem('moto_chat_redirect_active');
              })
              .catch((err) => {
                handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
                setAuthChecking(false);
              });
          } else {
            console.log("Registration in progress, deferring fallback profile creation.");
            setAuthChecking(false);
          }
          return;
        }

  // Fallback user profile setup if none exists
        const email = currentUser.email || '';
        const fallbackName = email.split('@')[0] || 'Usuario';
        const initialProfile: UserProfile = {
          uid: currentUser.uid,
          email,
          name: fallbackName,
          role: 'cliente',
          zone: 'Langue (Centro)',
          isOnline: true,
          lastActive: Date.now()
        };
        setDoc(userProfileRef, initialProfile, { merge: true })
          .then(() => {
            setUserProfile(initialProfile);
            setAuthChecking(false);
          })
          .catch((err) => {
            handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
            setAuthChecking(false);
          });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
      setAuthChecking(false);
    });

    // Establish periodic heartbeat to report online status on Firestore
    const heartbeat = setInterval(async () => {
      try {
        await updateDoc(userProfileRef, {
          isOnline: true,
          lastActive: Date.now()
        });
      } catch (error) {
        console.warn("Heartbeat update failed. Retrying on next cycle.", error);
      }
    }, 20000); // every 20 seconds

    // Unload presence write
    const handleUnloadOffline = () => {
      updateDoc(userProfileRef, {
        isOnline: false,
        lastActive: Date.now()
      }).catch(() => {});
    };

    window.addEventListener('beforeunload', handleUnloadOffline);
    window.addEventListener('unload', handleUnloadOffline);

    return () => {
      clearInterval(heartbeat);
      unsubProfile();
      window.removeEventListener('beforeunload', handleUnloadOffline);
      window.removeEventListener('unload', handleUnloadOffline);
      
      // Attempt clean disconnect marking
      updateDoc(userProfileRef, {
        isOnline: false,
        lastActive: Date.now()
      }).catch(() => {});
    };
  }, [currentUser, redirectResultChecked]);

  // Keep track of active users online (visible in mode presence)
  useEffect(() => {
    if (!currentUser || !userProfile) return;

    const usersQuery = query(
      collection(db, 'users'),
      where('isOnline', '==', true)
    );

    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      const list = snapshot.docs.map(d => d.data() as UserProfile);
      
      const normalizeZone = (z?: string) => {
        if (!z) return 'langue (centro)';
        return z.trim().toLowerCase();
      };

      const userZoneNormalized = normalizeZone(userProfile.zone);

      // Filter clientside to only users who checked in with heartbeat within 45 seconds AND match geographic zone OR are nearby with GPS
      const activePulseList = list.filter(u => {
        const isPulseActive = Date.now() - u.lastActive < 45000;
        if (!isPulseActive) return false;

        // Proximity condition (if both users have GPS coordinates)
        if (
          userProfile.hasGPS &&
          u.hasGPS &&
          userProfile.latitude !== undefined &&
          userProfile.longitude !== undefined &&
          u.latitude !== undefined &&
          u.longitude !== undefined
        ) {
          const dist = getHaversineDistance(
            userProfile.latitude,
            userProfile.longitude,
            u.latitude,
            u.longitude
          );
          // Match if they are within 15 km of each other (even if the string zone is different!)
          return dist <= 15;
        }

        // Fallback: match by zone string name if either does not have GPS
        const matchesZone = normalizeZone(u.zone) === userZoneNormalized;
        return matchesZone;
      });

      setOnlineUsers(activePulseList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    return () => unsubUsers();
  }, [currentUser, userProfile]);

  // Geolocation tracking is now managed fully inside the useGpsTracker hook.

  // Listen to Chat Sessions according to user role
  useEffect(() => {
    if (!currentUser || !userProfile) {
      isFirstLoadRef.current = true;
      lastSessionMessageTimeRef.current = {};
      lastSentByMeTimeRef.current = {};
      return;
    }

    // Reset tracking for new login session
    isFirstLoadRef.current = true;
    lastSessionMessageTimeRef.current = {};
    lastSentByMeTimeRef.current = {};

    const keyField = userProfile.role === 'moto' ? 'driverId' : 'clientId';
    const chatsQuery = query(
      collection(db, 'chats'),
      where(keyField, '==', currentUser.uid)
    );

    const unsubChats = onSnapshot(chatsQuery, (snapshot) => {
      const list = snapshot.docs.map(d => d.data() as ChatSession);

      let shouldPlayAlert = false;

      list.forEach(chat => {
        const previousTime = lastSessionMessageTimeRef.current[chat.id];
        const isNewMessage = previousTime !== undefined && chat.lastMessageTime > previousTime;

        // Remember the latest timestamp
        lastSessionMessageTimeRef.current[chat.id] = chat.lastMessageTime;

        // Sound trigger conditions: for active users (both client and mototaxista), after initial load, for newer messages
        if (isNewMessage && !isFirstLoadRef.current && (userProfile.role === 'moto' || userProfile.role === 'cliente')) {
          // Check if we sent this message in the last 2 seconds (e.g. bypass echo sound or ourselves sending)
          const sentRecently = lastSentByMeTimeRef.current[chat.id] && (Date.now() - lastSentByMeTimeRef.current[chat.id] < 2000);
          const isDefaultStart = chat.lastMessage === 'Servicio iniciado. Esperando mensajes...';
          const isTransfer = chat.lastMessage && chat.lastMessage.startsWith('⚠️');

          if (!sentRecently && !isDefaultStart && !isTransfer) {
            shouldPlayAlert = true;
          }
        } else if (previousTime === undefined) {
          // First time we see this session in this snapshot run, initialize the tracking timestamp
          lastSessionMessageTimeRef.current[chat.id] = chat.lastMessageTime;
        }
      });

      // Turn off initial load state after first snapshot finishes handling
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
      }

      if (shouldPlayAlert) {
        playLoudAlarmSound();
      }

      // Filter out chats that are logically deleted for this user
      const filteredList = list.filter(chat => {
        if (userProfile.role === 'moto') {
          return !chat.driverDeleted;
        } else {
          return !chat.clientDeleted;
        }
      });
      // Sort chats descending by lastMessageTime
      filteredList.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
      setChats(filteredList);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'chats');
    });

    return () => unsubChats();
  }, [currentUser, userProfile]);

  // Monitor peers in chats and trigger automatic 5s complete deletion if peer of an active chat goes offline
  useEffect(() => {
    if (!currentUser || !userProfile || chats.length === 0) return;

    const timers: { [chatId: string]: any } = {};

    chats.forEach((chat) => {
      // Find the ID of the other user in the chat
      const peerId = userProfile.role === 'cliente' ? chat.driverId : chat.clientId;
      const isPeerOnline = onlineUsers.some(u => u.uid === peerId);

      // We only care about open chats
      if (chat.status === 'open') {
        if (!isPeerOnline) {
          // If Peer is offline, we completely delete this chat after 5 seconds
          timers[chat.id] = setTimeout(async () => {
            try {
              // 1. Deselect instantly if active to prevent blank views
              if (selectedChatId === chat.id) {
                setSelectedChatId(null);
              }

              // 2. Delete messages subcollection first (so rules find parent chat and permit it)
              const snapshot = await getDocs(collection(db, `chats/${chat.id}/messages`));
              if (snapshot && !snapshot.empty) {
                const deletePromises = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
                await Promise.all(deletePromises);
              }

              // 3. Delete parent chat session document
              await deleteDoc(doc(db, 'chats', chat.id));

              console.log(`Chat ${chat.id} automatically deleted completely 5 seconds after peer went offline.`);
            } catch (err) {
              console.warn("Failed to auto-delete chat", err);
            }
          }, 5000);
        }
      }
    });

    return () => {
      Object.values(timers).forEach(t => clearTimeout(t));
    };
  }, [chats, onlineUsers, currentUser, userProfile, selectedChatId]);

  // Listen to messages for the active selected chat
  useEffect(() => {
    if (!currentUser || !selectedChatId) {
      setMessages([]);
      return;
    }

    const messagesCollectionRef = collection(db, `chats/${selectedChatId}/messages`);
    
    const unsubMessages = onSnapshot(messagesCollectionRef, (snapshot) => {
      const list = snapshot.docs.map(d => d.data() as ChatMessage);
      // Sort message list chronologically
      list.sort((a, b) => a.timestamp - b.timestamp);
      setMessages(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `chats/${selectedChatId}/messages`);
    });

    return () => unsubMessages();
  }, [currentUser, selectedChatId]);

  // Action: Select or start a chat with an online user (Client only starts, or Driver selected client)
  const handleSelectUser = async (targetUser: UserProfile, initialMessage?: string) => {
    if (!userProfile) return;

    const clientId = userProfile.role === 'cliente' ? userProfile.uid : targetUser.uid;
    const clientName = userProfile.role === 'cliente' ? userProfile.name : targetUser.name;
    const clientEmail = userProfile.role === 'cliente' ? userProfile.email : targetUser.email;

    const driverId = userProfile.role === 'moto' ? userProfile.uid : targetUser.uid;
    const driverName = userProfile.role === 'moto' ? userProfile.name : targetUser.name;
    const driverEmail = userProfile.role === 'moto' ? userProfile.email : targetUser.email;

    const chatId = `${clientId}_${driverId}`;

    // Initialize or merge Chat Session doc in Firestore safely.
    // We ALWAYS reset logical deletions, set status back to open and mark it as NOT rated for new requests!
    const chatDocRef = doc(db, 'chats', chatId);
    const initialOrRestoredChat: ChatSession = {
      id: chatId,
      clientId,
      clientName,
      clientEmail,
      driverId,
      driverName,
      driverEmail,
      status: 'open',
      clientDeleted: false,
      driverDeleted: false,
      isRated: false,
      lastMessage: initialMessage || 'Servicio iniciado o restaurado. Esperando mensajes...',
      lastMessageTime: Date.now()
    };

    try {
      await setDoc(chatDocRef, initialOrRestoredChat, { merge: true });

      if (initialMessage && initialMessage.trim()) {
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();
        const newMessagePayload: ChatMessage = {
          id: messageId,
          chatId,
          text: initialMessage.trim(),
          senderId: currentUser?.uid || userProfile.uid,
          senderName: userProfile.name,
          timestamp: now,
          type: 'text'
        };
        await setDoc(doc(db, `chats/${chatId}/messages`, messageId), newMessagePayload);
      }

      // Set selectedChatId and exit map view
      setSelectedChatId(chatId);
      setIsMapActive(false);
    } catch (err) {
      console.warn("Background chat document creation/restoration error, setting client-side state anyway:", err);
      setSelectedChatId(chatId);
      setIsMapActive(false);
    }
  };

  const handleSelectChat = async (chat: ChatSession) => {
    if (!userProfile) return;
    try {
      const chatDocRef = doc(db, 'chats', chat.id);
      const updates: Partial<ChatSession> = userProfile.role === 'moto'
        ? { driverDeleted: false }
        : { clientDeleted: false };
      await updateDoc(chatDocRef, updates);
      // Set selectedChatId ONLY after updates are successfully updated in Firestore so that permissions succeed.
      setSelectedChatId(chat.id);
    } catch (e) {
      console.warn("Could not un-delete chat on selection, setting client-side state anyway:", e);
      setSelectedChatId(chat.id);
    }
  };

  // Action: Send a active chat message
  const handleSendMessage = async (text: string) => {
    if (!selectedChatId || !userProfile || !currentUser) return;

    const chatId = selectedChatId;
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const newMessagePayload: ChatMessage = {
      id: messageId,
      chatId,
      text: text.trim(),
      senderId: currentUser.uid,
      senderName: userProfile.name,
      timestamp: now,
      type: 'text'
    };

    // Track that we sent a message to this chat to avoid playing notifications on our echo
    lastSentByMeTimeRef.current[chatId] = now;
    lastSessionMessageTimeRef.current[chatId] = now;

    try {
      // 1. Write the message Doc first as that's permission safe
      await setDoc(doc(db, `chats/${chatId}/messages`, messageId), newMessagePayload);

      // 2. Perform safe merge setDoc update on parent session to guarantee existence and refresh counters
      const chatDocRef = doc(db, 'chats', chatId);
      await setDoc(chatDocRef, {
        lastMessage: text.trim(),
        lastMessageTime: now,
        clientDeleted: false,
        driverDeleted: false
      }, { merge: true });

      setInputText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `chats/${chatId}/messages/${messageId}`);
    }
  };

  // Action: Transfer Chat to other driver (only available for Moto)
  const handleTransferChat = async (targetDriver: UserProfile) => {
    if (!selectedChatId || !userProfile || userProfile.role !== 'moto') return;

    const chatId = selectedChatId;
    const chatDocRef = doc(db, 'chats', chatId);

    try {
      const chatDocSnap = await getDoc(chatDocRef);
      if (!chatDocSnap.exists()) return;

      const chatSession = chatDocSnap.data() as ChatSession;
      
      // Update Driver details on the main session
      await updateDoc(chatDocRef, {
        driverId: targetDriver.uid,
        driverName: targetDriver.name,
        driverEmail: targetDriver.email,
        status: 'transferred',
        lastMessage: `⚠️ Servicio transferido a ${targetDriver.name}`,
        lastMessageTime: Date.now()
      });

      // Append System Message to state logs
      const systemMessageId = `msg_sys_${Date.now()}`;
      const systemMessagePayload: ChatMessage = {
        id: systemMessageId,
        chatId,
        text: `El servicio y chat han sido transferidos a ${targetDriver.name}`,
        senderId: 'system',
        senderName: 'Sistema',
        timestamp: Date.now(),
        type: 'system'
      };

      await setDoc(doc(db, `chats/${chatId}/messages`, systemMessageId), systemMessagePayload);
      
      // Alert and Deselect
      alert(`Servicio transferido exitosamente al conductor en línea: ${targetDriver.name}`);
      setSelectedChatId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `chats/${chatId}`);
    }
  };

  // Action: Delete Chat (selective logic for cliente and moto)
  const handleDeleteChat = async (chatId: string) => {
    if (!userProfile) return;
    // Optimistic UI update: instantly close the chat panel
    setSelectedChatId(null);
    try {
      const chatDocRef = doc(db, 'chats', chatId);
      const chatSnap = await getDoc(chatDocRef);
      if (!chatSnap.exists()) return;

      const chatData = chatSnap.data() as ChatSession;
      const isDriver = userProfile.role === 'moto';

      const otherSideDeleted = isDriver
        ? chatData.clientDeleted === true
        : chatData.driverDeleted === true;

      if (otherSideDeleted) {
        // Both sides want to delete, so clear messages and erase doc completely
        try {
          const snapshot = await getDocs(collection(db, `chats/${chatId}/messages`));
          if (snapshot && !snapshot.empty) {
            const deletePromises = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
            await Promise.all(deletePromises);
          }
        } catch (err) {
          console.warn("Messages permanent deletion error:", err);
        }
        await deleteDoc(chatDocRef);
        console.log(`Chat ${chatId} completely purged from Firestore.`);
      } else {
        // Only one side deleted it, update logical mark for that user role
        const updates: Partial<ChatSession> = isDriver
          ? { driverDeleted: true }
          : { clientDeleted: true };
        await updateDoc(chatDocRef, updates);
        console.log(`Chat ${chatId} logically deleted for role: ${userProfile.role}`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `chats/${chatId}`);
    }
  };

  // Action: Complete and close service chat session
  const handleCloseChat = async (chatId: string) => {
    try {
      const chatDocRef = doc(db, 'chats', chatId);
      await updateDoc(chatDocRef, {
        status: 'closed',
        lastMessage: '✅ Servicio finalizado con éxito.',
        lastMessageTime: Date.now()
      });

      // Insert system message inside subcollection
      const systemMessageId = `msg_sys_${Date.now()}`;
      const systemMessagePayload: ChatMessage = {
        id: systemMessageId,
        chatId,
        text: 'El servicio ha sido finalizado correctamente.',
        senderId: 'system',
        senderName: 'Sistema',
        timestamp: Date.now(),
        type: 'system'
      };
      await setDoc(doc(db, `chats/${chatId}/messages`, systemMessageId), systemMessagePayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `chats/${chatId}`);
    }
  };

  // Action: Give a star rating score to the driver and update user profile averages
  const handleRateDriver = async (chatId: string, driverId: string, stars: number) => {
    try {
      // 1. Mark chat status as rated to avoid repeat prompts
      const chatDocRef = doc(db, 'chats', chatId);
      await updateDoc(chatDocRef, {
        isRated: true,
        lastMessage: `⭐ Calificado con ${stars} estrellas de satisfacción`,
        lastMessageTime: Date.now()
      });

      // 2. Transact or write dynamic update to target driver's user profile
      const driverDocRef = doc(db, 'users', driverId);
      const driverSnap = await getDoc(driverDocRef);

      if (driverSnap.exists()) {
        const driverData = driverSnap.data() as UserProfile;
        const currentCount = driverData.ratingCount || 0;
        const currentSum = driverData.ratingSum || 0;

        const newCount = currentCount + 1;
        const newSum = currentSum + stars;
        const newAverage = newSum / newCount;

        await updateDoc(driverDocRef, {
          ratingCount: newCount,
          ratingSum: newSum,
          averageRating: newAverage
        });
        console.log(`Driver profile ${driverId} rating successfully synced. Count: ${newCount}, Avg: ${newAverage}`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${driverId}`);
    }
  };

  // Action: Sign user out and set current user off-status
  const handleLogout = async () => {
    setSelectedChatId(null);
    setBypassOverlay(false);
    if (currentUser && userProfile) {
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        // Make user offline instantly
        await updateDoc(userDocRef, {
          isOnline: false,
          lastActive: Date.now()
        }).catch((e) => console.warn(e));

        // Proactively delete open chats in the background (Non-blocking!)
        const openChats = chats.filter(c => c.status === 'open');
        openChats.forEach((chat) => {
          // No await on the top level, let it run in the background
          getDocs(collection(db, `chats/${chat.id}/messages`))
            .then((snapshot) => {
              const deleteMsgs = snapshot && !snapshot.empty
                ? snapshot.docs.map(docSnap => deleteDoc(docSnap.ref))
                : [];
              Promise.all(deleteMsgs)
                .then(() => {
                  deleteDoc(doc(db, 'chats', chat.id)).catch((e) => console.warn("Could not background delete chat doc on logout:", e));
                })
                .catch((e) => console.warn("Background msg deletion error:", e));
            })
            .catch((e) => console.warn("Could not get background messages on logout:", e));
        });
      } catch (err) {
        console.warn("Could not mark user offline on logout.", err);
      }
      await signOut(auth);
    } else if (currentUser) {
      await signOut(auth);
    }
  };

  // Action: Update user's current geographic zone
  const handleUpdateZone = async (newZone: string) => {
    if (!currentUser) return;
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        zone: newZone,
        lastActive: Date.now()
      });
      console.log(`User ${currentUser.uid} geographic zone updated to: ${newZone}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
    }
  };

  // Find the selected chat session details
  const activeChat = useMemo(() => {
    if (!userProfile) return undefined;
    return chats.find(c => c.id === selectedChatId) || (selectedChatId ? {
      id: selectedChatId,
      clientId: userProfile.role === 'cliente' ? userProfile.uid : selectedChatId.split('_')[0],
      clientName: userProfile.role === 'cliente' ? userProfile.name : 'Cliente',
      clientEmail: userProfile.role === 'cliente' ? userProfile.email : '',
      driverId: userProfile.role === 'moto' ? userProfile.uid : selectedChatId.split('_')[1],
      driverName: userProfile.role === 'moto' ? userProfile.name : (onlineUsers.find(u => u.uid === selectedChatId.split('_')[1])?.name || 'Mototaxista'),
      driverEmail: userProfile.role === 'moto' ? userProfile.email : (onlineUsers.find(u => u.uid === selectedChatId.split('_')[1])?.email || ''),
      status: 'open',
      lastMessage: 'Servicio iniciado. Esperando mensajes...',
      lastMessageTime: Date.now()
    } as ChatSession : undefined);
  }, [chats, selectedChatId, userProfile, onlineUsers]);

  const clearedAt = useMemo(() => {
    if (activeChat && activeChat.lastMessage && activeChat.lastMessage.startsWith('[clear]:')) {
      const parts = activeChat.lastMessage.split(':');
      if (parts.length > 1) {
        return parseInt(parts[1], 10) || 0;
      }
    }
    return 0;
  }, [activeChat?.lastMessage]);

  const visibleMessages = useMemo(() => {
    return messages.filter(m => m.timestamp > clearedAt);
  }, [messages, clearedAt]);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#F7F9FB] flex flex-col items-center justify-center p-4">
        <motion.div 
          animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-4xl"
        >
          🛵
        </motion.div>
        <span className="text-[10px] text-slate-500 font-mono mt-4 tracking-widest animate-pulse font-bold">
          INICIALIZANDO CONEXIÓN MOTOCHAT...
        </span>
      </div>
    );
  }

  if (!currentUser || !userProfile) {
    return <Login onAuthSuccess={() => {}} />;
  }

  const partnerId = activeChat ? (userProfile.role === 'moto' ? activeChat.clientId : activeChat.driverId) : '';
  const partnerProfile = onlineUsers.find(u => u.uid === partnerId);

  return (
    <div className="h-screen flex bg-[#F7F9FB] text-slate-850 overflow-hidden font-sans relative">
      {/* Onboarding and Permission setup overlay */}
      {currentUser && userProfile && (gpsStatus !== 'granted' || gpsIsSensorOff) && !bypassOverlay && (
        <PermissionsOverlay
          gpsStatus={gpsStatus}
          gpsTrackingState={gpsTrackingState}
          gpsEnvInfo={gpsEnvInfo}
          gpsLogs={gpsLogs}
          isSensorOff={gpsIsSensorOff}
          onGrantGps={handleRetryGps}
          onBypass={handleBypassOverlay}
        />
      )}

      {/* Background Watermark/Map */}
      <div 
        className="absolute inset-0 pointer-events-none z-0 opacity-[0.05] bg-center bg-no-repeat"
        style={{ 
          backgroundImage: 'url(/src/assets/images/langue_map_bg_1779504965708.png)',
          backgroundSize: '450px',
        }}
      />

      {connectionError && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-red-50 border border-red-200 text-red-750 px-4 py-2 rounded-xl text-xs flex items-center gap-2 z-50 shadow-xl font-mono font-bold uppercase">
          <CircleAlert className="w-4 h-4 text-red-500 animate-pulse shrink-0" />
          <span>{connectionError}</span>
        </div>
      )}

      {/* Roster & Chats panel (Sidebar) - hidden or visible depending on responsive state */}
      <div className={`h-full shrink-0 md:block ${selectedChatId || isMapActive ? 'hidden md:w-80' : 'w-full'}`}>
        <Sidebar
          currentUserProfile={userProfile}
          onlineUsers={onlineUsers}
          activeChats={chats}
          selectedChatId={selectedChatId}
          onSelectUser={(u) => {
            handleSelectUser(u);
            setIsMapActive(false);
          }}
          onSelectChat={(c) => {
            handleSelectChat(c);
            setIsMapActive(false);
          }}
          onTransferChat={handleTransferChat}
          onLogout={handleLogout}
          onUpdateZone={handleUpdateZone}
          onToggleMap={() => setIsMapActive(prev => !prev)}
          isMapActive={isMapActive}
          gpsStatus={gpsStatus}
          onRetryGps={handleRetryGps}
          gpsTrackingState={gpsTrackingState}
          gpsCoords={gpsCoords}
          gpsLogs={gpsLogs}
          gpsEnvInfo={gpsEnvInfo}
          onStopGps={handleStopGps}
          gpsIsStarted={gpsIsStarted}
          isSensorOff={gpsIsSensorOff}
        />
      </div>

      {/* Main center pane (Chat or Map) */}
      <div className={`h-full flex-1 flex flex-col bg-[#F7F9FB] ${selectedChatId || isMapActive ? 'w-full' : 'hidden md:flex'}`}>
        {isMapActive ? (
          <div className="h-full w-full relative">
            <div className="md:hidden bg-white p-3 border-b border-slate-200 flex items-center justify-between px-3.5 z-20 relative shrink-0">
              <button
                onClick={() => setIsMapActive(false)}
                className="p-2 text-blue-600 hover:bg-slate-50 rounded-lg flex items-center gap-1 cursor-pointer transition-colors font-bold text-xs"
              >
                <ChevronLeft className="w-5 h-5 shrink-0" />
                <span>Volver a la lista</span>
              </button>
            </div>
            <MapView
              currentUserProfile={userProfile}
              onlineUsers={onlineUsers}
              onSelectUser={(u) => {
                handleSelectUser(u);
                setIsMapActive(false);
              }}
              onCloseMap={() => setIsMapActive(false)}
            />
          </div>
        ) : activeChat ? (
          <div key={selectedChatId} className="h-full flex flex-col flex-1 relative">
            {/* Mobile navigation row: Allows user to click back to roster list */}
            <div className="md:hidden bg-white p-3 border-b border-slate-200 flex items-center gap-1.5 px-3.5 z-10 shrink-0">
              <button
                onClick={() => setSelectedChatId(null)}
                className="p-2 text-blue-600 hover:bg-slate-50 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-5 h-5 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider">Volver activos</span>
              </button>
            </div>

            <ChatWindow
              currentUserProfile={userProfile}
              activeChat={activeChat}
              messages={visibleMessages}
              inputText={inputText}
              onInputChange={setInputText}
              onSendMessage={handleSendMessage}
              onDeleteChat={handleDeleteChat}
              onCollapse={() => setSelectedChatId(null)}
              onCloseChat={handleCloseChat}
              onRateDriver={handleRateDriver}
              partnerProfile={partnerProfile}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#F7F9FB] select-none">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="max-w-md bg-white border border-slate-200 p-8 rounded-3xl shadow-xl flex flex-col items-center"
            >
              <div className="inline-flex p-4 bg-yellow-405/15 border border-yellow-205 text-yellow-600 rounded-full mb-4 shadow-md shadow-yellow-100">
                <span className="text-4xl">🛵</span>
              </div>
              <h2 className="text-2xl font-extrabold text-slate-800 tracking-tight">MotoGo</h2>
              <p className="text-xs text-slate-500 mt-1 font-semibold">
                Servicio de mototaxis en tiempo real
              </p>

              {/* Action button to open Map directly */}
              <button
                onClick={() => setIsMapActive(true)}
                className="mt-5 w-full py-3.5 px-4 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
              >
                <span className="text-base">🗺️</span>
                <span>Ver Mapa MotoGo en Vivo</span>
              </button>
              
              {userProfile?.role === 'cliente' ? (
                <>
                  <p className="text-xs text-slate-500 mt-4 leading-relaxed font-medium">
                    ¡Hola! Comienza seleccionando uno de los **Mototaxistas Conectados** en la lista lateral o abre el **Mapa en Vivo** para solicitar tu servicio de transporte.
                  </p>
                  <p className="text-[11px] text-slate-500 mt-4 bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-left font-mono leading-relaxed w-full">
                    💡 **Escritura Rápida:** Una vez que abras el chat, usa los botones directos para enviar tu ubicación rápida o consultar tarifas al instante.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-505 mt-4 leading-relaxed font-sans font-medium">
                    Bienvenido Conductor. Mantén la aplicación abierta para aparecer **en línea** ante los clientes disponibles en la plataforma.
                  </p>
                  <p className="text-[11px] text-slate-500 mt-4 bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-left font-mono leading-relaxed w-full">
                    💡 **Traspaso de Servicios:** Si recibes un servicio y no puedes atenderlo por distancia o tiempo, búscalo en la lista lateral de compañeros en línea y presiona el botón naranja para **Traspasarlo** en tiempo real.
                  </p>
                </>
              )}
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
