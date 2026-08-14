// ======================
// ADMINISTRACIÓN Y MODERACIÓN
// ======================

import { db, ADMIN_EMAILS } from "./firebase-config.js";
import { buildDefeatedNation } from "./auth.js";
import {
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    query,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import { removeFromAlliance } from "./diplomacy.js";

let isAdminUser = false;
let banWatchUnsubscribe = null;

async function loadAdminConfig() {
    try {
        const snap = await getDoc(doc(db, "configuracion", "admin"));
        if (!snap.exists()) return { emails: [], uids: [] };
        const data = snap.data();
        return {
            emails: (data.emails || []).map(e => String(e).toLowerCase()),
            uids: data.uids || []
        };
    } catch (e) {
        console.warn("⚠️ No se pudo leer configuracion/admin:", e.message);
        return { emails: [], uids: [] };
    }
}

async function ensureAdminRegistered(uid, email) {
    if (!uid || !email) return false;

    const config = await loadAdminConfig();
    const emailLower = email.toLowerCase();
    const allAdminEmails = [
        ...config.emails,
        ...ADMIN_EMAILS.map(e => e.toLowerCase())
    ];
    const isListedAdmin = allAdminEmails.includes(emailLower) || config.uids.includes(uid);

    if (isListedAdmin) {
        if (!config.uids.includes(uid)) {
            try {
                const mergedEmails = [...new Set([...config.emails, emailLower])];
                await setDoc(doc(db, "configuracion", "admin"), {
                    emails: mergedEmails,
                    uids: [...config.uids, uid]
                }, { merge: true });
            } catch (e) {
                console.warn("⚠️ No se pudo registrar UID admin en Firestore:", e.message);
            }
        }
        isAdminUser = true;
        console.log("👑 Admin activo:", emailLower);
        return true;
    }

    isAdminUser = config.uids.includes(uid);
    return isAdminUser;
}

function getIsAdmin() {
    return isAdminUser;
}

async function banUser(adminUid, adminName, targetUid, reason) {
    if (!isAdminUser) return { success: false, error: "No eres administrador" };
    if (targetUid === adminUid) return { success: false, error: "No puedes banearte a ti mismo" };

    try {
        const userSnap = await getDoc(doc(db, "usuarios", targetUid));
        const nationSnap = await getDoc(doc(db, "naciones", targetUid));

        const userData = userSnap.exists() ? userSnap.data() : {};
        const nationData = nationSnap.exists() ? nationSnap.data() : {};
        const email = (userData.email || "").toLowerCase();

        if (!email) return { success: false, error: "No se encontró el correo del jugador" };

        await setDoc(doc(db, "baneados", targetUid), {
            uid: targetUid,
            email,
            nombre: nationData.nombre || userData.nombre || "Desconocido",
            razon: reason || "Violación de las reglas",
            baneadoPor: adminUid,
            baneadoPorNombre: adminName,
            fecha: serverTimestamp()
        });

        const banListSnap = await getDoc(doc(db, "configuracion", "baneados"));
        let emails = [];
        let uids = [];
        if (banListSnap.exists()) {
            emails = banListSnap.data().emails || [];
            uids = banListSnap.data().uids || [];
        }
        if (!emails.includes(email)) emails.push(email);
        if (!uids.includes(targetUid)) uids.push(targetUid);

        await setDoc(doc(db, "configuracion", "baneados"), { emails, uids }, { merge: true });

        if (nationSnap.exists()) {
            await setDoc(doc(db, "naciones", targetUid), buildDefeatedNation(
                targetUid,
                nationData,
                `BANEADO: ${reason || "Violación de reglas"}`,
                `Admin: ${adminName}`
            ));
            if (nationData.alianzaId) {
                await removeFromAlliance(targetUid, nationData.alianzaId);
            }
        }

        await updateDoc(doc(db, "usuarios", targetUid), {
            baneado: true,
            baneado_fecha: serverTimestamp()
        });

        return { success: true, email, nombre: nationData.nombre || userData.nombre };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function unbanUser(targetUid) {
    if (!isAdminUser) return { success: false, error: "No eres administrador" };

    try {
        const banSnap = await getDoc(doc(db, "baneados", targetUid));
        if (!banSnap.exists()) return { success: false, error: "Este jugador no está baneado" };

        const { email } = banSnap.data();
        await deleteDoc(doc(db, "baneados", targetUid));

        const banListSnap = await getDoc(doc(db, "configuracion", "baneados"));
        if (banListSnap.exists()) {
            const data = banListSnap.data();
            await updateDoc(doc(db, "configuracion", "baneados"), {
                emails: (data.emails || []).filter(e => e.toLowerCase() !== email?.toLowerCase()),
                uids: (data.uids || []).filter(id => id !== targetUid)
            });
        }

        const userRef = doc(db, "usuarios", targetUid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            await updateDoc(userRef, { baneado: false });
        }

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function deleteChatMessage(collectionName, messageId) {
    if (!isAdminUser) return { success: false, error: "No eres administrador" };
    try {
        await deleteDoc(doc(db, collectionName, messageId));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function loadAllUsersForAdmin() {
    const snap = await getDocs(collection(db, "usuarios"));
    const users = [];
    snap.forEach(d => users.push({ id: d.id, ...d.data() }));
    return users;
}

async function loadBannedUsers() {
    const snap = await getDocs(collection(db, "baneados"));
    const banned = [];
    snap.forEach(d => banned.push({ id: d.id, ...d.data() }));
    return banned;
}

function startBanWatcher(uid, onBanned) {
    if (banWatchUnsubscribe) banWatchUnsubscribe();
    banWatchUnsubscribe = onSnapshot(doc(db, "baneados", uid), (snap) => {
        if (snap.exists()) onBanned(snap.data());
    });
}

function stopBanWatcher() {
    if (banWatchUnsubscribe) banWatchUnsubscribe();
    banWatchUnsubscribe = null;
}

export {
    ensureAdminRegistered,
    getIsAdmin,
    banUser,
    unbanUser,
    deleteChatMessage,
    loadAllUsersForAdmin,
    loadBannedUsers,
    startBanWatcher,
    stopBanWatcher
};
