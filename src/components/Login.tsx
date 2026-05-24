/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { setDoc, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { 
  UserCheck, 
  Shield, 
  AlertCircle, 
  MapPin, 
  ArrowRight 
} from 'lucide-react';

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

  // State fields requested by user
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [mototaxiNumber, setMototaxiNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedZone, setSelectedZone] = useState('Langue (Centro)');
  const [customZone, setCustomZone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Sync role selector
  const handleSetRole = (newRole: 'cliente' | 'moto') => {
    setRole(newRole);
    localStorage.setItem('moto_chat_pending_registration', newRole);
    setError(null);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmedEmail = email.trim();
    const trimmedPassword = password;

    if (!trimmedEmail || !trimmedPassword) {
      setError('Por favor completa el correo electrónico y la contraseña.');
      setLoading(false);
      return;
    }

    if (trimmedPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      setLoading(false);
      return;
    }

    if (isSignUp) {
      if (!firstName.trim()) {
        setError('Por favor ingresa tu nombre (nombre es obligatorio).');
        setLoading(false);
        return;
      }
      if (!lastName.trim()) {
        setError('Por favor ingresa tu apellido (apellido es obligatorio).');
        setLoading(false);
        return;
      }
      if (!phone.trim()) {
        setError('Por favor ingresa tu número celular (celular es obligatorio).');
        setLoading(false);
        return;
      }
    }

    try {
      const finalZone = selectedZone === 'Otro' ? (customZone.trim() || 'Langue (Centro)') : selectedZone;

      if (isSignUp) {
        localStorage.setItem('moto_chat_pending_registration', role);
        const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
        const user = credential.user;
        const displayName = `${firstName.trim()} ${lastName.trim()}`;

        // Create user document inside firestore
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: trimmedEmail,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          name: displayName,
          role: role,
          zone: finalZone,
          isOnline: true,
          lastActive: Date.now(),
          ...(role === 'moto' && mototaxiNumber.trim() ? { mototaxiNumber: mototaxiNumber.trim() } : {})
        });

        localStorage.removeItem('moto_chat_pending_registration');
        onAuthSuccess();
      } else {
        // Sign in user directly using persistent auth state
        const credential = await signInWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
        const user = credential.user;

        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        let updateData: any = {
          isOnline: true,
          lastActive: Date.now()
        };

        if (userDocSnap.exists()) {
          const docData = userDocSnap.data();
          if (docData?.role) {
            updateData.role = docData.role;
          } else {
            updateData.role = role;
          }
          if (docData?.name) {
            updateData.name = docData.name;
          }
        } else {
          // Fallback if db trigger lag or manual user delete
          updateData.role = role;
          updateData.name = trimmedEmail.split('@')[0];
          updateData.zone = finalZone;
        }

        await setDoc(userDocRef, updateData, { merge: true });
        localStorage.removeItem('moto_chat_pending_registration');
        onAuthSuccess();
      }
    } catch (err: any) {
      localStorage.removeItem('moto_chat_pending_registration');
      console.error(err);
      let localizedMsg = 'Ocurrió un error al autenticar. Por favor reintenta.';
      if (err.code === 'auth/email-already-in-use') {
        localizedMsg = 'Este correo electrónico ya está registrado. Intenta iniciar sesión.';
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        localizedMsg = 'Credenciales de acceso incorrectas. Verifica tu correo y contraseña.';
      } else if (err.code === 'auth/invalid-email') {
        localizedMsg = 'La dirección de correo electrónico provista no es válida.';
      } else if (err.code === 'auth/weak-password') {
        localizedMsg = 'La contraseña ingresada es muy débil (mínimo 6 caracteres).';
      } else if (err.message) {
        localizedMsg = err.message;
      }
      setError(localizedMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FB] flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden" id="login-screen">
      {/* Background Watermark/Map */}
      <div 
        className="absolute inset-0 pointer-events-none z-0 opacity-[0.06] bg-center bg-no-repeat"
        style={{ 
          backgroundImage: 'url(/src/assets/images/langue_map_bg_1779504965708.png)',
          backgroundSize: '450px',
        }}
      />

      {/* Decorative gradient blur rings */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-yellow-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white border border-slate-200 p-6 sm:p-8 rounded-3xl w-full max-w-md shadow-xl relative z-10"
      >
        <div className="text-center mb-6">
          <div className="inline-flex p-3 bg-yellow-400 text-slate-900 rounded-full mb-2.5 shadow-md">
            <span className="text-2xl font-bold">🛵</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">MotoChatPro</h1>
          <p className="text-slate-500 mt-1 text-xs leading-relaxed max-w-xs mx-auto">
            Tu servicio de motos y taxis rápidos en tiempo real (Langue y Zonas Cercanas)
          </p>
        </div>

        {/* Tab switcher: Iniciar Sesión vs Registrarse */}
        <div className="flex border-b border-slate-200 mb-6">
          <button
            type="button"
            onClick={() => { setIsSignUp(false); setError(null); }}
            className={`flex-1 pb-2.5 text-xs sm:text-sm font-bold transition-all text-center border-b-2 cursor-pointer ${
              !isSignUp 
                ? 'border-yellow-400 text-slate-800' 
                : 'border-transparent text-slate-400 hover:text-slate-605'
            }`}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => { setIsSignUp(true); setError(null); }}
            className={`flex-1 pb-2.5 text-xs sm:text-sm font-bold transition-all text-center border-b-2 cursor-pointer ${
              isSignUp 
                ? 'border-yellow-400 text-slate-800' 
                : 'border-transparent text-slate-400 hover:text-slate-605'
            }`}
          >
            Registrarse
          </button>
        </div>

        {/* Dynamic & Actionable Error Notice */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-5 p-3 bg-red-50 border border-red-200 rounded-2xl text-red-850 text-xs flex gap-2 items-start font-medium leading-relaxed"
          >
            <AlertCircle className="text-red-500 shrink-0 mt-0.5 w-4 h-4" />
            <div className="flex-1 text-slate-700">{error}</div>
          </motion.div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {/* Profile selector header - shown ONLY during registration */}
          {isSignUp && (
            <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
              <label className="block text-slate-500 text-[10px] font-bold mb-2 uppercase tracking-wider text-center">
                Selecciona tu tipo de Perfil
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleSetRole('cliente')}
                  className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer ${
                    role === 'cliente'
                      ? 'bg-yellow-400/25 border-yellow-400 text-slate-900 font-bold shadow-sm'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Cliente</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSetRole('moto')}
                  className={`py-2 px-3 rounded-xl border flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer ${
                    role === 'moto'
                      ? 'bg-yellow-400/25 border-yellow-400 text-slate-900 font-bold shadow-sm'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <Shield className="w-4 h-4" />
                  <span>Mototaxista</span>
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {isSignUp && (
              <>
                {/* Nombre y Apellido */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 text-[10px] font-bold mb-1 uppercase tracking-wider">
                      Nombre
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Juan"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-205 rounded-xl py-2 px-3 text-slate-800 text-xs focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[10px] font-bold mb-1 uppercase tracking-wider">
                      Apellido
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: Silva"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-205 rounded-xl py-2 px-3 text-slate-800 text-xs focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 font-semibold"
                    />
                  </div>
                </div>

                {/* Número celular */}
                <div>
                  <label className="block text-slate-600 text-[10px] font-bold mb-1 uppercase tracking-wider">
                    Número Celular
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Ej: 9944-8833"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-205 rounded-xl py-2 px-3 text-slate-800 text-xs focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 font-semibold"
                  />
                </div>

                {/* Número de mototaxi (Optional, Mototaxistas only) */}
                {role === 'moto' && (
                  <div>
                    <label className="block text-slate-600 text-[10px] font-bold mb-1 uppercase tracking-wider">
                      Número de Mototaxi (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: M-104 o Registro local"
                      value={mototaxiNumber}
                      onChange={(e) => setMototaxiNumber(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-205 rounded-xl py-2 px-3 text-slate-800 text-xs focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 font-semibold"
                    />
                  </div>
                )}
              </>
            )}

            {/* Email */}
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
                className="w-full bg-slate-50 border border-slate-205 rounded-xl py-2 px-3 text-slate-800 text-xs focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 font-semibold"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-slate-605 text-[10px] font-bold mb-1 uppercase tracking-wider">
                Contraseña {isSignUp && <span className="text-[9px] text-slate-400 font-normal">(mínimo 6 caracteres)</span>}
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-205 rounded-xl py-2 px-3 text-slate-800 text-xs focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 font-semibold"
              />
            </div>

            {/* Zona / Ubicación - shown ONLY during registration */}
            {isSignUp && (
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5">
                <label className="block text-slate-700 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-center flex items-center justify-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-yellow-500" />
                  Ubicación / Comunidad
                </label>
                
                <select
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="w-full text-center bg-white border border-slate-200 rounded-xl py-1.5 px-2 text-slate-800 text-xs focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 font-semibold"
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
                    className="w-full text-center bg-white border border-slate-202 rounded-xl py-1.5 px-2 text-slate-800 text-xs placeholder-slate-400 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 font-semibold"
                  />
                )}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${
              loading ? 'scale-[0.98]' : 'active:scale-95'
            }`}
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            <span>{isSignUp ? "Registrarse" : "Iniciar Sesión"}</span>
          </button>
        </form>

        <p className="text-center text-[10px] text-slate-400 mt-5 leading-normal">
          🔒 Sesión totalmente persistente: la aplicación se mantendrá abierta y conectada incluso si la minimizas, cierras o reinicias tu dispositivo móvil.
        </p>
      </motion.div>
    </div>
  );
}
