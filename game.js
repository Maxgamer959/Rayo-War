// ======================
// RAYO WAR - SISTEMA DE NACIONES AVANZADO (PARCHE DEFINITIVO V3)
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
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";

// ======================
// ESTADO GLOBAL
// ======================

let currentUser = null;
let currentNation = null;
let currentLanguage = 'es';
let allNations = [];
let activeCityId = null; 

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
    const nationName = document.getElementById('registerNationName').value; // ID Corregido
    const government = document.getElementById('governmentSelect').value;
    const territory = document.getElementById('territorySelect').value;
    
    // 1. Registrar en Auth
    const result = await registerUser(email, password);
    
    if (result.success) {
        currentUser = result.uid;
        
        // 2. Inicializar documento en Firestore con valores base (Parche Crítico)
        const initialData = {
            nombre: nationName,
            gobierno: government,
            territorio: territory,
            dinero: 5000, // Dinero inicial de regalo
            poblacion: 1000,
            felicidad: 50,
            salud: 50,
            seguridad: 50,
            recursos_especiales: {
                energy: 100,
                food: 100,
                minerals: 100,
                oil: 100
            },
            ejercito: {
                soldados: 10,
                tanques: 0,
                aviones: 0
            },
            poder_total: 100,
            ciudades: [
                {
                    name: "Capital " + nationName,
                    population: 500,
                    edificios: {
                        factories: 1,
                        powerPlants: 1,
                        farms: 1,
                        mines: 1,
                        refineries: 1,
                        hospitals: 1,
                        police: 1,
                        firefighters: 1,
                        schools: 1
                    }
                }
            ],
            ultima_conexion: serverTimestamp()
        };

        try {
            await setDoc(doc(db, "naciones", currentUser), initialData);
            await loadNationData();
            showGameScreen();
        } catch (error) {
            console.error("Error creando nación en Firestore:", error);
            alert("Error al inicializar la nación en la base de datos.");
        }
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
            
            if (typeof L !== 'undefined' && (currentNation.dinero > 0 || currentNation.ciudades.length > 0)) {
                setTimeout(initMap, 800);
            }
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
    if (activeCityId === null) return;
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

async function demolishBuilding(type) {
    if (activeCityId === null) return;
    if (!confirm(currentLanguage === 'es' ? "¿Estás seguro de demoler este edificio? El nivel volverá a 0." : "Are you sure? Level will reset to 0.")) return;

    const newCities = [...currentNation.ciudades];
    const city = newCities[activeCityId];
    if (city.edificios) {
        city.edificios[type] = 0;
    }

    try {
        await updateDoc(doc(db, "naciones", currentUser), {
            ciudades: newCities,
            ultima_conexion: serverTimestamp()
        });
        currentNation.ciudades = newCities;
        updateUI();
    } catch (e) { console.error(e); }
}

async function upgradeService(type) {
    if (activeCityId === null) return;
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
        updateUI();
    } catch (e) { console.error(e); }
}

function seleccionarCiudad(id) {
    activeCityId = id;
    switchTab('cityDetail');
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
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    // PANEL SUPERIOR
    set('topMoney', Math.floor(currentNation.dinero).toLocaleString());
    set('topPopulation', Math.floor(currentNation.poblacion || 0).toLocaleString());
    if (currentNation.recursos_especiales) {
        set('topCopper', Math.floor(currentNation.recursos_especiales.minerals || 0).toLocaleString());
        set('topAluminum', Math.floor(currentNation.recursos_especiales.energy || 0).toLocaleString());
        set('topOil', Math.floor(currentNation.recursos_especiales.oil || 0).toLocaleString());
    }

    // SIDEBAR
    set('sidebarMoney', '$' + Math.floor(currentNation.dinero).toLocaleString());
    set('sidebarPopulation', Math.floor(currentNation.poblacion || 0).toLocaleString());
    const sidebarNationEl = document.getElementById('sidebarNationName'); // ID Corregido
    if (sidebarNationEl) sidebarNationEl.innerText = currentNation.nombre;

    // OVERVIEW
    set('overviewNation', currentNation.nombre);
    set('overviewTerritory', currentNation.territorio);
    set('overviewGovernment', currentNation.gobierno);
    set('overviewPopulation', Math.floor(currentNation.poblacion || 0).toLocaleString());
    set('overviewMoney', Math.floor(currentNation.dinero).toLocaleString());
    set('overviewHappiness', (currentNation.felicidad || 0) + '%');
    set('overviewHealth', (currentNation.salud || 0) + '%');
    set('overviewSecurity', (currentNation.seguridad || 0) + '%');

    // CITIES LIST
    const citiesList = document.getElementById('citiesList');
    if (citiesList) {
        citiesList.innerHTML = currentNation.ciudades.map((c, index) => `
            <button class="city-item" onclick="seleccionarCiudad(${index})" style="width: 100%; text-align: left; margin-bottom: 10px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background: white; cursor: pointer; font-size: 1.1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                🏙️ <strong>${c.name}</strong> <span style="float: right; color: #666;">Pop: ${c.population}</span>
            </button>
        `).join('') || (currentLanguage === 'es' ? "No hay ciudades" : "No cities");
    }

    // CITY DETAIL VIEW
    if (activeCityId !== null && currentNation.ciudades[activeCityId]) {
        const city = currentNation.ciudades[activeCityId];
        set('activeCityTitle', city.name);
        const b = city.edificios || {};
        
        set('factoriesLevel', b.factories || 0);
        set('factoriesProduction', '+' + ((b.factories || 0) * 5));
        set('powerLevel', b.powerPlants || 0);
        set('powerProduction', '+' + ((b.powerPlants || 0) * 2));
        set('farmsLevel', b.farms || 0);
        set('farmsProduction', '+' + ((b.farms || 0) * 3));
        set('minesLevel', b.mines || 0);
        set('minesProduction', '+' + ((b.mines || 0) * 2));
        set('refineriesLevel', b.refineries || 0);
        set('refineriesProduction', '+' + ((b.refineries || 0) * 1.5));

        set('hospitalsLevel', b.hospitals || 0);
        set('policeLevel', b.police || 0);
        set('firefightersLevel', b.firefighters || 0);
        set('schoolsLevel', b.schools || 0);
    }

    // WAR & RANKING
    if (currentNation.ejercito) {
        set('soldadosLevel', currentNation.ejercito.soldados);
        set('tanquesLevel', currentNation.ejercito.tanques);
        set('avionesLevel', currentNation.ejercito.aviones);
    }
    set('militaryPowerDisplay', (currentNation.poder_total || 0).toLocaleString());
}

function updateRankingDisplay() {
    const t = translations[currentLanguage];
    const rankingList = document.getElementById('rankingList');
    if (!rankingList) return;

    let html = `<h3>${t.war} - Ranking</h3><div class="ranking-list">`;
    allNations.forEach((n, i) => {
        html += `
            <div class="ranking-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee;">
                <div>
                    <span class="rank">#${i + 1}</span>
                    <span class="nation-name"><strong>${n.nombre}</strong> — Fuerza: ${(n.poder_total || 0).toLocaleString()} [${n.gobierno || 'S/D'}]</span>
                </div>
                ${n.id !== currentUser ? `<button onclick="attackNation('${n.id}')" style="padding: 5px 10px; cursor: pointer;">${t.attack}</button>` : ''}
            </div>`;
    });
    rankingList.innerHTML = html + '</div>';
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active', tab.id === tabName));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('onclick')?.includes(tabName)));
    if (tabName === 'overview' && map) setTimeout(() => map.invalidateSize(), 300);
}

function switchCitySubTab(sub) {
    document.getElementById('cityInfra').classList.toggle('active', sub === 'infra');
    document.getElementById('cityServ').classList.toggle('active', sub === 'serv');
    document.querySelectorAll('.city-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(sub));
    });
}

// ======================
// MAPA (LEAFLET)
// ======================

function initMap() {
    if (!currentNation || typeof L === 'undefined') return;
    const mapContainer = document.getElementById('worldMap');
    if (!mapContainer) return;

    if (map) {
        map.remove();
        map = null;
    }

    const coords = { 
        'Chile': [-35, -71], 'Argentina': [-38, -63], 'México': [23, -102], 'España': [40, -3],
        'Perú': [-9, -75], 'Brasil': [-14, -51], 'Canadá': [56, -106], 'EE.UU': [37, -95],
        'Reino Unido': [55, -3], 'Francia': [46, 2], 'Alemania': [51, 10], 'Italia': [41, 12],
        'Rusia': [61, 105], 'China': [35, 104], 'Japón': [36, 138], 'India': [20, 78],
        'Australia': [-25, 133], 'Sudáfrica': [-30, 22], 'Egipto': [26, 30], 'Arabia Saudita': [23, 45]
    };
    
    const center = coords[currentNation.territorio] || [20, 0];
    
    try {
        map = L.map('worldMap').setView(center, 4);
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
        showGameScreen();
    } else {
        showAuthScreen();
    }
});

window.handleLogin = handleLogin;
window.handleRegister = handleRegister; // EXPOSICIÓN GLOBAL
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

// ======================
// PARCHE: NAVEGACIÓN DE AUTENTICACIÓN (EXPOSICIÓN GLOBAL)
// ======================

function switchToRegister(e) {
    if (e) e.preventDefault();
    document.getElementById('loginForm').classList.remove('active');
    document.getElementById('registerForm').classList.add('active');
}

function switchToLogin(e) {
    if (e) e.preventDefault();
    document.getElementById('registerForm').classList.remove('active');
    document.getElementById('loginForm').classList.add('active');
}

window.switchToRegister = switchToRegister;
window.switchToLogin = switchToLogin;
