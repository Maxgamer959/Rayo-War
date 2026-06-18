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
    doc,
    setDoc,
    updateDoc,
    increment,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

function buildInitialNation(uid, nationName, government, territory) {
    return {
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
        ejercito: { soldados: 10, tanques: 0, aviones: 0 },
        poder_total: 100,
        leyes: {},
        alianza: null,
        alianzaId: null,
        ciudades: [{
            name: "Capital " + nationName,
            population: 500,
            edificios: {
                factories: 1, powerPlants: 1, farms: 1, mines: 1, refineries: 1,
                hospitals: 1, police: 1, firefighters: 1, schools: 1
            }
        }],
        ultima_conexion: serverTimestamp(),
        fecha_creacion: serverTimestamp()
    };
}

async function registerUser(email, password, nationName, government, territory) {
    try {
        await runTransaction(db, async (transaction) => {
            const configRef = doc(db, "configuracion", "estado");
            const configSnap = await transaction.get(configRef);

            let totalUsuarios = 0;
            if (configSnap.exists()) {
                totalUsuarios = configSnap.data().totalUsuarios || 0;
            } else {
                transaction.set(configRef, { totalUsuarios: 0 });
            }

            if (totalUsuarios >= 9000) {
                throw new Error("SERVIDORES_LLENOS");
            }
        });

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        await setDoc(doc(db, "naciones", uid), buildInitialNation(uid, nationName, government, territory));
        await updateDoc(doc(db, "configuracion", "estado"), {
            totalUsuarios: increment(1)
        });

        return { success: true, uid };

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

async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, uid: userCredential.user.uid };
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
