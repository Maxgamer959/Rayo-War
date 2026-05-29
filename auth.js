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
    increment,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ======================
// REGISTRO DE USUARIO CON LÍMITE DE CUPOS
// ======================

async function registerUser(email, password, nationName, government, territory) {
    try {
        console.log("🔄 Verificando cupos del imperio...");
        
        // Usamos una transacción para asegurar que el contador sea exacto y evitar duplicados
        const result = await runTransaction(db, async (transaction) => {
            const configRef = doc(db, "configuracion", "estado");
            const configSnap = await transaction.get(configRef);
            
            let totalUsuarios = 0;
            if (configSnap.exists()) {
                totalUsuarios = configSnap.data().totalUsuarios || 0;
            } else {
                // Si el documento no existe, lo inicializamos
                transaction.set(configRef, { totalUsuarios: 0 });
            }

            // LÍMITE DE 9,000 USUARIOS (PLAN SPARK)
            if (totalUsuarios >= 9000) {
                throw new Error("SERVIDORES_LLENOS");
            }

            // Si hay cupo, procedemos con la creación en Auth (esto ocurre fuera de la transacción, 
            // pero validamos el cupo aquí dentro primero)
            return true;
        });

        // Crear el usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        // Datos iniciales de la nación
        const nationDocData = {
            id_lider: uid,
            nombre: nationName,
            territorio: territory,
            gobierno: government,
            dinero: 5000,
            poblacion: 1000,
            felicidad: 50,
            salud: 50,
            seguridad: 50,
            recursos_especiales: { energy: 100, food: 100, minerals: 100, oil: 100 },
            edificios: {
                factories: 0, powerPlants: 0, farms: 0, mines: 0, refineries: 0,
                hospitals: 0, police: 0, firefighters: 0, schools: 0
            },
            ejercito: { soldados: 0, tanques: 0, aviones: 0 },
            poder_total: 0,
            ciudades: [],
            ultima_conexion: new Date(),
            fecha_creacion: new Date()
        };

        // Guardar datos y aumentar contador
        await setDoc(doc(db, "naciones", uid), nationDocData);
        await updateDoc(doc(db, "configuracion", "estado"), {
            totalUsuarios: increment(1)
        });

        return { success: true, uid: uid };

    } catch (error) {
        if (error.message === "SERVIDORES_LLENOS") {
            return { 
                success: false, 
                error: "¡Servidores llenos! El imperio Rayo War ha alcanzado su límite máximo de gobernantes por ahora. Vuelve más tarde." 
            };
        }
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
        return { success: true, uid: uid };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function logoutUser() {
    await signOut(auth);
}

function setupAuthListener(callback) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            callback({ authenticated: true, uid: user.uid });
        } else {
            callback({ authenticated: false });
        }
    });
}

export {
    registerUser,
    loginUser,
    logoutUser,
    setupAuthListener
};
