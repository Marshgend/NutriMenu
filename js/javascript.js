/************************************************************
 * Nutri Planner - Sistema simplificado con una sola tarjeta
 * Navegación con botones de flecha - VERSIÓN MEJORADA
 ************************************************************/

const CATEGORY_ORDER = ["breakfast", "snack1", "lunch", "snack2", "dinner"];
const TOTAL_DAYS = 7;

// --- INICIO DE CAMBIO: Claves de LocalStorage ---
const STATE_KEY = "nutriSelectionStateDark";
const MANUAL_MENUS_KEY = "nutriManualMenus";
const MENU_SOURCE_KEY = "nutriMenuSource";
// --- FIN DE CAMBIO ---

let originalMenus = {
  breakfast: [],
  snack: [],
  lunch: [],
  dinner: [],
};

let allMenus = {
  breakfast: [],
  snack1: [],
  snack2: [],
  lunch: [],
  dinner: [],
};

let selectionState = {};
let currentMenuIndex = 0; // Índice de la tarjeta actual

// Inicialización
window.addEventListener("DOMContentLoaded", init);

function init() {
  // 1. Verificar si es un resumen compartido
  const sharedData = checkForSharedSummary();
  if (sharedData) {
    try {
      const decoded = JSON.parse(atob(sharedData));
      selectionState = decoded;
      hideLoading();
      renderSharedSummary();
      return;
    } catch (err) {
      console.error("Error al decodificar resumen compartido:", err);
      hideLoading();
      showModal("No se pudo decodificar el resumen compartido.");
    }
  }

  // 2. Cargar estado (selecciones)
  loadStateFromLocalStorage();
  ensureSelectionStateIntegrity();

  const menuSource = localStorage.getItem(MENU_SOURCE_KEY);

  if (menuSource === "manual") {
    // 3a. Si la fuente es manual, cargar desde localStorage
    console.log("Cargando menús manuales desde localStorage...");
    const manualMenusData = localStorage.getItem(MANUAL_MENUS_KEY);
    if (manualMenusData) {
      try {
        originalMenus = JSON.parse(manualMenusData);
        setupAppFromLoadedMenus();
        return;
      } catch (e) {
        console.error("Error al parsear menús manuales de localStorage", e);
        localStorage.removeItem(MANUAL_MENUS_KEY);
        localStorage.removeItem(MENU_SOURCE_KEY);
      }
    }
  }

  // 3b. Si la fuente es 'directory', 'null', o si 'manual' falló, cargar desde directorio
  console.log("Cargando menús desde directorio...");
  loadMenusFromDirectory(true);

  // 4. Listener para carga inicial (clic)
  const initialInput = document.getElementById('initial-load-input');
  if (initialInput) {
    initialInput.addEventListener('change', handleJsonFileSelect);
  }

  // --- INICIO DE CAMBIO: Listeners para Drag and Drop ---
  const dropOverlay = document.getElementById('drag-drop-overlay');
  const initialDropZone = document.getElementById('initial-load-container');

  // Mostrar overlay cuando arrastras sobre la ventana
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropOverlay.classList.remove('hidden');
    initialDropZone.classList.add('drag-over'); // Resaltar también zona inicial
  });

  // Ocultar overlay si el drag sale de la ventana
  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) {
      dropOverlay.classList.add('hidden');
      initialDropZone.classList.remove('drag-over');
    }
  });

  // Manejar el soltar archivo
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dropOverlay.classList.add('hidden');
    initialDropZone.classList.remove('drag-over');
    handleDroppedFiles(e.dataTransfer.files);
  });
  // --- FIN DE CAMBIO ---
}

// Carga desde json_directory.json
function loadMenusFromDirectory(isInitialLoad = false) {
  fetch("json_directory.json")
    .then((res) => {
      if (!res.ok) throw new Error("No se pudo cargar el directorio de menús");
      return res.json();
    })
    .then((directoryData) => {
      const files = directoryData.jsonFiles || [];
      console.log("Archivos JSON a cargar:", files);

      if (isInitialLoad && files.length === 0) {
        console.warn("No se encontraron archivos en json_directory.json.");
        hideLoading(true);
        showInitialLoadButton();
        return Promise.reject("No files");
      }
      
      localStorage.setItem(MENU_SOURCE_KEY, "directory");
      localStorage.removeItem(MANUAL_MENUS_KEY);
      
      return loadAllJsonMenus(files);
    })
    .then((loadResult) => {
      setupAppFromLoadedMenus(loadResult);
    })
    .catch((err) => {
      if (err === "No files") return;
      console.error("Error al cargar menús:", err);
      if (isInitialLoad) {
        hideLoading(true);
        showInitialLoadButton();
      } else {
        hideLoading();
        showModal("Error al cargar la lista de archivos JSON.");
      }
    });
}

function setupAppFromLoadedMenus(loadResult = null) {
  hideLoading();
  if (loadResult && loadResult.errors && loadResult.errors.length > 0) {
    showModal(`Algunos menús no se pudieron cargar: ${loadResult.errors.join(', ')}`);
  }

  if (selectionState.shuffledMenus && selectionState.shuffledMenus.breakfast.length > 0) {
      console.log("Restaurando menús barajados y estado 'isUsed' desde localStorage.");
      allMenus = deepClone(selectionState.shuffledMenus);
  } else {
      console.log("Creando nuevos menús barajados.");
      copyOriginalToAllMenus_NoShuffle();
      shuffleAllMenus();
      CATEGORY_ORDER.forEach(catKey => {
        if (allMenus[catKey]) {
          allMenus[catKey].forEach((menu, index) => {
            menu.uniqueId = `${catKey}-${index}-${menu.menuName.replace(/\s/g, '')}`;
            menu.isUsed = false; 
          });
        }
      });
      selectionState.shuffledMenus = deepClone(allMenus);
  }

  if (selectionState.currentMenuIndex !== undefined) {
    currentMenuIndex = selectionState.currentMenuIndex;
  }

  saveStateToLocalStorage();
  console.log("Menús finales listos:", allMenus);
  renderApp();
}


function hideLoading(keepOverlay = false) {
  const loading = document.getElementById("loading");
  if (loading) {
    if (keepOverlay) {
      const spinner = loading.querySelector('.loading-spinner');
      const p = loading.querySelector('p');
      if (spinner) spinner.classList.add("hidden");
      if (p) p.classList.add("hidden");
    } else {
      loading.classList.add("hidden");
    }
  }
}

function showInitialLoadButton() {
  const container = document.getElementById('initial-load-container');
  if (container) {
    container.classList.remove('hidden');
  }
}

// --- INICIO DE CAMBIO: Lógica de Carga Refactorizada ---

// 1. Wrapper para el <input type="file"> (clic)
function handleJsonFileSelect(event) {
  const files = event.target.files;
  if (!files || files.length === 0) {
    showModal("No se seleccionaron archivos.");
    return;
  }
  readAndProcessFiles(files); // Llamar a la función núcleo
  event.target.value = null; // Resetear input
}

// 2. Wrapper para Drag and Drop
function handleDroppedFiles(files) {
  if (!files || files.length === 0) {
    showModal("No se soltaron archivos.");
    return;
  }
  readAndProcessFiles(files); // Llamar a la función núcleo
}

// 3. Función Núcleo que leen la FileList
function readAndProcessFiles(files) {
  // Filtrar solo archivos JSON
  const jsonFiles = Array.from(files).filter(file => file.type === "application/json" || file.name.endsWith('.json'));

  if (jsonFiles.length === 0) {
    showModal("No se encontraron archivos .json válidos. Asegúrate de que los archivos tengan la extensión .json.");
    return;
  }

  const readPromises = [];
  for (const file of jsonFiles) {
    readPromises.push(new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const menuData = JSON.parse(e.target.result);
          resolve(menuData);
        } catch (err) {
          reject(`Error al parsear ${file.name}: ${err.message}`);
        }
      };
      reader.onerror = () => reject(`Error al leer ${file.name}`);
      reader.readAsText(file);
    }));
  }

  Promise.all(readPromises)
    .then(allMenuData => {
      console.log("Todos los JSON cargados:", allMenuData);
      processLoadedMenus(allMenuData); // Función que ya teníamos
    })
    .catch(err => {
      console.error("Error al cargar archivos JSON:", err);
      showModal(`Error al cargar archivos: ${err}`);
    });
}
// --- FIN DE CAMBIO ---

function processLoadedMenus(menuDataArray) {
  originalMenus = { breakfast: [], snack: [], lunch: [], dinner: [] };
  let menusAdded = 0;
  
  menuDataArray.forEach(menuData => {
    if (!menuData || typeof menuData !== "object") return;
    Object.keys(menuData).forEach((key) => {
      if (key === "id") return;
      let targetKey = key.toLowerCase();
      if (targetKey.startsWith("snack")) targetKey = "snack";
      if (!originalMenus[targetKey]) originalMenus[targetKey] = [];
      if (Array.isArray(menuData[key])) {
        const validMenus = menuData[key].filter(
          (m) =>
            m &&
            typeof m.menuName === "string" &&
            Array.isArray(m.dishes) &&
            m.dishes.length > 0
        );
        originalMenus[targetKey].push(...validMenus);
        menusAdded += validMenus.length;
      }
    });
  });

  if (menusAdded === 0) {
    showModal("Los archivos JSON no contienen menús válidos.");
    return;
  }

  console.log("Guardando menús manuales en localStorage...");
  localStorage.setItem(MANUAL_MENUS_KEY, JSON.stringify(originalMenus));
  localStorage.setItem(MENU_SOURCE_KEY, "manual");
  
  resetAndSetupApp();
}

function resetAndSetupApp() {
  hideLoading();
  initializeSelectionState(); 
  copyOriginalToAllMenus_NoShuffle();
  shuffleAllMenus();
  
  CATEGORY_ORDER.forEach(catKey => {
    if (allMenus[catKey]) {
      allMenus[catKey].forEach((menu, index) => {
        menu.uniqueId = `${catKey}-${index}-${menu.menuName.replace(/\s/g, '')}`;
        menu.isUsed = false; 
      });
    }
  });

  selectionState.shuffledMenus = deepClone(allMenus);
  
  currentMenuIndex = 0;
  selectionState.currentMenuIndex = 0;

  saveStateToLocalStorage(); 
  
  console.log("Menús finales (manual):", allMenus);
  renderApp();
}

function loadAllJsonMenus(fileList) {
  const errors = [];
  const promises = fileList.map((file) =>
    fetch(file)
      .then((r) => {
        if (!r.ok) throw new Error(`Error al cargar ${file}: ${r.statusText}`);
        return r.json();
      })
      .then((menuData) => {
        if (!menuData || typeof menuData !== "object") {
          errors.push(`Archivo inválido: ${file}`);
          return;
        }
        Object.keys(menuData).forEach((key) => {
          if (key === "id") return;
          let targetKey = key.toLowerCase();
          if (targetKey.startsWith("snack")) targetKey = "snack";
          if (!originalMenus[targetKey]) originalMenus[targetKey] = [];
          if (Array.isArray(menuData[key])) {
            const validMenus = menuData[key].filter(
              (m) =>
                m &&
                typeof m.menuName === "string" &&
                Array.isArray(m.dishes) &&
                m.dishes.length > 0
            );
            originalMenus[targetKey].push(...validMenus);
          }
        });
      })
      .catch((err) => {
        errors.push(`Error al cargar el archivo ${file}: ${err.message}`);
      })
  );
  return Promise.all(promises).then(() => ({ errors }));
}

// Funciones de estado
function initializeSelectionState() {
  selectionState = {
    initialized: true,
    breakfast: [],
    snack1: [],
    lunch: [],
    snack2: [],
    dinner: [],
    completedCategories: {
      breakfast: 0,
      snack1: 0,
      lunch: 0,
      snack2: 0,
      dinner: 0,
    },
    currentCategoryIndex: 0,
    currentMenuIndex: 0,
    tempSelections: {},
    tempDaysSelection: null,
    shuffledMenus: null,
    globalUndoHistory: [],
  };
}

function saveStateToLocalStorage() {
  try {
    selectionState.currentMenuIndex = currentMenuIndex;
    
    if (allMenus.breakfast.length > 0) { 
       selectionState.shuffledMenus = deepClone(allMenus);
    }
    
    localStorage.setItem(STATE_KEY, JSON.stringify(selectionState));
    console.log("Estado guardado:", selectionState);
  } catch (e) {
    console.error("Error al guardar estado:", e);
  }
}

function loadStateFromLocalStorage() {
  const data = localStorage.getItem(STATE_KEY);
  if (data) {
    try {
      selectionState = JSON.parse(data);
      console.log("Estado cargado:", selectionState);
      if (selectionState.currentMenuIndex !== undefined) {
        currentMenuIndex = selectionState.currentMenuIndex;
      }
    } catch (err) {
      console.error("Error al cargar estado:", err);
      selectionState = {};
    }
  }
}

function ensureSelectionStateIntegrity() {
  if (!selectionState || typeof selectionState !== "object") {
    initializeSelectionState();
    return;
  }
  CATEGORY_ORDER.forEach((cat) => {
    if (!Array.isArray(selectionState[cat])) selectionState[cat] = [];
    if (!selectionState.completedCategories) selectionState.completedCategories = {};
    if (selectionState.completedCategories[cat] === undefined)
      selectionState.completedCategories[cat] = 0;
  });
  if (!selectionState.tempSelections || typeof selectionState.tempSelections !== "object")
    selectionState.tempSelections = {};
  if (selectionState.currentCategoryIndex === undefined)
    selectionState.currentCategoryIndex = 0;
  if (selectionState.currentMenuIndex === undefined)
    selectionState.currentMenuIndex = 0;
  if (!selectionState.initialized) selectionState.initialized = true;
  if (!("shuffledMenus" in selectionState)) selectionState.shuffledMenus = null;
  if (!("tempDaysSelection" in selectionState)) selectionState.tempDaysSelection = null;
  if (!Array.isArray(selectionState.globalUndoHistory))
    selectionState.globalUndoHistory = [];
}

function copyOriginalToAllMenus_NoShuffle() {
  allMenus.breakfast = deepClone(originalMenus.breakfast);
  allMenus.snack1 = deepClone(originalMenus.snack);
  allMenus.snack2 = deepClone(originalMenus.snack);
  allMenus.lunch = deepClone(originalMenus.lunch);
  allMenus.dinner = deepClone(originalMenus.dinner);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function shuffleAllMenus() {
  shuffleArray(allMenus.breakfast);
  shuffleArray(allMenus.snack1);
  shuffleArray(allMenus.snack2);
  shuffleArray(allMenus.lunch);
  shuffleArray(allMenus.dinner);
}

// Funciones de renderizado principal
function renderApp() {
  const appDiv = document.getElementById("app");
  appDiv.innerHTML = "";

  showFloatingButtonReset(() => confirmRestart());

  if (allCategoriesCompleted()) {
    renderSummary();
    return;
  }

  const catIndex = selectionState.currentCategoryIndex;
  const categoryKey = CATEGORY_ORDER[catIndex];
  const usedDays = selectionState.completedCategories[categoryKey];

  if (usedDays >= TOTAL_DAYS) {
    goToNextCategory();
    return;
  }

  // Header
  const header = document.createElement("div");
  header.className = "app-header";
  const title = document.createElement("h1");
  title.className = "app-title";
  title.textContent = "Nutri Planner";
  const subtitle = document.createElement("p");
  subtitle.className = "app-subtitle";
  subtitle.textContent = "Planifica tu semana nutricional";
  header.appendChild(title);
  header.appendChild(subtitle);
  appDiv.appendChild(header);

  const headerActions = document.createElement('div');
  headerActions.className = 'header-actions';
  
  const loadJsonLabel = document.createElement('label');
  loadJsonLabel.className = 'btn btn-secondary btn-load-header';
  loadJsonLabel.textContent = 'Cargar JSON(s)';
  const loadJsonInput = document.createElement('input');
  loadJsonInput.type = 'file';
  loadJsonInput.accept = '.json';
  loadJsonInput.className = 'hidden';
  loadJsonInput.multiple = true;
  loadJsonInput.addEventListener('change', handleJsonFileSelect);
  loadJsonLabel.appendChild(loadJsonInput);
  headerActions.appendChild(loadJsonLabel);

  if (shouldShowAutofill() && !allCategoriesCompleted()) {
    const autoFillBtn = document.createElement('button');
    autoFillBtn.id = 'autofill-button';
    autoFillBtn.className = 'btn btn-primary';
    autoFillBtn.textContent = 'Autocompletar Semana';
    autoFillBtn.addEventListener('click', autoFillWeek);
    headerActions.appendChild(autoFillBtn);
  }
  
  appDiv.appendChild(headerActions);

  // Progress
  appDiv.appendChild(renderProgressBar(categoryKey, usedDays));

  // Sección del carrusel simplificado
  const arrayKey = categoryKey;
  if (!allMenus[arrayKey] || allMenus[arrayKey].length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.className = "empty-state";
    emptyDiv.textContent = "No hay menús disponibles para esta categoría.";
    appDiv.appendChild(emptyDiv);
    return;
  }

  if (currentMenuIndex >= allMenus[arrayKey].length) {
    currentMenuIndex = 0;
    selectionState.currentMenuIndex = currentMenuIndex;
    saveStateToLocalStorage();
  }

  console.log(`Renderizando carrusel simplificado para ${categoryKey} con ${allMenus[arrayKey].length} menús`);
  appDiv.appendChild(renderSimpleCarousel(arrayKey, categoryKey));

  renderDaysSelector();
  updateFloatingButtons();
  if (selectionState.tempDaysSelection) {
    restoreTempDaysSelection();
  }
}

function shouldShowAutofill() {
  const bfast = originalMenus.breakfast.length <= 1;
  const lunch = originalMenus.lunch.length <= 1;
  const dinner = originalMenus.dinner.length <= 1;
  const snack = originalMenus.snack.length <= 2;
  const hasAtLeastOne = originalMenus.breakfast.length > 0 ||
                        originalMenus.lunch.length > 0 ||
                        originalMenus.dinner.length > 0 ||
                        originalMenus.snack.length > 0;
  return bfast && lunch && dinner && snack && hasAtLeastOne;
}

function updateFloatingButtons() {
  const catIndex = selectionState.currentCategoryIndex;
  const categoryKey = CATEGORY_ORDER[catIndex];
  const usedDays = selectionState.completedCategories[categoryKey];
  const isLastCategory = catIndex === CATEGORY_ORDER.length - 1;
  const hasSelection = selectionState.tempDaysSelection !== null;

  if (hasSelection) {
    const daysCount = selectionState.tempDaysSelection;
    showFloatingButton(() => confirmSelection(daysCount));
    if (isLastCategory && usedDays + daysCount >= TOTAL_DAYS) {
      document.getElementById('floating-btn-text').textContent = "Ir al Resumen";
    } else {
      document.getElementById('floating-btn-text').textContent = "Continuar";
    }
  } else {
    hideFloatingButton();
  }

  if (canUndo()) {
    showFloatingButtonLeft(() => performUndo());
  } else {
    hideFloatingButtonLeft();
  }
  // El botón de Reiniciar es visible por defecto desde renderApp()
}

function canUndo() {
  if (selectionState.currentCategoryIndex === 0 &&
    selectionState.completedCategories.breakfast === 0 &&
    selectionState.tempDaysSelection === null &&
    (!Array.isArray(selectionState.globalUndoHistory) || selectionState.globalUndoHistory.length === 0)) {
    return false;
  }
  return true;
}

function performUndo() {
  if (selectionState.tempDaysSelection !== null) {
    clearTempDaysSelection();
    return;
  }
  if (Array.isArray(selectionState.globalUndoHistory) && selectionState.globalUndoHistory.length > 0) {
    undoLastSelectionGlobal();
    return;
  }
  showModal("No hay acciones para deshacer.");
}

function renderProgressBar(categoryKey, usedDays) {
  const section = document.createElement("div");
  section.className = "progress-section";
  const card = document.createElement("div");
  card.className = "progress-card";
  const header = document.createElement("div");
  header.className = "progress-header";
  const title = document.createElement("h2");
  title.className = "progress-title";
  title.textContent = mapCategoryToSpanish(categoryKey);
  const counter = document.createElement("span");
  counter.className = "progress-counter";
  counter.textContent = `${usedDays} / ${TOTAL_DAYS} días`;
  header.appendChild(title);
  header.appendChild(counter);
  const progressBar = document.createElement("div");
  progressBar.className = "progress-bar";
  const progressFill = document.createElement("div");
  progressFill.className = "progress-fill";
  const percent = Math.min(usedDays / TOTAL_DAYS, 1);
  progressFill.style.width = `${percent * 100}%`;
  progressBar.appendChild(progressFill);
  card.appendChild(header);
  card.appendChild(progressBar);
  section.appendChild(card);
  return section;
}

function renderSimpleCarousel(arrayKey, categoryKey) {
  const section = document.createElement("div");
  section.className = "carousel-section";
  const sectionTitle = document.createElement("h2");
  sectionTitle.className = "section-title";
  sectionTitle.textContent = "Selecciona tu menú";
  section.appendChild(sectionTitle);

  const menus = allMenus[arrayKey];
  const navigation = document.createElement("div");
  navigation.className = "carousel-navigation";
  const prevBtn = document.createElement("button");
  prevBtn.className = "nav-button";
  prevBtn.innerHTML = "‹";
  prevBtn.addEventListener('click', () => navigateMenu(-1, menus));
  navigation.appendChild(prevBtn);

  const indicator = document.createElement("div");
  indicator.className = "carousel-indicator";
  indicator.id = "carousel-indicator";
  updateIndicator(indicator, currentMenuIndex, menus.length);
  indicator.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown(indicator, menus, categoryKey);
  });
  navigation.appendChild(indicator);

  const nextBtn = document.createElement("button");
  nextBtn.className = "nav-button";
  nextBtn.innerHTML = "›";
  nextBtn.addEventListener('click', () => navigateMenu(1, menus));
  navigation.appendChild(nextBtn);
  section.appendChild(navigation);

  const cardContainer = document.createElement("div");
  cardContainer.className = "single-card-container";
  cardContainer.id = "single-card-container";
  
  const currentCard = createMenuCard(menus[currentMenuIndex], currentMenuIndex, menus.length, categoryKey);
  
  cardContainer.appendChild(currentCard);
  section.appendChild(cardContainer);
  updateNavigationButtons(prevBtn, nextBtn, currentMenuIndex, menus.length);
  return section;
}

function toggleDropdown(indicator, menus, categoryKey) {
  const existingDropdown = document.querySelector('.indicator-dropdown');
  if (existingDropdown) {
    existingDropdown.remove();
    return;
  }
  const dropdown = document.createElement('div');
  dropdown.className = 'indicator-dropdown';
  const indicatorRect = indicator.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  dropdown.style.visibility = 'hidden';
  dropdown.style.position = 'fixed';
  dropdown.style.top = '-9999px';
  document.body.appendChild(dropdown);
  menus.forEach((menu, index) => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.textContent = menu.menuName;
    dropdown.appendChild(item);
  });
  const dropdownWidth = dropdown.offsetWidth;
  dropdown.innerHTML = '';
  dropdown.style.visibility = 'visible';
  dropdown.style.top = 'auto';
  let left = indicatorRect.left + (indicatorRect.width / 2) - (dropdownWidth / 2);
  const margin = 10;
  if (left < margin) {
    left = margin;
  } else if (left + dropdownWidth > viewportWidth - margin) {
    left = viewportWidth - dropdownWidth - margin;
  }
  dropdown.style.left = `${left}px`;
  dropdown.style.top = `${indicatorRect.bottom + 8}px`;

  menus.forEach((menu, index) => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    if (index === currentMenuIndex) {
      item.classList.add('current');
    }
    if (menu.isUsed) {
      item.classList.add('is-used');
    }
    item.textContent = menu.menuName;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToMenu(index, menus, categoryKey);
      dropdown.remove();
    });
    dropdown.appendChild(item);
  });
  
  const closeDropdown = (e) => {
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    if (e.type === 'click' && (indicator.contains(e.target) || dropdown.contains(e.target))) return;
    if (dropdown.parentNode) {
      dropdown.remove();
    }
    document.removeEventListener('click', closeDropdown);
    document.removeEventListener('keydown', closeDropdown);
    window.removeEventListener('scroll', closeDropdown);
    window.removeEventListener('resize', closeDropdown);
  };
  setTimeout(() => {
    document.addEventListener('click', closeDropdown);
    document.addEventListener('keydown', closeDropdown);
    window.addEventListener('scroll', closeDropdown);
    window.addEventListener('resize', closeDropdown);
  }, 10);
}

function navigateToMenu(targetIndex, menus, categoryKey) {
  if (targetIndex >= 0 && targetIndex < menus.length) {
    currentMenuIndex = targetIndex;
    selectionState.currentMenuIndex = currentMenuIndex;
    saveStateToLocalStorage();
    updateDisplayedCard(menus, categoryKey);
    const indicator = document.getElementById("carousel-indicator");
    updateIndicator(indicator, currentMenuIndex, menus.length);
    clearTempDaysSelection();
  }
}

function navigateMenu(direction, menus) {
  const newIndex = currentMenuIndex + direction;
  if (newIndex < 0) {
    currentMenuIndex = menus.length - 1;
  } else if (newIndex >= menus.length) {
    currentMenuIndex = 0;
  } else {
    currentMenuIndex = newIndex;
  }
  selectionState.currentMenuIndex = currentMenuIndex;
  saveStateToLocalStorage();
  
  const catIndex = selectionState.currentCategoryIndex;
  const categoryKey = CATEGORY_ORDER[catIndex];
  updateDisplayedCard(menus, categoryKey);
  
  const indicator = document.getElementById("carousel-indicator");
  updateIndicator(indicator, currentMenuIndex, menus.length);
  clearTempDaysSelection();
}

function updateDisplayedCard(menus, categoryKey) {
  const container = document.getElementById("single-card-container");
  const currentMenu = menus[currentMenuIndex];
  const newCard = createMenuCard(currentMenu, currentMenuIndex, menus.length, categoryKey);
  container.innerHTML = "";
  container.appendChild(newCard);
}

function updateIndicator(indicator, current, total) {
  indicator.textContent = `${current + 1} de ${total}`;
}

function updateNavigationButtons(prevBtn, nextBtn, current, total) {
  prevBtn.disabled = total <= 1;
  nextBtn.disabled = total <= 1;
}

function createMenuCard(menu, originalIndex, totalMenus, categoryKey) {
  const card = document.createElement("div");
  card.className = "menu-card";
  card.dataset.originalIndex = originalIndex;

  if (menu.isUsed) {
    card.classList.add('is-used');
  }

  const cardNumber = document.createElement("div");
  cardNumber.className = "card-number";
  cardNumber.textContent = (originalIndex + 1).toString();
  card.appendChild(cardNumber);
  const content = document.createElement("div");
  content.className = "card-content";
  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = menu.menuName;
  content.appendChild(title);
  const dishesList = document.createElement("div");
  dishesList.className = "dishes-list";
  const visibleDishes = menu.dishes.slice(0, 2);
  const hiddenDishes = menu.dishes.slice(2);
  visibleDishes.forEach(dish => {
    dishesList.appendChild(createDishElement(dish));
  });
  if (hiddenDishes.length > 0) {
    const hiddenContainer = document.createElement("div");
    hiddenContainer.className = "hidden-dishes hidden";
    hiddenDishes.forEach(dish => {
      hiddenContainer.appendChild(createDishElement(dish));
    });
    dishesList.appendChild(hiddenContainer);
    const expandBtn = document.createElement("button");
    expandBtn.className = "expand-toggle";
    expandBtn.innerHTML = `Ver ${hiddenDishes.length} platillo${hiddenDishes.length > 1 ? 's' : ''} más <span class="expand-icon">▼</span>`;
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = hiddenContainer.classList.contains('hidden');
      hiddenContainer.classList.toggle('hidden');
      expandBtn.classList.toggle('expanded');
      expandBtn.innerHTML = isExpanded
        ? `Ver menos <span class="expand-icon">▼</span>`
        : `Ver ${hiddenDishes.length} platillo${hiddenDishes.length > 1 ? 's' : ''} más <span class="expand-icon">▼</span>`;
    });
    dishesList.appendChild(expandBtn);
  }
  content.appendChild(dishesList);
  card.appendChild(content);
  return card;
}

function createDishElement(dish) {
  const dishItem = document.createElement("div");
  dishItem.className = "dish-item";
  const dishName = document.createElement("div");
  dishName.className = "dish-name";
  dishName.textContent = dish.name;
  dishItem.appendChild(dishName);
  const ingredientsList = document.createElement("div");
  ingredientsList.className = "ingredients-list";
  dish.ingredients.forEach(ingredient => {
    const ingredientItem = document.createElement("div");
    ingredientItem.className = "ingredient-item";
    const nameSpan = document.createElement("span");
    nameSpan.className = "ingredient-name";
    nameSpan.textContent = ingredient.name;
    ingredientItem.appendChild(nameSpan);
    if (ingredient.metricQuantity || ingredient.metricUnit) {
      const metricPill = document.createElement("span");
      metricPill.className = "ingredient-pill metric";
      let metricText = "";
      if (ingredient.metricQuantity && ingredient.metricUnit) {
        metricText = `${ingredient.metricQuantity} ${ingredient.metricUnit}`;
      } else if (ingredient.metricQuantity) {
        metricText = `${ingredient.metricQuantity}`;
      } else if (ingredient.metricUnit) {
        metricText = `${ingredient.metricUnit}`;
      }
      metricPill.textContent = metricText;
      ingredientItem.appendChild(metricPill);
    }
    if (ingredient.alternativeQuantity || ingredient.alternativeUnit) {
      const altPill = document.createElement("span");
      altPill.className = "ingredient-pill alternative";
      let altText = "";
      if (ingredient.alternativeQuantity && ingredient.alternativeUnit) {
        altText = `${ingredient.alternativeQuantity} ${ingredient.alternativeUnit}`;
      } else if (ingredient.alternativeQuantity) {
        altText = `${ingredient.alternativeQuantity}`;
      } else if (ingredient.alternativeUnit) {
        altText = `${ingredient.alternativeUnit}`;
      }
      altPill.textContent = altText;
      ingredientItem.appendChild(altPill);
    }
    ingredientsList.appendChild(ingredientItem);
  });
  dishItem.appendChild(ingredientsList);
  return dishItem;
}

function renderDaysSelector() {
  const existingSection = document.querySelector('.days-section');
  if (existingSection) {
    existingSection.remove();
  }
  const catIndex = selectionState.currentCategoryIndex;
  const categoryKey = CATEGORY_ORDER[catIndex];
  const usedDays = selectionState.completedCategories[categoryKey];
  const remainingDays = TOTAL_DAYS - usedDays;
  const section = document.createElement("div");
  section.className = "days-section";
  const sectionTitle = document.createElement("h2");
  sectionTitle.className = "section-title";
  sectionTitle.textContent = `Selecciona cuántos días (${remainingDays} disponibles)`;
  section.appendChild(sectionTitle);

  const helperText = document.createElement("p");
  helperText.className = "section-helper-text";
  helperText.textContent = `Asigna este menú para ${remainingDays > 1 ? `hasta ${remainingDays} días` : '1 día'} de tu semana.`;
  section.appendChild(helperText);

  const timeline = document.createElement("div");
  timeline.className = "days-timeline";
  for (let i = 1; i <= TOTAL_DAYS; i++) {
    const button = document.createElement("button");
    button.className = "day-button";
    button.textContent = i.toString();
    button.dataset.day = i;
    if (i <= usedDays) {
      button.classList.add('used');
      button.disabled = true;
    } else if (i > usedDays + remainingDays) {
      button.classList.add('disabled');
      button.disabled = true;
    } else {
      button.addEventListener('click', () => selectDays(i - usedDays));
    }
    timeline.appendChild(button);
  }
  section.appendChild(timeline);
  const carouselSection = document.querySelector('.carousel-section');
  if (carouselSection) {
    carouselSection.insertAdjacentElement('afterend', section);
  }
}

function selectDays(daysCount) {
  const catIndex = selectionState.currentCategoryIndex;
  const categoryKey = CATEGORY_ORDER[catIndex];
  const usedDays = selectionState.completedCategories[categoryKey];
  selectionState.tempDaysSelection = daysCount;
  saveStateToLocalStorage();
  const dayButtons = document.querySelectorAll('.day-button');
  dayButtons.forEach((button, index) => {
    const dayNumber = index + 1;
    button.classList.remove('selected');
    if (dayNumber > usedDays && dayNumber <= usedDays + daysCount) {
      button.classList.add('selected');
    }
  });
  updateFloatingButtons();
}

function restoreTempDaysSelection() {
  if (selectionState.tempDaysSelection) {
    const daysCount = selectionState.tempDaysSelection;
    const catIndex = selectionState.currentCategoryIndex;
    const categoryKey = CATEGORY_ORDER[catIndex];
    const usedDays = selectionState.completedCategories[categoryKey];
    const dayButtons = document.querySelectorAll('.day-button');
    dayButtons.forEach((button, index) => {
      const dayNumber = index + 1;
      button.classList.remove('selected');
      if (dayNumber > usedDays && dayNumber <= usedDays + daysCount) {
        button.classList.add('selected');
      }
    });
    updateFloatingButtons();
  }
}

function clearTempDaysSelection() {
  selectionState.tempDaysSelection = null;
  saveStateToLocalStorage();
  const dayButtons = document.querySelectorAll('.day-button');
  dayButtons.forEach(button => {
    button.classList.remove('selected');
  });
  updateFloatingButtons();
}

function confirmSelection(daysCount) {
  const catIndex = selectionState.currentCategoryIndex;
  const categoryKey = CATEGORY_ORDER[catIndex];
  const arrayKey = categoryKey;
  if (currentMenuIndex >= allMenus[arrayKey].length) {
    showModal("Selección inválida.");
    return;
  }
  const chosenMenu = allMenus[arrayKey][currentMenuIndex];
  
  selectionState[categoryKey].push({
    menuName: chosenMenu.menuName,
    daysUsed: daysCount,
    dishes: chosenMenu.dishes,
    uniqueId: chosenMenu.uniqueId
  });
  selectionState.completedCategories[categoryKey] += daysCount;
  
  chosenMenu.isUsed = true;
  const persistedMenu = selectionState.shuffledMenus[arrayKey].find(m => m.uniqueId === chosenMenu.uniqueId);
  if (persistedMenu) {
    persistedMenu.isUsed = true;
  }

  selectionState.globalUndoHistory = selectionState.globalUndoHistory || [];
  selectionState.globalUndoHistory.push({
    category: categoryKey,
    menu: deepClone(chosenMenu),
    menuIndex: currentMenuIndex,
    daysUsed: daysCount,
    previousCategoryIndex: selectionState.currentCategoryIndex,
    previousMenuIndex: currentMenuIndex,
    uniqueId: chosenMenu.uniqueId
  });

  selectionState.tempDaysSelection = null;
  selectionState.currentMenuIndex = currentMenuIndex;
  saveStateToLocalStorage();
  
  if (selectionState.completedCategories[categoryKey] >= TOTAL_DAYS) {
    goToNextCategory();
  } else {
    renderApp();
  }
}

function showFloatingButton(onClick) {
  const btn = document.getElementById('floating-btn');
  btn.classList.remove('hidden');
  btn.onclick = onClick;
}

function showFloatingButtonLeft(onClick) {
  const btn = document.getElementById('floating-btn-left');
  btn.classList.remove('hidden');
  btn.onclick = onClick;
}

function showFloatingButtonReset(onClick) {
  const btn = document.getElementById('floating-btn-reset');
  btn.classList.remove('hidden');
  btn.onclick = onClick;
}

function hideFloatingButtonReset() {
  const btn = document.getElementById('floating-btn-reset');
  btn.classList.add('hidden');
  btn.onclick = null;
}

function hideFloatingButtons() {
  hideFloatingButton();
  hideFloatingButtonLeft();
  hideFloatingButtonReset(); 
}

function hideFloatingButton() {
  const btn = document.getElementById('floating-btn');
  btn.classList.add('hidden');
  btn.onclick = null;
}

function hideFloatingButtonLeft() {
  const btn = document.getElementById('floating-btn-left');
  btn.classList.add('hidden');
  btn.onclick = null;
}

function goToNextCategory() {
  selectionState.currentCategoryIndex++;
  currentMenuIndex = 0;
  selectionState.currentMenuIndex = currentMenuIndex;
  selectionState.tempDaysSelection = null;
  saveStateToLocalStorage();
  renderApp();
}

function allCategoriesCompleted() {
  return CATEGORY_ORDER.every(
    (cat) => selectionState.completedCategories[cat] >= TOTAL_DAYS
  );
}

function undoLastSelectionGlobal() {
  if (!Array.isArray(selectionState.globalUndoHistory) || selectionState.globalUndoHistory.length === 0) {
    return;
  }
  const last = selectionState.globalUndoHistory.pop();
  const { category, menu, menuIndex, daysUsed, previousCategoryIndex, previousMenuIndex, uniqueId } = last;

  if (Array.isArray(selectionState[category]) && selectionState[category].length > 0) {
    selectionState[category].pop();
    selectionState.completedCategories[category] -= daysUsed;

    const isStillUsed = selectionState[category].some(sel => sel.uniqueId === uniqueId);
    
    if (!isStillUsed) {
      const menuInAllMenus = allMenus[category].find(m => m.uniqueId === uniqueId);
      if (menuInAllMenus) {
        menuInAllMenus.isUsed = false;
      }
      const menuInShuffled = selectionState.shuffledMenus[category].find(m => m.uniqueId === uniqueId);
      if (menuInShuffled) {
        menuInShuffled.isUsed = false;
      }
    }
  }

  if (previousCategoryIndex !== undefined) {
    selectionState.currentCategoryIndex = previousCategoryIndex;
  }
  if (previousMenuIndex !== undefined) {
    currentMenuIndex = previousMenuIndex;
    selectionState.currentMenuIndex = currentMenuIndex;
  }
  selectionState.tempDaysSelection = null;
  saveStateToLocalStorage();
  
  if (!allCategoriesCompleted()) {
    renderApp();
  } else {
    renderSummary();
  }
}

function renderSummary() {
  const appDiv = document.getElementById("app");
  appDiv.innerHTML = "";
  
  showFloatingButtonReset(() => confirmRestart());
  
  const section = document.createElement("div");
  section.className = "summary-section";
  const title = document.createElement("h1");
  title.className = "summary-title";
  title.textContent = "Resumen de tu Semana";
  section.appendChild(title);
  
  const topActions = document.createElement("div");
  topActions.className = "summary-actions-top";
  
  const copyBtn = document.createElement("button");
  copyBtn.className = "btn btn-primary";
  copyBtn.textContent = "Copiar Resumen";
  copyBtn.addEventListener('click', copySummaryToClipboard);
  topActions.appendChild(copyBtn);
  
  const shareBtn = document.createElement("button");
  shareBtn.className = "btn btn-primary";
  shareBtn.textContent = "Compartir Link";
  shareBtn.addEventListener('click', shareSummaryLink);
  topActions.appendChild(shareBtn);

  // --- INICIO DE CAMBIO: Botones de IA (Gemini) ---
  const geminiListBtn = document.createElement("a"); // Cambiado a <a> para click derecho
  geminiListBtn.className = "btn btn-ia";
  geminiListBtn.textContent = "Crear Lista de Súper (IA)";
  geminiListBtn.href = "https://gemini.google.com"; // Link base
  geminiListBtn.target = "_blank"; // Abrir en nueva pestaña
  geminiListBtn.addEventListener('click', (e) => {
      e.preventDefault(); // Prevenir navegación inmediata
      handleAiPrompt('assets/aiprompt_shopping_list.txt');
  });
  topActions.appendChild(geminiListBtn);

  const geminiNotionBtn = document.createElement("a"); // Cambiado a <a>
  geminiNotionBtn.className = "btn btn-ia";
  geminiNotionBtn.textContent = "Enviar a Notion (IA)";
  geminiNotionBtn.href = "https://gemini.google.com"; // Link base
  geminiNotionBtn.target = "_blank"; // Abrir en nueva pestaña
  geminiNotionBtn.addEventListener('click', (e) => {
      e.preventDefault(); // Prevenir navegación inmediata
      handleAiPrompt('assets/aiprompt_to_notion.txt');
  });
  topActions.appendChild(geminiNotionBtn);
  // --- FIN DE CAMBIO ---

  section.appendChild(topActions);

  const grid = document.createElement("div");
  grid.className = "summary-grid";
  CATEGORY_ORDER.forEach((cat) => {
    if (selectionState[cat].length > 0) {
      const categorySection = document.createElement("div");
      categorySection.className = "category-section";
      const categoryTitle = document.createElement("h2");
      categoryTitle.className = "category-title";
      categoryTitle.textContent = mapCategoryToSpanish(cat);
      categorySection.appendChild(categoryTitle);
      selectionState[cat].forEach((sel) => {
        categorySection.appendChild(renderMenuSummary(sel));
      });
      grid.appendChild(categorySection);
    }
  });
  section.appendChild(grid);
  appDiv.appendChild(section);
  updateFloatingButtonsForSummary();
}

function updateFloatingButtonsForSummary() {
  hideFloatingButton();
  
  if (Array.isArray(selectionState.globalUndoHistory) &&
    selectionState.globalUndoHistory.length > 0) {
    showFloatingButtonLeft(() => performUndo());
  } else {
    hideFloatingButtonLeft();
  }
  // El botón de Reiniciar ya es visible
}

function renderMenuSummary(sel) {
  const summary = document.createElement("div");
  summary.className = "menu-summary"; 
  const title = document.createElement("div");
  title.className = "menu-summary-title";
  title.textContent = `${sel.menuName} - ${sel.daysUsed} día${sel.daysUsed > 1 ? "s" : ""}`;
  
  const details = document.createElement("div");
  details.className = "summary-details hidden"; 

  sel.dishes.forEach((dish) => {
    const dishDiv = document.createElement("div");
    dishDiv.className = "summary-dish";
    dishDiv.textContent = dish.name;
    details.appendChild(dishDiv);

    dish.ingredients.forEach((ing) => {
      const ingredientDiv = document.createElement("div");
      ingredientDiv.className = "summary-ingredient";
      const nameSpan = document.createElement("span");
      nameSpan.className = "ingredient-name";
      nameSpan.textContent = ing.name;
      ingredientDiv.appendChild(nameSpan);

      if (ing.metricQuantity || ing.metricUnit) {
        const metricPill = document.createElement("span");
        metricPill.className = "ingredient-pill metric";
        let metricText = "";
        if (ing.metricQuantity && ing.metricUnit) {
          metricText = `${ing.metricQuantity} ${ing.metricUnit}`;
        } else if (ing.metricQuantity) {
          metricText = `${ing.metricQuantity}`;
        } else if (ing.metricUnit) {
          metricText = `${ing.metricUnit}`;
        }
        metricPill.textContent = metricText;
        ingredientDiv.appendChild(metricPill);
      }
      if (ing.alternativeQuantity || ing.alternativeUnit) {
        const altPill = document.createElement("span");
        altPill.className = "ingredient-pill alternative";
        let altText = "";
        if (ing.alternativeQuantity && ing.alternativeUnit) {
          altText = `${ing.alternativeQuantity} ${ing.alternativeUnit}`;
        } else if (ing.alternativeQuantity) {
          altText = `${ing.alternativeQuantity}`;
        } else if (ing.alternativeUnit) {
          altText = `${ing.alternativeUnit}`;
        }
        altPill.textContent = altText;
        ingredientDiv.appendChild(altPill);
      }
      details.appendChild(ingredientDiv);
    });
  });
  
  summary.appendChild(title);
  summary.appendChild(details);

  summary.addEventListener('click', () => {
    summary.classList.toggle('expanded');
    details.classList.toggle('hidden');
  });

  return summary;
}

async function copySummaryToClipboard() {
  const text = buildSummaryText();
  try {
    await navigator.clipboard.writeText(text);
    await showModal("¡Resumen copiado al portapapeles!");
  } catch (err) {
    await showModal("Hubo un error al copiar el resumen.");
  }
}

function buildSummaryText() {
  let text = "Resumen de tu Semana\n\n";
  CATEGORY_ORDER.forEach((cat) => {
    if (selectionState[cat].length > 0) {
      text += `${mapCategoryToSpanish(cat)}\n`;
      selectionState[cat].forEach((sel) => {
        text += `  ${sel.menuName} - ${sel.daysUsed} día${sel.daysUsed > 1 ? "s" : ""}\n`;
        sel.dishes.forEach((dish) => {
          text += `    ${dish.name}\n`;
          dish.ingredients.forEach((ing) => {
            let ingredientText = `      ${ing.name}`;
            if (ing.metricQuantity || ing.metricUnit) {
              let metric = "";
              if (ing.metricQuantity && ing.metricUnit) {
                metric = `${ing.metricQuantity} ${ing.metricUnit}`;
              } else if (ing.metricQuantity) {
                metric = `${ing.metricQuantity}`;
              } else if (ing.metricUnit) {
                metric = `${ing.metricUnit}`;
              }
              ingredientText += ` | ${metric}`;
            }
            if (ing.alternativeQuantity || ing.alternativeUnit) {
              let alt = "";
              if (ing.alternativeQuantity && ing.alternativeUnit) {
                alt = `${ing.alternativeQuantity} ${ing.alternativeUnit}`;
              } else if (ing.alternativeQuantity) {
                alt = `${ing.alternativeQuantity}`;
              } else if (ing.alternativeUnit) {
                alt = `${ing.alternativeUnit}`;
              }
              ingredientText += ` | ${alt}`;
            }
            text += ingredientText + "\n";
          });
        });
        text += "\n";
      });
      text += "\n";
    }
  });
  return text.trim() + "\n";
}

async function shareSummaryLink() {
  try {
    const jsonState = JSON.stringify(selectionState);
    const encoded = btoa(jsonState);
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = baseUrl + "#share=" + encoded;
    await navigator.clipboard.writeText(shareUrl);
    await showModal("Link de resumen copiado al portapapeles!");
  } catch (err) {
    await showModal("Ocurrió un error al copiar el link.");
  }
}

// --- INICIO DE CAMBIO: Nueva función para Prompts de IA ---
async function handleAiPrompt(promptUrl) {
  try {
    // 1. Cargar el prompt desde el archivo de assets
    const promptRes = await fetch(promptUrl);
    if (!promptRes.ok) {
      throw new Error(`No se pudo cargar el prompt: ${promptUrl}`);
    }
    const promptText = await promptRes.text();

    // 2. Construir el resumen de texto
    const summaryText = buildSummaryText();

    // 3. Combinar
    const combinedText = promptText + "\n\n" + summaryText;

    // 4. Copiar al portapapeles
    await navigator.clipboard.writeText(combinedText);

    // 5. Abrir Gemini en una nueva pestaña
    window.open('https://gemini.google.com', '_blank');

    // 6. Mostrar modal de éxito
    await showModal("¡Prompt copiado! Pégalo en la pestaña de Gemini que se acaba de abrir.");
    
  } catch (err) {
    console.error("Error al procesar prompt de IA:", err);
    showModal(`Hubo un error al preparar el prompt: ${err.message}`);
  }
}
// --- FIN DE CAMBIO ---


async function confirmRestart() {
  const confirmed = await showModal("¿Estás seguro de reiniciar todo? Se borrarán los menús cargados y tu selección.", true);
  if (confirmed) {
    resetAll();
  }
}

function resetAll() {
  localStorage.removeItem(STATE_KEY);
  localStorage.removeItem(MANUAL_MENUS_KEY); // Limpiar menús manuales
  localStorage.removeItem(MENU_SOURCE_KEY); // Limpiar flag de fuente
  currentMenuIndex = 0;
  window.location.hash = "";
  window.location.reload(); // Forzar recarga a estado limpio
}

function renderSharedSummary() {
  renderSummary();
}

async function autoFillWeek() {
  const menuSources = {
    breakfast: originalMenus.breakfast[0] || null,
    snack1: originalMenus.snack[0] || null,
    snack2: originalMenus.snack[1] || originalMenus.snack[0] || null,
    lunch: originalMenus.lunch[0] || null,
    dinner: originalMenus.dinner[0] || null,
  };

  let baseMessage = "¿Estás seguro de autocompletar la semana? Esto reemplazará tu selección actual.";
  const missingCategories = [];
  
  if (!menuSources.breakfast) missingCategories.push("Desayuno");
  if (!menuSources.snack1) missingCategories.push("Snack 1");
  if (!menuSources.snack2) missingCategories.push("Snack 2");
  if (!menuSources.lunch) missingCategories.push("Comida");
  if (!menuSources.dinner) missingCategories.push("Cena");

  if (missingCategories.length > 0) {
    baseMessage += `\n\nADVERTENCIA:\nNo se encontraron menús para: ${missingCategories.join(", ")}. Se autocompletará sin estas categorías.`;
  }

  const confirmed = await showModal(baseMessage, true);
  if (!confirmed) return;

  initializeSelectionState(); 

  if (menuSources.breakfast) {
    selectionState.breakfast = [{
      menuName: menuSources.breakfast.menuName,
      daysUsed: TOTAL_DAYS,
      dishes: menuSources.breakfast.dishes,
    }];
    selectionState.completedCategories.breakfast = TOTAL_DAYS;
  }
  
  if (menuSources.snack1) {
    selectionState.snack1 = [{
      menuName: menuSources.snack1.menuName,
      daysUsed: TOTAL_DAYS,
      dishes: menuSources.snack1.dishes,
    }];
    selectionState.completedCategories.snack1 = TOTAL_DAYS;
  }

  if (menuSources.snack2) {
    selectionState.snack2 = [{
      menuName: menuSources.snack2.menuName,
      daysUsed: TOTAL_DAYS,
      dishes: menuSources.snack2.dishes,
    }];
    selectionState.completedCategories.snack2 = TOTAL_DAYS;
  }

  if (menuSources.lunch) {
    selectionState.lunch = [{
      menuName: menuSources.lunch.menuName,
      daysUsed: TOTAL_DAYS,
      dishes: menuSources.lunch.dishes,
    }];
    selectionState.completedCategories.lunch = TOTAL_DAYS;
  }

  if (menuSources.dinner) {
    selectionState.dinner = [{
      menuName: menuSources.dinner.menuName,
      daysUsed: TOTAL_DAYS,
      dishes: menuSources.dinner.dishes,
    }];
    selectionState.completedCategories.dinner = TOTAL_DAYS;
  }
  
  selectionState.currentCategoryIndex = CATEGORY_ORDER.length;
  
  saveStateToLocalStorage();
  renderApp();
}

function checkForSharedSummary() {
  const hash = window.location.hash || "";
  const prefix = "#share=";
  if (hash.startsWith(prefix)) {
    return hash.slice(prefix.length);
  }
  return null;
}

function mapCategoryToSpanish(cat) {
  switch (cat) {
    case "breakfast":
      return "Desayuno";
    case "snack1":
    case "snack2":
      return "Colación / Snack";
    case "lunch":
      return "Comida";
    case "dinner":
      return "Cena";
    default:
      return cat;
  }
}

// Sistema de modales
function showModal(message, isConfirm = false) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');

    messageEl.textContent = message;

    if (isConfirm) {
      cancelBtn.classList.remove('hidden');
      confirmBtn.textContent = "Sí";
      const handleConfirm = () => {
        cleanup();
        resolve(true);
      };
      const handleCancel = () => {
        cleanup();
        resolve(false);
      };
      confirmBtn.onclick = handleConfirm;
      cancelBtn.onclick = handleCancel;
      const cleanup = () => {
        overlay.classList.add('hidden');
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
      };
    } else {
      cancelBtn.classList.add('hidden');
      confirmBtn.textContent = "Aceptar";
      confirmBtn.onclick = () => {
        overlay.classList.add('hidden');
        confirmBtn.onclick = null;
        resolve();
      };
    }
    overlay.classList.remove('hidden');
  });
}