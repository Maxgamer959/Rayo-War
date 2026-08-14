// ======================
// DIPLOMACIA: COMERCIO, ESPIONAJE, PROGRAMAS, ONU
// ======================

import { db } from "./firebase-config.js";
import {
    doc,
    getDoc,
    getDocs,
    collection,
    addDoc,
    updateDoc,
    query,
    where,
    limit,
    serverTimestamp,
    onSnapshot,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

export const TRADE_RESOURCES = [
    "dinero", "energy", "food", "minerals", "oil", "soldados", "tanques", "aviones"
];

const RESOURCE_LABELS = {
    dinero: "💰 Dinero",
    energy: "⚡ Energía",
    food: "🌾 Alimentos",
    minerals: "⛏️ Minerales",
    oil: "🛢️ Petróleo",
    soldados: "👨‍🎖️ Soldados",
    tanques: "🚜 Tanques",
    aviones: "✈️ Aviones"
};

const SPACE_COSTS = [
    { money: 3000, minerals: 50 },
    { money: 8000, minerals: 150 },
    { money: 15000, minerals: 300 },
    { money: 30000, minerals: 600 },
    { money: 60000, minerals: 1200 }
];

const NUCLEAR_COSTS = [
    { money: 5000, minerals: 100, oil: 50 },
    { money: 12000, minerals: 250, oil: 120 },
    { money: 25000, minerals: 500, oil: 250 }
];

let tradeUnsubscribe = null;

function getResourceAmount(nation, type) {
    if (!nation) return 0;
    if (type === "dinero") return nation.dinero || 0;
    if (["soldados", "tanques", "aviones"].includes(type)) {
        return nation.ejercito?.[type] || 0;
    }
    return nation.recursos_especiales?.[type] || 0;
}

function applyResourceDelta(base, type, delta) {
    const nation = JSON.parse(JSON.stringify(base));
    if (type === "dinero") {
        nation.dinero = Math.max(0, (nation.dinero || 0) + delta);
        return nation;
    }
    if (["soldados", "tanques", "aviones"].includes(type)) {
        if (!nation.ejercito) nation.ejercito = { soldados: 0, tanques: 0, aviones: 0 };
        nation.ejercito[type] = Math.max(0, (nation.ejercito[type] || 0) + delta);
        return nation;
    }
    if (!nation.recursos_especiales) {
        nation.recursos_especiales = { energy: 0, food: 0, minerals: 0, oil: 0 };
    }
    nation.recursos_especiales[type] = Math.max(0, (nation.recursos_especiales[type] || 0) + delta);
    return nation;
}

function calcPower(nation) {
    const e = nation.ejercito || {};
    return (e.soldados || 0) * 10 + (e.tanques || 0) * 100 + (e.aviones || 0) * 500;
}

function resourceLabel(type) {
    return RESOURCE_LABELS[type] || type;
}

async function removeFromAlliance(uid, alianzaId) {
    if (!alianzaId) return;
    try {
        const allianceRef = doc(db, "alianzas", alianzaId);
        const snap = await getDoc(allianceRef);
        if (!snap.exists()) return;
        const miembros = (snap.data().miembros || []).filter(id => id !== uid);
        await updateDoc(allianceRef, { miembros });
    } catch (e) {
        console.error("❌ Error removiendo de alianza:", e);
    }
}

async function ensureOnuDoc() {
    const onuRef = doc(db, "onu", "estado");
    const snap = await getDoc(onuRef);
    if (!snap.exists()) {
        await updateDoc(onuRef, {}).catch(async () => {
            const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js");
            await setDoc(onuRef, {
                miembros: [],
                resoluciones: [],
                sanciones: {},
                fecha: serverTimestamp()
            });
        });
    }
}

async function registerOnuMember(uid) {
    try {
        const onuRef = doc(db, "onu", "estado");
        const snap = await getDoc(onuRef);
        if (!snap.exists()) {
            const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js");
            await setDoc(onuRef, {
                miembros: [uid],
                resoluciones: [],
                sanciones: {},
                fecha: serverTimestamp()
            });
            return;
        }
        const miembros = snap.data().miembros || [];
        if (!miembros.includes(uid)) {
            await updateDoc(onuRef, { miembros: [...miembros, uid] });
        }
    } catch (e) {
        console.error("❌ Error registrando en ONU:", e);
    }
}

async function sendTradeOffer(currentUser, currentNation, targetId, offerType, offerAmount, requestType, requestAmount) {
    if (!currentUser || !currentNation || !targetId) return { success: false, error: "Datos incompletos" };
    if (targetId === currentUser) return { success: false, error: "No puedes comerciar contigo mismo" };
    if (offerAmount <= 0 || requestAmount <= 0) return { success: false, error: "Cantidades inválidas" };
    if (getResourceAmount(currentNation, offerType) < offerAmount) {
        return { success: false, error: "No tienes suficientes recursos para ofrecer" };
    }

    try {
        await addDoc(collection(db, "comercio"), {
            emisorId: currentUser,
            emisorNombre: currentNation.nombre,
            destinatarioId: targetId,
            ofrece: { tipo: offerType, cantidad: offerAmount },
            pide: { tipo: requestType, cantidad: requestAmount },
            estado: "pendiente",
            fecha: serverTimestamp()
        });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function acceptTradeOffer(currentUser, tradeId) {
    try {
        await runTransaction(db, async (transaction) => {
            const tradeRef = doc(db, "comercio", tradeId);
            const tradeSnap = await transaction.get(tradeRef);
            if (!tradeSnap.exists()) throw new Error("Oferta no encontrada");

            const trade = tradeSnap.data();
            if (trade.estado !== "pendiente") throw new Error("Oferta ya procesada");
            if (trade.destinatarioId !== currentUser) throw new Error("No puedes aceptar esta oferta");

            const emisorRef = doc(db, "naciones", trade.emisorId);
            const destRef = doc(db, "naciones", trade.destinatarioId);
            const emisorSnap = await transaction.get(emisorRef);
            const destSnap = await transaction.get(destRef);

            if (!emisorSnap.exists() || !destSnap.exists()) throw new Error("Nación no encontrada");
            const emisor = emisorSnap.data();
            const dest = destSnap.data();
            if (emisor.estado === "derrotado" || dest.estado === "derrotado") throw new Error("Nación derrotada");

            const offer = trade.ofrece;
            const request = trade.pide;

            if (getResourceAmount(emisor, offer.tipo) < offer.cantidad) throw new Error("El emisor ya no tiene los recursos");
            if (getResourceAmount(dest, request.tipo) < request.cantidad) throw new Error("No tienes recursos suficientes");

            let newEmisor = applyResourceDelta(emisor, offer.tipo, -offer.cantidad);
            newEmisor = applyResourceDelta(newEmisor, request.tipo, request.cantidad);
            let newDest = applyResourceDelta(dest, request.tipo, -request.cantidad);
            newDest = applyResourceDelta(newDest, offer.tipo, offer.cantidad);

            transaction.update(emisorRef, {
                dinero: newEmisor.dinero,
                recursos_especiales: newEmisor.recursos_especiales,
                ejercito: newEmisor.ejercito,
                poder_total: calcPower(newEmisor),
                ultima_conexion: serverTimestamp()
            });
            transaction.update(destRef, {
                dinero: newDest.dinero,
                recursos_especiales: newDest.recursos_especiales,
                ejercito: newDest.ejercito,
                poder_total: calcPower(newDest),
                ultima_conexion: serverTimestamp()
            });
            transaction.update(tradeRef, {
                estado: "completada",
                fecha_completada: serverTimestamp()
            });
        });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function rejectTradeOffer(currentUser, tradeId) {
    try {
        const tradeRef = doc(db, "comercio", tradeId);
        const snap = await getDoc(tradeRef);
        if (!snap.exists()) return { success: false, error: "Oferta no encontrada" };
        const trade = snap.data();
        if (trade.destinatarioId !== currentUser && trade.emisorId !== currentUser) {
            return { success: false, error: "No autorizado" };
        }
        await updateDoc(tradeRef, { estado: "rechazada", fecha_rechazo: serverTimestamp() });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function sendSupport(currentUser, currentNation, targetId, resourceType, amount) {
    if (!amount || amount <= 0) return { success: false, error: "Cantidad inválida" };
    const target = await getDoc(doc(db, "naciones", targetId));
    if (!target.exists()) return { success: false, error: "Nación no encontrada" };

    const targetData = target.data();
    if (currentNation.alianzaId && targetData.alianzaId === currentNation.alianzaId) {
        // aliado OK
    } else {
        return { success: false, error: "Solo puedes apoyar a miembros de tu alianza" };
    }
    if (getResourceAmount(currentNation, resourceType) < amount) {
        return { success: false, error: "Recursos insuficientes" };
    }

    try {
        await runTransaction(db, async (transaction) => {
            const fromRef = doc(db, "naciones", currentUser);
            const toRef = doc(db, "naciones", targetId);
            const fromSnap = await transaction.get(fromRef);
            const toSnap = await transaction.get(toRef);
            if (!fromSnap.exists() || !toSnap.exists()) throw new Error("Nación no encontrada");

            let from = fromSnap.data();
            let to = toSnap.data();
            if (getResourceAmount(from, resourceType) < amount) throw new Error("Recursos insuficientes");

            from = applyResourceDelta(from, resourceType, -amount);
            to = applyResourceDelta(to, resourceType, amount);

            transaction.update(fromRef, {
                dinero: from.dinero,
                recursos_especiales: from.recursos_especiales,
                ejercito: from.ejercito,
                poder_total: calcPower(from),
                ultima_conexion: serverTimestamp()
            });
            transaction.update(toRef, {
                dinero: to.dinero,
                recursos_especiales: to.recursos_especiales,
                ejercito: to.ejercito,
                poder_total: calcPower(to),
                ultima_conexion: serverTimestamp()
            });
        });

        await addDoc(collection(db, "batallas"), {
            tipo: "apoyo",
            atacante: currentNation.nombre,
            atacanteId: currentUser,
            defensor: targetData.nombre,
            defensorId: targetId,
            mensaje: `${currentNation.nombre} envió apoyo: ${amount} ${resourceLabel(resourceType)}`,
            fecha: serverTimestamp()
        });

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function sabotageNation(currentUser, currentNation, targetId) {
    const cost = { money: 2000, minerals: 30 };
    if ((currentNation.dinero || 0) < cost.money) return { success: false, error: "Necesitas $2,000" };
    if ((currentNation.recursos_especiales?.minerals || 0) < cost.minerals) {
        return { success: false, error: "Necesitas 30 minerales" };
    }

    try {
        await runTransaction(db, async (transaction) => {
            const attackerRef = doc(db, "naciones", currentUser);
            const targetRef = doc(db, "naciones", targetId);
            const attSnap = await transaction.get(attackerRef);
            const tgtSnap = await transaction.get(targetRef);
            if (!tgtSnap.exists() || !attSnap.exists()) throw new Error("Nación no encontrada");

            let attacker = attSnap.data();
            let target = tgtSnap.data();
            if (target.estado === "derrotado") throw new Error("Objetivo ya derrotado");

            attacker.dinero -= cost.money;
            attacker.recursos_especiales.minerals -= cost.minerals;

            const sabotageTypes = ["energy", "food", "minerals", "oil", "dinero"];
            const hit = sabotageTypes[Math.floor(Math.random() * sabotageTypes.length)];
            target = applyResourceDelta(target, hit, -Math.floor(getResourceAmount(target, hit) * 0.15));

            if (target.ciudades?.length) {
                const cityIdx = Math.floor(Math.random() * target.ciudades.length);
                const city = target.ciudades[cityIdx];
                const buildingKeys = Object.keys(city.edificios || {}).filter(k => (city.edificios[k] || 0) > 0);
                if (buildingKeys.length) {
                    const bKey = buildingKeys[Math.floor(Math.random() * buildingKeys.length)];
                    city.edificios[bKey] = Math.max(0, city.edificios[bKey] - 1);
                }
            }

            transaction.update(attackerRef, {
                dinero: attacker.dinero,
                recursos_especiales: attacker.recursos_especiales,
                ultima_conexion: serverTimestamp()
            });
            transaction.update(targetRef, {
                dinero: target.dinero,
                recursos_especiales: target.recursos_especiales,
                ciudades: target.ciudades,
                ultima_conexion: serverTimestamp()
            });
        });

        await addDoc(collection(db, "batallas"), {
            tipo: "sabotaje",
            atacante: currentNation.nombre,
            atacanteId: currentUser,
            defensorId: targetId,
            mensaje: `${currentNation.nombre} ejecutó un sabotaje enemigo.`,
            fecha: serverTimestamp()
        });

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function spyOnNation(currentUser, currentNation, targetId, allNations) {
    const cost = 1500;
    if ((currentNation.dinero || 0) < cost) return { success: false, error: "Necesitas $1,500" };

    const target = allNations.find(n => n.id === targetId);
    if (!target) return { success: false, error: "Nación no encontrada" };

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - cost,
            espionaje_intel: {
                objetivoId: targetId,
                objetivoNombre: target.nombre,
                datos: {
                    dinero: target.dinero,
                    poblacion: target.poblacion,
                    recursos: target.recursos_especiales,
                    ejercito: target.ejercito,
                    poder_total: target.poder_total,
                    territorio: target.territorio,
                    programas: target.programas
                },
                expira: Date.now() + 30 * 60 * 1000
            },
            ultima_conexion: serverTimestamp()
        });
        return { success: true, intel: target };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function investSpaceProgram(currentUser, currentNation) {
    const level = currentNation.programas?.espacial?.nivel || 0;
    if (level >= SPACE_COSTS.length) return { success: false, error: "Programa espacial al máximo" };

    const cost = SPACE_COSTS[level];
    if ((currentNation.dinero || 0) < cost.money) return { success: false, error: `Necesitas $${cost.money}` };
    if ((currentNation.recursos_especiales?.minerals || 0) < cost.minerals) {
        return { success: false, error: `Necesitas ${cost.minerals} minerales` };
    }

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - cost.money,
            recursos_especiales: {
                ...currentNation.recursos_especiales,
                minerals: (currentNation.recursos_especiales?.minerals || 0) - cost.minerals
            },
            programas: {
                ...currentNation.programas,
                espacial: { nivel: level + 1 }
            },
            ultima_conexion: serverTimestamp()
        });
        return { success: true, newLevel: level + 1 };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function investNuclearProgram(currentUser, currentNation) {
    const level = currentNation.programas?.nuclear?.nivel || 0;
    if (level >= NUCLEAR_COSTS.length) return { success: false, error: "Programa nuclear completado" };

    const cost = NUCLEAR_COSTS[level];
    if ((currentNation.dinero || 0) < cost.money) return { success: false, error: `Necesitas $${cost.money}` };
    if ((currentNation.recursos_especiales?.minerals || 0) < cost.minerals) {
        return { success: false, error: `Necesitas ${cost.minerals} minerales` };
    }
    if ((currentNation.recursos_especiales?.oil || 0) < cost.oil) {
        return { success: false, error: `Necesitas ${cost.oil} petróleo` };
    }

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - cost.money,
            recursos_especiales: {
                ...currentNation.recursos_especiales,
                minerals: (currentNation.recursos_especiales?.minerals || 0) - cost.minerals,
                oil: (currentNation.recursos_especiales?.oil || 0) - cost.oil
            },
            programas: {
                ...currentNation.programas,
                nuclear: {
                    nivel: level + 1,
                    armas: currentNation.programas?.nuclear?.armas || 0
                }
            },
            ultima_conexion: serverTimestamp()
        });
        return { success: true, newLevel: level + 1 };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function buildNuclearWeapon(currentUser, currentNation) {
    const nuclear = currentNation.programas?.nuclear || { nivel: 0, armas: 0 };
    if (nuclear.nivel < 3) return { success: false, error: "Completa el programa nuclear primero" };
    const cost = { money: 10000, minerals: 200, oil: 100 };
    if ((currentNation.dinero || 0) < cost.money) return { success: false, error: "Necesitas $10,000" };
    if ((currentNation.recursos_especiales?.minerals || 0) < cost.minerals) return { success: false, error: "Minerales insuficientes" };
    if ((currentNation.recursos_especiales?.oil || 0) < cost.oil) return { success: false, error: "Petróleo insuficiente" };

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - cost.money,
            recursos_especiales: {
                ...currentNation.recursos_especiales,
                minerals: (currentNation.recursos_especiales?.minerals || 0) - cost.minerals,
                oil: (currentNation.recursos_especiales?.oil || 0) - cost.oil
            },
            programas: {
                ...currentNation.programas,
                nuclear: { nivel: nuclear.nivel, armas: (nuclear.armas || 0) + 1 }
            },
            ultima_conexion: serverTimestamp()
        });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function proposeOnuSanction(currentUser, currentNation, targetId, reason) {
    const cost = 3000;
    if ((currentNation.dinero || 0) < cost) return { success: false, error: "Necesitas $3,000 para proponer sanción" };

    try {
        const onuRef = doc(db, "onu", "estado");
        const onuSnap = await getDoc(onuRef);
        const resoluciones = onuSnap.exists() ? (onuSnap.data().resoluciones || []) : [];

        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - cost,
            ultima_conexion: serverTimestamp()
        });

        const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js");
        const newRes = {
            id: Date.now().toString(),
            tipo: "sancion",
            objetivoId: targetId,
            proponenteId: currentUser,
            proponenteNombre: currentNation.nombre,
            razon: reason || "Violación de la paz mundial",
            votos: [currentUser],
            fecha: new Date().toISOString()
        };

        if (onuSnap.exists()) {
            await updateDoc(onuRef, { resoluciones: [...resoluciones, newRes] });
        } else {
            await setDoc(onuRef, { miembros: [currentUser], resoluciones: [newRes], sanciones: {} });
        }

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function voteOnuResolution(currentUser, resolutionId, favor) {
    try {
        const onuRef = doc(db, "onu", "estado");
        const snap = await getDoc(onuRef);
        if (!snap.exists()) return { success: false, error: "ONU no disponible" };

        const data = snap.data();
        const resoluciones = data.resoluciones || [];
        const idx = resoluciones.findIndex(r => r.id === resolutionId);
        if (idx === -1) return { success: false, error: "Resolución no encontrada" };

        const res = resoluciones[idx];
        if (res.votos?.includes(currentUser)) return { success: false, error: "Ya votaste" };

        res.votos = [...(res.votos || []), currentUser];
        resoluciones[idx] = res;

        const sanciones = { ...(data.sanciones || {}) };
        if (res.votos.length >= 3 && res.tipo === "sancion") {
            sanciones[res.objetivoId] = res.razon;
            await updateDoc(doc(db, "naciones", res.objetivoId), { sancion_onu: true });
        }

        await updateDoc(onuRef, { resoluciones, sanciones });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function appealOnuSanction(currentUser, currentNation) {
    const cost = 10000;
    if (!currentNation.sancion_onu) return { success: false, error: "No tienes sanciones activas" };
    if ((currentNation.dinero || 0) < cost) return { success: false, error: "Necesitas $10,000 para apelar" };

    try {
        const onuRef = doc(db, "onu", "estado");
        const snap = await getDoc(onuRef);
        const sanciones = snap.exists() ? { ...(snap.data().sanciones || {}) } : {};
        delete sanciones[currentUser];

        await updateDoc(onuRef, { sanciones });
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - cost,
            sancion_onu: false,
            ultima_conexion: serverTimestamp()
        });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function startTradeListener(currentUser, callback) {
    if (tradeUnsubscribe) tradeUnsubscribe();
    const q = query(
        collection(db, "comercio"),
        where("destinatarioId", "==", currentUser),
        limit(30)
    );
    tradeUnsubscribe = onSnapshot(q, (snap) => {
        const offers = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(o => o.estado === "pendiente");
        callback(offers);
    }, (err) => console.error("❌ Error comercio:", err));
}

function stopTradeListener() {
    if (tradeUnsubscribe) tradeUnsubscribe();
    tradeUnsubscribe = null;
}

function getSpaceBonus(level) {
    return 1 + (level || 0) * 0.05;
}

function getNuclearAttackBonus(nation) {
    return (nation.programas?.nuclear?.armas || 0) > 0;
}

export {
    TRADE_RESOURCES,
    resourceLabel,
    getResourceAmount,
    calcPower,
    removeFromAlliance,
    registerOnuMember,
    sendTradeOffer,
    acceptTradeOffer,
    rejectTradeOffer,
    sendSupport,
    sabotageNation,
    spyOnNation,
    investSpaceProgram,
    investNuclearProgram,
    buildNuclearWeapon,
    proposeOnuSanction,
    voteOnuResolution,
    appealOnuSanction,
    startTradeListener,
    stopTradeListener,
    getSpaceBonus,
    getNuclearAttackBonus,
    SPACE_COSTS,
    NUCLEAR_COSTS
};
