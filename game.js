// ======================
// RAYO WAR - SISTEMA DE NACIONES AVANZADO (CORREGIDO)
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
let activeCityId = null; // PARCHE 2: Ciudad activa seleccionada

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
        logout: 'Cerrar Sesión',
        selectCity: 'Selecciona una ciudad primero'
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
        logout: 'Logout',
        selectCity: 'Select a city first'
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

            // Inicializar ciudad activa si existen ciudades
            if (currentNation.ciudades && currentNation.ciudades.length > 0 && activeCityId === null) {
                activeCityId = 0;
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
    
    // PARCHE 2: Producción pasiva sumando todas las ciudades
    let totalFactories = 0, totalPower = 0, totalFarms = 0, totalMines = 0, totalRefineries = 0;
    
    if (currentNation.ciudades && currentNation.ciudades.length > 0) {
        currentNation.ciudades.forEach(city => {
            const b = city.edificios || { factories: 0, powerPlants: 0, farms: 0, mines: 0, refineries: 0 };
            totalFactories += (b.factories || 0);
            totalPower += (b.powerPlants || 0);
            totalFarms += (b.farms || 0);
            totalMines += (b.mines || 0);
            totalRefineries += (b.refineries || 0);
        });
    } else {
        // Fallback para naciones sin ciudades (global)
        const b = currentNation.edificios || { factories: 0, powerPlants: 0, farms: 0, mines: 0, refineries: 0 };
        totalFactories = b.factories;
        totalPower = b.powerPlants;
        totalFarms = b.farms;
        totalMines = b.mines;
        totalRefineries = b.refineries;
    }

    currentNation.dinero += (totalFactories * 5) * minutes;
    currentNation.recursos_especiales.energy += (totalPower * 2) * minutes;
    currentNation.recursos_especiales.food += (totalFarms * 3) * minutes;
    currentNation.recursos_especiales.minerals += (totalMines * 2) * minutes;
    currentNation.recursos_especiales.oil += (totalRefineries * 1.5) * minutes;
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
    // PARCHE 2: Mejora por ciudad activa
    if (activeCityId === null) { alert(translations[currentLanguage].selectCity); return; }
    
    const costs = { factories: 500, powerPlants: 600, farms: 400, mines: 700, refineries: 800 };
    if (currentNation.dinero < costs[type]) { alert(translations[currentLanguage].insufficientMoney); return; }

    const newCities = [...currentNation.ciudades];
    const city = newCities[activeCityId];
    if (!city.edificios) city.edificios = { factories: 0, powerPlants: 0, farms: 0, mines: 0, refineries: 0, hospitals: 0, police: 0, firefighters: 0, schools: 0 };
    city.edificios[type]++;

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - costs[type],
            ciudades: newCities,
            ultima_conexion: serverTimestamp()
        });

        currentNation.dinero -= costs[type];
        currentNation.ciudades = newCities;
        updateUI();
    } catch (e) { console.error(e); }
}

async function upgradeService(type) {
    // PARCHE 2: Mejora por ciudad activa
    if (activeCityId === null) { alert(translations[currentLanguage].selectCity); return; }
    
    const costs = { hospitals: 800, police: 600, firefighters: 700, schools: 500 };
    if (currentNation.dinero < costs[type]) { alert(translations[currentLanguage].insufficientMoney); return; }

    const newCities = [...currentNation.ciudades];
    const city = newCities[activeCityId];
    if (!city.edificios) city.edificios = { factories: 0, powerPlants: 0, farms: 0, mines: 0, refineries: 0, hospitals: 0, police: 0, firefighters: 0, schools: 0 };
    city.edificios[type]++;

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            dinero: currentNation.dinero - costs[type],
            ciudades: newCities,
            ultima_conexion: serverTimestamp()
        });

        currentNation.dinero -= costs[type];
        currentNation.ciudades = newCities;
        updateUI();
    } catch (e) { console.error(e); }
}

async function buildCity() {
    if (currentNation.dinero < 1000) { alert(translations[currentLanguage].insufficientMoney); return; }
    const cityName = prompt(currentLanguage === 'es' ? "Nombre de la ciudad:" : "City Name:");
    if (!cityName) return;

    // PARCHE 2: Inicializar edificios al crear ciudad
    const newCity = { 
        name: cityName, 
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

        currentNation.dinero -= 1000;
        currentNation.ciudades = newCities;
        if (activeCityId === null) activeCityId = currentNation.ciudades.length - 1;
        updateUI();
    } catch (e) { console.error(e); }
}

// PARCHE 1: Función para seleccionar ciudad
function seleccionarCiudad(id) {
    activeCityId = id;
    updateUI();
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

    // PARCHE 1: Ciudades como botones
    const citiesList = document.getElementById('citiesList');
    if (citiesList) {
        citiesList.innerHTML = currentNation.ciudades.map((c, index) => `
            <button class="city-item ${activeCityId === index ? 'active' : ''}" onclick="seleccionarCiudad(${index})" style="width: 100%; text-align: left; margin-bottom: 5px; padding: 10px; border: 1px solid #ccc; border-radius: 5px; background: ${activeCityId === index ? '#e0e0e0' : 'white'}; cursor: pointer;">
                🏙️ ${c.name} (Pop: ${c.population})
            </button>
        `).join('') || (currentLanguage === 'es' ? "No hay ciudades" : "No cities");
    }

    // PARCHE 2: Mostrar nombre de ciudad activa en pestañas
    const activeCityName = activeCityId !== null && currentNation.ciudades[activeCityId] ? currentNation.ciudades[activeCityId].name : (currentLanguage === 'es' ? "Ninguna" : "None");
    
    const infraHeader = document.querySelector('#infrastructure h2');
    if (infraHeader) infraHeader.innerText = `${t.infrastructure} - ${activeCityName}`;
    
    const servicesHeader = document.querySelector('#services h2');
    if (servicesHeader) servicesHeader.innerText = `${t.services} - ${activeCityName}`;

    // PARCHE 2: Niveles de Edificios por ciudad
    const b = (activeCityId !== null && currentNation.ciudades[activeCityId]) ? (currentNation.ciudades[activeCityId].edificios || {}) : {};
    
    set('factoriesLevel', b.factories || 0);
    set('powerLevel', b.powerPlants || 0);
    set('farmsLevel', b.farms || 0);
    set('minesLevel', b.mines || 0);
    set('refineriesLevel', b.refineries || 0);
    set('hospitalsLevel', b.hospitals || 0);
    set('policeLevel', b.police || 0);
    set('firefightersLevel', b.firefighters || 0);
    set('schoolsLevel', b.schools || 0);

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
        // PARCHE 3: Mostrar fuerza en el ranking
        html += `
            <div class="ranking-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee;">
                <div>
                    <span class="rank">#${i + 1}</span>
                    <span class="nation-name"><strong>${n.nombre}</strong> — Fuerza: ${n.poder_total.toLocaleString()}</span>
                </div>
                ${n.id !== currentUser ? `<button onclick="attackNation('${n.id}')" style="padding: 5px 10px; cursor: pointer;">${t.attack}</button>` : ''}
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
window.seleccionarCiudad = seleccionarCiudad; // PARCHE 1
window.changeLanguage = changeLanguage;
window.switchTab = switchTab;
