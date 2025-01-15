/************************************************************
 * javascript.js
 * Versión con unificación de Snack1 & Snack2 en "snack"
 * Tema oscuro/morado
 * Muestra un resumen COMPLETO (platillos e ingredientes)
 * 
 * - Fila 1: Menú (70%) / Días (30%)
 * - Fila 2: Reiniciar (30%) / Aceptar (70%), Botón Aceptar más claro
 * - Guardar en localStorage las selecciones de los <select> (sin Aceptar)
 * - Eliminar "Ingrediente:" y "Platillo:" del resumen final
 * 
 * Se asume que "json_directory.json" existe al mismo nivel que index.html
 * y que "allMenus['snack']" unifica snack1 y snack2.
 ************************************************************/

// Categorías en orden (7 días cada una).
// Pero internamente usaremos "snack" para la data de menús,
// aunque a nivel estado guardaremos snack1 y snack2 distintos
// para los días.
const CATEGORY_ORDER = ["breakfast", "snack1", "lunch", "snack2", "dinner"];
const TOTAL_DAYS = 7;

// Objeto global: para la interfaz, unificamos snacks en "snack"
let allMenus = {
  "breakfast": [],
  "snack": [],   // Aquí meteremos todo lo que venga de snack1 y snack2
  "lunch": [],
  "dinner": []
};

// Estado de selección (guardado en localStorage).
let selectionState = {};

/*************************************************
 * EVENTO PRINCIPAL
 *************************************************/
window.addEventListener("DOMContentLoaded", init);

function init() {
  loadStateFromLocalStorage();
  ensureSelectionStateIntegrity();
  if (!selectionState.initialized) {
    initializeSelectionState();
  }

  // Cargar archivo "json_directory.json"
  fetch("json_directory.json")
    .then(res => res.json())
    .then(directoryData => {
      const files = directoryData.jsonFiles || [];
      // Cargar cada archivo JSON
      return loadAllJsonMenus(files);
    })
    .then(() => {
      renderApp();
    })
    .catch(err => {
      console.error("Error al cargar json_directory.json:", err);
      const appDiv = document.getElementById("app");
      appDiv.textContent = "Error al cargar la lista de archivos JSON.";
    });
}

/*************************************************
 * FUNCIÓN MODIFICADA PARA CARGAR MENÚS
 * (Ignorar archivos que fallen)
 *************************************************/
function loadAllJsonMenus(fileList) {
  const promises = fileList.map(file =>
    fetch(file)
      .then(r => {
        if (!r.ok) {
          throw new Error(`Error al cargar ${file}: ${r.statusText}`);
        }
        return r.json();
      })
      .catch(err => {
        console.error(`Error al cargar el archivo ${file}:`, err);
        return null; // Ignorar archivos con error individual
      })
  );

  return Promise.all(promises).then(listOfMenus => {
    listOfMenus.forEach(menuData => {
      if (!menuData) return; // Ignorar archivos que no se cargaron bien

      // Unir la info de "snack1" y "snack2" en "snack"
      Object.keys(menuData).forEach(key => {
        if (key === "id") return;

        // Si el key es snack1 o snack2, lo unificamos en allMenus["snack"]
        let targetKey = key.toLowerCase();
        if (targetKey.startsWith("snack")) {
          targetKey = "snack";
        }

        if (!allMenus[targetKey]) {
          allMenus[targetKey] = [];
        }

        if (Array.isArray(menuData[key])) {
          allMenus[targetKey].push(...menuData[key]);
        } else {
          console.warn(`El valor de '${key}' no es un array.`, menuData[key]);
        }
      });
    });
  });
}

/*************************************************
 * ESTADO DE SELECCIÓN
 *************************************************/
function initializeSelectionState() {
  // Estructura base
  selectionState = {
    initialized: true,
    // Para cada categoría real (desayuno, snack1, lunch, snack2, dinner),
    // guardamos un array con { menuName, daysUsed, dishes: [...], etc. }
    breakfast: [],
    snack1: [],
    lunch: [],
    snack2: [],
    dinner: [],
    // cuántos días lleva completados cada categoría
    completedCategories: {
      breakfast: 0,
      snack1: 0,
      lunch: 0,
      snack2: 0,
      dinner: 0
    },
    currentCategoryIndex: 0,
    // Selecciones temporales para restaurar los <select> al recargar
    tempSelections: {}
  };
  saveStateToLocalStorage();
}

function saveStateToLocalStorage() {
  localStorage.setItem("nutriSelectionStateDark", JSON.stringify(selectionState));
}

function loadStateFromLocalStorage() {
  const data = localStorage.getItem("nutriSelectionStateDark");
  if (data) {
    try {
      selectionState = JSON.parse(data);
    } catch (err) {
      console.warn("No se pudo parsear localStorage:", err);
    }
  }
}

function ensureSelectionStateIntegrity() {
  // Asegurarse de que todas las propiedades existan
  if (!selectionState || typeof selectionState !== 'object') {
    initializeSelectionState();
    return;
  }

  // Verificar cada propiedad necesaria
  CATEGORY_ORDER.forEach(cat => {
    if (!Array.isArray(selectionState[cat])) {
      selectionState[cat] = [];
    }
    if (!selectionState.completedCategories || typeof selectionState.completedCategories !== 'object') {
      selectionState.completedCategories = {};
    }
    if (selectionState.completedCategories[cat] === undefined) {
      selectionState.completedCategories[cat] = 0;
    }
  });

  if (!selectionState.tempSelections || typeof selectionState.tempSelections !== 'object') {
    selectionState.tempSelections = {};
  }

  if (selectionState.currentCategoryIndex === undefined) {
    selectionState.currentCategoryIndex = 0;
  }

  if (!selectionState.initialized) {
    selectionState.initialized = true;
  }

  saveStateToLocalStorage();
}

/*************************************************
 * RENDERIZAR INTERFAZ
 *************************************************/
function renderApp() {
  const appDiv = document.getElementById("app");
  appDiv.innerHTML = "";

  // ¿Están todas las categorías completas?
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

  // Bloque de pregunta
  const questionBlock = document.createElement("div");
  questionBlock.classList.add("question-block");

  const catSpanish = mapCategoryToSpanish(categoryKey);
  const h3 = document.createElement("h3");
  h3.textContent = `Selecciona tu opción de ${catSpanish}`;
  questionBlock.appendChild(h3);

  // Fila 1 (70% Menú / 30% Días)
  const selectionRow = document.createElement("div");
  selectionRow.classList.add("selection-row");
  questionBlock.appendChild(selectionRow);

  // Div contenedor 70% para Menú
  const menuDiv = document.createElement("div");
  menuDiv.classList.add("selection-menu");
  menuDiv.style.flexBasis = "70%";
  menuDiv.style.marginRight = "1rem";
  selectionRow.appendChild(menuDiv);

  // Div contenedor 30% para Días
  const daysDiv = document.createElement("div");
  daysDiv.classList.add("selection-days");
  daysDiv.style.flexBasis = "30%";
  selectionRow.appendChild(daysDiv);

  // Determinar si es breakfast, lunch, dinner o snack
  // Para snack1 y snack2, usaremos allMenus["snack"]
  let arrayKey = categoryKey;
  if (arrayKey === "snack1" || arrayKey === "snack2") {
    arrayKey = "snack";
  }

  if (!allMenus[arrayKey] || allMenus[arrayKey].length === 0) {
    const p = document.createElement("p");
    p.textContent = "No hay menús disponibles para esta categoría.";
    questionBlock.appendChild(p);
  } else {
    // 1. Select Menú
    const selectMenu = document.createElement("select");
    selectMenu.classList.add("fixed-select-menu"); // Añadir clase para estilos fijos
    menuDiv.appendChild(selectMenu);

    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "--Selecciona--";
    selectMenu.appendChild(defaultOpt);

    allMenus[arrayKey].forEach((menuObj, idx) => {
      const opt = document.createElement("option");
      opt.value = idx;
      opt.textContent = menuObj.menuName;
      selectMenu.appendChild(opt);
    });

    // 2. Select Días
    const remainingDays = TOTAL_DAYS - usedDays;
    const selectDays = document.createElement("select");
    selectDays.classList.add("fixed-select-days"); // Añadir clase para estilos fijos
    for (let i = 1; i <= remainingDays; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = `${i} día${i > 1 ? 's' : ''}`;
      selectDays.appendChild(opt);
    }
    daysDiv.appendChild(selectDays);

    // Restaurar la selección temporal (si existe)
    const temp = selectionState.tempSelections[categoryKey] || {};
    if (temp.menuIndex !== undefined && temp.menuIndex < allMenus[arrayKey].length) {
      selectMenu.value = temp.menuIndex;
    }
    if (temp.dayIndex !== undefined && temp.dayIndex < selectDays.options.length) {
      selectDays.selectedIndex = temp.dayIndex;
    }

    // Guardar en localStorage la selección temporal al cambiar
    selectMenu.addEventListener("change", () => {
      selectionState.tempSelections[categoryKey] = selectionState.tempSelections[categoryKey] || {};
      selectionState.tempSelections[categoryKey].menuIndex = selectMenu.value;
      saveStateToLocalStorage();
    });

    selectDays.addEventListener("change", () => {
      selectionState.tempSelections[categoryKey] = selectionState.tempSelections[categoryKey] || {};
      selectionState.tempSelections[categoryKey].dayIndex = selectDays.selectedIndex;
      saveStateToLocalStorage();
    });

    // Fila 2 (Botones: Reiniciar 30% y Aceptar 70%)
    const buttonRow = document.createElement("div");
    buttonRow.classList.add("button-row");
    questionBlock.appendChild(buttonRow);

    // Botón Reiniciar (30%)
    const btnReset = document.createElement("button");
    btnReset.textContent = "Reiniciar Todo";
    btnReset.classList.add("btn-restart"); // Mantener clase para estilos de color
    btnReset.style.flexBasis = "30%"; // Asignar flex-basis directamente
    btnReset.style.marginRight = "1rem"; // Espaciado entre botones
    buttonRow.appendChild(btnReset);

    btnReset.addEventListener("click", () => {
      if (confirm("¿Estás seguro de reiniciar todo?")) {
        resetAll();
      }
    });

    // Botón Aceptar (70%)
    const btnAccept = document.createElement("button");
    btnAccept.textContent = "Aceptar";
    btnAccept.classList.add("btn-accept-light"); // Clase para color más claro
    btnAccept.style.flexBasis = "70%"; // Asignar flex-basis directamente
    buttonRow.appendChild(btnAccept);

    btnAccept.addEventListener("click", () => {
      const menuIndexStr = selectMenu.value;
      if (!menuIndexStr) {
        alert("Por favor, selecciona un menú.");
        return;
      }
      const daysSelected = parseInt(selectDays.value, 10);

      const menuIndex = parseInt(menuIndexStr, 10);
      const chosenMenu = allMenus[arrayKey][menuIndex];

      // Almacenar la selección (con TODO su contenido)
      // para poder mostrarlo en el resumen
      selectionState[categoryKey].push({
        menuName: chosenMenu.menuName,
        daysUsed: daysSelected,
        // Guardamos dishes para mostrar ingredientes en resumen
        dishes: chosenMenu.dishes
      });

      // Actualizar conteo
      selectionState.completedCategories[categoryKey] += daysSelected;

      // Limpiar la selección temporal
      delete selectionState.tempSelections[categoryKey];
      saveStateToLocalStorage();

      // Si completamos la categoría, pasamos a la siguiente
      if (selectionState.completedCategories[categoryKey] >= TOTAL_DAYS) {
        goToNextCategory();
      } else {
        // Volver a renderizar la misma
        renderApp();
      }
    });
  }

  appDiv.appendChild(questionBlock);
}

/*************************************************
 * PASAR A LA SIGUIENTE CATEGORÍA
 *************************************************/
function goToNextCategory() {
  selectionState.currentCategoryIndex++;
  saveStateToLocalStorage();
  renderApp();
}

/*************************************************
 * CHECAR SI TODAS LAS CATEGORÍAS ESTÁN COMPLETAS
 *************************************************/
function allCategoriesCompleted() {
  for (let cat of CATEGORY_ORDER) {
    if (selectionState.completedCategories[cat] < TOTAL_DAYS) {
      return false;
    }
  }
  return true;
}

/*************************************************
 * MOSTRAR RESUMEN FINAL (SIN "Ingrediente"/"Platillo")
 *************************************************/
function renderSummary() {
  const appDiv = document.getElementById("app");
  appDiv.innerHTML = "";

  const summaryDiv = document.createElement("div");
  summaryDiv.classList.add("selection-summary");

  const h2 = document.createElement("h2");
  h2.textContent = "Resumen de tu Semana";
  summaryDiv.appendChild(h2);

  CATEGORY_ORDER.forEach(cat => {
    if (selectionState[cat].length > 0) {
      // Título de la categoría
      const catHeader = document.createElement("h3");
      catHeader.textContent = mapCategoryToSpanish(cat);
      summaryDiv.appendChild(catHeader);

      // Cada menú seleccionado
      selectionState[cat].forEach(sel => {
        // Bloque de menú
        const menuBlock = document.createElement("div");
        menuBlock.classList.add("summary-menu-block");

        // Nombre del menú y días
        const h4 = document.createElement("h4");
        h4.textContent = `${sel.menuName} - ${sel.daysUsed} día${sel.daysUsed > 1 ? 's' : ''}`;
        menuBlock.appendChild(h4);

        // Platillos (sin poner "Platillo:")
        sel.dishes.forEach(dish => {
          const dishDiv = document.createElement("div");
          dishDiv.classList.add("summary-dish");
          dishDiv.textContent = dish.name; // Solo el nombre del platillo
          menuBlock.appendChild(dishDiv);

          // Ingredientes (sin poner "Ingrediente:")
          dish.ingredients.forEach(ing => {
            const ingDiv = document.createElement("div");
            ingDiv.classList.add("summary-ingredient");
            // Formato: name | metricQuantity metricUnit | altQuantity altUnit
            let txt = `${ing.name} | ${ing.metricQuantity} ${ing.metricUnit}`;
            if (ing.alternativeQuantity && ing.alternativeUnit) {
              txt += ` | ${ing.alternativeQuantity} ${ing.alternativeUnit}`;
            }
            ingDiv.textContent = txt;
            menuBlock.appendChild(ingDiv);
          });
        });

        summaryDiv.appendChild(menuBlock);
      });
    }
  });

  // Botón reiniciar en el resumen
  const btnReset = document.createElement("button");
  btnReset.textContent = "Reiniciar Todo";
  btnReset.classList.add("btn-restart");
  btnReset.addEventListener("click", () => {
    if (confirm("¿Estás seguro de reiniciar todo?")) {
      resetAll();
    }
  });
  summaryDiv.appendChild(btnReset);

  appDiv.appendChild(summaryDiv);
}

/*************************************************
 * RESET COMPLETO
 *************************************************/
function resetAll() {
  localStorage.removeItem("nutriSelectionStateDark");
  initializeSelectionState();
  renderApp();
}

/*************************************************
 * MAPEAR CATEGORÍA A ESPAÑOL
 *************************************************/
function mapCategoryToSpanish(cat) {
  switch (cat) {
    case "breakfast": return "Desayuno";
    case "snack1":
    case "snack2":
      return "Colación / Snack";
    case "lunch": return "Comida";
    case "dinner": return "Cena";
    default: return cat;
  }
}
