// ======================
// RAYO WAR - SIMULADOR DE NACIONES MULTIJUGADOR
// ======================

let currentNacion = null;
let map = null;
let nationMarkers = [];

import { auth, db } from "./firebase-config.js";
import {
    registerUser,
    loginUser,
    logoutUser,
    setupAuthListener
} from "./auth.js";
import {
    doc,
    getDocs,
    collection,
    updateDoc,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    onSnapshot,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ======================
// ESTADO GLOBAL
// ======================

let currentUser = null;
let currentNation = null;
let currentLanguage = 'es';
let allNations = [];
let activeCityId = null;
let currentChatChannel = 'global';
let chatUnsubscribe = null;
let rankingUnsubscribe = null;
let battlesUnsubscribe = null;
let productionInterval = null;
let firestoreSyncCounter = 0;
let statsSyncCounter = 0;

const FIRESTORE_SYNC_EVERY = 15;
const STATS_SYNC_EVERY = 30;
const TICK_MS = 1000;
const TICK_SECONDS = 1;
const ATTACK_BASE_COST = 500;

const TERRITORY_COORDS = {
    'Chile': [-35, -71], 'Argentina': [-38, -63], 'México': [23, -102], 'España': [40, -3],
    'Perú': [-9, -75], 'Brasil': [-14, -51], 'Canadá': [56, -106], 'EE.UU': [37, -95],
    'Reino Unido': [55, -3], 'Francia': [46, 2], 'Alemania': [51, 10], 'Italia': [41, 12],
    'Rusia': [61, 105], 'China': [35, 104], 'Japón': [36, 138], 'India': [20, 78],
    'Australia': [-25, 133], 'Sudáfrica': [-30, 22], 'Egipto': [26, 30], 'Arabia Saudita': [23, 45]
};

const translations = {
    es: {
        overview: '📊 Resumen',
        cities: '🏙️ Ciudades',
        war: '⚔️ Guerra',
        money: '💰 Dinero',
        energy: '⚡ Energía',
        food: '🌾 Alimentos',
        minerals: '⛏️ Minerales',
        oil: '🛢️ Petróleo',
        population: '👥 Población',
        attack: '⚔️ Atacar',
        logout: 'Cerrar Sesión',
        selectCity: 'Selecciona una ciudad primero',
        insufficientMoney: '❌ Dinero insuficiente',
        cantAttackSelf: 'No puedes atacarte a ti mismo',
        cantAttackAlly: 'No puedes atacar a un miembro de tu alianza',
        confirmAttack: '¿Declarar guerra y atacar a {name}? Costo: ${cost}',
        noArmy: 'Necesitas al menos 5 soldados para atacar'
    },
    en: {
        overview: '📊 Overview',
        cities: '🏙️ Cities',
        war: '⚔️ War',
        money: '💰 Money',
        energy: '⚡ Energy',
        food: '🌾 Food',
        minerals: '⛏️ Minerals',
        oil: '🛢️ Oil',
        population: '👥 Population',
        attack: '⚔️ Attack',
        logout: 'Logout',
        selectCity: 'Select a city first',
        insufficientMoney: '❌ Insufficient money',
        cantAttackSelf: 'You cannot attack yourself',
        cantAttackAlly: 'You cannot attack an alliance member',
        confirmAttack: 'Declare war and attack {name}? Cost: ${cost}',
        noArmy: 'You need at least 5 soldiers to attack'
    }
};

function t(key, vars = {}) {
    let text = translations[currentLanguage][key] || key;
    Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(`{${k}}`, v);
    });
    return text;
}

// ======================
// AUTENTICACIÓN
// ======================

async function handleLogin(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const result = await loginUser(email, password);
    if (result.success) {
        currentUser = result.uid;
        await loadNationData();
        showGameScreen();
    } else {
        showAuthMessage(result.error, 'error');
    }
}

async function handleRegister(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const nationName = document.getElementById('registerNationName').value.trim();
    const government = document.getElementById('governmentSelect').value;
    const territory = document.getElementById('territorySelect').value;

    if (!nationName || !government || !territory) {
        showAuthMessage('Completa todos los campos de tu nación.', 'error');
        return;
    }

    const result = await registerUser(email, password, nationName, government, territory);

    if (result.success) {
        currentUser = result.uid;
        await loadNationData();
        showGameScreen();
        showAuthMessage('¡Nación creada! Bienvenido al campo de batalla.', 'success');
    } else {
        showAuthMessage(result.error, 'error');
    }
}

function showAuthMessage(message, type) {
    const messageEl = document.getElementById('authMessage');
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.style.display = 'block';
        messageEl.className = 'auth-message ' + type;
    } else {
        alert(message);
    }
}

async function handleLogout() {
    if (productionInterval) clearInterval(productionInterval);
    await logoutUser();
    location.reload();
}

function showAuthScreen() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('gameScreen').style.display = 'none';
}

function showGameScreen() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'flex';
}

// ======================
// DATOS Y PRODUCCIÓN
// ======================

async function loadNationData() {
    if (!currentUser) return;
    try {
        const nacionRef = doc(db, "naciones", currentUser);

        onSnapshot(nacionRef, (nacionSnap) => {
            if (!nacionSnap.exists()) return;
            const data = nacionSnap.data();
            const isFirstLoad = !currentNation;

            currentNation = data;
            currentNation.id = currentUser;
            currentNacion = currentNation;

            updateUI();
            updateLawsUI();

            if (isFirstLoad) {
                calculatePassiveProduction();
                startProductionLoop();
                loadAllNations();
                loadBattlesLog();
                startChatListener();
                if (typeof L !== 'undefined' && !map) {
                    setTimeout(initMap, 500);
                }
            }
        });
    } catch (error) {
        console.error("❌ Error cargando datos:", error);
    }
}

function loadAllNations() {
    if (rankingUnsubscribe) return;

    try {
        const q = query(collection(db, "naciones"), orderBy("poder_total", "desc"), limit(20));
        rankingUnsubscribe = onSnapshot(q, (snap) => {
            allNations = [];
            snap.forEach((docSnap) => {
                const n = docSnap.data();
                n.id = docSnap.id;
                allNations.push(n);
            });
            updateRankingDisplay();
            updateMapMarkers();
        }, (error) => console.error("❌ Error en ranking:", error));
    } catch (error) {
        console.error("❌ Error iniciando ranking:", error);
    }
}

function loadBattlesLog() {
    if (battlesUnsubscribe) battlesUnsubscribe();

    try {
        const q = query(collection(db, "batallas"), orderBy("fecha", "desc"), limit(30));
        battlesUnsubscribe = onSnapshot(q, (snap) => {
            renderBattlesLog(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (error) => console.error("❌ Error en log de batallas:", error));
    } catch (error) {
        console.error("❌ Error iniciando batallas:", error);
    }
}

function calculateMilitaryPower(nation) {
    if (!nation) return 0;
    const e = nation.ejercito || { soldados: 0, tanques: 0, aviones: 0 };
    return (e.soldados * 10) + (e.tanques * 100) + (e.aviones * 500);
}

function calculateNationalStats(nation) {
    if (!nation?.ciudades) {
        return {
            salud: nation?.salud || 50,
            seguridad: nation?.seguridad || 50,
            felicidad: nation?.felicidad || 50
        };
    }

    let hospitals = 0, police = 0, firefighters = 0, schools = 0;
    nation.ciudades.forEach(city => {
        const b = city.edificios || {};
        hospitals += b.hospitals || 0;
        police += b.police || 0;
        firefighters += b.firefighters || 0;
        schools += b.schools || 0;
    });

    const baseHappiness = nation.felicidad ?? 50;
    return {
        salud: Math.min(100, 35 + hospitals * 6),
        seguridad: Math.min(100, 35 + police * 5 + firefighters * 4),
        felicidad: Math.min(100, Math.max(0, baseHappiness + schools * 2 - (nation.leyes?.forcedRecruitment ? 10 : 0)))
    };
}

function getProductionRates() {
    if (!currentNation?.ciudades) {
        return { money: 0, pop: 0, energy: 0, food: 0, minerals: 0, oil: 0 };
    }

    let totalFactories = 0, totalPower = 0, totalFarms = 0, totalMines = 0, totalRefineries = 0;
    currentNation.ciudades.forEach(city => {
        const b = city.edificios || {};
        totalFactories += b.factories || 0;
        totalPower += b.powerPlants || 0;
        totalFarms += b.farms || 0;
        totalMines += b.mines || 0;
        totalRefineries += b.refineries || 0;
    });

    const factoryMult = currentNation.leyes?.industrialization ? 1.20 : 1.0;
    const moneyMult = currentNation.leyes?.warTax ? 1.30 : 1.0;
    const popGrowth = currentNation.leyes?.warTax ? 0 : 1;

    return {
        money: (totalFactories * 5 * factoryMult * moneyMult) / 60,
        pop: (totalFarms * 2 * popGrowth) / 60,
        energy: (totalPower * 2) / 60,
        food: (totalFarms * 3) / 60,
        minerals: (totalMines * 2) / 60,
        oil: (totalRefineries * 1.5) / 60
    };
}

function startProductionLoop() {
    if (productionInterval) clearInterval(productionInterval);
    firestoreSyncCounter = 0;
    statsSyncCounter = 0;

    productionInterval = setInterval(() => {
        if (!currentNation || !currentUser) return;

        const rates = getProductionRates();

        currentNation.dinero += rates.money * TICK_SECONDS;
        currentNation.poblacion += rates.pop * TICK_SECONDS;
        if (!currentNation.recursos_especiales) {
            currentNation.recursos_especiales = { energy: 0, food: 0, minerals: 0, oil: 0 };
        }
        currentNation.recursos_especiales.energy += rates.energy * TICK_SECONDS;
        currentNation.recursos_especiales.food += rates.food * TICK_SECONDS;
        currentNation.recursos_especiales.minerals += rates.minerals * TICK_SECONDS;
        currentNation.recursos_especiales.oil += rates.oil * TICK_SECONDS;

        const stats = calculateNationalStats(currentNation);
        currentNation.salud = stats.salud;
        currentNation.seguridad = stats.seguridad;
        currentNation.felicidad = stats.felicidad;

        updateUI();

        firestoreSyncCounter++;
        if (firestoreSyncCounter >= FIRESTORE_SYNC_EVERY) {
            firestoreSyncCounter = 0;
            syncNationResources();
        }

        statsSyncCounter++;
        if (statsSyncCounter >= STATS_SYNC_EVERY) {
            statsSyncCounter = 0;
            updateDoc(doc(db, "naciones", currentUser), {
                salud: currentNation.salud,
                seguridad: currentNation.seguridad,
                felicidad: currentNation.felicidad
            }).catch(e => console.error("❌ Error sync stats:", e));
        }
    }, TICK_MS);
}

function syncNationResources() {
    updateDoc(doc(db, "naciones", currentUser), {
        dinero: currentNation.dinero,
        poblacion: currentNation.poblacion,
        recursos_especiales: currentNation.recursos_especiales,
        ultima_conexion: serverTimestamp()
    }).catch(e => console.error("❌ Error sync producción:", e));
}

function calculatePassiveProduction() {
    if (!currentNation?.ultima_conexion) return;
    const lastTs = currentNation.ultima_conexion.toDate
        ? currentNation.ultima_conexion.toDate()
        : new Date(currentNation.ultima_conexion);
    const minutes = Math.max(0, (Date.now() - lastTs.getTime()) / (1000 * 60));
    if (minutes < 0.1) return;

    const rates = getProductionRates();
    const secs = Math.min(minutes * 60, 3600);

    currentNation.dinero += rates.money * secs;
    currentNation.poblacion += rates.pop * secs;
    if (!currentNation.recursos_especiales) {
        currentNation.recursos_especiales = { energy: 0, food: 0, minerals: 0, oil: 0 };
    }
    currentNation.recursos_especiales.energy += rates.energy * secs;
    currentNation.recursos_especiales.food += rates.food * secs;
    currentNation.recursos_especiales.minerals += rates.minerals * secs;
    currentNation.recursos_especiales.oil += rates.oil * secs;

    const stats = calculateNationalStats(currentNation);
    currentNation.salud = stats.salud;
    currentNation.seguridad = stats.seguridad;
    currentNation.felicidad = stats.felicidad;

    syncNationResources();
}

// ======================
// SISTEMA DE GUERRA PvP
// ======================

function getAttackCost() {
    const army = currentNation?.ejercito || {};
    return ATTACK_BASE_COST + (army.soldados || 0) * 5 + (army.tanques || 0) * 20;
}

async function attackNation(targetId) {
    if (!currentUser || !currentNation) return;
    if (targetId === currentUser) {
        alert(t('cantAttackSelf'));
        return;
    }

    const target = allNations.find(n => n.id === targetId);
    if (!target) return;

    if (currentNation.alianzaId && target.alianzaId && currentNation.alianzaId === target.alianzaId) {
        alert(t('cantAttackAlly'));
        return;
    }

    const soldiers = currentNation.ejercito?.soldados || 0;
    if (soldiers < 5) {
        alert(t('noArmy'));
        return;
    }

    const cost = getAttackCost();
    if (currentNation.dinero < cost) {
        alert(t('insufficientMoney'));
        return;
    }

    const msg = t('confirmAttack', { name: target.nombre, cost: cost.toLocaleString() });
    if (!confirm(msg)) return;

    try {
        const result = await runTransaction(db, async (transaction) => {
            const attackerRef = doc(db, "naciones", currentUser);
            const defenderRef = doc(db, "naciones", targetId);
            const attackerSnap = await transaction.get(attackerRef);
            const defenderSnap = await transaction.get(defenderRef);

            if (!attackerSnap.exists() || !defenderSnap.exists()) {
                throw new Error("Nación no encontrada");
            }

            const attacker = attackerSnap.data();
            const defender = defenderSnap.data();

            if (attacker.alianzaId && defender.alianzaId && attacker.alianzaId === defender.alianzaId) {
                throw new Error("ALLY");
            }

            const attackCost = ATTACK_BASE_COST + (attacker.ejercito?.soldados || 0) * 5 + (attacker.ejercito?.tanques || 0) * 20;
            if ((attacker.dinero || 0) < attackCost) throw new Error("NO_MONEY");

            const attackPower = calculateMilitaryPower(attacker) * (0.85 + Math.random() * 0.3);
            const defenseBonus = 1.15 + ((defender.seguridad || 50) / 200);
            const defensePower = calculateMilitaryPower(defender) * defenseBonus * (0.85 + Math.random() * 0.3);

            const attackerArmy = { ...attacker.ejercito };
            const defenderArmy = { ...defender.ejercito };
            let attackerMoney = (attacker.dinero || 0) - attackCost;
            let defenderMoney = defender.dinero || 0;
            let battleMessage = '';
            let victor = null;

            if (attackPower > defensePower) {
                victor = 'attacker';
                const loot = Math.floor(defenderMoney * 0.12);
                attackerMoney += loot;
                defenderMoney -= loot;

                const defSoldierLoss = Math.max(1, Math.ceil((defenderArmy.soldados || 0) * 0.18));
                const defTankLoss = Math.ceil((defenderArmy.tanques || 0) * 0.12);
                const attSoldierLoss = Math.max(1, Math.ceil((attackerArmy.soldados || 0) * 0.08));

                defenderArmy.soldados = Math.max(0, (defenderArmy.soldados || 0) - defSoldierLoss);
                defenderArmy.tanques = Math.max(0, (defenderArmy.tanques || 0) - defTankLoss);
                defenderArmy.aviones = Math.max(0, (defenderArmy.aviones || 0) - Math.ceil((defenderArmy.aviones || 0) * 0.05));
                attackerArmy.soldados = Math.max(0, (attackerArmy.soldados || 0) - attSoldierLoss);

                battleMessage = `${attacker.nombre} venció a ${defender.nombre}. Botín: $${loot.toLocaleString()}.`;
            } else {
                victor = 'defender';
                const attSoldierLoss = Math.max(2, Math.ceil((attackerArmy.soldados || 0) * 0.22));
                const attTankLoss = Math.ceil((attackerArmy.tanques || 0) * 0.10);
                attackerArmy.soldados = Math.max(0, (attackerArmy.soldados || 0) - attSoldierLoss);
                attackerArmy.tanques = Math.max(0, (attackerArmy.tanques || 0) - attTankLoss);

                battleMessage = `${defender.nombre} repelió el ataque de ${attacker.nombre}.`;
            }

            const attackerPower = calculateMilitaryPower({ ejercito: attackerArmy });
            const defenderPower = calculateMilitaryPower({ ejercito: defenderArmy });

            transaction.update(attackerRef, {
                dinero: attackerMoney,
                ejercito: attackerArmy,
                poder_total: attackerPower,
                ultima_conexion: serverTimestamp()
            });

            transaction.update(defenderRef, {
                dinero: defenderMoney,
                ejercito: defenderArmy,
                poder_total: defenderPower,
                ultima_conexion: serverTimestamp()
            });

            return {
                atacante: attacker.nombre,
                atacanteId: currentUser,
                defensor: defender.nombre,
                defensorId: targetId,
                resultado: victor === 'attacker' ? 'victoria' : 'derrota',
                mensaje: battleMessage,
                poderAtaque: Math.floor(attackPower),
                poderDefensa: Math.floor(defensePower)
            };
        });

        await addDoc(collection(db, "batallas"), {
            ...result,
            fecha: serverTimestamp()
        });

        if (result.atacanteId === currentUser) {
            alert(result.resultado === 'victoria'
                ? `⚔️ ¡Victoria! ${result.mensaje}`
                : `💥 Derrota. ${result.mensaje}`);
        } else if (result.defensorId === currentUser) {
            alert(result.resultado === 'victoria'
                ? `🚨 ¡Te han atacado! ${result.mensaje}`
                : `🛡️ ¡Defensa exitosa! ${result.mensaje}`);
        }

    } catch (error) {
        if (error.message === 'ALLY') alert(t('cantAttackAlly'));
        else if (error.message === 'NO_MONEY') alert(t('insufficientMoney'));
        else console.error("❌ Error en batalla:", error);
    }
}

function renderBattlesLog(battles) {
    const log = document.getElementById('attacksLog');
    if (!log) return;

    const relevant = battles.filter(b =>
        b.atacanteId === currentUser || b.defensorId === currentUser
    ).slice(0, 10);

    if (relevant.length === 0) {
        log.innerHTML = '<p class="battle-empty">Sin batallas recientes. Ataca desde el ranking.</p>';
        return;
    }

    log.innerHTML = `
        <h3>📜 Registro de Batallas</h3>
        <div class="attacks-list">
            ${relevant.map(b => {
                const isMine = b.atacanteId === currentUser;
                const won = (isMine && b.resultado === 'victoria') || (!isMine && b.resultado === 'derrota');
                const cssClass = won ? 'victoria' : 'derrota';
                const icon = won ? '🏆' : '💀';
                return `
                    <div class="attack-item ${cssClass}">
                        <p><strong>${icon} ${b.mensaje}</strong></p>
                        <p>Fuerza: ${b.poderAtaque || '?'} vs ${b.poderDefensa || '?'}</p>
                    </div>`;
            }).join('')}
        </div>`;
}

// ======================
// LEYES
// ======================

async function activateLaw(lawId, cost) {
    if (currentNation.dinero < cost) { alert(t('insufficientMoney')); return; }
    if (currentNation.leyes?.[lawId]) { alert("Esta ley ya está activa"); return; }

    const newLeyes = { ...(currentNation.leyes || {}), [lawId]: true };
    let newHappiness = currentNation.felicidad || 50;
    if (lawId === 'forcedRecruitment') newHappiness = Math.max(0, newHappiness - 10);

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - cost,
            leyes: newLeyes,
            felicidad: newHappiness,
            ultima_conexion: serverTimestamp()
        });
    } catch (e) { console.error(e); }
}

function updateLawsUI() {
    const laws = ['industrialization', 'forcedRecruitment', 'warTax'];
    const ids = { industrialization: 'btnLawIndustrial', forcedRecruitment: 'btnLawRecruit', warTax: 'btnLawWarTax' };
    laws.forEach(law => {
        const btn = document.getElementById(ids[law]);
        if (btn) {
            if (currentNation.leyes?.[law]) {
                btn.innerText = "✓ ACTIVA";
                btn.disabled = true;
                btn.style.background = "#27ae60";
            } else {
                btn.innerText = "Activar";
                btn.disabled = false;
                btn.style.background = "";
            }
        }
    });
}

// ======================
// ALIANZAS
// ======================

async function createAlliance() {
    const name = document.getElementById('newAllianceName').value.trim();
    if (!name || currentNation.dinero < 5000) {
        alert("Nombre inválido o dinero insuficiente ($5,000)");
        return;
    }
    if (currentNation.alianzaId) {
        alert("Ya perteneces a una alianza.");
        return;
    }

    try {
        const allianceRef = await addDoc(collection(db, "alianzas"), {
            nombre: name,
            fundador: currentUser,
            miembros: [currentUser],
            fecha: serverTimestamp()
        });
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - 5000,
            alianza: name,
            alianzaId: allianceRef.id,
            ultima_conexion: serverTimestamp()
        });
        alert("¡Alianza " + name + " fundada!");
        document.getElementById('newAllianceName').value = '';
    } catch (e) { console.error(e); }
}

async function joinAlliance() {
    const name = document.getElementById('joinAllianceName').value.trim();
    if (!name) return;
    if (currentNation.alianzaId) {
        alert("Ya perteneces a una alianza.");
        return;
    }

    const q = query(collection(db, "alianzas"), where("nombre", "==", name), limit(1));
    const snap = await getDocs(q);

    if (snap.empty) { alert("Alianza no encontrada"); return; }

    const allianceDoc = snap.docs[0];
    const miembros = allianceDoc.data().miembros || [];
    if (miembros.includes(currentUser)) {
        alert("Ya eres miembro de esta alianza.");
        return;
    }

    await updateDoc(doc(db, "alianzas", allianceDoc.id), {
        miembros: [...miembros, currentUser]
    });
    await updateDoc(doc(db, "naciones", currentUser), {
        alianza: name,
        alianzaId: allianceDoc.id,
        ultima_conexion: serverTimestamp()
    });
    alert("Te has unido a " + name);
    document.getElementById('joinAllianceName').value = '';
}

// ======================
// CHAT
// ======================

function switchChatChannel(channel) {
    currentChatChannel = channel;
    document.getElementById('chatGlobalTab')?.classList.toggle('active', channel === 'global');
    document.getElementById('chatAllianceTab')?.classList.toggle('active', channel === 'alliance');
    startChatListener();
}

function startChatListener() {
    if (chatUnsubscribe) chatUnsubscribe();
    if (!currentNation) return;

    let chatRef;
    if (currentChatChannel === 'global') {
        chatRef = query(collection(db, "chat_global"), orderBy("fecha", "asc"), limit(50));
    } else {
        if (!currentNation.alianzaId) {
            const box = document.getElementById('chatMessages');
            if (box) box.innerHTML = "<div class='chat-notice'>Debes unirte a una alianza para ver este chat.</div>";
            return;
        }
        chatRef = query(
            collection(db, "chat_alianzas"),
            where("alianzaId", "==", currentNation.alianzaId),
            orderBy("fecha", "asc"),
            limit(50)
        );
    }

    chatUnsubscribe = onSnapshot(chatRef, (snap) => {
        const chatBox = document.getElementById('chatMessages');
        if (!chatBox) return;
        chatBox.innerHTML = "";
        snap.forEach(d => {
            const m = d.data();
            const div = document.createElement('div');
            div.className = 'chat-msg';
            div.innerHTML = `<strong>${m.usuario}:</strong> ${m.mensaje}`;
            chatBox.appendChild(div);
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const msg = input?.value?.trim();
    if (!msg || !currentNation) return;

    const collectionName = currentChatChannel === 'global' ? "chat_global" : "chat_alianzas";
    const data = {
        usuario: currentNation.nombre,
        mensaje: msg,
        fecha: serverTimestamp()
    };
    if (currentChatChannel === 'alliance') data.alianzaId = currentNation.alianzaId;

    try {
        await addDoc(collection(db, collectionName), data);
        input.value = "";
    } catch (e) { console.error(e); }
}

// ======================
// ACCIONES DEL JUEGO
// ======================

async function recruitUnit(unitType) {
    if (!currentUser || !currentNation) return;

    const baseCosts = { soldados: 50, tanques: 500, aviones: 2000 };
    if (!(unitType in baseCosts)) return;

    let cost = baseCosts[unitType];
    if (currentNation.leyes?.forcedRecruitment) cost = Math.floor(cost * 0.85);

    if (currentNation.dinero < cost) { alert(t('insufficientMoney')); return; }

    const newEjercito = {
        soldados: currentNation.ejercito?.soldados || 0,
        tanques: currentNation.ejercito?.tanques || 0,
        aviones: currentNation.ejercito?.aviones || 0
    };
    newEjercito[unitType] += 1;

    const newPower = calculateMilitaryPower({ ejercito: newEjercito });
    const newDinero = currentNation.dinero - cost;

    currentNation.dinero = newDinero;
    currentNation.ejercito = newEjercito;
    currentNation.poder_total = newPower;
    updateUI();

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: newDinero,
            ejercito: newEjercito,
            poder_total: newPower,
            ultima_conexion: serverTimestamp()
        });
    } catch (e) {
        console.error("❌ Error reclutando:", e);
    }
}

async function upgradeBuilding(type) {
    if (!currentUser || !currentNation) return;
    if (activeCityId === null) { alert(t('selectCity')); return; }

    const costs = { factories: 500, powerPlants: 600, farms: 400, mines: 700, refineries: 800 };
    if (currentNation.dinero < costs[type]) { alert(t('insufficientMoney')); return; }

    const newCities = JSON.parse(JSON.stringify(currentNation.ciudades));
    const city = newCities[activeCityId];
    if (!city.edificios) city.edificios = {};

    city.edificios[type] = (city.edificios[type] || 0) + 1;
    const newDinero = currentNation.dinero - costs[type];

    currentNation.dinero = newDinero;
    currentNation.ciudades = newCities;
    updateUI();

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: newDinero,
            ciudades: newCities,
            ultima_conexion: serverTimestamp()
        });
    } catch (e) { console.error(e); }
}

async function demolishBuilding(type) {
    if (activeCityId === null) return;
    if (!confirm(currentLanguage === 'es' ? "¿Demoler este edificio?" : "Demolish this building?")) return;

    const newCities = JSON.parse(JSON.stringify(currentNation.ciudades));
    const city = newCities[activeCityId];
    if (city.edificios) city.edificios[type] = 0;

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            ciudades: newCities,
            ultima_conexion: serverTimestamp()
        });
    } catch (e) { console.error(e); }
}

async function upgradeService(type) {
    if (!currentUser || !currentNation) return;
    if (activeCityId === null) { alert(t('selectCity')); return; }

    const costs = { hospitals: 800, police: 600, firefighters: 700, schools: 500 };
    if (currentNation.dinero < costs[type]) { alert(t('insufficientMoney')); return; }

    const newCities = JSON.parse(JSON.stringify(currentNation.ciudades));
    const city = newCities[activeCityId];
    if (!city.edificios) city.edificios = {};
    city.edificios[type] = (city.edificios[type] || 0) + 1;

    const stats = calculateNationalStats({ ...currentNation, ciudades: newCities });
    const newDinero = currentNation.dinero - costs[type];

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: newDinero,
            ciudades: newCities,
            salud: stats.salud,
            seguridad: stats.seguridad,
            felicidad: stats.felicidad,
            ultima_conexion: serverTimestamp()
        });
    } catch (e) { console.error(e); }
}

async function buildCity() {
    if (currentNation.dinero < 1000) { alert(t('insufficientMoney')); return; }
    const cityName = prompt(currentLanguage === 'es' ? "Nombre de la ciudad:" : "City name:");
    if (!cityName?.trim()) return;

    const newCity = {
        name: cityName.trim(),
        population: 100,
        edificios: { factories: 0, powerPlants: 0, farms: 0, mines: 0, refineries: 0, hospitals: 0, police: 0, firefighters: 0, schools: 0 }
    };
    const newCities = [...currentNation.ciudades, newCity];

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - 1000,
            ciudades: newCities,
            ultima_conexion: serverTimestamp()
        });
    } catch (e) { console.error(e); }
}

function seleccionarCiudad(id) {
    activeCityId = id;
    const city = currentNation.ciudades[id];
    const titleEl = document.getElementById('activeCityTitle');
    if (titleEl && city) titleEl.innerText = city.name;
    updateUI();
    switchTab('cityDetail');
}

// ======================
// INTERFAZ
// ======================

function changeLanguage(lang) {
    currentLanguage = lang;
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    updateUI();
}

function updateUI() {
    if (!currentNation) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    const dinero = Math.floor(currentNation.dinero || 0);
    const poblacion = Math.floor(currentNation.poblacion || 0);
    const energy = Math.floor(currentNation.recursos_especiales?.energy || 0);
    const minerals = Math.floor(currentNation.recursos_especiales?.minerals || 0);
    const oil = Math.floor(currentNation.recursos_especiales?.oil || 0);
    const food = Math.floor(currentNation.recursos_especiales?.food || 0);

    set('topMoney', dinero.toLocaleString());
    set('topPopulation', poblacion.toLocaleString());
    set('topMinerals', minerals.toLocaleString());
    set('topEnergy', energy.toLocaleString());
    set('topOil', oil.toLocaleString());
    set('topFood', food.toLocaleString());

    set('sidebarMoney', '$' + dinero.toLocaleString());
    set('sidebarPopulation', poblacion.toLocaleString());

    const sidebarNationEl = document.getElementById('sidebarNationName');
    if (sidebarNationEl) sidebarNationEl.innerText = currentNation.nombre;

    const stats = calculateNationalStats(currentNation);
    set('overviewNation', currentNation.nombre);
    set('overviewAlliance', currentNation.alianza || "Ninguna");
    set('overviewTerritory', currentNation.territorio || '-');
    set('overviewGovernment', currentNation.gobierno || '-');
    set('overviewPopulation', poblacion.toLocaleString());
    set('overviewMoney', dinero.toLocaleString());
    set('overviewHappiness', stats.felicidad + "%");
    set('overviewHealth', stats.salud + "%");
    set('overviewSecurity', stats.seguridad + "%");

    updateAbundantResources();

    const realPower = calculateMilitaryPower(currentNation);
    set('militaryPowerDisplay', realPower.toLocaleString());

    const e = currentNation.ejercito || { soldados: 0, tanques: 0, aviones: 0 };
    set('soldadosLevel', (e.soldados || 0).toLocaleString());
    set('tanquesLevel', (e.tanques || 0).toLocaleString());
    set('avionesLevel', (e.aviones || 0).toLocaleString());
    set('attackCostDisplay', '$' + getAttackCost().toLocaleString());

    const citiesList = document.getElementById('citiesList');
    if (citiesList) {
        citiesList.innerHTML = currentNation.ciudades.map((c, i) => `
            <button class="city-item" onclick="seleccionarCiudad(${i})">
                <span class="city-icon">🏙️</span>
                <span class="city-info">
                    <strong>${c.name}</strong>
                    <small>Población: ${c.population || 0}</small>
                </span>
                <span class="city-arrow">→</span>
            </button>
        `).join('') || '<p class="empty-state">No hay ciudades</p>';
    }

    if (activeCityId !== null && currentNation.ciudades[activeCityId]) {
        const city = currentNation.ciudades[activeCityId];
        set('activeCityTitle', city.name);
        const b = city.edificios || {};
        const factoryMult = currentNation.leyes?.industrialization ? 1.2 : 1;

        set('factoriesLevel', b.factories || 0);
        set('factoriesProduction', "+" + Math.floor((b.factories || 0) * 5 * factoryMult));
        set('powerLevel', b.powerPlants || 0);
        set('powerProduction', "+" + Math.floor((b.powerPlants || 0) * 2));
        set('farmsLevel', b.farms || 0);
        set('farmsProduction', "+" + Math.floor((b.farms || 0) * 3));
        set('minesLevel', b.mines || 0);
        set('minesProduction', "+" + Math.floor((b.mines || 0) * 2));
        set('refineriesLevel', b.refineries || 0);
        set('refineriesProduction', "+" + Math.floor((b.refineries || 0) * 1.5));

        set('hospitalsLevel', b.hospitals || 0);
        set('policeLevel', b.police || 0);
        set('firefightersLevel', b.firefighters || 0);
        set('schoolsLevel', b.schools || 0);
    }
}

function updateAbundantResources() {
    const el = document.getElementById('abundantResources');
    if (!el) return;

    const rates = getProductionRates();
    const resources = [
        { name: 'Dinero', rate: rates.money * 60, icon: '💰' },
        { name: 'Energía', rate: rates.energy * 60, icon: '⚡' },
        { name: 'Alimentos', rate: rates.food * 60, icon: '🌾' },
        { name: 'Minerales', rate: rates.minerals * 60, icon: '⛏️' },
        { name: 'Petróleo', rate: rates.oil * 60, icon: '🛢️' }
    ].filter(r => r.rate > 0).sort((a, b) => b.rate - a.rate);

    if (resources.length === 0) {
        el.innerHTML = '<p class="resource-note">Construye edificios para generar recursos.</p>';
        return;
    }

    el.innerHTML = `
        <p class="resource-note"><strong>Producción por minuto:</strong></p>
        <div class="resource-tags">
            ${resources.map(r => `<span class="resource-tag">${r.icon} ${r.name}: +${Math.floor(r.rate)}/min</span>`).join('')}
        </div>`;
}

function updateRankingDisplay() {
    const list = document.getElementById('rankingList');
    if (!list) return;

    list.innerHTML = allNations.map((n, i) => {
        const isMe = n.id === currentUser;
        const isAlly = currentNation?.alianzaId && n.alianzaId === currentNation.alianzaId && !isMe;
        const rankClass = i === 0 ? 'rank-gold' : i === 1 ? 'rank-silver' : i === 2 ? 'rank-bronze' : '';

        return `
            <div class="ranking-item ${isMe ? 'ranking-me' : ''} ${rankClass}">
                <div class="ranking-info">
                    <span class="rank">#${i + 1}</span>
                    <div class="ranking-details">
                        <span class="nation-name">${n.nombre}${isMe ? ' (Tú)' : ''}</span>
                        <span class="nation-territory">${n.territorio || '?'} · ${n.alianza || 'Sin alianza'}</span>
                    </div>
                </div>
                <div class="ranking-stats">
                    <span class="military-power-stat">⚔️ ${(n.poder_total || 0).toLocaleString()}</span>
                    <span class="nation-money">💰 ${Math.floor(n.dinero || 0).toLocaleString()}</span>
                </div>
                ${!isMe && !isAlly ? `<button class="btn-attack" onclick="attackNation('${n.id}')">${t('attack')}</button>` : ''}
                ${isAlly ? '<span class="ally-badge">🛡️ Aliado</span>' : ''}
            </div>`;
    }).join('');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active', tab.id === tabName));
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(tabName));
    });
    if (tabName === 'overview' && map) {
        setTimeout(() => map.invalidateSize(), 200);
    }
}

function switchCitySubTab(subTab) {
    document.getElementById('cityInfra')?.classList.toggle('active', subTab === 'infra');
    document.getElementById('cityServ')?.classList.toggle('active', subTab === 'serv');
    document.querySelectorAll('.city-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(subTab));
    });
}

// ======================
// MAPA
// ======================

function initMap() {
    if (!currentNation || typeof L === 'undefined') return;
    const mapContainer = document.getElementById('worldMap');
    if (!mapContainer) return;

    if (map) { map.remove(); map = null; }
    nationMarkers.forEach(m => m.remove?.());
    nationMarkers = [];

    const center = TERRITORY_COORDS[currentNation.territorio] || [20, 0];

    try {
        map = L.map('worldMap', {
            scrollWheelZoom: true,
            touchZoom: true,
            doubleClickZoom: true
        }).setView(center, 3);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            maxZoom: 18
        }).addTo(map);

        updateMapMarkers();
        setTimeout(() => map.invalidateSize(), 300);
    } catch (e) {
        console.error("❌ Error Leaflet:", e);
    }
}

function updateMapMarkers() {
    if (!map || typeof L === 'undefined') return;

    nationMarkers.forEach(m => map.removeLayer(m));
    nationMarkers = [];

    allNations.forEach(n => {
        const coords = TERRITORY_COORDS[n.territorio];
        if (!coords) return;

        const isMe = n.id === currentUser;
        const isAlly = currentNation?.alianzaId && n.alianzaId === currentNation.alianzaId;

        const icon = L.divIcon({
            className: 'nation-marker ' + (isMe ? 'marker-me' : isAlly ? 'marker-ally' : 'marker-enemy'),
            html: `<div class="marker-pin">${isMe ? '★' : '⚔'}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        const marker = L.marker(coords, { icon }).addTo(map);
        marker.bindPopup(`
            <b>${n.nombre}</b><br>
            ${n.territorio}<br>
            ⚔️ ${(n.poder_total || 0).toLocaleString()}<br>
            ${n.alianza ? '🛡️ ' + n.alianza : ''}
        `);
        nationMarkers.push(marker);
    });
}

// ======================
// INICIALIZACIÓN
// ======================

setupAuthListener((state) => {
    if (state.authenticated) {
        currentUser = state.uid;
        loadNationData();
        showGameScreen();
    } else {
        showAuthScreen();
    }
});

window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
window.recruitUnit = recruitUnit;
window.upgradeBuilding = upgradeBuilding;
window.demolishBuilding = demolishBuilding;
window.upgradeService = upgradeService;
window.buildCity = buildCity;
window.seleccionarCiudad = seleccionarCiudad;
window.changeLanguage = changeLanguage;
window.switchTab = switchTab;
window.switchCitySubTab = switchCitySubTab;
window.activateLaw = activateLaw;
window.createAlliance = createAlliance;
window.joinAlliance = joinAlliance;
window.switchChatChannel = switchChatChannel;
window.sendChatMessage = sendChatMessage;
window.attackNation = attackNation;

window.switchToRegister = (e) => {
    if (e) e.preventDefault();
    document.getElementById('loginForm').classList.remove('active');
    document.getElementById('registerForm').classList.add('active');
};
window.switchToLogin = (e) => {
    if (e) e.preventDefault();
    document.getElementById('registerForm').classList.remove('active');
    document.getElementById('loginForm').classList.add('active');
};

document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
});
