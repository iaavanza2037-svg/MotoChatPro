/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signInAnonymously } from 'firebase/auth';
import { setDoc, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { User, LogIn, Mail, Lock, Shield, UserCheck, AlertCircle, Sparkles } from 'lucide-react';

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

interface LoginProps {
  onAuthSuccess: () => void;
}

export default function Login({ onAuthSuccess }: LoginProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [role, setRole] = useState<'cliente' | 'moto'>(() => {
    const saved = localStorage.getItem('moto_chat_pending_registration');
    return (saved === 'moto' || saved === 'cliente') ? saved : 'cliente';
  });
  const [name, setName] = useState(() => {
    return localStorage.getItem('moto_chat_saved_name') || '';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedZone, setSelectedZone] = useState('Langue (Centro)');
  const [customZone, setCustomZone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authTab, setAuthTab] = useState<'invite' | 'google' | 'email'>('invite');

  // Sync role to localStorage so App.tsx is immediately in line
  const handleSetRole = (newRole: 'cliente' | 'moto') => {
    setRole(newRole);
    localStorage.setItem('moto_chat_pending_registration', newRole);
    if (newRole === 'moto') {
      setAuthTab('google');
    } else {
      setAuthTab('invite');
    }
  };

  const handleAnonymousSignIn = async () => {
    setError(null);
    const trimmedName = name.trim();
    if (role === 'cliente' && !trimmedName) {
      setError('Por favor, ingresa tu nombre. Es obligatorio para poder ingresar como Cliente.');
      return;
    }

    setLoading(true);
    localStorage.setItem('moto_chat_pending_registration', role);
    try {
      if (trimmedName) {
        localStorage.setItem('moto_chat_saved_name', trimmedName);
      }
      const credential = await signInAnonymously(auth);
      const user = credential.user;
      
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      const customName = trimmedName || (role === 'cliente' ? `Pasajero_${Math.floor(1000 + Math.random() * 9000)}` : `Mototaxista_${Math.floor(1000 + Math.random() * 9000)}`);
      const finalZone = selectedZone === 'Otro' ? (customZone.trim() || 'Langue (Centro)') : selectedZone;
      
      if (!userDocSnap.exists()) {
        await setDoc(userDocRef, {
          uid: user.uid,
          email: `guest_${user.uid.substring(0, 8)}@motochat.com`,
          name: customName,
          role: role,
          zone: finalZone,
          isOnline: true,
          lastActive: Date.now()
        });
      } else {
        await setDoc(userDocRef, {
          role: role,
          name: name.trim() || userDocSnap.data()?.name || customName,
          zone: finalZone,
          isOnline: true,
          lastActive: Date.now()
        }, { merge: true });
      }
      
      localStorage.removeItem('moto_chat_pending_registration');
      onAuthSuccess();
    } catch (err: any) {
      localStorage.removeItem('moto_chat_pending_registration');
      console.error(err);
      let localizedMsg = 'Error al iniciar sesión como invitado.';
      if (err.code === 'auth/admin-restricted-operation') {
        localizedMsg = 'auth/admin-restricted-operation';
      } else if (err.message) {
        localizedMsg = err.message;
      }
      setError(localizedMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!email || !password) {
      setError('Por favor completa el correo y la contraseña.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      setLoading(false);
      return;
    }

    try {
      const finalZone = selectedZone === 'Otro' ? (customZone.trim() || 'Langue (Centro)') : selectedZone;

      if (isSignUp) {
        localStorage.setItem('moto_chat_pending_registration', role);
        // Create user
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const displayName = name.trim() || email.split('@')[0];

        // Set profile in Firestore
        await setDoc(doc(db, 'users', credential.user.uid), {
          uid: credential.user.uid,
          email: email.trim(),
          name: displayName,
          role: role,
          zone: finalZone,
          isOnline: true,
          lastActive: Date.now()
        });
      } else {
        // Log in
        const credential = await signInWithEmailAndPassword(auth, email, password);
        // Track the chosen role on successful login to enable easy sandbox profiling
        const userDocRef = doc(db, 'users', credential.user.uid);
        const updateData: any = {
          role: role,
          zone: finalZone,
          isOnline: true,
          lastActive: Date.now()
        };
        if (name.trim()) {
          updateData.name = name.trim();
        }
        await setDoc(userDocRef, updateData, { merge: true });
      }
      localStorage.removeItem('moto_chat_pending_registration');
      onAuthSuccess();
    } catch (err: any) {
      localStorage.removeItem('moto_chat_pending_registration');
      console.error(err);
      let localizedMsg = 'Ocurrió un error al autenticar.';
      if (err.code === 'auth/email-already-in-use') {
        localizedMsg = 'auth/email-already-in-use';
      } else if (err.code === 'auth/operation-not-allowed') {
        localizedMsg = 'auth/operation-not-allowed';
      } else if (err.code === 'auth/invalid-credential') {
        localizedMsg = 'Credenciales incorrectas. Verifica tu correo y contraseña.';
      } else if (err.code === 'auth/user-not-found') {
        localizedMsg = 'No existe ningún usuario registrado con este correo.';
      } else if (err.code === 'auth/wrong-password') {
        localizedMsg = 'Contraseña incorrecta.';
      } else if (err.message) {
        localizedMsg = err.message;
      }
      setError(localizedMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    const trimmedName = name.trim();
    if (role === 'cliente' && !trimmedName) {
      setError('Por favor, ingresa tu nombre. Es obligatorio para poder ingresar como Cliente.');
      return;
    }

    setLoading(true);
    localStorage.setItem('moto_chat_pending_registration', role);
    try {
      if (trimmedName) {
        localStorage.setItem('moto_chat_saved_name', trimmedName);
      }
      localStorage.setItem('moto_chat_saved_zone', selectedZone);
      localStorage.setItem('moto_chat_saved_custom_zone', customZone);

      const provider = new GoogleAuthProvider();
      
      const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      let credential = null;

      if (isMobileDevice && !isStandalone) {
        // Standard mobile browser: use direct redirect
        console.log("Iniciando redirección de Google para navegador móvil.");
        localStorage.setItem('moto_chat_redirect_active', 'true');
        await signInWithRedirect(auth, provider);
        return; // Page is redirecting
      }

      // Standalone PWA or Desktop: try popup first
      try {
        console.log("Iniciando selector emergente de Google (PWA Standalone o Escritorio).");
        credential = await signInWithPopup(auth, provider);
      } catch (popupErr: any) {
        console.warn("Fallo en signInWithPopup, probando redirección como respaldo:", popupErr);
        if (isMobileDevice) {
          localStorage.setItem('moto_chat_redirect_active', 'true');
          await signInWithRedirect(auth, provider);
          return;
        } else {
          throw popupErr;
        }
      }

      if (!credential) {
        throw new Error("No se pudo obtener las credenciales de autenticación.");
      }

      const user = credential.user;
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      const displayName = trimmedName || userDocSnap.data()?.name || user.displayName || user.email?.split('@')[0] || 'Usuario';
      const finalZone = selectedZone === 'Otro' ? (customZone.trim() || 'Langue (Centro)') : selectedZone;
      
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email || userDocSnap.data()?.email || '',
        name: displayName,
        role: role,
        zone: finalZone,
        isOnline: true,
        lastActive: Date.now()
      }, { merge: true });
      
      localStorage.removeItem('moto_chat_pending_registration');
      localStorage.removeItem('moto_chat_saved_name');
      localStorage.removeItem('moto_chat_saved_zone');
      localStorage.removeItem('moto_chat_saved_custom_zone');
      localStorage.removeItem('moto_chat_redirect_active');
      onAuthSuccess();
    } catch (err: any) {
      console.error("Error en inicio de sesión de Google:", err);
      let localizedMsg = 'Ocurrió un error con el inicio de sesión de Google.';
      if (err.code === 'auth/popup-blocked') {
        localizedMsg = 'El navegador bloqueó la ventana emergente de Google. Por favor, permite ventanas emergentes para MotoChatPro.';
      } else if (err.code === 'auth/popup-closed-by-user') {
        localizedMsg = 'La ventana de inicio de sesión de Google fue cerrada antes de completarse.';
      } else if (err.code === 'auth/operation-not-allowed') {
        localizedMsg = 'auth/operation-not-allowed-google';
      } else if (err.message) {
        localizedMsg = err.message;
      }
      setError(localizedMsg);
    } finally {
      setLoading(false);
    }
  };

  const [showClassicAuth, setShowClassicAuth] = useState(false);

  return (
    <div className="min-h-screen bg-[#F7F9FB] flex flex-col justify-center items-center px-4 relative overflow-hidden" id="login-screen">
      {/* Background Watermark/Map */}
      <div 
        className="absolute inset-0 pointer-events-none z-0 opacity-[0.06] bg-center bg-no-repeat"
        style={{ 
          backgroundImage: 'url(/src/assets/images/langue_map_bg_1779504965708.png)',
          backgroundSize: '450px',
        }}
      />

      {/* Background graphic elements */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-yellow-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white border border-slate-200 p-8 rounded-3xl w-full max-w-md shadow-xl relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex p-4 bg-yellow-400 text-slate-900 rounded-full mb-3 shadow-md shadow-yellow-250">
            <span className="text-3xl font-bold">🛵</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">MotoChatPro</h1>
          <p className="text-slate-550 mt-2 text-sm leading-relaxed">
            Tu servicio de motos, mototaxis y taxis rápido, directo y en tiempo real
          </p>
        </div>

        {/* Dynamic & Actionable Error Notice */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs flex gap-2.5 items-start font-medium"
          >
            <AlertCircle className="text-red-500 shrink-0 mt-0.5 w-4 h-4" />
            <div className="flex-1 text-slate-700">
              {error === 'auth/operation-not-allowed' ? (
                <div>
                  <p className="font-bold text-red-800">⚠️ Registro de Correo Inactivo</p>
                  <p className="mt-1 leading-relaxed text-slate-600">
                    El método de inicio con correo y contraseña no está activado en tu panel de Firebase.
                  </p>
                  <div className="mt-2.5 bg-white border border-red-100 p-3 rounded-lg text-slate-700 font-sans shadow-sm">
                    <p className="font-mono text-[9px] uppercase font-bold text-red-600 tracking-wider">PASOS PARA SOLUCIONAR:</p>
                    <ol className="list-decimal pl-4 mt-1.5 space-y-1.5 text-[11px] text-slate-600 leading-normal">
                      <li>Inicia sesión en tu consola:</li>
                      <li>
                        <a 
                          href="https://console.firebase.google.com/project/gen-lang-client-0527772426/authentication/providers"
                          target="_blank"
                          rel="noreferrer"
                          className="underline font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                        >
                          Ir a Proveedores de Firebase ↗
                        </a>
                      </li>
                      <li>Haz clic en <strong>Agregar proveedor</strong> y selecciona <strong>Correo electrónico/Contraseña</strong>.</li>
                      <li>Habilítalo y presiona <strong>Guardar</strong>.</li>
                    </ol>
                  </div>
                  <p className="mt-2.5 text-[10px] text-slate-500 italic">
                    💡 O inicie sesión inmediatamente usando el botón de <strong>Google</strong> abajo si ya está activo.
                  </p>
                </div>
              ) : error === 'auth/operation-not-allowed-google' ? (
                <div>
                  <p className="font-bold text-red-800">⚠️ Google Sign-In Inactivo</p>
                  <p className="mt-1 leading-relaxed text-slate-600">
                    El método de inicio de Google Sign-In no está activo en este proyecto de Firebase.
                  </p>
                  <div className="mt-2.5 bg-white border border-red-100 p-3 rounded-lg text-slate-700 font-sans shadow-sm">
                    <p className="font-mono text-[9px] uppercase font-bold text-red-600 tracking-wider">COMO HABILITAR GOOGLE SIGN-IN:</p>
                    <ol className="list-decimal pl-4 mt-1.5 space-y-1.5 text-[11px] text-slate-600 leading-normal">
                      <li>Abre el panel de proveedores:</li>
                      <li>
                        <a 
                          href="https://console.firebase.google.com/project/gen-lang-client-0527772426/authentication/providers"
                          target="_blank"
                          rel="noreferrer"
                          className="underline font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                        >
                          Panel de Proveedores de Firebase ↗
                        </a>
                      </li>
                      <li>Selecciona o añade el proveedor de <strong>Google</strong>.</li>
                      <li>Habilítalo, selecciona un correo de soporte del proyecto y presiona <strong>Guardar</strong>.</li>
                    </ol>
                  </div>
                </div>
              ) : error === 'auth/admin-restricted-operation' ? (
                <div>
                  <p className="font-bold text-red-800">⚠️ Acceso de Invitado Inactivo</p>
                  <p className="mt-1 leading-relaxed text-slate-600">
                    El método de inicio de sesión **Anónimo (Invitado)** no está activado en tu panel de Firebase Console.
                  </p>
                  <div className="mt-2.5 bg-white border border-red-100 p-3 rounded-lg text-slate-700 font-sans shadow-sm">
                    <p className="font-mono text-[9px] uppercase font-bold text-red-600 tracking-wider">CÓMO SOLUCIONAR:</p>
                    <ol className="list-decimal pl-4 mt-1.5 space-y-1.5 text-[11px] text-slate-600 leading-normal font-normal">
                      <li>Inicia sesión en tu consola:</li>
                      <li>
                        <a 
                          href="https://console.firebase.google.com/project/gen-lang-client-0527772426/authentication/providers"
                          target="_blank"
                          rel="noreferrer"
                          className="underline font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                        >
                          Ir a Métodos de Acceso de Firebase ↗
                        </a>
                      </li>
                      <li>Haz clic en <strong>Agregar proveedor nuevo</strong> si no ves Anónimo en la lista.</li>
                      <li>Busca <strong>Anónimo</strong> (bajo la sección "Otros proveedores"), actívalo y haz clic en <strong>Guardar</strong>.</li>
                    </ol>
                  </div>
                  <p className="mt-2.5 text-[10px] text-slate-500 italic">
                    💡 Mientras tanto, puedes usar **Google** si ya lo tienes habilitado arriba.
                  </p>
                </div>
              ) : error === 'auth/email-already-in-use' ? (
                <div>
                  <p className="font-bold">⚠️ Correo electrónico ocupado</p>
                  <p className="mt-0.5 text-slate-600 leading-relaxed">
                    Esta dirección de correo ya está registrada a nombre de otra persona.
                  </p>
                  <button 
                    type="button"
                    onClick={() => {
                      setIsSignUp(false);
                      setShowClassicAuth(true);
                      setError(null);
                    }}
                    className="mt-2.5 text-[11px] font-bold text-blue-600 hover:text-blue-700 underline block text-left"
                  >
                    ¿Ya es tu cuenta? Haga clic aquí para Iniciar Sesión en su lugar.
                  </button>
                </div>
              ) : (
                <span>{error}</span>
              )}
            </div>
          </motion.div>
        )}

        {/* STEP 1: Select Role First */}
        <div className="mb-6">
          <label className="block text-slate-600 text-xs font-bold mb-3 uppercase tracking-wider text-center">
            Paso 1: Selecciona tu Perfil
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => handleSetRole('cliente')}
              className={`py-3.5 px-4 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                role === 'cliente'
                  ? 'bg-yellow-400/25 border-yellow-400 text-slate-900 font-bold shadow-md ring-1 ring-yellow-400'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              <UserCheck className="w-6 h-6 shrink-0" />
              <div className="text-center font-bold">
                <p className="text-xs font-black uppercase tracking-wider">Cliente</p>
                <p className="text-[10px] text-slate-500 mt-0.5 font-normal">Quiero pedir viajes</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSetRole('moto')}
              className={`py-3.5 px-4 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                role === 'moto'
                  ? 'bg-yellow-400/25 border-yellow-400 text-slate-900 font-bold shadow-md ring-1 ring-yellow-400'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              <Shield className="w-6 h-6 shrink-0" />
              <div className="text-center">
                <p className="text-xs font-black uppercase tracking-wider">Mototaxista</p>
                <p className="text-[10px] text-slate-500 mt-0.5 font-normal">Tengo una moto</p>
              </div>
            </button>
          </div>
        </div>

        {/* STEP 1.5: Customize Name (Required for Cliente, Optional for Mototaxista) */}
        <div className={`mb-6 p-3.5 rounded-2xl border transition-all duration-300 ${
          role === 'cliente' 
            ? 'bg-yellow-450/5 border-yellow-300 ring-1 ring-yellow-400/20' 
            : 'bg-slate-50 border-slate-200'
        }`}>
          <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider text-center flex items-center justify-center gap-1.5">
            <User className={`w-3.5 h-3.5 shrink-0 ${role === 'cliente' ? 'text-amber-500' : 'text-yellow-500'}`} />
            {role === 'cliente' ? 'Tu Nombre (Obligatorio)' : 'Tu Nombre (Opcional)'}
          </label>
          <input
            type="text"
            required={role === 'cliente'}
            placeholder={role === 'cliente' ? "Escribe tu nombre para iniciar" : "Ej: Pedro Navaja / Moto Rápida"}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              // Proactively clear error if they start typing
              if (error && role === 'cliente' && e.target.value.trim()) {
                setError(null);
              }
            }}
            className={`w-full text-center bg-white border rounded-xl py-2 px-3 text-slate-800 text-xs placeholder-slate-400 focus:outline-none focus:ring-1 font-semibold transition-all ${
              role === 'cliente' && !name.trim()
                ? 'border-yellow-400/80 focus:border-yellow-400 focus:ring-yellow-400 bg-yellow-50/5'
                : 'border-slate-200 focus:border-yellow-400 focus:ring-yellow-400'
            }`}
          />
          <p className="text-center text-[9px] text-slate-400 mt-1.5 leading-tight">
            {role === 'cliente' 
              ? '⚠️ Para pedir viajes es obligatorio ingresar tu nombre de cliente.'
              : '¿Quieres usar un nombre personalizado? Escríbelo aquí antes de conectar.'
            }
          </p>
        </div>

        {/* STEP 1.7: Zona / Comunidad (Required) */}
        <div className="mb-6 bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
          <label className="block text-slate-700 text-xs font-bold mb-2 uppercase tracking-wider text-center flex items-center justify-center gap-1.5">
            <span className="text-yellow-500 text-sm">📍</span>
            Tu Ubicación / Municipio / Aldea
          </label>
          
          <select
            value={selectedZone}
            onChange={(e) => setSelectedZone(e.target.value)}
            className="w-full text-center bg-white border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 font-semibold mb-2"
          >
            {ZONAS_PRESETS.map(z => (
              <option key={z} value={z}>{z}</option>
            ))}
            <option value="Otro">Otro (Escribir personalizado...)</option>
          </select>

          {selectedZone === 'Otro' && (
            <motion.input
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              type="text"
              placeholder="Escribe tu Barrio, Aldea o Municipio"
              value={customZone}
              onChange={(e) => setCustomZone(e.target.value)}
              className="w-full text-center bg-white border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs placeholder-slate-400 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 font-semibold"
            />
          )}
          <p className="text-center text-[9px] text-slate-400 mt-1.5 leading-tight">
            💡 Verás únicamente a los usuarios de tu ubicación seleccionada para evitar confusión entre zonas distantes.
          </p>
        </div>

        {/* STEP 2: Main connect Actions */}
        <div className="mb-6 space-y-3">
          {role === 'moto' ? (
            <>
              {showClassicAuth ? (
                /* EMAIL PASSWORD BACK-UP INTERFACE FOR MOTOTAXISTAS */
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="bg-yellow-400/10 border border-yellow-350 p-3 rounded-2xl text-[11px] text-slate-700 leading-relaxed mb-1 shadow-sm text-center">
                    <p className="font-bold text-yellow-800 flex items-center justify-center gap-1.5 text-xs">
                      <span>🚲</span> Registro/Acceso con Correo para Mototaxistas
                    </p>
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] font-bold mb-1 uppercase tracking-wider">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="ejemplo@correo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3.5 text-slate-800 text-xs focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] font-bold mb-1 uppercase tracking-wider">
                      Contraseña (mínimo 6 caracteres)
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3.5 text-slate-800 text-xs focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 font-semibold"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <button
                      type="button"
                      onClick={() => setIsSignUp(!isSignUp)}
                      className="text-blue-600 hover:text-blue-700 font-bold underline cursor-pointer"
                    >
                      {isSignUp ? "Ya tengo cuenta (Iniciar sesión)" : "¿No tienes cuenta? Regístrate aquí"}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider py-4 px-4 rounded-2xl shadow-md flex items-center justify-center gap-3 transition-all cursor-pointer ${
                      loading ? 'scale-95' : 'active:scale-95'
                    }`}
                  >
                    {loading ? (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : null}
                    <span>{isSignUp ? "Registrarse como Mototaxista" : "Iniciar Sesión"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowClassicAuth(false);
                      setError(null);
                    }}
                    className="w-full text-slate-500 hover:text-slate-700 text-[11px] font-bold text-center underline block cursor-pointer"
                  >
                    ← Volver a Conectar con Google
                  </button>
                </form>
              ) : (
                /* GOOGLE SIGN IN INTERFACE */
                <>
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-yellow-400/10 border border-yellow-350 p-3 rounded-2xl text-[11px] text-slate-700 leading-relaxed mb-1 shadow-sm text-center"
                  >
                    <p className="font-bold text-yellow-800 flex items-center justify-center gap-1.5 text-xs">
                      <span>⚠️</span> Registro Obligatorio con Google / Correo
                    </p>
                  </motion.div>

                  <label className="block text-slate-600 text-xs font-bold mb-1 uppercase tracking-wider text-center">
                    Paso 2: Conéctate con Google
                  </label>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className={`w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider py-4 px-4 rounded-2xl shadow-md flex items-center justify-center gap-3 transition-all cursor-pointer ${
                      loading ? 'scale-95' : 'active:scale-95'
                    }`}
                  >
                    {loading ? (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#EA4335"
                          d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.48 14.98 1 12 1 7.35 1 3.37 3.68 1.41 7.59l3.8 2.94C6.15 7.15 8.86 5.04 12 5.04z"
                        />
                        <path
                          fill="#4285F4"
                          d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.44h6.46c-.28 1.48-1.11 2.73-2.35 3.57l3.72 2.87c2.18-2.01 3.66-4.97 3.66-8.54z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.21 10.53c-.24-.72-.38-1.49-.38-2.28s.14-1.56.38-2.28L1.41 3.59C.51 5.39 0 7.39 0 9.5s.51 4.11 1.41 5.91l3.8-2.88z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 18.96c-3.14 0-5.85-2.11-6.79-5.49l-3.8 2.88c1.96 3.91 5.94 6.59 10.59 6.59 2.98 0 5.66-1 7.55-2.71l-3.72-2.87c-1.03.68-2.35 1.1-4.03 1.1z"
                        />
                      </svg>
                    )}
                    <span>Conectar con Google</span>
                  </button>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-[10.5px] text-slate-550 leading-relaxed text-center">
                    🛡️ <em>Requiere una cuenta de Google para garantizar la confianza en el servicio.</em>
                  </div>

                  <div className="text-center pt-1.55">
                    <button
                      type="button"
                      onClick={() => {
                        setShowClassicAuth(true);
                        setIsSignUp(false);
                        setError(null);
                      }}
                      className="text-blue-600 hover:text-blue-700 font-bold text-xs underline cursor-pointer"
                    >
                      💡 ¿No te funciona Google? Usa tu Correo y Contraseña aquí
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {showClassicAuth ? (
                /* EMAIL PASSWORD BACK-UP INTERFACE FOR CLIENTS */
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="bg-emerald-500/10 border border-emerald-200 p-3 rounded-2xl text-[11px] text-slate-700 leading-relaxed mb-1 text-center">
                    <p className="font-bold text-emerald-800">
                      ✉️ Registro / Acceso con Correo para Clientes
                    </p>
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] font-bold mb-1 uppercase tracking-wider">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="ejemplo@correo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3.5 text-slate-800 text-xs focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] font-bold mb-1 uppercase tracking-wider">
                      Contraseña (mínimo 6 caracteres)
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3.5 text-slate-800 text-xs focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 font-semibold"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <button
                      type="button"
                      onClick={() => setIsSignUp(!isSignUp)}
                      className="text-blue-600 hover:text-blue-700 font-bold underline cursor-pointer"
                    >
                      {isSignUp ? "Ya tengo cuenta (Iniciar sesión)" : "¿No tienes cuenta? Regístrate aquí"}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full bg-[#10B981] hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider py-4 px-4 rounded-2xl shadow-md flex items-center justify-center gap-3 transition-all cursor-pointer ${
                      loading ? 'scale-95' : 'active:scale-95'
                    }`}
                  >
                    {loading ? (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : null}
                    <span>{isSignUp ? "Registrarse como Cliente" : "Iniciar Sesión"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowClassicAuth(false);
                      setError(null);
                    }}
                    className="w-full text-slate-500 hover:text-slate-700 text-[11px] font-bold text-center underline block cursor-pointer"
                  >
                    ← Volver a Conexión Rápida
                  </button>
                </form>
              ) : (
                /* INSTANT CLIENT CONNECT */
                <>
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-emerald-500/10 border border-emerald-200 p-3 rounded-2xl text-[11px] text-slate-700 leading-relaxed mb-1 text-center"
                  >
                    <p className="font-medium text-emerald-800 font-bold">
                      🎉 El servicio para <strong>Clientes</strong> es 100% gratuito y libre de cargos.
                    </p>
                  </motion.div>

                  <label className="block text-slate-600 text-xs font-bold mb-1 uppercase tracking-wider text-center">
                    Paso 2: Conéctate al Instante
                  </label>

                  <button
                    type="button"
                    onClick={handleAnonymousSignIn}
                    disabled={loading}
                    className={`w-full bg-yellow-400 hover:bg-yellow-500 text-slate-950 font-bold text-xs uppercase tracking-wider py-4 px-4 rounded-2xl shadow-md flex items-center justify-center gap-3 transition-all cursor-pointer ${
                      loading ? 'scale-95' : 'active:scale-95'
                    }`}
                  >
                    {loading ? (
                      <span className="inline-block w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Sparkles className="w-5 h-5 text-slate-900" />
                    )}
                    <span>Entrar como Cliente</span>
                  </button>

                  <p className="text-center text-[11px] text-slate-550 mt-1 leading-relaxed px-1">
                    ⚡ <strong>100% Libre y Compatible:</strong> Olvídate de registros pesados o contraseñas. Únete de inmediato de forma rápida y sin complicaciones.
                  </p>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowClassicAuth(true);
                        setIsSignUp(false);
                        setError(null);
                      }}
                      className="text-blue-600 hover:text-blue-700 font-bold text-xs underline cursor-pointer"
                    >
                      💡 ¿Prefieres usar Correo y Contraseña? Haz clic aquí
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>

      </motion.div>
    </div>
  );
}
