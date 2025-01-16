/************************************************************
 * javascript.js
 * Versión simplificada para unificación de Snack1 & Snack2 en "snack"
 * Tema oscuro/morado
 * Muestra un resumen COMPLETO (platillos e ingredientes)
 ************************************************************/

const CATEGORY_ORDER = ["breakfast", "snack1", "lunch", "snack2", "dinner"];
const TOTAL_DAYS = 7;

// Unificación de snack1 y snack2 en "snack"
let allMenus = {
  "breakfast": [],
  "snack": [],
  "lunch": [],
  "dinner": []
};

// Estado de selección (guardado en localStorage)
let selectionState = {};

window.addEventListener("DOMContentLoaded", init);

function init() {
  loadStateFromLocalStorage();
  ensureSelectionStateIntegrity();
  if (!selectionState.initialized) {
    initializeSelectionState();
  }

  fetch("json_directory.json")
    .then(res => res.json())
    .then(directoryData => {
      const files = directoryData.jsonFiles || [];
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
        return null;
      })
  );

  return Promise.all(promises).then(listOfMenus => {
    listOfMenus.forEach(menuData => {
      if (!menuData) return;

      Object.keys(menuData).forEach(key => {
        if (key === "id") return;

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
      dinner: 0
    },
    currentCategoryIndex: 0,
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
  if (!selectionState || typeof selectionState !== 'object') {
    initializeSelectionState();
    return;
  }

  CATEGORY_ORDER.forEach(cat => {
    if (!Array.isArray(selectionState[cat])) {
      selectionState[cat] = [];
    }
    if (!selectionState.completedCategories) {
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

  const questionBlock = document.createElement("div");
  questionBlock.classList.add("question-block");

  const catSpanish = mapCategoryToSpanish(categoryKey);
  const h3 = document.createElement("h3");
  h3.textContent = `Selecciona tu opción de ${catSpanish}`;
  questionBlock.appendChild(h3);

  const selectionRow = document.createElement("div");
  selectionRow.classList.add("selection-row");
  questionBlock.appendChild(selectionRow);

  const menuDiv = document.createElement("div");
  menuDiv.classList.add("selection-menu");
  selectionRow.appendChild(menuDiv);

  const daysDiv = document.createElement("div");
  daysDiv.classList.add("selection-days");
  selectionRow.appendChild(daysDiv);

  let arrayKey = categoryKey;
  if (arrayKey === "snack1" || arrayKey === "snack2") {
    arrayKey = "snack";
  }

  if (!allMenus[arrayKey] || allMenus[arrayKey].length === 0) {
    const p = document.createElement("p");
    p.textContent = "No hay menús disponibles para esta categoría.";
    questionBlock.appendChild(p);
  } else {
    // Select Menú
    const selectMenu = document.createElement("select");
    selectMenu.classList.add("menu-select");
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

    // Select Días
    const remainingDays = TOTAL_DAYS - usedDays;
    const selectDays = document.createElement("select");
    selectDays.classList.add("days-select");
    for (let i = 1; i <= remainingDays; i++) {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = `${i} día${i > 1 ? 's' : ''}`;
      selectDays.appendChild(opt);
    }
    daysDiv.appendChild(selectDays);

    // Restaurar selección
    const temp = selectionState.tempSelections[categoryKey] || {};
    if (temp.menuIndex !== undefined && temp.menuIndex < allMenus[arrayKey].length) {
      selectMenu.value = temp.menuIndex;
    }
    if (temp.dayIndex !== undefined && temp.dayIndex < selectDays.options.length) {
      selectDays.selectedIndex = temp.dayIndex;
    }

    // Guardar selección temporal
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

    // Botones
    const buttonRow = document.createElement("div");
    buttonRow.classList.add("button-row");
    questionBlock.appendChild(buttonRow);

    const btnAccept = document.createElement("button");
    btnAccept.textContent = "Aceptar";
    btnAccept.classList.add("btn-accept-light");
    buttonRow.appendChild(btnAccept);

    const btnReset = document.createElement("button");
    btnReset.textContent = "Reiniciar Todo";
    btnReset.classList.add("btn-restart");
    buttonRow.appendChild(btnReset);

    btnReset.addEventListener("click", () => {
      if (confirm("¿Estás seguro de reiniciar todo?")) {
        resetAll();
      }
    });

    btnAccept.addEventListener("click", () => {
      const menuIndexStr = selectMenu.value;
      if (!menuIndexStr) {
        alert("Por favor, selecciona un menú.");
        return;
      }
      const daysSelected = parseInt(selectDays.value, 10);

      const menuIndex = parseInt(menuIndexStr, 10);
      const chosenMenu = allMenus[arrayKey][menuIndex];

      // Almacenar la selección
      selectionState[categoryKey].push({
        menuName: chosenMenu.menuName,
        daysUsed: daysSelected,
        dishes: chosenMenu.dishes
      });

      // Actualizar conteo
      selectionState.completedCategories[categoryKey] += daysSelected;

      // Limpiar selección temporal
      delete selectionState.tempSelections[categoryKey];
      saveStateToLocalStorage();

      if (selectionState.completedCategories[categoryKey] >= TOTAL_DAYS) {
        goToNextCategory();
      } else {
        renderApp();
      }
    });
  }

  appDiv.appendChild(questionBlock);
}

function goToNextCategory() {
  selectionState.currentCategoryIndex++;
  saveStateToLocalStorage();
  renderApp();
}

function allCategoriesCompleted() {
  for (let cat of CATEGORY_ORDER) {
    if (selectionState.completedCategories[cat] < TOTAL_DAYS) {
      return false;
    }
  }
  return true;
}

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
      const catHeader = document.createElement("h3");
      catHeader.textContent = mapCategoryToSpanish(cat);
      summaryDiv.appendChild(catHeader);

      selectionState[cat].forEach(sel => {
        const menuBlock = document.createElement("div");
        menuBlock.classList.add("summary-menu-block");

        const h4 = document.createElement("h4");
        h4.textContent = `${sel.menuName} - ${sel.daysUsed} día${sel.daysUsed > 1 ? 's' : ''}`;
        menuBlock.appendChild(h4);

        sel.dishes.forEach(dish => {
          const dishDiv = document.createElement("div");
          dishDiv.classList.add("summary-dish");
          dishDiv.textContent = dish.name;
          menuBlock.appendChild(dishDiv);

          dish.ingredients.forEach(ing => {
            const ingDiv = document.createElement("div");
            ingDiv.classList.add("summary-ingredient");
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

function resetAll() {
  localStorage.removeItem("nutriSelectionStateDark");
  initializeSelectionState();
  renderApp();
}

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
