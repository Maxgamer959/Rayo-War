// ======================
// RAYO WAR - SISTEMA DE NACIONES AVANZADO (PARCHE DEFINITIVO V5 - ÍNTEGRO)
// ======================

let currentNacion = null; 
let map = null; 

import { auth, db } from "./firebase-config.js";
import {
    registerUser,
    loginUser,
    logoutUser,
    setupAuthListener
} from "./auth.js";
import {
    doc,
    getDoc,
    getDocs,
    collection,
    updateDoc,
    setDoc,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    onSnapshot
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
        insufficientMoney: '❌ Dinero insuficiente'
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
        insufficientMoney: '❌ Insufficient money'
    }
};

// ======================
// MANEJO DE AUTENTICACIÓN
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
        alert(result.error);
    }
}

async function handleRegister(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const nationName = document.getElementById('registerNationName').value; 
    const government = document.getElementById('governmentSelect').value;
    const territory = document.getElementById('territorySelect').value;
    
    const result = await registerUser(email, password);
    
    if (result.success) {
        currentUser = result.uid;
        const initialData = {
            nombre: nationName,
            gobierno: government,
            territorio: territory,
            dinero: 5000, 
            poblacion: 1000,
            felicidad: 50,
            salud: 50,
            seguridad: 50,
            recursos_especiales: { energy: 100, food: 100, minerals: 100, oil: 100 },
            ejercito: { soldados: 10, tanques: 0, aviones: 0 },
            poder_total: 100,
            ciudades: [{
                name: "Capital " + nationName,
                population: 500,
                edificios: { factories: 1, powerPlants: 1, farms: 1, mines: 1, refineries: 1, hospitals: 1, police: 1, firefighters: 1, schools: 1 }
            }],
            ultima_conexion: serverTimestamp()
        };

        try {
            await setDoc(doc(db, "naciones", currentUser), initialData);
            await loadNationData();
            showGameScreen();
        } catch (error) { console.error(error); alert("Error al inicializar la nación."); }
    } else {
        const messageEl = document.getElementById('authMessage');
        if (messageEl) {
            messageEl.textContent = result.error;
            messageEl.style.display = 'block';
            messageEl.className = 'auth-message error';
        } else { alert(result.error); }
    }
}

async function handleLogout() {
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
// LÓGICA DE DATOS
// ======================

async function loadNationData() {
    if (!currentUser) return;
    try {
        const nacionRef = doc(db, "naciones", currentUser);
        
        // PARCHE: Listener en tiempo real para datos, leyes y alianzas
        onSnapshot(nacionRef, (nacionSnap) => {
            if (nacionSnap.exists()) {
                const data = nacionSnap.data();
                
                // Evitar rebote: Solo actualizar si los datos son realmente nuevos o si no hay datos locales
                if (!currentNation || JSON.stringify(currentNation) !== JSON.stringify(data)) {
                    currentNation = data;
                    currentNation.id = currentUser;
                    currentNacion = currentNation;
                    
                    if (!currentNation.recursos_especiales) {
                        currentNation.recursos_especiales = { energy: 100, food: 100, minerals: 100, oil: 100 };
                    }
                    
                    // Solo calculamos producción pasiva una vez al cargar, no en cada snapshot
                    // para evitar bucles infinitos de actualización
                    if (!window.initialProductionCalculated) {
                        calculatePassiveProduction();
                        window.initialProductionCalculated = true;
                    }

                    updateUI();
                    updateLawsUI();
                    loadAllNations();
                    
                    if (currentChatChannel === 'alliance') startChatListener();
                    
                    if (typeof L !== 'undefined' && !map) {
                        setTimeout(initMap, 800);
                    }
                }
            }
        });
    } catch (error) { console.error("❌ Error cargando datos:", error); }
}

async function loadAllNations() {
    try {
        const q = query(collection(db, "naciones"), orderBy("poder_total", "desc"), limit(20));
        const querySnapshot = await getDocs(q);
        allNations = [];
        querySnapshot.forEach((doc) => {
            const n = doc.data();
            n.id = doc.id;
            allNations.push(n);
        });
        updateRankingDisplay();
    } catch (error) { console.error("❌ Error cargando ranking:", error); }
}

function calculateMilitaryPower(nation) {
    if (!nation || !nation.ejercito) return 0;
    return (nation.ejercito.soldados * 10) + (nation.ejercito.tanques * 100) + (nation.ejercito.aviones * 500);
}

function calculatePassiveProduction() {
    if (!currentNation.ultima_conexion) return;
    const lastConnection = currentNation.ultima_conexion.toDate ? currentNation.ultima_conexion.toDate() : new Date(currentNation.ultima_conexion);
    const minutes = (new Date() - lastConnection) / (1000 * 60);
    
    let totalFactories = 0, totalPower = 0, totalFarms = 0, totalMines = 0, totalRefineries = 0;
    
    if (currentNation.ciudades && currentNation.ciudades.length > 0) {
        currentNation.ciudades.forEach(city => {
            const b = city.edificios || {};
            totalFactories += (b.factories || 0);
            totalPower += (b.powerPlants || 0);
            totalFarms += (b.farms || 0);
            totalMines += (b.mines || 0);
            totalRefineries += (b.refineries || 0);
        });
    }

    // PARCHE: APLICAR BONOS DE LEYES MATEMÁTICOS
    let factoryMult = currentNation.leyes?.industrialization ? 1.20 : 1.0;
    let moneyMult = currentNation.leyes?.warTax ? 1.30 : 1.0;
    let popGrowth = currentNation.leyes?.warTax ? 0 : 1;

    currentNation.dinero += ((totalFactories * 5 * factoryMult) * moneyMult) * minutes;
    currentNation.poblacion += (totalFarms * 2 * popGrowth) * minutes;
    currentNation.recursos_especiales.energy += (totalPower * 2) * minutes;
    currentNation.recursos_especiales.food += (totalFarms * 3) * minutes;
    currentNation.recursos_especiales.minerals += (totalMines * 2) * minutes;
    currentNation.recursos_especiales.oil += (totalRefineries * 1.5) * minutes;
}

// ======================
// SISTEMA DE LEYES
// ======================

async function activateLaw(lawId, cost) {
    if (currentNation.dinero < cost) { alert(translations[currentLanguage].insufficientMoney); return; }
    if (currentNation.leyes?.[lawId]) { alert("Esta ley ya está activa"); return; }

    const newLeyes = { ...currentNation.leyes, [lawId]: true };
    let newHappiness = currentNation.felicidad;
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
        if (btn && currentNation.leyes?.[law]) {
            btn.innerText = "ACTIVA";
            btn.disabled = true;
            btn.style.background = "#27ae60";
        }
    });
}

// ======================
// SISTEMA DE ALIANZAS
// ======================

async function createAlliance() {
    const name = document.getElementById('newAllianceName').value;
    if (!name || currentNation.dinero < 5000) { alert("Nombre inválido o dinero insuficiente ($5,000)"); return; }

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
            alianzaId: allianceRef.id
        });
        alert("¡Alianza " + name + " fundada!");
    } catch (e) { console.error(e); }
}

async function joinAlliance() {
    const name = document.getElementById('joinAllianceName').value;
    const q = query(collection(db, "alianzas"), where("nombre", "==", name), limit(1));
    const snap = await getDocs(q);
    
    if (snap.empty) { alert("Alianza no encontrada"); return; }
    
    const allianceDoc = snap.docs[0];
    await updateDoc(doc(db, "alianzas", allianceDoc.id), {
        miembros: [...allianceDoc.data().miembros, currentUser]
    });
    await updateDoc(doc(db, "naciones", currentUser), {
        alianza: name,
        alianzaId: allianceDoc.id
    });
    alert("Te has unido a " + name);
}

// ======================
// CHAT EN TIEMPO REAL
// ======================

function switchChatChannel(channel) {
    currentChatChannel = channel;
    const gTab = document.getElementById('chatGlobalTab');
    const aTab = document.getElementById('chatAllianceTab');
    if (gTab) gTab.classList.toggle('active', channel === 'global');
    if (aTab) aTab.classList.toggle('active', channel === 'alliance');
    startChatListener();
}

function startChatListener() {
    if (chatUnsubscribe) chatUnsubscribe();
    
    let chatRef;
    if (currentChatChannel === 'global') {
        chatRef = query(collection(db, "chat_global"), orderBy("fecha", "asc"), limit(50));
    } else {
        if (!currentNation.alianzaId) {
            const box = document.getElementById('chatMessages');
            if (box) box.innerHTML = "<div class='chat-notice'>Debes unirte a una alianza para ver este chat.</div>";
            return;
        }
        chatRef = query(collection(db, "chat_alianzas"), where("alianzaId", "==", currentNation.alianzaId), orderBy("fecha", "asc"), limit(50));
    }

    chatUnsubscribe = onSnapshot(chatRef, (snap) => {
        const chatBox = document.getElementById('chatMessages');
        if (!chatBox) return;
        chatBox.innerHTML = "";
        snap.forEach(doc => {
            const m = doc.data();
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
    const msg = input.value;
    if (!msg) return;

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
// ACCIONES DEL JUEGO (ORIGINALES PRESERVADAS)
// ======================

async function recruitUnit(unitType) {
    let cost = { soldados: 50, tanques: 500, aviones: 2000 }[unitType];
    if (currentNation.leyes?.forcedRecruitment) cost *= 0.85;

    if (currentNation.dinero < cost) { alert(translations[currentLanguage].insufficientMoney); return; }
    
    const newEjercito = { ...currentNation.ejercito };
    newEjercito[unitType] = (newEjercito[unitType] || 0) + 1;
    const newPower = (newEjercito.soldados * 10) + (newEjercito.tanques * 100) + (newEjercito.aviones * 500);

    try {
        // ACTUALIZACIÓN ATÓMICA: Solo enviamos los campos que cambian
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - cost,
            ejercito: newEjercito,
            poder_total: newPower,
            ultima_conexion: serverTimestamp()
        });
    } catch (e) { console.error("❌ Error reclutando:", e); }
}

async function upgradeBuilding(type) {
    if (activeCityId === null || !currentNation) return;
    const costs = { factories: 500, powerPlants: 600, farms: 400, mines: 700, refineries: 800 };
    if (currentNation.dinero < costs[type]) { alert(translations[currentLanguage].insufficientMoney); return; }

    const newCities = JSON.parse(JSON.stringify(currentNation.ciudades)); // Deep copy
    const city = newCities[activeCityId];
    if (!city.edificios) city.edificios = { factories: 0, powerPlants: 0, farms: 0, mines: 0, refineries: 0, hospitals: 0, police: 0, firefighters: 0, schools: 0 };
    city.edificios[type] = (city.edificios[type] || 0) + 1;

    try {
        // ACTUALIZACIÓN ATÓMICA: No incluimos 'poblacion' para evitar sobreescrituras accidentales
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - costs[type],
            ciudades: newCities,
            ultima_conexion: serverTimestamp()
        });
    } catch (e) { console.error("❌ Error mejorando edificio:", e); }
}

async function demolishBuilding(type) {
    if (activeCityId === null) return;
    if (!confirm(currentLanguage === 'es' ? "¿Estás seguro?" : "Are you sure?")) return;

    const newCities = [...currentNation.ciudades];
    const city = newCities[activeCityId];
    if (city.edificios) city.edificios[type] = 0;

    try {
        await updateDoc(doc(db, "naciones", currentUser), { ciudades: newCities, ultima_conexion: serverTimestamp() });
    } catch (e) { console.error(e); }
}

async function upgradeService(type) {
    if (activeCityId === null || !currentNation) return;
    const costs = { hospitals: 800, police: 600, firefighters: 700, schools: 500 };
    if (currentNation.dinero < costs[type]) { alert(translations[currentLanguage].insufficientMoney); return; }

    const newCities = JSON.parse(JSON.stringify(currentNation.ciudades)); // Deep copy
    const city = newCities[activeCityId];
    if (!city.edificios) city.edificios = { factories: 0, powerPlants: 0, farms: 0, mines: 0, refineries: 0, hospitals: 0, police: 0, firefighters: 0, schools: 0 };
    city.edificios[type] = (city.edificios[type] || 0) + 1;

    try {
        await updateDoc(doc(db, "naciones", currentUser), { 
            dinero: currentNation.dinero - costs[type], 
            ciudades: newCities, 
            ultima_conexion: serverTimestamp() 
        });
    } catch (e) { console.error("❌ Error mejorando servicio:", e); }
}

async function buildCity() {
    if (currentNation.dinero < 1000) { alert(translations[currentLanguage].insufficientMoney); return; }
    const cityName = prompt(currentLanguage === 'es' ? "Nombre de la ciudad:" : "City Name:");
    if (!cityName) return;

    const newCity = { 
        name: cityName, population: 100,
        edificios: { factories: 0, powerPlants: 0, farms: 0, mines: 0, refineries: 0, hospitals: 0, police: 0, firefighters: 0, schools: 0 }
    };
    const newCities = [...currentNation.ciudades, newCity];

    try {
        await updateDoc(doc(db, "naciones", currentUser), { dinero: currentNation.dinero - 1000, ciudades: newCities, ultima_conexion: serverTimestamp() });
    } catch (e) { console.error(e); }
}

function seleccionarCiudad(id) { 
    activeCityId = id; 
    const city = currentNation.ciudades[id];
    const titleEl = document.getElementById('activeCityTitle');
    if (titleEl && city) titleEl.innerText = city.name;
    updateUI(); // Forzar actualización de niveles al seleccionar
    switchTab('cityDetail'); 
}

// ======================
// INTERFAZ Y TRADUCCIÓN
// ======================

function changeLanguage(lang) { currentLanguage = lang; updateUI(); }

function updateUI() {
    if (!currentNation) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    // Sincronización de Recursos Superiores (Barra Lateral y Top)
    const dinero = Math.floor(currentNation.dinero || 0);
    const poblacion = Math.floor(currentNation.poblacion || 0);
    const energy = Math.floor(currentNation.recursos_especiales?.energy || 0);
    const minerals = Math.floor(currentNation.recursos_especiales?.minerals || 0);
    const oil = Math.floor(currentNation.recursos_especiales?.oil || 0);

    set('topMoney', dinero.toLocaleString());
    set('topPopulation', poblacion.toLocaleString());
    set('topCopper', minerals.toLocaleString());
    set('topAluminum', energy.toLocaleString());
    set('topOil', oil.toLocaleString());

    set('sidebarMoney', '$' + dinero.toLocaleString());
    set('sidebarPopulation', poblacion.toLocaleString());
    const sidebarNationEl = document.getElementById('sidebarNationName'); 
    if (sidebarNationEl) sidebarNationEl.innerText = currentNation.nombre;

    set('overviewNation', currentNation.nombre);
    set('overviewAlliance', currentNation.alianza || "Ninguna");
    set('overviewTerritory', currentNation.territorio);
    set('overviewGovernment', currentNation.gobierno);
    set('overviewPopulation', poblacion.toLocaleString());
    set('overviewMoney', dinero.toLocaleString());
    set('overviewHappiness', (currentNation.felicidad || 0) + "%");
    
    // Unificar Poder Militar en Panel de Guerra
    const realPower = calculateMilitaryPower(currentNation);
    set('warTotalPower', realPower.toLocaleString());
    set('armySoldiers', (currentNation.ejercito?.soldados || 0).toLocaleString());
    set('armyTanks', (currentNation.ejercito?.tanques || 0).toLocaleString());
    set('armyPlanes', (currentNation.ejercito?.aviones || 0).toLocaleString());

    const citiesList = document.getElementById('citiesList');
    if (citiesList) {
        citiesList.innerHTML = currentNation.ciudades.map((c, i) => `
            <button class="city-item" onclick="seleccionarCiudad(${i})" style="width:100%; text-align:left; padding:10px; margin-bottom:5px; border:1px solid #ddd; border-radius:6px; background:#fff; cursor:pointer;">
                🏙️ <strong>${c.name}</strong> (Pop: ${c.population})
            </button>
        `).join('') || "No hay ciudades";
    }

    if (activeCityId !== null && currentNation.ciudades[activeCityId]) {
        const city = currentNation.ciudades[activeCityId];
        set('activeCityTitle', city.name);
        const b = city.edificios || { factories: 0, powerPlants: 0, farms: 0, mines: 0, refineries: 0, hospitals: 0, police: 0, firefighters: 0, schools: 0 };
        
        // Sincronizar niveles de Infraestructura
        set('factoriesLevel', b.factories || 0);
        set('factoriesProduction', "+" + Math.floor((b.factories || 0) * 5 * (currentNation.leyes?.industrialization ? 1.2 : 1)));
        set('powerLevel', b.powerPlants || 0);
        set('powerProduction', "+" + Math.floor((b.powerPlants || 0) * 2));
        set('farmsLevel', b.farms || 0);
        set('farmsProduction', "+" + Math.floor((b.farms || 0) * 3));
        set('minesLevel', b.mines || 0);
        set('minesProduction', "+" + Math.floor((b.mines || 0) * 2));
        set('refineriesLevel', b.refineries || 0);
        set('refineriesProduction', "+" + Math.floor((b.refineries || 0) * 1.5));

        // Sincronizar niveles de Servicios
        set('hospitalsLevel', b.hospitals || 0);
        set('policeLevel', b.police || 0);
        set('firefightersLevel', b.firefighters || 0);
        set('schoolsLevel', b.schools || 0);
    }
}

function updateRankingDisplay() {
    const list = document.getElementById('rankingList');
    if (!list) return;
    list.innerHTML = allNations.map((n, i) => `
        <div class="ranking-item" style="padding:8px; border-bottom:1px solid #eee;">
            #${i+1} <strong>${n.nombre}</strong> [${n.alianza || 'S/A'}] - Fuerza: ${(n.poder_total || 0).toLocaleString()}
        </div>
    `).join('');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active', tab.id === tabName));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(tabName)));
}

function switchCitySubTab(subTab) {
    const infra = document.getElementById('cityInfra');
    const serv = document.getElementById('cityServ');
    if (infra && serv) {
        infra.classList.toggle('active', subTab === 'infra');
        serv.classList.toggle('active', subTab === 'serv');
    }
    document.querySelectorAll('.city-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(subTab));
    });
}

// ======================
// LÓGICA DEL MAPA (ORIGINAL PRESERVADA)
// ======================

function initMap() {
    if (!currentNation || typeof L === 'undefined') return;
    const mapContainer = document.getElementById('worldMap');
    if (!mapContainer) return;

    if (map) { map.remove(); map = null; }

    const coords = { 
        'Chile': [-35, -71], 'Argentina': [-38, -63], 'México': [23, -102], 'España': [40, -3],
        'Perú': [-9, -75], 'Brasil': [-14, -51], 'Canadá': [56, -106], 'EE.UU': [37, -95],
        'Reino Unido': [55, -3], 'Francia': [46, 2], 'Alemania': [51, 10], 'Italia': [41, 12],
        'Rusia': [61, 105], 'China': [35, 104], 'Japón': [36, 138], 'India': [20, 78],
        'Australia': [-25, 133], 'Sudáfrica': [-30, 22], 'Egipto': [26, 30], 'Arabia Saudita': [23, 45]
    };
    
    const center = coords[currentNation.territorio] || [20, 0];
    
    try {
        map = L.map('worldMap', {
            dragging: false, 
            scrollWheelZoom: true, 
            touchZoom: true,
            doubleClickZoom: true
        }).setView(center, 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        L.marker(center).addTo(map).bindPopup(`<b>${currentNation.nombre}</b><br>${currentNation.territorio}`).openPopup();
        setTimeout(() => map.invalidateSize(), 200);
    } catch (e) { console.error("❌ Error Leaflet:", e); }
}

// ======================
// INICIALIZACIÓN
// ======================

setupAuthListener((state) => {
    if (state.authenticated) {
        currentUser = state.uid;
        loadNationData();
        startChatListener();
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

window.switchToRegister = (e) => { if (e) e.preventDefault(); document.getElementById('loginForm').classList.remove('active'); document.getElementById('registerForm').classList.add('active'); };
window.switchToLogin = (e) => { if (e) e.preventDefault(); document.getElementById('registerForm').classList.remove('active'); document.getElementById('loginForm').classList.add('active'); };
