// ======================
// RAYO WAR - SISTEMA DE NACIONES AVANZADO
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
    query,
    where,
    orderBy,
    limit,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ======================
// ESTADO GLOBAL
// ======================

let currentUser = null;
let currentNation = null;
let currentLanguage = 'es';
let allNations = [];

const translations = {
    es: {
        overview: '📊 Resumen',
        infrastructure: '🏗️ Infraestructura',
        services: '🏥 Servicios',
        cities: '🏙️ Ciudades',
        war: '⚔️ Guerra',
        money: '💰 Dinero',
        energy: '⚡ Energía',
        food: '🌾 Alimentos',
        minerals: '⛏️ Minerales',
        oil: '🛢️ Petróleo',
        population: '👥 Población',
        happiness: '😊 Felicidad',
        health: '🏥 Salud',
        security: '🛡️ Seguridad',
        soldiers: '🪖 Soldados',
        tanks: '🚜 Tanques',
        planes: '✈️ Aviones',
        militaryPower: '⚔️ Poder Militar',
        recruit: 'Reclutar',
        upgrade: 'Mejorar',
        build: 'Construir',
        insufficientMoney: '❌ Dinero insuficiente',
        cityRequired: '🔒 Requiere una Ciudad construida',
        attack: '⚔️ Atacar',
        logout: 'Cerrar Sesión'
    },
    en: {
        overview: '📊 Overview',
        infrastructure: '🏗️ Infrastructure',
        services: '🏥 Services',
        cities: '🏙️ Cities',
        war: '⚔️ War',
        money: '💰 Money',
        energy: '⚡ Energy',
        food: '🌾 Food',
        minerals: '⛏️ Minerals',
        oil: '🛢️ Oil',
        population: '👥 Population',
        happiness: '😊 Happiness',
        health: '🏥 Health',
        security: '🛡️ Security',
        soldiers: '🪖 Soldiers',
        tanks: '🚜 Tanks',
        planes: '✈️ Planes',
        militaryPower: '⚔️ Military Power',
        recruit: 'Recruit',
        upgrade: 'Upgrade',
        build: 'Build',
        insufficientMoney: '❌ Insufficient money',
        cityRequired: '🔒 Requires a City built',
        attack: '⚔️ Attack',
        logout: 'Logout'
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
    const nationName = document.getElementById('nationName').value;
    const government = document.getElementById('governmentSelect').value;
    const territory = document.getElementById('territorySelect').value;
    const result = await registerUser(email, password, nationName, government, territory);
    if (result.success) {
        currentUser = result.uid;
        await loadNationData();
        showGameScreen();
    } else {
        const messageEl = document.getElementById('authMessage');
        if (messageEl) {
            messageEl.textContent = result.error;
            messageEl.style.display = 'block';
            messageEl.className = 'auth-message error';
        } else {
            alert(result.error);
        }
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
        const nacionSnap = await getDoc(nacionRef);
        if (nacionSnap.exists()) {
            currentNation = nacionSnap.data();
            currentNation.id = currentUser;
            currentNacion = currentNation;
            
            if (!currentNation.recursos_especiales) {
                currentNation.recursos_especiales = { energy: 100, food: 100, minerals: 100, oil: 100 };
            }
            if (!currentNation.poder_total) {
                currentNation.poder_total = calculateMilitaryPower(currentNation);
            }

            calculatePassiveProduction();
            await loadAllNations();
            updateUI();
            setTimeout(initMap, 800);
        }
    } catch (error) {
        console.error("❌ Error cargando datos:", error);
    }
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
    } catch (error) {
        console.error("❌ Error cargando ranking:", error);
    }
}

function calculateMilitaryPower(nation) {
    if (!nation || !nation.ejercito) return 0;
    return (nation.ejercito.soldados * 10) + (nation.ejercito.tanques * 100) + (nation.ejercito.aviones * 500);
}

function calculatePassiveProduction() {
    const lastConnection = currentNation.ultima_conexion.toDate ? currentNation.ultima_conexion.toDate() : new Date(currentNation.ultima_conexion);
    const minutes = (new Date() - lastConnection) / (1000 * 60);
    
    currentNation.dinero += (currentNation.edificios.factories * 5) * minutes;
    currentNation.recursos_especiales.energy += (currentNation.edificios.powerPlants * 2) * minutes;
    currentNation.recursos_especiales.food += (currentNation.edificios.farms * 3) * minutes;
    currentNation.recursos_especiales.minerals += (currentNation.edificios.mines * 2) * minutes;
    currentNation.recursos_especiales.oil += (currentNation.edificios.refineries * 1.5) * minutes;
}

// ======================
// ACCIONES DEL JUEGO
// ======================

async function recruitUnit(unitType) {
    const costs = { soldados: 50, tanques: 500, aviones: 2000 };
    if (currentNation.dinero < costs[unitType]) { alert(translations[currentLanguage].insufficientMoney); return; }
    
    const newEjercito = { ...currentNation.ejercito };
    newEjercito[unitType]++;
    const newPower = (newEjercito.soldados * 10) + (newEjercito.tanques * 100) + (newEjercito.aviones * 500);

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - costs[unitType],
            ejercito: newEjercito,
            poder_total: newPower,
            ultima_conexion: serverTimestamp()
        });
        
        currentNation.dinero -= costs[unitType];
        currentNation.ejercito = newEjercito;
        currentNation.poder_total = newPower;
        updateUI();
        loadAllNations();
    } catch (e) { console.error(e); }
}

async function upgradeBuilding(type) {
    const costs = { factories: 500, powerPlants: 600, farms: 400, mines: 700, refineries: 800 };
    if (currentNation.dinero < costs[type]) { alert(translations[currentLanguage].insufficientMoney); return; }

    const newEdificios = { ...currentNation.edificios };
    newEdificios[type]++;

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - costs[type],
            edificios: newEdificios,
            ultima_conexion: serverTimestamp()
        });

        currentNation.dinero -= costs[type];
        currentNation.edificios = newEdificios;
        updateUI();
    } catch (e) { console.error(e); }
}

async function upgradeService(type) {
    if (currentNation.ciudades.length === 0) { alert(translations[currentLanguage].cityRequired); return; }
    const costs = { hospitals: 800, police: 600, firefighters: 700, schools: 500 };
    if (currentNation.dinero < costs[type]) { alert(translations[currentLanguage].insufficientMoney); return; }

    const newEdificios = { ...currentNation.edificios };
    newEdificios[type]++;

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - costs[type],
            edificios: newEdificios,
            ultima_conexion: serverTimestamp()
        });

        currentNation.dinero -= costs[type];
        currentNation.edificios = newEdificios;
        updateUI();
    } catch (e) { console.error(e); }
}

async function buildCity() {
    if (currentNation.dinero < 1000) { alert(translations[currentLanguage].insufficientMoney); return; }
    const cityName = prompt(currentLanguage === 'es' ? "Nombre de la ciudad:" : "City Name:");
    if (!cityName) return;

    const newCities = [...currentNation.ciudades, { name: cityName, population: 100 }];

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - 1000,
            ciudades: newCities,
            ultima_conexion: serverTimestamp()
        });

        currentNation.dinero -= 1000;
        currentNation.ciudades = newCities;
        updateUI();
    } catch (e) { console.error(e); }
}

// ======================
// INTERFAZ Y TRADUCCIÓN
// ======================

function changeLanguage(lang) {
    currentLanguage = lang;
    updateUI();
}

function updateUI() {
    if (!currentNation) return;
    const t = translations[currentLanguage];

    // Helper para actualizar texto de forma segura
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    // Traducir Navegación de forma segura
    const navButtons = {
        'overview': t.overview,
        'infrastructure': t.infrastructure,
        'services': t.services,
        'cities': t.cities,
        'war': t.war
    };
    Object.keys(navButtons).forEach(tab => {
        const btn = document.querySelector(`[onclick="switchTab('${tab}')"]`);
        if (btn) btn.innerText = navButtons[tab];
    });
    const logoutBtn = document.querySelector('.btn-logout');
    if (logoutBtn) logoutBtn.innerText = t.logout;

    // Actualizar Contadores Superiores
    set('topMoney', Math.floor(currentNation.dinero));
    if (currentNation.recursos_especiales) {
        set('topEnergy', Math.floor(currentNation.recursos_especiales.energy));
        set('topFood', Math.floor(currentNation.recursos_especiales.food));
        set('topMinerals', Math.floor(currentNation.recursos_especiales.minerals));
        set('topOil', Math.floor(currentNation.recursos_especiales.oil));
    }

    // Sidebar
    set('sidebarMoney', '$' + Math.floor(currentNation.dinero));
    set('sidebarPopulation', Math.floor(currentNation.poblacion));
    set('nationNameDisplay', currentNation.nombre);

    // Desbloqueo de Servicios
    const servicesTab = document.getElementById('services');
    const lockMsg = document.getElementById('servicesLockMessage');
    if (servicesTab && lockMsg) {
        if (currentNation.ciudades && currentNation.ciudades.length > 0) {
            servicesTab.classList.remove('locked');
            lockMsg.style.display = 'none';
        } else {
            servicesTab.classList.add('locked');
            lockMsg.style.display = 'block';
            lockMsg.innerText = t.cityRequired;
        }
    }

    // Ciudades
    const citiesList = document.getElementById('citiesList');
    if (citiesList) {
        citiesList.innerHTML = currentNation.ciudades.map(c => `<div class="city-item">🏙️ ${c.name} (Pop: ${c.population})</div>`).join('') || (currentLanguage === 'es' ? "No hay ciudades" : "No cities");
    }

    // Niveles de Edificios
    const b = currentNation.edificios;
    if (b) {
        set('factoriesLevel', b.factories);
        set('powerLevel', b.powerPlants);
        set('farmsLevel', b.farms);
        set('minesLevel', b.mines);
        set('refineriesLevel', b.refineries);
        set('hospitalsLevel', b.hospitals);
        set('policeLevel', b.police);
        set('firefightersLevel', b.firefighters);
        set('schoolsLevel', b.schools);
    }

    // Ejército
    if (currentNation.ejercito) {
        set('soldadosLevel', currentNation.ejercito.soldados);
        set('tanquesLevel', currentNation.ejercito.tanques);
        set('avionesLevel', currentNation.ejercito.aviones);
    }
    set('militaryPowerDisplay', currentNation.poder_total);

    // Etiquetas de materiales
    document.querySelectorAll('.label-money').forEach(el => el.innerText = t.money);
    document.querySelectorAll('.label-energy').forEach(el => el.innerText = t.energy);
    document.querySelectorAll('.label-food').forEach(el => el.innerText = t.food);
    document.querySelectorAll('.label-minerals').forEach(el => el.innerText = t.minerals);
    document.querySelectorAll('.label-oil').forEach(el => el.innerText = t.oil);
}

function updateRankingDisplay() {
    const t = translations[currentLanguage];
    const rankingList = document.getElementById('rankingList');
    if (!rankingList) return;

    let html = `<h3>${t.war} - Ranking</h3><div class="ranking-list">`;
    allNations.forEach((n, i) => {
        html += `
            <div class="ranking-item">
                <span class="rank">#${i + 1}</span>
                <span class="nation-name">${n.nombre}</span>
                <span class="military-power-stat">⚔️ ${n.poder_total}</span>
                ${n.id !== currentUser ? `<button onclick="attackNation('${n.id}')" class="btn-attack">${t.attack}</button>` : '⭐'}
            </div>`;
    });
    rankingList.innerHTML = html + '</div>';
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active', tab.id === tabName));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('onclick').includes(tabName)));
    if (tabName === 'overview' && map) setTimeout(() => map.invalidateSize(), 300);
}

// ======================
// MAPA (LEAFLET)
// ======================

function initMap() {
    if (!currentNation) return;
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    if (map) {
        map.remove();
        map = null;
    }

    const coords = { 'Chile': [-35, -71], 'Argentina': [-38, -63], 'México': [23, -102], 'España': [40, -3] };
    const center = coords[currentNation.territorio] || [20, 0];
    
    try {
        map = L.map('map').setView(center, 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        L.marker(center).addTo(map).bindPopup(currentNation.nombre).openPopup();
        setTimeout(() => map.invalidateSize(), 200);
    } catch (e) { console.error(e); }
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
window.upgradeService = upgradeService;
window.buildCity = buildCity;
window.changeLanguage = changeLanguage;
window.switchTab = switchTab;
