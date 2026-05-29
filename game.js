// ======================
// RAYO WAR - PASSIVE WARFARE SYSTEM
// ======================

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
        victoria: 'Victory',
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
    document.getElementById('loginTab').classList.remove('active');
    document.getElementById('registerTab').classList.remove('active');
    document.getElementById(tab + 'Tab').classList.add('active');
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
        showAuthScreen();
    }
}

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

function showAuthMessage(message, type) {
    const messageEl = document.getElementById('authMessage');
    messageEl.textContent = message;
    messageEl.className = 'auth-message ' + type;
}

function showAuthScreen() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('gameScreen').style.display = 'none';
}

function showGameScreen() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'flex';
    updateUI();
}

// ======================
// CARGAR DATOS DE LA NACIÓN
// ======================

async function loadNationData() {
    try {
        const nacionRef = doc(db, "naciones", currentUser);
        const nacionSnap = await getDoc(nacionRef);

        if (nacionSnap.exists()) {
            currentNation = nacionSnap.data();
            currentNation.id = currentUser;
            
            // Inicializar unidades militares si no existen
            if (!currentNation.ejercito) {
                currentNation.ejercito = {
                    soldados: 0,
                    tanques: 0,
                    aviones: 0
                };
            }

            calculatePassiveProduction();
            
            // PROCESAMIENTO PASIVO DE ATAQUES
            await processPendingAttacks();
            
            await loadAllNations();
            updateUI();
        } else {
            console.error("❌ Nación no encontrada");
        }
    } catch (error) {
        console.error("❌ Error cargando datos:", error);
    }
}

// ======================
// PROCESAMIENTO PASIVO DE ATAQUES
// ======================

async function processPendingAttacks() {
    try {
        // Buscar ataques pendientes contra esta nación
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

            // Calcular resultado de la batalla
            const attackPower = (attack.tropas_enviadas.soldados * 10) + 
                               (attack.tropas_enviadas.tanques * 100) + 
                               (attack.tropas_enviadas.aviones * 500);

            const defensePower = (currentNation.ejercito.soldados * 10) + 
                                (currentNation.ejercito.tanques * 100) + 
                                (currentNation.ejercito.aviones * 500);

            const randomFactor = Math.random() * 0.2 + 0.9;
            const adjustedAttackPower = attackPower * randomFactor;
            const isVictory = adjustedAttackPower > defensePower;

            // Aplicar daño
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

            // Marcar ataque como procesado
            const attackRef = doc(db, "ataques", attack.docId);
            await updateDoc(attackRef, { procesado: true });
        }

        // Guardar cambios en la nación
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
    const costs = {
        soldados: 50,
        tanques: 500,
        aviones: 2000
    };

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

        console.log(`✅ ${unitType} reclutado`);
        updateUI();
    } catch (error) {
        console.error("❌ Error reclutando:", error.message);
    }
}

// ======================
// CALCULAR PODER MILITAR
// ======================

function calculateMilitaryPower(nation) {
    if (!nation.ejercito) return 0;
    return (nation.ejercito.soldados * 10) + (nation.ejercito.tanques * 100) + (nation.ejercito.aviones * 500);
}

// ======================
// LANZAR ATAQUE (CREAR DOCUMENTO EN COLECCIÓN ATAQUES)
// ======================

async function attackNation(targetId) {
    if (!currentNation.ejercito || (currentNation.ejercito.soldados + currentNation.ejercito.tanques + currentNation.ejercito.aviones) === 0) {
        alert('❌ ' + t('noUnidades'));
        return;
    }

    const targetNation = allNations.find(n => n.id === targetId);
    if (!targetNation) {
        alert('❌ Nación no encontrada');
        return;
    }

    if (targetId === currentUser) {
        alert('❌ No puedes atacarte a ti mismo');
        return;
    }

    try {
        // PASO 1: Restar tropas del atacante
        const batch = writeBatch(db);
        const nacionRef = doc(db, "naciones", currentUser);

        batch.update(nacionRef, {
            ejercito: currentNation.ejercito,
            ultima_conexion: new Date()
        });

        await batch.commit();

        // PASO 2: Crear documento de ataque en la colección "ataques"
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
        
        // Recargar datos
        await loadNationData();
    } catch (error) {
        console.error("❌ Error lanzando ataque:", error.message);
        alert('❌ ' + t('ataqueFallido'));
    }
}

// ======================
// MEJORAR EDIFICIOS
// ======================

async function upgradeBuilding(buildingType) {
    const costs = {
        factories: 500,
        powerPlants: 600,
        farms: 400,
        mines: 700,
        refineries: 800
    };

    const cost = costs[buildingType];

    if (currentNation.dinero < cost) {
        alert('❌ ' + t('dineroInsuficiente'));
        return;
    }

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

        console.log(`✅ ${buildingType} mejorado`);
        updateUI();
    } catch (error) {
        console.error("❌ Error mejorando edificio:", error.message);
    }
}

// ======================
// MEJORAR SERVICIOS
// ======================

async function upgradeService(serviceType) {
    const costs = {
        hospitals: 800,
        police: 600,
        firefighters: 700,
        schools: 500
    };

    const cost = costs[serviceType];

    if (currentNation.dinero < cost) {
        alert('❌ ' + t('dineroInsuficiente'));
        return;
    }

    try {
        const batch = writeBatch(db);
        const nacionRef = doc(db, "naciones", currentUser);

        let updates = {
            dinero: currentNation.dinero - cost,
            [`edificios.${serviceType}`]: currentNation.edificios[serviceType] + 1,
            ultima_conexion: new Date()
        };

        if (serviceType === 'hospitals') {
            updates.salud = Math.min(100, currentNation.salud + 5);
        } else if (serviceType === 'police') {
            updates.seguridad = Math.min(100, currentNation.seguridad + 5);
        } else if (serviceType === 'firefighters') {
            updates.seguridad = Math.min(100, currentNation.seguridad + 3);
        } else if (serviceType === 'schools') {
            updates.felicidad = Math.min(100, currentNation.felicidad + 3);
        }

        batch.update(nacionRef, updates);
        await batch.commit();

        currentNation.dinero -= cost;
        currentNation.edificios[serviceType]++;

        console.log(`✅ ${serviceType} construido`);
        updateUI();
    } catch (error) {
        console.error("❌ Error construyendo servicio:", error.message);
    }
}

// ======================
// CONSTRUIR CIUDAD
// ======================

async function buildCity() {
    const cityName = prompt('Nombre de la ciudad:');
    if (!cityName) return;

    const cost = 1000;
    if (currentNation.dinero < cost) {
        alert('❌ ' + t('dineroInsuficiente'));
        return;
    }

    try {
        const batch = writeBatch(db);
        const nacionRef = doc(db, "naciones", currentUser);

        const newCity = {
            name: cityName,
            population: 100,
            buildings: { factories: 0, mines: 0, farms: 0 }
        };

        batch.update(nacionRef, {
            dinero: currentNation.dinero - cost,
            ciudades: [...currentNation.ciudades, newCity],
            ultima_conexion: new Date()
        });

        await batch.commit();

        currentNation.dinero -= cost;
        currentNation.ciudades.push(newCity);

        alert('✅ ' + t('ciudadCreada') + ': ' + cityName);
        updateUI();
    } catch (error) {
        console.error("❌ Error construyendo ciudad:", error.message);
    }
}

// ======================
// CAMBIAR IDIOMA
// ======================

function changeLanguage(lang) {
    currentLanguage = lang;
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-lang="${lang}"]`).classList.add('active');
    updateUI();
}

// ======================
// CAMBIAR TABS
// ======================

function switchTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));

    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }

    const buttons = document.querySelectorAll('.nav-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    if (tabName === 'war') {
        updateRankingDisplay();
    }
}

// ======================
// ACTUALIZAR RANKING
// ======================

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
    document.getElementById('rankingList').innerHTML = rankingHTML;

    // Mostrar ataques pendientes procesados
    if (pendingAttacks.length > 0) {
        let attacksHTML = '<h3>' + t('ataquesPendientes') + '</h3><div class="attacks-list">';

        pendingAttacks.forEach((attack) => {
            const resultIcon = attack.resultado === 'victoria' ? '✅' : '❌';
            const resultText = attack.resultado === 'victoria' ? t('victoria') : t('derrota');

            attacksHTML += `
                <div class="attack-item ${attack.resultado}">
                    <p>${resultIcon} <strong>${attack.nombre_atacante}</strong> te atacó</p>
                    <p>Resultado: ${resultText}</p>
                    <p>Botín perdido: $${attack.botin}</p>
                </div>
            `;
        });

        attacksHTML += '</div>';
        document.getElementById('attacksLog').innerHTML = attacksHTML;
    }
}

// ======================
// ACTUALIZAR INTERFAZ
// ======================

function updateUI() {
    if (!currentNation) return;

    // ACTUALIZAR MAPA
    const worldMap = document.getElementById('worldMap');
    if (worldMap) {
        const territory = currentNation.territorio;
        // Simulación de mapa usando una imagen de placeholder con el nombre del territorio
        worldMap.style.backgroundImage = `url('https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&q=80&w=1000')`; 
        worldMap.innerHTML = `
            <div class="map-overlay">📍 Territorio: ${territory}</div>
            <div style="color: white; font-size: 1.5rem; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">
                MAPA ESTRATÉGICO: ${territory.toUpperCase()}
            </div>
        `;
    }

    // SIDEBAR
    document.getElementById('sidebarMoney').innerText = '$' + Math.floor(currentNation.dinero);
    document.getElementById('sidebarPopulation').innerText = Math.floor(currentNation.poblacion);
    document.getElementById('nationName').innerText = currentNation.nombre + ' (' + currentNation.territorio + ')';

    // OVERVIEW
    document.getElementById('overviewNation').innerText = currentNation.nombre;
    document.getElementById('overviewTerritory').innerText = currentNation.territorio;
    document.getElementById('overviewGovernment').innerText = currentNation.gobierno;
    document.getElementById('overviewPopulation').innerText = Math.floor(currentNation.poblacion);
    document.getElementById('overviewMoney').innerText = '$' + Math.floor(currentNation.dinero);
    document.getElementById('overviewHappiness').innerText = Math.floor(currentNation.felicidad) + '%';
    document.getElementById('overviewHealth').innerText = Math.floor(currentNation.salud) + '%';
    document.getElementById('overviewSecurity').innerText = Math.floor(currentNation.seguridad) + '%';

    // RECURSOS
    let resourcesHTML = '<h3>Recursos Abundantes:</h3>';
    for (let resource in currentNation.recursos) {
        resourcesHTML += '<p>' + resource + ': ' + currentNation.recursos[resource] + '%</p>';
    }
    document.getElementById('abundantResources').innerHTML = resourcesHTML;

    // INFRAESTRUCTURA
    document.getElementById('factoriesLevel').innerText = currentNation.edificios.factories;
    document.getElementById('factoriesProduction').innerText = '+' + Math.floor(currentNation.edificios.factories * 5);

    document.getElementById('powerLevel').innerText = currentNation.edificios.powerPlants;
    document.getElementById('powerProduction').innerText = '+' + Math.floor(currentNation.edificios.powerPlants * 10);

    document.getElementById('farmsLevel').innerText = currentNation.edificios.farms;
    document.getElementById('farmsProduction').innerText = '+' + Math.floor(currentNation.edificios.farms * 8);

    document.getElementById('minesLevel').innerText = currentNation.edificios.mines;
    document.getElementById('minesProduction').innerText = '+' + Math.floor(currentNation.edificios.mines * 5);

    document.getElementById('refineriesLevel').innerText = currentNation.edificios.refineries;
    document.getElementById('refineriesProduction').innerText = '+' + Math.floor(currentNation.edificios.refineries * 5);

    // SERVICIOS
    document.getElementById('hospitalsLevel').innerText = currentNation.edificios.hospitals;
    document.getElementById('policeLevel').innerText = currentNation.edificios.police;
    document.getElementById('firefightersLevel').innerText = currentNation.edificios.firefighters;
    document.getElementById('schoolsLevel').innerText = currentNation.edificios.schools;

    // EJÉRCITO
    const militaryPower = calculateMilitaryPower(currentNation);
    document.getElementById('soldadosLevel').innerText = currentNation.ejercito.soldados;
    document.getElementById('tanquesLevel').innerText = currentNation.ejercito.tanques;
    document.getElementById('avionesLevel').innerText = currentNation.ejercito.aviones;
    document.getElementById('militaryPowerDisplay').innerText = militaryPower;

    // CIUDADES
    let citiesHTML = '<h3>Ciudades:</h3>';
    if (currentNation.ciudades.length === 0) {
        citiesHTML += '<p>-</p>';
    } else {
        currentNation.ciudades.forEach(city => {
            citiesHTML += '<p>🏙️ ' + city.name + ' (Pop: ' + city.population + ')</p>';
        });
    }
    document.getElementById('citiesList').innerHTML = citiesHTML;
}

// ======================
// INICIALIZAR
// ======================

showAuthScreen();

// ======================
// MONITOREAR AUTENTICACIÓN
// ======================

setupAuthListener((authState) => {
    if (authState.authenticated) {
        currentUser = authState.uid;
        console.log("🎮 Autenticación detectada, cargando datos de nación...");
        loadNationData();
        showGameScreen();
    } else {
        showAuthScreen();
    }
});

// ======================
// EXPORTAR FUNCIONES AL OBJETO GLOBAL (window)
// ======================
// Esto permite que el HTML pueda llamar a estas funciones
// cuando usa type="module" en los scripts

window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
window.switchAuthTab = switchAuthTab;
window.switchToRegister = switchToRegister;
window.switchToLogin = switchToLogin;
window.upgradeService = upgradeService;
window.upgradeBuilding = upgradeBuilding;
window.buildCity = buildCity;
window.changeLanguage = changeLanguage;
window.switchTab = switchTab;
window.recruitUnit = recruitUnit;
window.attackNation = attackNation;
window.updateRankingDisplay = updateRankingDisplay;
window.updateUI = updateUI;
window.loadNationData = loadNationData;
window.showAuthScreen = showAuthScreen;
window.showGameScreen = showGameScreen;

