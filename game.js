// ======================
// RAYO WAR - PASSIVE WARFARE SYSTEM
// ======================

let currentNacion = null; // Variable declarada globalmente para evitar ReferenceError
let map = null; // Variable para la instancia del mapa Leaflet

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
            initMap(); // Inicializar el mapa después de cargar los datos
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

    // Coordenadas aproximadas por territorio
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

    const center = coords[currentNation.territorio] || [0, 0];

    // Si el mapa ya existe, solo mover la vista
    if (map) {
        map.setView(center, 4);
        return;
    }

    // Crear el mapa
    map = L.map('map').setView(center, 4);

    // Añadir capa de OpenStreetMap (Estilo Oscuro/CartoDB)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Añadir marcador en la capital/centro
    L.marker(center).addTo(map)
        .bindPopup(`<b>${currentNation.nombre}</b><br>${currentNation.territorio}`)
        .openPopup();
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

            const attackPower = (attack.tropas_enviadas.soldados * 10) + 
                               (attack.tropas_enviadas.tanques * 100) + 
                               (attack.tropas_enviadas.aviones * 500);

            const defensePower = (currentNation.ejercito.soldados * 10) + 
                                (currentNation.ejercito.tanques * 100) + 
                                (currentNation.ejercito.aviones * 500);

            const randomFactor = Math.random() * 0.2 + 0.9;
            const adjustedAttackPower = attackPower * randomFactor;
            const isVictory = adjustedAttackPower > defensePower;

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
            const attackRef = doc(db, "ataques", attack.docId);
            await updateDoc(attackRef, { procesado: true });
        }

        if (pendingAttacks.length > 0) {
            const nacionRef = doc(db, "naciones", currentUser);
            await updateDoc(nacionRef, {
                dinero: currentNation.dinero,
                seguridad: currentNation.seguridad,
                ultima_conexion: new Date()
            });
            console.log(`⚔️ ${pendingAttacks.length} ataques procesados`);
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
        const q = query(
            collection(db, "naciones"),
            orderBy("dinero", "desc"),
            limit(50)
        );
        const querySnapshot = await getDocs(q);
        allNations = [];

        querySnapshot.forEach((doc) => {
            const nation = doc.data();
            nation.id = doc.id;
            allNations.push(nation);
        });

        console.log("✅ Ranking cargado:", allNations.length, "naciones");
    } catch (error) {
        console.error("❌ Error cargando ranking:", error.message);
    }
}

// ======================
// CÁLCULO PASIVO DE RECURSOS
// ======================

function calculatePassiveProduction() {
    if (!currentNation) return;

    const lastConnection = currentNation.ultima_conexion.toDate ? 
        currentNation.ultima_conexion.toDate() : 
        new Date(currentNation.ultima_conexion);
    
    const now = new Date();
    const minutesOffline = (now - lastConnection) / (1000 * 60);

    const moneyPerMinute = currentNation.poblacion * 0.5;
    const foodPerMinute = currentNation.edificios.farms * 8;

    currentNation.dinero += moneyPerMinute * minutesOffline;
    currentNation.poblacion += Math.floor(currentNation.poblacion * (minutesOffline / 1000));

    currentNation.salud = Math.max(0, currentNation.salud - (minutesOffline * 0.1));
    currentNation.seguridad = Math.max(0, currentNation.seguridad - (minutesOffline * 0.1));

    currentNation.salud += currentNation.edificios.hospitals * 0.5;
    currentNation.seguridad += (currentNation.edificios.police + currentNation.edificios.firefighters) * 0.3;
}

// ======================
// RECLUTAMIENTO MILITAR
// ======================

async function recruitUnit(unitType) {
    const costs = { soldados: 50, tanques: 500, aviones: 2000 };
    const cost = costs[unitType];

    if (currentNation.dinero < cost) {
        alert('❌ ' + t('dineroInsuficiente'));
        return;
    }

    try {
        const batch = writeBatch(db);
        const nacionRef = doc(db, "naciones", currentUser);

        batch.update(nacionRef, {
            dinero: currentNation.dinero - cost,
            [`ejercito.${unitType}`]: currentNation.ejercito[unitType] + 1,
            ultima_conexion: new Date()
        });

        await batch.commit();
        currentNation.dinero -= cost;
        currentNation.ejercito[unitType]++;
        updateUI();
    } catch (error) {
        console.error("❌ Error reclutando:", error.message);
    }
}

function calculateMilitaryPower(nation) {
    if (!nation || !nation.ejercito) return 0;
    return (nation.ejercito.soldados * 10) + (nation.ejercito.tanques * 100) + (nation.ejercito.aviones * 500);
}

async function attackNation(targetId) {
    if (!currentNation.ejercito || (currentNation.ejercito.soldados + currentNation.ejercito.tanques + currentNation.ejercito.aviones) === 0) {
        alert('❌ ' + t('noUnidades'));
        return;
    }

    const targetNation = allNations.find(n => n.id === targetId);
    if (!targetNation || targetId === currentUser) return;

    try {
        const batch = writeBatch(db);
        const nacionRef = doc(db, "naciones", currentUser);
        batch.update(nacionRef, { ejercito: currentNation.ejercito, ultima_conexion: new Date() });
        await batch.commit();

        const attackData = {
            id_atacante: currentUser,
            id_defensor: targetId,
            nombre_atacante: currentNation.nombre,
            nombre_defensor: targetNation.nombre,
            tropas_enviadas: {
                soldados: currentNation.ejercito.soldados,
                tanques: currentNation.ejercito.tanques,
                aviones: currentNation.ejercito.aviones
            },
            fecha_ataque: new Date(),
            procesado: false
        };

        await addDoc(collection(db, "ataques"), attackData);
        alert(`✅ ${t('ataqueLanzado')} contra ${targetNation.nombre}`);
        await loadNationData();
    } catch (error) {
        console.error("❌ Error lanzando ataque:", error.message);
    }
}

async function upgradeBuilding(buildingType) {
    const costs = { factories: 500, powerPlants: 600, farms: 400, mines: 700, refineries: 800 };
    const cost = costs[buildingType];
    if (currentNation.dinero < cost) return;

    try {
        const batch = writeBatch(db);
        const nacionRef = doc(db, "naciones", currentUser);
        batch.update(nacionRef, {
            dinero: currentNation.dinero - cost,
            [`edificios.${buildingType}`]: currentNation.edificios[buildingType] + 1,
            ultima_conexion: new Date()
        });
        await batch.commit();
        currentNation.dinero -= cost;
        currentNation.edificios[buildingType]++;
        updateUI();
    } catch (error) {
        console.error("❌ Error mejorando edificio:", error.message);
    }
}

async function upgradeService(serviceType) {
    const costs = { hospitals: 800, police: 600, firefighters: 700, schools: 500 };
    const cost = costs[serviceType];
    if (currentNation.dinero < cost) return;

    try {
        const batch = writeBatch(db);
        const nacionRef = doc(db, "naciones", currentUser);
        let updates = {
            dinero: currentNation.dinero - cost,
            [`edificios.${serviceType}`]: currentNation.edificios[serviceType] + 1,
            ultima_conexion: new Date()
        };
        batch.update(nacionRef, updates);
        await batch.commit();
        currentNation.dinero -= cost;
        currentNation.edificios[serviceType]++;
        updateUI();
    } catch (error) {
        console.error("❌ Error construyendo servicio:", error.message);
    }
}

async function buildCity() {
    const cityName = prompt('Nombre de la ciudad:');
    if (!cityName) return;
    const cost = 1000;
    if (currentNation.dinero < cost) return;

    try {
        const batch = writeBatch(db);
        const nacionRef = doc(db, "naciones", currentUser);
        const newCity = { name: cityName, population: 100, buildings: { factories: 0, mines: 0, farms: 0 } };
        batch.update(nacionRef, {
            dinero: currentNation.dinero - cost,
            ciudades: [...currentNation.ciudades, newCity],
            ultima_conexion: new Date()
        });
        await batch.commit();
        currentNation.dinero -= cost;
        currentNation.ciudades.push(newCity);
        updateUI();
    } catch (error) {
        console.error("❌ Error construyendo ciudad:", error.message);
    }
}

function changeLanguage(lang) {
    currentLanguage = lang;
    document.querySelectorAll('.lang-btn').forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.querySelector(`[data-lang="${lang}"]`);
    if (targetBtn) targetBtn.classList.add('active');
    updateUI();
}

function switchTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) selectedTab.classList.add('active');
    const buttons = document.querySelectorAll('.nav-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    if (tabName === 'war') updateRankingDisplay();
    if (tabName === 'overview' && map) setTimeout(() => map.invalidateSize(), 200);
}

function updateRankingDisplay() {
    let rankingHTML = '<h3>Ranking de Naciones</h3><div class="ranking-list">';
    allNations.forEach((nation, index) => {
        const militaryPower = calculateMilitaryPower(nation);
        const isYou = nation.id === currentUser ? ' (Tú)' : '';
        const attackBtn = nation.id !== currentUser ? `<button onclick="attackNation('${nation.id}')" class="btn-attack">⚔️ Atacar</button>` : '';
        rankingHTML += `
            <div class="ranking-item">
                <div class="ranking-info">
                    <span class="rank">#${index + 1}</span>
                    <span class="nation-name">${nation.nombre}${isYou}</span>
                    <span class="nation-territory">${nation.territorio}</span>
                    <span class="military-power-stat">⚔️ ${militaryPower}</span>
                    <span class="nation-money">💰 $${Math.floor(nation.dinero)}</span>
                </div>
                ${attackBtn}
            </div>
        `;
    });
    rankingHTML += '</div>';
    const rankingList = document.getElementById('rankingList');
    if (rankingList) rankingList.innerHTML = rankingHTML;
}

function updateUI() {
    if (!currentNation) return;
    const sidebarMoney = document.getElementById('sidebarMoney');
    const sidebarPopulation = document.getElementById('sidebarPopulation');
    const sidebarNationName = document.getElementById('nationName');
    if (sidebarMoney) sidebarMoney.innerText = '$' + Math.floor(currentNation.dinero);
    if (sidebarPopulation) sidebarPopulation.innerText = Math.floor(currentNation.poblacion);
    if (sidebarNationName) sidebarNationName.innerText = currentNation.nombre + ' (' + currentNation.territorio + ')';

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setVal('overviewNation', currentNation.nombre);
    setVal('overviewTerritory', currentNation.territorio);
    setVal('overviewGovernment', currentNation.gobierno);
    setVal('overviewPopulation', Math.floor(currentNation.poblacion));
    setVal('overviewMoney', '$' + Math.floor(currentNation.dinero));
    setVal('overviewHappiness', Math.floor(currentNation.felicidad) + '%');
    setVal('overviewHealth', Math.floor(currentNation.salud) + '%');
    setVal('overviewSecurity', Math.floor(currentNation.seguridad) + '%');

    const abundantResources = document.getElementById('abundantResources');
    if (abundantResources) {
        let html = '<h3>Recursos Abundantes:</h3>';
        for (let r in currentNation.recursos) html += `<p>${r}: ${currentNation.recursos[r]}%</p>`;
        abundantResources.innerHTML = html;
    }

    setVal('factoriesLevel', currentNation.edificios.factories);
    setVal('powerLevel', currentNation.edificios.powerPlants);
    setVal('farmsLevel', currentNation.edificios.farms);
    setVal('minesLevel', currentNation.edificios.mines);
    setVal('refineriesLevel', currentNation.edificios.refineries);
    setVal('hospitalsLevel', currentNation.edificios.hospitals);
    setVal('policeLevel', currentNation.edificios.police);
    setVal('firefightersLevel', currentNation.edificios.firefighters);
    setVal('schoolsLevel', currentNation.edificios.schools);
    setVal('soldadosLevel', currentNation.ejercito.soldados);
    setVal('tanquesLevel', currentNation.ejercito.tanques);
    setVal('avionesLevel', currentNation.ejercito.aviones);
    setVal('militaryPowerDisplay', calculateMilitaryPower(currentNation));
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
