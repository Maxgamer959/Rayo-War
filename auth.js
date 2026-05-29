// ======================
// FIREBASE AUTHENTICATION & FIRESTORE INTEGRATION
// ======================

import { auth, db } from "./firebase-config.js";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
    collection,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ======================
// REGISTRO DE USUARIO
// ======================

async function registerUser(email, password, nationName, government, territory) {
    try {
        console.log("🔄 Iniciando registro para:", email);
        
        // Crear usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        console.log("✅ Usuario creado en Auth:", uid);

        // Crear documento de usuario en Firestore
        const userDocData = {
            email: email,
            nombre_nacion: nationName,
            gobierno: government,
            territorio: territory,
            fecha_creacion: new Date(),
            ultima_conexion: new Date(),
            dinero: 5000,
            poblacion: 1000,
            felicidad: 50,
            salud: 50,
            seguridad: 50
        };

        await setDoc(doc(db, "usuarios", uid), userDocData);
        console.log("✅ Documento de usuario creado en Firestore");

        // Crear documento de nación en Firestore
        const nationDocData = {
            id_lider: uid,
            nombre: nationName,
            territorio: territory,
            gobierno: government,
            religion: null,
            dinero: 5000,
            poblacion: 1000,
            felicidad: 50,
            salud: 50,
            seguridad: 50,
            recursos: getCountryResources(territory),
            edificios: {
                factories: 0,
                powerPlants: 0,
                farms: 0,
                mines: 0,
                refineries: 0,
                hospitals: 0,
                police: 0,
                firefighters: 0,
                schools: 0
            },
            ejercito: {
                soldados: 0,
                tanques: 0,
                aviones: 0
            },
            ciudades: [],
            leyes: [],
            ultima_conexion: new Date(),
            fecha_creacion: new Date()
        };

        await setDoc(doc(db, "naciones", uid), nationDocData);
        console.log("✅ Documento de nación creado en Firestore");

        console.log("✅ Usuario registrado exitosamente:", uid);
        return { success: true, uid: uid };
    } catch (error) {
        console.error("❌ Error en registro:", error.message);
        return { success: false, error: error.message };
    }
}

// ======================
// LOGIN DE USUARIO
// ======================

async function loginUser(email, password) {
    try {
        console.log("🔄 Iniciando login para:", email);
        
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        console.log("✅ Usuario autenticado en Auth:", uid);

        // Verificar que el documento de nación existe
        const nacionRef = doc(db, "naciones", uid);
        const nacionSnap = await getDoc(nacionRef);
        
        if (!nacionSnap.exists()) {
            console.error("❌ Documento de nación no encontrado para:", uid);
            await signOut(auth);
            return { success: false, error: "Datos de nación no encontrados. Por favor, regístrate de nuevo." };
        }

        // Actualizar última conexión
        await updateDoc(nacionRef, { ultima_conexion: new Date() });
        console.log("✅ Última conexión actualizada");

        console.log("✅ Login exitoso para:", uid);
        return { success: true, uid: uid };
    } catch (error) {
        console.error("❌ Error en login:", error.message);
        return { success: false, error: error.message };
    }
}

// ======================
// LOGOUT DE USUARIO
// ======================

async function logoutUser() {
    try {
        await signOut(auth);
        console.log("✅ Usuario desconectado");
        return { success: true };
    } catch (error) {
        console.error("❌ Error en logout:", error.message);
        return { success: false, error: error.message };
    }
}

// ======================
// ACTUALIZAR ÚLTIMA CONEXIÓN
// ======================

async function updateLastConnection(uid) {
    try {
        const nacionRef = doc(db, "naciones", uid);
        await updateDoc(nacionRef, { ultima_conexion: new Date() });
    } catch (error) {
        console.error("❌ Error actualizando última conexión:", error.message);
    }
}

// ======================
// OBTENER RECURSOS POR PAÍS
// ======================

function getCountryResources(territory) {
    const countryResources = {
        'Chile': { Cobre: 80, Hierro: 40, Carbón: 30, Petróleo: 20 },
        'Argentina': { Hierro: 70, Cobre: 30, Carbón: 25, Trigo: 90 },
        'Brasil': { Hierro: 75, Cobre: 35, Petróleo: 50, Café: 85 },
        'Perú': { Cobre: 90, Hierro: 45, Plata: 70, Petróleo: 25 },
        'Colombia': { Petróleo: 80, Cobre: 40, Carbón: 35, Café: 75 },
        'México': { Petróleo: 85, Cobre: 50, Plata: 65, Carbón: 30 },
        'EE.UU': { Hierro: 80, Cobre: 60, Carbón: 90, Petróleo: 70 },
        'Canadá': { Hierro: 85, Cobre: 70, Carbón: 60, Uranio: 75 },
        'Australia': { Hierro: 95, Cobre: 80, Carbón: 100, Uranio: 70 },
        'Rusia': { Petróleo: 100, Carbón: 95, Hierro: 90, Uranio: 85 },
        'China': { Hierro: 100, Cobre: 85, Carbón: 100, Uranio: 60 },
        'India': { Hierro: 80, Cobre: 50, Carbón: 85, Uranio: 40 },
        'Japón': { Cobre: 70, Hierro: 60, Uranio: 50, Tecnología: 95 },
        'Alemania': { Hierro: 75, Cobre: 65, Carbón: 50, Tecnología: 90 },
        'Francia': { Uranio: 80, Hierro: 60, Cobre: 50, Tecnología: 85 },
        'Reino Unido': { Carbón: 70, Hierro: 65, Cobre: 55, Tecnología: 88 },
        'España': { Cobre: 60, Hierro: 50, Carbón: 40, Tecnología: 70 },
        'Italia': { Hierro: 55, Cobre: 50, Carbón: 35, Tecnología: 75 }
    };

    return countryResources[territory] || { Cobre: 50, Hierro: 50, Carbón: 50, Petróleo: 50 };
}

// ======================
// MONITOREAR ESTADO DE AUTENTICACIÓN
// ======================

let authListenerSet = false;

function setupAuthListener(callback) {
    if (authListenerSet) return; // Evitar configurar el listener múltiples veces
    authListenerSet = true;

    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("✅ Usuario autenticado (listener):", user.uid);
            callback({ authenticated: true, uid: user.uid, email: user.email });
        } else {
            console.log("❌ Usuario no autenticado (listener)");
            callback({ authenticated: false });
        }
    });
}

// ======================
// EXPORTAR FUNCIONES
// ======================

export {
    registerUser,
    loginUser,
    logoutUser,
    updateLastConnection,
    getCountryResources,
    setupAuthListener
};
