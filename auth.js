// ======================
// FIREBASE AUTHENTICATION & FIRESTORE INTEGRATION
// ======================

import { auth, db } from "./firebase-config.js";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import {
    doc,
    getDoc,
    setDoc,
    increment,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

async function isEmailBanned(email) {
    if (!email) return false;
    const snap = await getDoc(doc(db, "configuracion", "baneados"));
    if (!snap.exists()) return false;
    const emails = (snap.data().emails || []).map(e => e.toLowerCase());
    return emails.includes(email.toLowerCase());
}

async function isUidBanned(uid) {
    if (!uid) return false;
    const snap = await getDoc(doc(db, "baneados", uid));
    return snap.exists();
}

async function checkAndKickBannedUser(uid, email) {
    const banned = await isUidBanned(uid) || await isEmailBanned(email);
    if (banned) {
        await signOut(auth);
        return {
            banned: true,
            message: "Tu cuenta ha sido suspendida permanentemente por violar las reglas de Rayo War."
        };
    }
    return { banned: false };
}

async function saveUserProfile(uid, email, nationName) {
    await setDoc(doc(db, "usuarios", uid), {
        uid,
        email: email.toLowerCase(),
        nombre: nationName || "Sin nombre",
        ultima_conexion: serverTimestamp()
    }, { merge: true });
}

function buildInitialNation(uid, nationName, government, territory) {
    return {
        id_lider: uid,
        nombre: nationName,
        territorio: territory,
        gobierno: government,
        estado: "activo",
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
        territorios_conquistados: [],
        programas: {
            espacial: { nivel: 0 },
            nuclear: { nivel: 0, armas: 0 }
        },
        miembro_onu: true,
        sancion_onu: false,
        espionaje_intel: null,
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

function buildDefeatedNation(uid, previousData, reason, conquerorName) {
    return {
        id_lider: uid,
        nombre: previousData?.nombre || "Nación Caída",
        estado: "derrotado",
        derrota_razon: reason,
        derrota_por: conquerorName || null,
        derrota_fecha: serverTimestamp(),
        territorio: null,
        gobierno: previousData?.gobierno || null,
        dinero: 0,
        poblacion: 0,
        felicidad: 0,
        salud: 0,
        seguridad: 0,
        recursos_especiales: { energy: 0, food: 0, minerals: 0, oil: 0 },
        ejercito: { soldados: 0, tanques: 0, aviones: 0 },
        poder_total: 0,
        leyes: {},
        alianza: null,
        alianzaId: null,
        territorios_conquistados: [],
        programas: { espacial: { nivel: 0 }, nuclear: { nivel: 0, armas: 0 } },
        miembro_onu: previousData?.miembro_onu !== false,
        sancion_onu: false,
        espionaje_intel: null,
        ciudades: [],
        ultima_conexion: serverTimestamp()
    };
}

async function recreateNation(uid, nationName, government, territory) {
    try {
        const user = auth.currentUser;
        if (await isUidBanned(uid) || await isEmailBanned(user?.email)) {
            return {
                success: false,
                error: "Tu cuenta está suspendida. No puedes crear una nueva nación."
            };
        }

        await setDoc(doc(db, "naciones", uid), buildInitialNation(uid, nationName, government, territory));
        await saveUserProfile(uid, user?.email, nationName);
        return { success: true, uid };
    } catch (error) {
        console.error("❌ Error recreando nación:", error.message);
        return { success: false, error: error.message };
    }
}

async function registerUser(email, password, nationName, government, territory) {
    let userCredential = null;

    try {
        if (await isEmailBanned(email)) {
            return {
                success: false,
                error: "Este correo está permanentemente suspendido por violar las reglas de Rayo War."
            };
        }

        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        const banCheck = await checkAndKickBannedUser(uid, email);
        if (banCheck.banned) {
            return { success: false, error: banCheck.message };
        }

        await runTransaction(db, async (transaction) => {
            const configRef = doc(db, "configuracion", "estado");
            const nationRef = doc(db, "naciones", uid);
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

            transaction.set(nationRef, buildInitialNation(uid, nationName, government, territory));
            transaction.update(configRef, { totalUsuarios: increment(1) });
        });

        await saveUserProfile(uid, email, nationName);

        return { success: true, uid };

    } catch (error) {
        if (userCredential?.user) {
            try {
                await deleteUser(userCredential.user);
            } catch (cleanupError) {
                console.error("❌ No se pudo revertir la cuenta creada:", cleanupError.message);
            }
        }

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
        if (await isEmailBanned(email)) {
            return {
                success: false,
                error: "Tu cuenta está permanentemente suspendida por violar las reglas de Rayo War."
            };
        }

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const banCheck = await checkAndKickBannedUser(userCredential.user.uid, email);
        if (banCheck.banned) {
            return { success: false, error: banCheck.message };
        }

        const nationSnap = await getDoc(doc(db, "naciones", userCredential.user.uid));
        const nationName = nationSnap.exists() ? nationSnap.data().nombre : "Jugador";
        await saveUserProfile(userCredential.user.uid, email, nationName);

        return { success: true, uid: userCredential.user.uid };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function logoutUser() {
    await signOut(auth);
}

function setupAuthListener(callback) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const banCheck = await checkAndKickBannedUser(user.uid, user.email);
            if (banCheck.banned) {
                callback({ authenticated: false, banned: true, message: banCheck.message });
                return;
            }
            callback({ authenticated: true, uid: user.uid, email: user.email });
        } else {
            callback({ authenticated: false });
        }
    });
}

export {
    buildInitialNation,
    buildDefeatedNation,
    registerUser,
    recreateNation,
    loginUser,
    logoutUser,
    setupAuthListener
};
