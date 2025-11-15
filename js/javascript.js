/************************************************************
 * Nutri Planner - Sistema simplificado con una sola tarjeta
 * Navegación con botones de flecha - VERSIÓN MEJORADA
 ************************************************************/

const CATEGORY_ORDER = ["breakfast", "snack1", "lunch", "snack2", "dinner"];
const TOTAL_DAYS = 7;

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
let loadedFileCount = 0; // INICIO DE CAMBIO: Contador de archivos JSON

// Inicialización
window.addEventListener("DOMContentLoaded", init);

function init() {
  // Verificar si es un resumen compartido
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

  // Cargar estado y menús
  loadStateFromLocalStorage();
  ensureSelectionStateIntegrity();
  loadMenus(true); // Indicar que es la carga inicial

  // INICIO DE CAMBIO: Listeners para carga de JSON
  // Listener para el botón de carga inicial
  const initialInput = document.getElementById('initial-load-input');
  if (initialInput) {
    initialInput.addEventListener('change', handleJsonFileSelect);
  }
  // FIN DE CAMBIO
}

function loadMenus(isInitialLoad = false) { // INICIO DE CAMBIO
  fetch("json_directory.json")
    .then((res) => {
      if (!res.ok) throw new Error("No se pudo cargar el directorio de menús");
      return res.json();
    })
    .then((directoryData) => {
      const files = directoryData.jsonFiles || [];
      console.log("Archivos JSON a cargar:", files);
      loadedFileCount = files.length; // INICIO DE CAMBIO

      // INICIO DE CAMBIO (check for empty)
      if (isInitialLoad && files.length === 0) {
        console.warn("No se encontraron archivos en json_directory.json.");
        hideLoading(true); // Ocultar spinner, pero no el overlay
        showInitialLoadButton();
        return Promise.reject("No files"); // Stop the promise chain
      }
      // FIN DE CAMBIO

      return loadAllJsonMenus(files);
    })
    .then((loadResult) => {
      hideLoading();

      console.log("Menús cargados:", originalMenus);

      if (loadResult && loadResult.errors && loadResult.errors.length > 0) {
        console.warn("Errores al cargar menús:", loadResult.errors);
        showModal(`Algunos menús no se pudieron cargar: ${loadResult.errors.join(', ')}`);
      }

      if (selectionState.shuffledMenus) {
        allMenus = deepClone(selectionState.shuffledMenus);
      } else {
        copyOriginalToAllMenus_NoShuffle();
        shuffleAllMenus();
        selectionState.shuffledMenus = deepClone(allMenus);
        saveStateToLocalStorage();
      }

      // Restaurar currentMenuIndex desde el estado guardado
      if (selectionState.currentMenuIndex !== undefined) {
        currentMenuIndex = selectionState.currentMenuIndex;
      }

      console.log("Menús finales:", allMenus);
      renderApp();
    })
    .catch((err) => {
      // INICIO DE CAMBIO (catch)
      if (err === "No files") {
        // This is the expected "error" when no files are present, do nothing.
        return;
      }
      console.error("Error al cargar menús:", err);
      // If *any* other error happens during initial load (e.g., 404 on json_directory.json),
      // also show the load button.
      if (isInitialLoad) {
        hideLoading(true);
        showInitialLoadButton();
      } else {
        hideLoading();
        showModal("Error al cargar la lista de archivos JSON. Asegúrate de que json_directory.json existe.");
      }
      // FIN DE CAMBIO
    });
}

function hideLoading(keepOverlay = false) {
  const loading = document.getElementById("loading");
  if (loading) {
    // INICIO DE CAMBIO
    if (keepOverlay) {
      // Ocultar solo el spinner y el texto
      const spinner = loading.querySelector('.loading-spinner');
      const p = loading.querySelector('p');
      if (spinner) spinner.classList.add("hidden");
      if (p) p.classList.add("hidden");
    } else {
      // Ocultar todo el overlay
      loading.classList.add("hidden");
    }
    // FIN DE CAMBIO
  }
}

// INICIO DE CAMBIO: Nuevas funciones para carga de JSON

function showInitialLoadButton() {
  const container = document.getElementById('initial-load-container');
  if (container) {
    container.classList.remove('hidden');
  }
}

// Manejador para el <input type="file">
function handleJsonFileSelect(event) {
  const file = event.target.files[0];
  if (!file) {
    showModal("No se seleccionó ningún archivo.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const menuData = JSON.parse(e.target.result);
      console.log("Cargando JSON manual:", menuData);
      // Procesar este único archivo
      processSingleMenuData(menuData);
    } catch (err) {
      console.error("Error al parsear JSON:", err);
      showModal(`Error al leer el archivo JSON: ${err.message}`);
    }
  };
  reader.readAsText(file);
  
  // Limpiar el valor del input para permitir recargar el mismo archivo
  event.target.value = null;
}

// Procesa los datos de un único archivo JSON
function processSingleMenuData(menuData) {
  // 1. Limpiar menús anteriores
  originalMenus = { breakfast: [], snack: [], lunch: [], dinner: [] };
  
  if (!menuData || typeof menuData !== "object") {
    showModal("Archivo JSON inválido o vacío.");
    return;
  }

  let menusAdded = 0;
  // 2. Poblar originalMenus
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
      console.log(`Agregados ${validMenus.length} menús a ${targetKey}`);
    }
  });

  if (menusAdded === 0) {
    showModal("El JSON no contiene menús válidos.");
    return;
  }
  
  // 3. Marcar como 1 archivo cargado (para el botón de autocompletar)
  loadedFileCount = 1;
  
  // 4. Reiniciar el estado y la app
  resetAndSetupApp();
}

// Función para reiniciar el estado y correr la app con los nuevos menús
function resetAndSetupApp() {
  // 1. Ocultar loading
  hideLoading(); // Ocultar todo el overlay

  // 2. Reiniciar estado 
  initializeSelectionState(); 

  // 3. Copiar y barajar menús
  copyOriginalToAllMenus_NoShuffle();
  shuffleAllMenus();
  selectionState.shuffledMenus = deepClone(allMenus);
  saveStateToLocalStorage();

  // 4. Restaurar índice
  currentMenuIndex = 0;
  if (selectionState.currentMenuIndex !== undefined) {
    currentMenuIndex = selectionState.currentMenuIndex;
  }

  // 5. Renderizar
  console.log("Menús finales (manual):", allMenus);
  renderApp();
}
// FIN DE CAMBIO

function loadAllJsonMenus(fileList) {
  const errors = [];
  const promises = fileList.map((file) =>
    fetch(file)
      .then((r) => {
        if (!r.ok) throw new Error(`Error al cargar ${file}: ${r.statusText}`);
        return r.json();
      })
      .then((menuData) => {
        console.log(`Cargando ${file}:`, menuData);

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
            console.log(`Agregados ${validMenus.length} menús a ${targetKey}`);
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
  saveStateToLocalStorage();
}

function saveStateToLocalStorage() {
  try {
    // Guardar el índice actual del menú antes de guardar
    selectionState.currentMenuIndex = currentMenuIndex;
    localStorage.setItem("nutriSelectionStateDark", JSON.stringify(selectionState));
    console.log("Estado guardado:", selectionState);
  } catch (e) {
    console.error("Error al guardar estado:", e);
  }
}

function loadStateFromLocalStorage() {
  const data = localStorage.getItem("nutriSelectionStateDark");
  if (data) {
    try {
      selectionState = JSON.parse(data);
      console.log("Estado cargado:", selectionState);

      // Restaurar currentMenuIndex
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

  saveStateToLocalStorage();
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

  // INICIO DE CAMBIO: Añadir botones de Carga y Autocompletar
  const headerActions = document.createElement('div');
  headerActions.className = 'header-actions';
  
  // Botón de Cargar JSON (siempre visible)
  const loadJsonLabel = document.createElement('label');
  loadJsonLabel.className = 'btn btn-secondary btn-load-header';
  loadJsonLabel.textContent = 'Cargar JSON';
  
  const loadJsonInput = document.createElement('input');
  loadJsonInput.type = 'file';
  loadJsonInput.accept = '.json';
  loadJsonInput.className = 'hidden';
  loadJsonInput.addEventListener('change', handleJsonFileSelect);
  
  loadJsonLabel.appendChild(loadJsonInput);
  headerActions.appendChild(loadJsonLabel);

  // Botón de Autocompletar (condicional)
  if (loadedFileCount === 1 && !allCategoriesCompleted()) {
    const autoFillBtn = document.createElement('button');
    autoFillBtn.id = 'autofill-button';
    autoFillBtn.className = 'btn btn-primary';
    autoFillBtn.textContent = 'Autocompletar Semana';
    autoFillBtn.addEventListener('click', autoFillWeek);
    headerActions.appendChild(autoFillBtn);
  }
  
  appDiv.appendChild(headerActions);
  // FIN DE CAMBIO

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

  // Asegurar que currentMenuIndex esté en rango válido
  if (currentMenuIndex >= allMenus[arrayKey].length) {
    currentMenuIndex = 0;
    selectionState.currentMenuIndex = currentMenuIndex;
    saveStateToLocalStorage();
  }

  console.log(`Renderizando carrusel simplificado para ${categoryKey} con ${allMenus[arrayKey].length} menús`);
  appDiv.appendChild(renderSimpleCarousel(arrayKey, categoryKey));

  // Mostrar selector de días inmediatamente
  renderDaysSelector();

  // Configurar botones flotantes basado en el estado actual
  updateFloatingButtons();

  // Si hay una selección temporal de días, restaurarla
  if (selectionState.tempDaysSelection) {
    restoreTempDaysSelection();
  }
}

// NUEVA FUNCIÓN: Actualizar botones flotantes basado en el contexto
function updateFloatingButtons() {
  const catIndex = selectionState.currentCategoryIndex;
  const categoryKey = CATEGORY_ORDER[catIndex];
  const usedDays = selectionState.completedCategories[categoryKey];
  const isLastCategory = catIndex === CATEGORY_ORDER.length - 1;
  const hasSelection = selectionState.tempDaysSelection !== null;

  // Botón derecho (continuar/confirmar)
  if (hasSelection) {
    // Si hay selección temporal, mostrar botón de confirmar
    const daysCount = selectionState.tempDaysSelection;
    showFloatingButton(() => confirmSelection(daysCount));

    // Cambiar texto según si es la última categoría
    if (isLastCategory && usedDays + daysCount >= TOTAL_DAYS) {
      document.getElementById('floating-btn-text').textContent = "Ir al Resumen";
    } else {
      document.getElementById('floating-btn-text').textContent = "Continuar";
    }
  } else {
    hideFloatingButton();
  }

  // Botón izquierdo (deshacer) - SIEMPRE visible excepto en el primer momento
  if (canUndo()) {
    showFloatingButtonLeft(() => performUndo());
  } else {
    hideFloatingButtonLeft();
  }
}

// NUEVA FUNCIÓN: Verificar si se puede deshacer
function canUndo() {
  // Nunca se puede deshacer en el primer momento del desayuno sin selecciones
  if (selectionState.currentCategoryIndex === 0 &&
    selectionState.completedCategories.breakfast === 0 &&
    selectionState.tempDaysSelection === null &&
    (!Array.isArray(selectionState.globalUndoHistory) || selectionState.globalUndoHistory.length === 0)) {
    return false;
  }

  return true;
}

// NUEVA FUNCIÓN: Realizar deshacer granular
function performUndo() {
  // Prioridad 1: Si hay selección temporal de días, limpiarla
  if (selectionState.tempDaysSelection !== null) {
    clearTempDaysSelection();
    return;
  }

  // Prioridad 2: Si hay algo en el historial global, deshacerlo
  if (Array.isArray(selectionState.globalUndoHistory) && selectionState.globalUndoHistory.length > 0) {
    undoLastSelectionGlobal();
    return;
  }

  // Si no hay nada que deshacer, mostrar mensaje
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

  // Navegación con botones de flecha e indicador
  const navigation = document.createElement("div");
  navigation.className = "carousel-navigation";

  // Botón anterior
  const prevBtn = document.createElement("button");
  prevBtn.className = "nav-button";
  prevBtn.innerHTML = "‹";
  prevBtn.addEventListener('click', () => navigateMenu(-1, menus));
  navigation.appendChild(prevBtn);

  // Indicador (pill shape) clickeable con dropdown
  const indicator = document.createElement("div");
  indicator.className = "carousel-indicator";
  indicator.id = "carousel-indicator";
  updateIndicator(indicator, currentMenuIndex, menus.length);

  // Hacer el indicador clickeable
  indicator.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown(indicator, menus);
  });

  navigation.appendChild(indicator);

  // Botón siguiente
  const nextBtn = document.createElement("button");
  nextBtn.className = "nav-button";
  nextBtn.innerHTML = "›";
  nextBtn.addEventListener('click', () => navigateMenu(1, menus));
  navigation.appendChild(nextBtn);

  section.appendChild(navigation);

  // Contenedor de la tarjeta única
  const cardContainer = document.createElement("div");
  cardContainer.className = "single-card-container";
  cardContainer.id = "single-card-container";

  // Mostrar tarjeta en la posición actual
  const currentCard = createMenuCard(menus[currentMenuIndex], currentMenuIndex, menus.length);
  cardContainer.appendChild(currentCard);
  section.appendChild(cardContainer);

  // Actualizar estado de botones
  updateNavigationButtons(prevBtn, nextBtn, currentMenuIndex, menus.length);

  return section;
}

function toggleDropdown(indicator, menus) {
  // Cerrar dropdown existente
  const existingDropdown = document.querySelector('.indicator-dropdown');
  if (existingDropdown) {
    existingDropdown.remove();
    return;
  }

  // Crear nuevo dropdown usando posicionamiento fijo
  const dropdown = document.createElement('div');
  dropdown.className = 'indicator-dropdown';

  // Calcular posición del dropdown mejorado
  const indicatorRect = indicator.getBoundingClientRect();
  const viewportWidth = window.innerWidth;

  // Crear elemento temporal para medir el ancho real del dropdown
  dropdown.style.visibility = 'hidden';
  dropdown.style.position = 'fixed';
  dropdown.style.top = '-9999px';
  document.body.appendChild(dropdown);

  // Agregar items temporalmente para medir
  menus.forEach((menu, index) => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.textContent = menu.menuName;
    dropdown.appendChild(item);
  });

  // Medir el ancho real
  const dropdownWidth = dropdown.offsetWidth;

  // Limpiar y recrear
  dropdown.innerHTML = '';
  dropdown.style.visibility = 'visible';
  dropdown.style.top = 'auto';

  // Calcular posición centrada mejorada
  let left = indicatorRect.left + (indicatorRect.width / 2) - (dropdownWidth / 2);

  // Ajustar si se sale del viewport con margen de seguridad
  const margin = 10;
  if (left < margin) {
    left = margin;
  } else if (left + dropdownWidth > viewportWidth - margin) {
    left = viewportWidth - dropdownWidth - margin;
  }

  dropdown.style.left = `${left}px`;
  dropdown.style.top = `${indicatorRect.bottom + 8}px`;

  // Agregar items finales
  menus.forEach((menu, index) => {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    if (index === currentMenuIndex) {
      item.classList.add('current');
    }
    item.textContent = menu.menuName;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToMenu(index, menus);
      dropdown.remove();
    });
    dropdown.appendChild(item);
  });

  // Cerrar dropdown al hacer click fuera o al presionar Escape
  const closeDropdown = (e) => {
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    if (e.type === 'click' && indicator.contains(e.target)) return;
    if (e.type === 'click' && dropdown.contains(e.target)) return;

    if (dropdown.parentNode) {
      dropdown.remove();
    }
    document.removeEventListener('click', closeDropdown);
    document.removeEventListener('keydown', closeDropdown);
    window.removeEventListener('scroll', closeDropdown);
    window.removeEventListener('resize', closeDropdown);
  };

  // Usar setTimeout para evitar que el evento actual cierre inmediatamente el dropdown
  setTimeout(() => {
    document.addEventListener('click', closeDropdown);
    document.addEventListener('keydown', closeDropdown);
    window.addEventListener('scroll', closeDropdown);
    window.addEventListener('resize', closeDropdown);
  }, 10);
}

function navigateToMenu(targetIndex, menus) {
  if (targetIndex >= 0 && targetIndex < menus.length) {
    currentMenuIndex = targetIndex;

    // Guardar el nuevo índice inmediatamente
    selectionState.currentMenuIndex = currentMenuIndex;
    saveStateToLocalStorage();

    // Actualizar tarjeta mostrada
    updateDisplayedCard(menus);

    // Actualizar indicador
    const indicator = document.getElementById("carousel-indicator");
    updateIndicator(indicator, currentMenuIndex, menus.length);

    // Limpiar selección temporal de días al cambiar de menú
    clearTempDaysSelection();
  }
}

function navigateMenu(direction, menus) {
  const newIndex = currentMenuIndex + direction;

  // Navegación circular
  if (newIndex < 0) {
    currentMenuIndex = menus.length - 1;
  } else if (newIndex >= menus.length) {
    currentMenuIndex = 0;
  } else {
    currentMenuIndex = newIndex;
  }

  // Guardar el nuevo índice inmediatamente
  selectionState.currentMenuIndex = currentMenuIndex;
  saveStateToLocalStorage();

  // Actualizar tarjeta mostrada
  updateDisplayedCard(menus);

  // Actualizar indicador
  const indicator = document.getElementById("carousel-indicator");
  updateIndicator(indicator, currentMenuIndex, menus.length);

  // Limpiar selección temporal de días al cambiar de menú
  clearTempDaysSelection();
}

function updateDisplayedCard(menus) {
  const container = document.getElementById("single-card-container");
  const currentMenu = menus[currentMenuIndex];

  // Crear nueva tarjeta
  const newCard = createMenuCard(currentMenu, currentMenuIndex, menus.length);

  // Reemplazar tarjeta
  container.innerHTML = "";
  container.appendChild(newCard);
}

function updateIndicator(indicator, current, total) {
  indicator.textContent = `${current + 1} de ${total}`;
}

function updateNavigationButtons(prevBtn, nextBtn, current, total) {
  // Para navegación circular, siempre habilitados si hay más de 1 menú
  prevBtn.disabled = total <= 1;
  nextBtn.disabled = total <= 1;
}

function createMenuCard(menu, originalIndex, totalMenus) {
  const card = document.createElement("div");
  card.className = "menu-card";
  card.dataset.originalIndex = originalIndex;

  // Número de tarjeta
  const cardNumber = document.createElement("div");
  cardNumber.className = "card-number";
  cardNumber.textContent = (originalIndex + 1).toString();
  card.appendChild(cardNumber);

  const content = document.createElement("div");
  content.className = "card-content";

  // Título del menú
  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = menu.menuName;
  content.appendChild(title);

  // Lista de platillos
  const dishesList = document.createElement("div");
  dishesList.className = "dishes-list";

  const visibleDishes = menu.dishes.slice(0, 2);
  const hiddenDishes = menu.dishes.slice(2);

  // Mostrar primeros 2 platillos
  visibleDishes.forEach(dish => {
    dishesList.appendChild(createDishElement(dish));
  });

  // Platillos adicionales (ocultos inicialmente)
  if (hiddenDishes.length > 0) {
    const hiddenContainer = document.createElement("div");
    hiddenContainer.className = "hidden-dishes hidden";

    hiddenDishes.forEach(dish => {
      hiddenContainer.appendChild(createDishElement(dish));
    });
    dishesList.appendChild(hiddenContainer);

    // Botón expandir/contraer
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

    // Nombre del ingrediente
    const nameSpan = document.createElement("span");
    nameSpan.className = "ingredient-name";
    nameSpan.textContent = ingredient.name;
    ingredientItem.appendChild(nameSpan);

    // Píldora métrica (con prioridad)
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

    // Píldora alternativa
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
  // Remover selector existente
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

  // Insertar después del carrusel
  const carouselSection = document.querySelector('.carousel-section');
  if (carouselSection) {
    carouselSection.insertAdjacentElement('afterend', section);
  }
}

function selectDays(daysCount) {
  const catIndex = selectionState.currentCategoryIndex;
  const categoryKey = CATEGORY_ORDER[catIndex];
  const usedDays = selectionState.completedCategories[categoryKey];

  // Guardar selección temporal
  selectionState.tempDaysSelection = daysCount;
  saveStateToLocalStorage();

  // Actualizar visualización de timeline
  const dayButtons = document.querySelectorAll('.day-button');
  dayButtons.forEach((button, index) => {
    const dayNumber = index + 1;
    button.classList.remove('selected');

    if (dayNumber > usedDays && dayNumber <= usedDays + daysCount) {
      button.classList.add('selected');
    }
  });

  // Actualizar botones flotantes
  updateFloatingButtons();
}

function restoreTempDaysSelection() {
  if (selectionState.tempDaysSelection) {
    const daysCount = selectionState.tempDaysSelection;
    const catIndex = selectionState.currentCategoryIndex;
    const categoryKey = CATEGORY_ORDER[catIndex];
    const usedDays = selectionState.completedCategories[categoryKey];

    // Restaurar visualización
    const dayButtons = document.querySelectorAll('.day-button');
    dayButtons.forEach((button, index) => {
      const dayNumber = index + 1;
      button.classList.remove('selected');

      if (dayNumber > usedDays && dayNumber <= usedDays + daysCount) {
        button.classList.add('selected');
      }
    });

    // Actualizar botones flotantes
    updateFloatingButtons();
  }
}

// MODIFICADA: Limpiar selección temporal y actualizar botones
function clearTempDaysSelection() {
  selectionState.tempDaysSelection = null;
  saveStateToLocalStorage();

  // Limpiar visualización
  const dayButtons = document.querySelectorAll('.day-button');
  dayButtons.forEach(button => {
    button.classList.remove('selected');
  });

  // Actualizar botones flotantes
  updateFloatingButtons();
}

function confirmSelection(daysCount) {
  const catIndex = selectionState.currentCategoryIndex;
  const categoryKey = CATEGORY_ORDER[catIndex];
  const arrayKey = categoryKey;

  // Validar que currentMenuIndex esté en rango
  if (currentMenuIndex >= allMenus[arrayKey].length) {
    showModal("Selección inválida.");
    return;
  }

  const chosenMenu = allMenus[arrayKey][currentMenuIndex];

  // Agregar a selecciones
  selectionState[categoryKey].push({
    menuName: chosenMenu.menuName,
    daysUsed: daysCount,
    dishes: chosenMenu.dishes,
  });

  selectionState.completedCategories[categoryKey] += daysCount;

  // Agregar al historial de undo
  selectionState.globalUndoHistory = selectionState.globalUndoHistory || [];
  selectionState.globalUndoHistory.push({
    category: categoryKey,
    menu: deepClone(chosenMenu),
    menuIndex: currentMenuIndex,
    daysUsed: daysCount,
    previousCategoryIndex: selectionState.currentCategoryIndex,
    previousMenuIndex: currentMenuIndex
  });

  // Remover menú de opciones disponibles
  allMenus[arrayKey].splice(currentMenuIndex, 1);

  // Ajustar currentMenuIndex si es necesario
  if (currentMenuIndex >= allMenus[arrayKey].length && allMenus[arrayKey].length > 0) {
    currentMenuIndex = 0;
  }

  // Limpiar selección temporal
  selectionState.tempDaysSelection = null;
  selectionState.currentMenuIndex = currentMenuIndex;

  saveStateToLocalStorage();

  // Continuar
  if (selectionState.completedCategories[categoryKey] >= TOTAL_DAYS) {
    goToNextCategory();
  } else {
    renderApp();
  }
}

// Funciones de botones flotantes - MODIFICADAS
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

function hideFloatingButtons() {
  hideFloatingButton();
  hideFloatingButtonLeft();
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

// Funciones de navegación
function goToNextCategory() {
  selectionState.currentCategoryIndex++;
  currentMenuIndex = 0; // Resetear índice para nueva categoría
  selectionState.currentMenuIndex = currentMenuIndex;
  selectionState.tempDaysSelection = null; // Limpiar selección temporal
  saveStateToLocalStorage();
  renderApp();
}

function allCategoriesCompleted() {
  return CATEGORY_ORDER.every(
    (cat) => selectionState.completedCategories[cat] >= TOTAL_DAYS
  );
}

// MODIFICADA: Deshacer mejorado y granular
function undoLastSelectionGlobal() {
  if (!Array.isArray(selectionState.globalUndoHistory) ||
    selectionState.globalUndoHistory.length === 0) {
    return;
  }

  const last = selectionState.globalUndoHistory.pop();
  const { category, menu, menuIndex, daysUsed, previousCategoryIndex, previousMenuIndex } = last;

  // Revertir la selección
  if (Array.isArray(selectionState[category]) && selectionState[category].length > 0) {
    selectionState[category].pop();
    selectionState.completedCategories[category] -= daysUsed;

    // Restaurar el menú en la posición correcta
    if (!allMenus[category]) allMenus[category] = [];
    const idx = Math.max(0, Math.min(menuIndex, allMenus[category].length));
    allMenus[category].splice(idx, 0, menu);
  }

  // Restaurar índices
  if (previousCategoryIndex !== undefined) {
    selectionState.currentCategoryIndex = previousCategoryIndex;
  }
  if (previousMenuIndex !== undefined) {
    currentMenuIndex = previousMenuIndex;
    selectionState.currentMenuIndex = currentMenuIndex;
  }

  // Limpiar selección temporal
  selectionState.tempDaysSelection = null;

  saveStateToLocalStorage();

  // Re-renderizar
  if (!allCategoriesCompleted()) {
    renderApp();
  } else {
    renderSummary();
  }
}

// Funciones de resumen - MODIFICADAS
function renderSummary() {
  const appDiv = document.getElementById("app");
  appDiv.innerHTML = "";

  const section = document.createElement("div");
  section.className = "summary-section";

  const card = document.createElement("div");
  card.className = "summary-card";

  const title = document.createElement("h1");
  title.className = "summary-title";
  title.textContent = "Resumen de tu Semana";
  card.appendChild(title);

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

      card.appendChild(categorySection);
    }
  });

  // Acciones simplificadas (solo copiar y compartir)
  const actions = document.createElement("div");
  actions.className = "summary-actions";

  const copyBtn = document.createElement("button");
  copyBtn.className = "btn btn-primary";
  copyBtn.textContent = "Copiar Resumen";
  copyBtn.addEventListener('click', copySummaryToClipboard);
  actions.appendChild(copyBtn);

  const shareBtn = document.createElement("button");
  shareBtn.className = "btn btn-primary";
  shareBtn.textContent = "Compartir Link";
  shareBtn.addEventListener('click', shareSummaryLink);
  actions.appendChild(shareBtn);

  card.appendChild(actions);
  section.appendChild(card);
  appDiv.appendChild(section);

  // Actualizar botones flotantes para el resumen
  updateFloatingButtonsForSummary();
}

// NUEVA FUNCIÓN: Actualizar botones flotantes en el resumen
function updateFloatingButtonsForSummary() {
  // Botón derecho: Reiniciar todo
  showFloatingButton(confirmRestart);
  document.getElementById('floating-btn-text').textContent = "Reiniciar Todo";

  // Botón izquierdo: Deshacer si hay historial
  if (Array.isArray(selectionState.globalUndoHistory) &&
    selectionState.globalUndoHistory.length > 0) {
    showFloatingButtonLeft(() => performUndo());
  } else {
    hideFloatingButtonLeft();
  }
}

function renderMenuSummary(sel) {
  const summary = document.createElement("div");
  summary.className = "menu-summary";

  const title = document.createElement("div");
  title.className = "menu-summary-title";
  title.textContent = `${sel.menuName} - ${sel.daysUsed} día${sel.daysUsed > 1 ? "s" : ""}`;
  summary.appendChild(title);

  sel.dishes.forEach((dish) => {
    const dishDiv = document.createElement("div");
    dishDiv.className = "summary-dish";
    dishDiv.textContent = dish.name;
    summary.appendChild(dishDiv);

    dish.ingredients.forEach((ing) => {
      const ingredientDiv = document.createElement("div");
      ingredientDiv.className = "summary-ingredient";

      // Nombre del ingrediente
      const nameSpan = document.createElement("span");
      nameSpan.className = "ingredient-name";
      nameSpan.textContent = ing.name;
      ingredientDiv.appendChild(nameSpan);

      // Píldora métrica (con prioridad)
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

      // Píldora alternativa
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

      summary.appendChild(ingredientDiv);
    });
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
        text += `  ${sel.menuName} - ${sel.daysUsed} día${sel.daysUsed > 1 ? "s" : ""}\n`;
        sel.dishes.forEach((dish) => {
          text += `    ${dish.name}\n`;
          dish.ingredients.forEach((ing) => {
            let ingredientText = `      ${ing.name}`;

            // Agregar cantidades con separadores verticales
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

async function confirmRestart() {
  const confirmed = await showModal("¿Estás seguro de reiniciar todo?", true);
  if (confirmed) {
    resetAll();
  }
}

function resetAll() {
  localStorage.removeItem("nutriSelectionStateDark");
  currentMenuIndex = 0;
  initializeSelectionState();
  copyOriginalToAllMenus_NoShuffle();
  shuffleAllMenus();
  selectionState.shuffledMenus = deepClone(allMenus);
  saveStateToLocalStorage();
  window.location.hash = "";
  renderApp();
}

function renderSharedSummary() {
  renderSummary();
}

// INICIO DE CAMBIO: Nueva función para autocompletar la semana

async function autoFillWeek() {
  // 1. Validar que los menús base existan
  const bfast = originalMenus.breakfast[0];
  const snack1 = originalMenus.snack[0];
  const lunch = originalMenus.lunch[0];
  const dinner = originalMenus.dinner[0];
  // Usar el segundo snack si existe, si no, repetir el primero
  const snack2 = originalMenus.snack[1] || originalMenus.snack[0];

  if (!bfast || !snack1 || !lunch || !snack2 || !dinner) {
    showModal("El archivo JSON cargado no contiene los 5 menús necesarios (desayuno, 2 snacks, comida, cena) para autocompletar.");
    return;
  }
  
  // 2. Confirmar
  const confirmed = await showModal("¿Estás seguro de autocompletar la semana? Esto reemplazará tu selección actual.", true);
  
  if (!confirmed) return;

  // 3. Reiniciar estado de selección
  initializeSelectionState(); // Limpia todo

  // 4. Llenar el estado
  selectionState.breakfast = [{
    menuName: bfast.menuName,
    daysUsed: TOTAL_DAYS,
    dishes: bfast.dishes,
  }];
  selectionState.snack1 = [{
    menuName: snack1.menuName,
    daysUsed: TOTAL_DAYS,
    dishes: snack1.dishes,
  }];
  selectionState.lunch = [{
    menuName: lunch.menuName,
    daysUsed: TOTAL_DAYS,
    dishes: lunch.dishes,
  }];
  selectionState.snack2 = [{
    menuName: snack2.menuName,
    daysUsed: TOTAL_DAYS,
    dishes: snack2.dishes,
  }];
  selectionState.dinner = [{
    menuName: dinner.menuName,
    daysUsed: TOTAL_DAYS,
    dishes: dinner.dishes,
  }];
  
  // 5. Marcar categorías como completadas
  CATEGORY_ORDER.forEach(cat => {
    selectionState.completedCategories[cat] = TOTAL_DAYS;
  });
  
  // 6. Mover al final (para que muestre el resumen)
  selectionState.currentCategoryIndex = CATEGORY_ORDER.length;
  
  // 7. Guardar y renderizar (mostrará el resumen)
  saveStateToLocalStorage();
  renderApp();
}
// FIN DE CAMBIO

function checkForSharedSummary() {
  const hash = window.location.hash || "";
  const prefix = "#share=";
  if (hash.startsWith(prefix)) {
    return hash.slice(prefix.length);
  }
  return null;
}

// Funciones de utilidad
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
allMenus
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