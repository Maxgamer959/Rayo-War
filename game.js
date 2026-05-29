// ======================
// RAYO WAR - PASSIVE WARFARE SYSTEM
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
    addDoc,
    writeBatch,
    query,
    where,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ======================
// ESTADO GLOBAL
// ======================

let currentUser = null;
let currentNation = null;
let currentLanguage = 'es';
let allNations = [];
let pendingAttacks = [];

const translations = {
    es: {
        overview: 'Resumen',
        infrastructure: 'Infraestructura',
        services: 'Servicios',
        cities: 'Ciudades',
        war: 'Guerra',
        ranking: 'Ranking',
        dinero: 'Dinero',
        poblacion: 'Población',
        felicidad: 'Felicidad',
        salud: 'Salud',
        seguridad: 'Seguridad',
        soldados: 'Soldados',
        tanques: 'Tanques',
        aviones: 'Aviones',
        poder: 'Poder Militar',
        atacar: 'Atacar',
        reclutar: 'Reclutar',
        dineroInsuficiente: 'Dinero insuficiente',
        ciudadCreada: 'Ciudad creada exitosamente',
        ataqueLanzado: 'Ataque lanzado exitosamente',
        ataqueFallido: 'Ataque fallido',
        victoria: 'Victoria',
        derrota: 'Derrota',
        botin: 'Botín',
        ataquesPendientes: 'Ataques Pendientes',
        noUnidades: 'No tienes unidades militares para atacar'
    },
    en: {
        overview: 'Overview',
        infrastructure: 'Infrastructure',
        services: 'Services',
        cities: 'Cities',
        war: 'War',
        ranking: 'Ranking',
        dinero: 'Money',
        poblacion: 'Population',
        felicidad: 'Happiness',
        salud: 'Health',
        seguridad: 'Security',
        soldados: 'Soldiers',
        tanques: 'Tanks',
        aviones: 'Planes',
        poder: 'Military Power',
        atacar: 'Attack',
        reclutar: 'Recruit',
        dineroInsuficiente: 'Insufficient money',
        ciudadCreada: 'City created successfully',
        ataqueLanzado: 'Attack launched successfully',
        ataqueFallido: 'Attack failed',
        victoria: 'Victoria',
        derrota: 'Defeat',
        botin: 'Loot',
        ataquesPendientes: 'Pending Attacks',
        noUnidades: 'You have no military units to attack'
    }
};

function t(key) {
    return translations[currentLanguage][key] || key;
}

// ======================
// MANEJO DE AUTENTICACIÓN
// ======================

function switchAuthTab(tab) {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    if (loginTab) loginTab.classList.remove('active');
    if (registerTab) registerTab.classList.remove('active');
    const targetTab = document.getElementById(tab + 'Tab');
    if (targetTab) targetTab.classList.add('active');
}

async function handleLogin(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) {
        showAuthMessage('Por favor completa todos los campos', 'error');
        return;
    }
    const result = await loginUser(email, password);
    if (result.success) {
        currentUser = result.uid;
        await loadNationData();
        showGameScreen();
    } else {
        showAuthMessage('Error: ' + result.error, 'error');
    }
}

async function handleRegister(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const nationName = document.getElementById('nationName').value;
    const government = document.getElementById('governmentSelect').value;
    const territory = document.getElementById('territorySelect').value;
    if (!email || !password || !nationName || !government || !territory) {
        showAuthMessage('Por favor completa todos los campos', 'error');
        return;
    }
    if (password.length < 6) {
        showAuthMessage('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
    }
    const result = await registerUser(email, password, nationName, government, territory);
    if (result.success) {
        currentUser = result.uid;
        await loadNationData();
        showGameScreen();
    } else {
        showAuthMessage('Error: ' + result.error, 'error');
    }
}

async function handleLogout() {
    const result = await logoutUser();
    if (result.success) {
        currentUser = null;
        currentNation = null;
        currentNacion = null;
        showAuthScreen();
    }
}

function showAuthMessage(message, type) {
    const messageEl = document.getElementById('authMessage');
    if (messageEl) {
        messageEl.textContent = message;
        messageEl.className = 'auth-message ' + type;
        messageEl.style.display = 'block';
    }
}

function showAuthScreen() {
    const authScreen = document.getElementById('authScreen');
    const gameScreen = document.getElementById('gameScreen');
    if (authScreen) authScreen.style.display = 'flex';
    if (gameScreen) gameScreen.style.display = 'none';
}

function showGameScreen() {
    const authScreen = document.getElementById('authScreen');
    const gameScreen = document.getElementById('gameScreen');
    if (authScreen) authScreen.style.display = 'none';
    if (gameScreen) gameScreen.style.display = 'flex';
    updateUI();
}

// ======================
// CARGAR DATOS DE LA NACIÓN
// ======================

async function loadNationData() {
    try {
        if (!currentUser) return;
        const nacionRef = doc(db, "naciones", currentUser);
        const nacionSnap = await getDoc(nacionRef);
        if (nacionSnap.exists()) {
            currentNation = nacionSnap.data();
            currentNacion = currentNation;
            currentNation.id = currentUser;
            if (!currentNation.ejercito) {
                currentNation.ejercito = { soldados: 0, tanques: 0, aviones: 0 };
            }
            calculatePassiveProduction();
            await processPendingAttacks();
            await loadAllNations();
            updateUI();
            // Inicializar el mapa después de un breve retraso
            setTimeout(initMap, 800);
        } else {
            console.error("❌ Nación no encontrada");
        }
    } catch (error) {
        console.error("❌ Error cargando datos:", error);
    }
}

// ======================
// INICIALIZAR MAPA (LEAFLET)
// ======================

function initMap() {
    if (!currentNation) return;
    const mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.error("❌ Contenedor de mapa no encontrado en el DOM");
        return;
    }

    const coords = {
        'Chile': [-35.6751, -71.543],
        'Argentina': [-38.4161, -63.6167],
        'Perú': [-9.19, -75.0152],
        'Brasil': [-14.235, -51.9253],
        'México': [23.6345, -102.5528],
        'Canadá': [56.1304, -106.3468],
        'EE.UU': [37.0902, -95.7129],
        'Reino Unido': [55.3781, -3.436],
        'Francia': [46.2276, 2.2137],
        'Alemania': [51.1657, 10.4515],
        'España': [40.4637, -3.7492],
        'Italia': [41.8719, 12.5674],
        'Rusia': [61.524, 105.3188],
        'China': [35.8617, 104.1954],
        'Japón': [36.2048, 138.2529],
        'India': [20.5937, 78.9629],
        'Australia': [-25.2744, 133.7751],
        'Sudáfrica': [-30.5595, 22.9375],
        'Egipto': [26.8206, 30.8025],
        'Arabia Saudita': [23.8853, 45.0792]
    };

    const center = coords[currentNation.territorio] || [20, 0];

    // Si ya existe una instancia de mapa, eliminarla para recrearla (limpieza total)
    if (map) {
        map.remove();
        map = null;
    }

    try {
        console.log("📍 Inicializando mapa en:", currentNation.territorio);
        map = L.map('map', {
            zoomControl: true,
            scrollWheelZoom: true
        }).setView(center, 4);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);

        L.marker(center).addTo(map)
            .bindPopup(`<b>${currentNation.nombre}</b><br>${currentNation.territorio}`)
            .openPopup();
            
        // Forzar actualización de tamaño
        setTimeout(() => map.invalidateSize(), 200);
        console.log("✅ Mapa Leaflet cargado correctamente");
    } catch (e) {
        console.error("❌ Error crítico en Leaflet:", e);
    }
}

// ======================
// PROCESAMIENTO PASIVO DE ATAQUES
// ======================

async function processPendingAttacks() {
    try {
        if (!currentUser || !currentNation) return;
        const q = query(
            collection(db, "ataques"),
            where("id_defensor", "==", currentUser),
            where("procesado", "==", false)
        );
        const querySnapshot = await getDocs(q);
        pendingAttacks = [];
        for (const docSnap of querySnapshot.docs) {
            const attack = docSnap.data();
            attack.docId = docSnap.id;
            const attackPower = (attack.tropas_enviadas.soldados * 10) + (attack.tropas_enviadas.tanques * 100) + (attack.tropas_enviadas.aviones * 500);
            const defensePower = (currentNation.ejercito.soldados * 10) + (currentNation.ejercito.tanques * 100) + (currentNation.ejercito.aviones * 500);
            const randomFactor = Math.random() * 0.2 + 0.9;
            const isVictory = (attackPower * randomFactor) > defensePower;
            if (isVictory) {
                const loot = Math.floor(currentNation.dinero * 0.1);
                currentNation.dinero = Math.max(0, currentNation.dinero - loot);
                currentNation.seguridad = Math.max(0, currentNation.seguridad - 10);
                attack.resultado = 'derrota';
                attack.botin = loot;
            } else {
                currentNation.seguridad = Math.min(100, currentNation.seguridad + 5);
                attack.resultado = 'victoria';
                attack.botin = 0;
            }
            pendingAttacks.push(attack);
            await updateDoc(doc(db, "ataques", attack.docId), { procesado: true });
        }
        if (pendingAttacks.length > 0) {
            await updateDoc(doc(db, "naciones", currentUser), {
                dinero: currentNation.dinero,
                seguridad: currentNation.seguridad,
                ultima_conexion: new Date()
            });
        }
    } catch (error) {
        console.error("❌ Error procesando ataques:", error.message);
    }
}

// ======================
// CARGAR TODAS LAS NACIONES (RANKING)
// ======================

async function loadAllNations() {
    try {
        const q = query(collection(db, "naciones"), orderBy("dinero", "desc"), limit(50));
        const querySnapshot = await getDocs(q);
        allNations = [];
        querySnapshot.forEach((doc) => {
            const nation = doc.data();
            nation.id = doc.id;
            allNations.push(nation);
        });
    } catch (error) {
        console.error("❌ Error cargando ranking:", error.message);
    }
}

// ======================
// CÁLCULO PASIVO DE RECURSOS
// ======================

function calculatePassiveProduction() {
    if (!currentNation) return;
    const lastConnection = currentNation.ultima_conexion.toDate ? currentNation.ultima_conexion.toDate() : new Date(currentNation.ultima_conexion);
    const minutesOffline = (new Date() - lastConnection) / (1000 * 60);
    currentNation.dinero += (currentNation.poblacion * 0.5) * minutesOffline;
    currentNation.poblacion += Math.floor(currentNation.poblacion * (minutesOffline / 1000));
    currentNation.salud = Math.max(0, currentNation.salud - (minutesOffline * 0.1)) + (currentNation.edificios.hospitals * 0.5);
    currentNation.seguridad = Math.max(0, currentNation.seguridad - (minutesOffline * 0.1)) + (currentNation.edificios.police + currentNation.edificios.firefighters) * 0.3;
}

// ======================
// ACCIONES DEL JUEGO
// ======================

async function recruitUnit(unitType) {
    const costs = { soldados: 50, tanques: 500, aviones: 2000 };
    if (currentNation.dinero < costs[unitType]) { alert('❌ ' + t('dineroInsuficiente')); return; }
    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - costs[unitType],
            [`ejercito.${unitType}`]: currentNation.ejercito[unitType] + 1,
            ultima_conexion: new Date()
        });
        currentNation.dinero -= costs[unitType];
        currentNation.ejercito[unitType]++;
        updateUI();
    } catch (e) { console.error(e); }
}

function calculateMilitaryPower(nation) {
    if (!nation || !nation.ejercito) return 0;
    return (nation.ejercito.soldados * 10) + (nation.ejercito.tanques * 100) + (nation.ejercito.aviones * 500);
}

async function attackNation(targetId) {
    if (calculateMilitaryPower(currentNation) === 0) { alert('❌ ' + t('noUnidades')); return; }
    const target = allNations.find(n => n.id === targetId);
    if (!target || targetId === currentUser) return;
    try {
        await addDoc(collection(db, "ataques"), {
            id_atacante: currentUser, id_defensor: targetId,
            nombre_atacante: currentNation.nombre, nombre_defensor: target.nombre,
            tropas_enviadas: currentNation.ejercito, fecha_ataque: new Date(), procesado: false
        });
        alert(`✅ ${t('ataqueLanzado')} contra ${target.nombre}`);
        await loadNationData();
    } catch (e) { console.error(e); }
}

async function upgradeBuilding(type) {
    const costs = { factories: 500, powerPlants: 600, farms: 400, mines: 700, refineries: 800 };
    if (currentNation.dinero < costs[type]) return;
    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - costs[type],
            [`edificios.${type}`]: currentNation.edificios[type] + 1,
            ultima_conexion: new Date()
        });
        currentNation.dinero -= costs[type];
        currentNation.edificios[type]++;
        updateUI();
    } catch (e) { console.error(e); }
}

async function upgradeService(type) {
    const costs = { hospitals: 800, police: 600, firefighters: 700, schools: 500 };
    if (currentNation.dinero < costs[type]) return;
    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - costs[type],
            [`edificios.${type}`]: currentNation.edificios[type] + 1,
            ultima_conexion: new Date()
        });
        currentNation.dinero -= costs[type];
        currentNation.edificios[type]++;
        updateUI();
    } catch (e) { console.error(e); }
}

async function buildCity() {
    const name = prompt('Nombre de la ciudad:');
    if (!name || currentNation.dinero < 1000) return;
    try {
        const newCity = { name, population: 100, buildings: { factories: 0, mines: 0, farms: 0 } };
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - 1000,
            ciudades: [...currentNation.ciudades, newCity],
            ultima_conexion: new Date()
        });
        currentNation.dinero -= 1000;
        currentNation.ciudades.push(newCity);
        updateUI();
    } catch (e) { console.error(e); }
}

function changeLanguage(lang) {
    currentLanguage = lang;
    document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.lang === lang));
    updateUI();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active', tab.id === tabName));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('onclick').includes(tabName)));
    if (tabName === 'war') updateRankingDisplay();
    if (tabName === 'overview' && map) {
        setTimeout(() => {
            map.invalidateSize();
            console.log("🔄 Redibujando mapa...");
        }, 300);
    }
}

function updateRankingDisplay() {
    let html = '<h3>Ranking de Naciones</h3><div class="ranking-list">';
    allNations.forEach((n, i) => {
        html += `
            <div class="ranking-item">
                <div class="ranking-info">
                    <span class="rank">#${i + 1}</span>
                    <span class="nation-name">${n.nombre}${n.id === currentUser ? ' (Tú)' : ''}</span>
                    <span class="military-power-stat">⚔️ ${calculateMilitaryPower(n)}</span>
                    <span class="nation-money">💰 $${Math.floor(n.dinero)}</span>
                </div>
                ${n.id !== currentUser ? `<button onclick="attackNation('${n.id}')" class="btn-attack">⚔️ Atacar</button>` : ''}
            </div>`;
    });
    const el = document.getElementById('rankingList');
    if (el) el.innerHTML = html + '</div>';
}

function updateUI() {
    if (!currentNation) return;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    set('sidebarMoney', '$' + Math.floor(currentNation.dinero));
    set('sidebarPopulation', Math.floor(currentNation.poblacion));
    set('nationName', currentNation.nombre + ' (' + currentNation.territorio + ')');
    set('overviewNation', currentNation.nombre);
    set('overviewTerritory', currentNation.territorio);
    set('overviewPopulation', Math.floor(currentNation.poblacion));
    set('overviewMoney', '$' + Math.floor(currentNation.dinero));
    set('overviewHappiness', Math.floor(currentNation.felicidad) + '%');
    set('overviewHealth', Math.floor(currentNation.salud) + '%');
    set('overviewSecurity', Math.floor(currentNation.seguridad) + '%');
    
    const buildings = ['factories', 'powerPlants', 'farms', 'mines', 'refineries', 'hospitals', 'police', 'firefighters', 'schools'];
    buildings.forEach(b => set(b + 'Level', currentNation.edificios[b]));
    
    set('soldadosLevel', currentNation.ejercito.soldados);
    set('tanquesLevel', currentNation.ejercito.tanques);
    set('avionesLevel', currentNation.ejercito.aviones);
    set('militaryPowerDisplay', calculateMilitaryPower(currentNation));
}

showAuthScreen();

setupAuthListener((authState) => {
    if (authState.authenticated) {
        currentUser = authState.uid;
        loadNationData();
        showGameScreen();
    } else {
        showAuthScreen();
    }
});

window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
window.switchAuthTab = switchAuthTab;
window.upgradeService = upgradeService;
window.upgradeBuilding = upgradeBuilding;
window.buildCity = buildCity;
window.changeLanguage = changeLanguage;
window.switchTab = switchTab;
window.recruitUnit = recruitUnit;
window.attackNation = attackNation;
window.updateUI = updateUI;
window.loadNationData = loadNationData;
window.showAuthScreen = showAuthScreen;
window.showGameScreen = showGameScreen;
