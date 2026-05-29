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
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ======================
// REGISTRO DE USUARIO
// ======================

async function registerUser(email, password, nationName, government, territory) {
    try {
        // Crear usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        // Crear documento de usuario en Firestore
        await setDoc(doc(db, "usuarios", uid), {
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
        });

        // Crear documento de nación en Firestore
        await setDoc(doc(db, "naciones", uid), {
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
            ciudades: [],
            leyes: [],
            ultima_conexion: new Date(),
            fecha_creacion: new Date()
        });

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
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        // Actualizar última conexión en Firestore
        await updateLastConnection(uid);

        console.log("✅ Usuario autenticado:", uid);
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
        await setDoc(nacionRef, { ultima_conexion: new Date() }, { merge: true });
    } catch (error) {
        console.error("❌ Error actualizando última conexión:", error.message);
    }
}

// ======================
// OBTENER RECURSOS POR PAÍS
// ======================

function getCountryResources(territory) {
    const countryResources = {
        'Chile': { copper: 80, iron: 40, coal: 30, oil: 20 },
        'Argentina': { iron: 70, copper: 30, coal: 25, wheat: 90 },
        'Brazil': { iron: 75, copper: 35, oil: 50, coffee: 85 },
        'Peru': { copper: 90, iron: 45, silver: 70, oil: 25 },
        'Colombia': { oil: 80, copper: 40, coal: 35, coffee: 75 },
        'Mexico': { oil: 85, copper: 50, silver: 65, coal: 30 },
        'United States': { iron: 80, copper: 60, coal: 90, oil: 70 },
        'Canada': { iron: 85, copper: 70, coal: 60, uranium: 75 },
        'Australia': { iron: 95, copper: 80, coal: 100, uranium: 70 },
        'Russia': { oil: 100, coal: 95, iron: 90, uranium: 85 },
        'China': { iron: 100, copper: 85, coal: 100, uranium: 60 },
        'India': { iron: 80, copper: 50, coal: 85, uranium: 40 },
        'Japan': { copper: 70, iron: 60, uranium: 50, tech: 95 },
        'Germany': { iron: 75, copper: 65, coal: 50, tech: 90 },
        'France': { uranium: 80, iron: 60, copper: 50, tech: 85 },
        'United Kingdom': { coal: 70, iron: 65, copper: 55, tech: 88 },
    };

    return countryResources[territory] || { copper: 50, iron: 50, coal: 50, oil: 50 };
}

// ======================
// MONITOREAR ESTADO DE AUTENTICACIÓN
// ======================

export function onAuthStateChangedListener(callback) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("✅ Usuario autenticado:", user.uid);
            callback({ authenticated: true, uid: user.uid, email: user.email });
        } else {
            console.log("❌ Usuario no autenticado");
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
    getCountryResources
};
