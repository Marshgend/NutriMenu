/************************************************************
 * javascript.js
 * Versión con snack1 y snack2 barajados de forma diferente
 * Muestra un resumen COMPLETO (platillos e ingredientes)
 * + Botón para copiar resumen al portapapeles
 * + Parámetro URL para compartir el resumen
 * + Se elimina la opción elegida de la lista para evitar
 *   que reaparezca si todavía faltan días por completar.
 ************************************************************/

const CATEGORY_ORDER = ["breakfast", "snack1", "lunch", "snack2", "dinner"];
const TOTAL_DAYS = 7;

/*
 * Guardamos el contenido original (sin barajar) de los menús
 * exactamente como se cargan de los JSON.
 */
let originalMenus = {
  breakfast: [],
  snack: [],   // <-- Este será la "pool" de snacks
  lunch: [],
  dinner: []
};

/*
 * "allMenus" es lo que realmente se muestra en la página:
 *  - Se baraja al pulsar "Reiniciar Todo".
 *  - Se guardan dos copias diferentes para snack1 y snack2.
 */
let allMenus = {
  breakfast: [],
  snack1: [],
  snack2: [],
  lunch: [],
  dinner: []
};

// Estado de selección (guardado en localStorage)
let selectionState = {};

/**
 * Al cargar el DOM, iniciamos.
 */
window.addEventListener("DOMContentLoaded", init);

/**
 * Función principal de inicialización.
 */
function init() {
  // 1. Revisamos si la URL contiene un resumen compartido (en el hash #share=...)
  const sharedData = checkForSharedSummary();
  if (sharedData) {
    // Si se detecta data en la URL, se omite todo lo de localStorage
    // y se muestra directamente el resumen usando ese estado compartido.
    try {
      const decoded = JSON.parse(atob(sharedData));
      // Sobrescribimos el selectionState
      selectionState = decoded;
      hideHeaderFooter(true);
      renderSharedSummary(); // Renderizamos el resumen directamente
      return; // Evitamos el flujo normal
    } catch (err) {
      console.warn("No se pudo decodificar el resumen compartido:", err);
      // Si falla la decodificación, continuamos con el flujo normal
    }
  }

  // 2. Si no hay sharedData, usamos la lógica de siempre.
  loadStateFromLocalStorage();
  ensureSelectionStateIntegrity();

  // Cargamos los archivos JSON
  fetch("json_directory.json")
    .then(res => res.json())
    .then(directoryData => {
      const files = directoryData.jsonFiles || [];
      return loadAllJsonMenus(files);
    })
    .then(() => {
      // Revisamos si hay un "shuffledMenus" ya guardado
      if (selectionState.shuffledMenus) {
        // Si existe, lo usamos (mismo orden que la última vez)
        allMenus = selectionState.shuffledMenus;
      } else {
        // Si no existe, tomamos "originalMenus" tal cual (sin barajar)
        copyOriginalToAllMenus_NoShuffle();
      }

      renderApp();
    })
    .catch(err => {
      console.error("Error al cargar json_directory.json:", err);
      const appDiv = document.getElementById("app");
      appDiv.textContent = "Error al cargar la lista de archivos JSON.";
    });
}

/**
 * Si la URL contiene #share=..., devolvemos la parte después de "share="; de lo contrario null.
 */
function checkForSharedSummary() {
  const hash = window.location.hash || "";
  const prefix = "#share=";
  if (hash.startsWith(prefix)) {
    const encoded = hash.slice(prefix.length);
    return encoded;
  }
  return null;
}

/**
 * Lógica para renderizar el resumen en modo "solo compartido".
 * Omitimos la parte de localStorage e ignoramos menús, etc.
 */
function renderSharedSummary() {
  const appDiv = document.getElementById("app");
  appDiv.innerHTML = "";

  // Ocultamos header y footer
  hideHeaderFooter(true);

  // Renderizamos igual que un "renderSummary", pero sin las partes de localStorage
  const summaryDiv = document.createElement("div");
  summaryDiv.classList.add("selection-summary");

  const h2 = document.createElement("h2");
  h2.textContent = "Resumen de tu Semana (Compartido)";
  summaryDiv.appendChild(h2);

  CATEGORY_ORDER.forEach(cat => {
    if (selectionState[cat] && selectionState[cat].length > 0) {
      const catHeader = document.createElement("h3");
      catHeader.textContent = mapCategoryToSpanish(cat);
      summaryDiv.appendChild(catHeader);

      selectionState[cat].forEach(sel => {
        const menuBlock = document.createElement("div");
        menuBlock.classList.add("summary-menu-block");

        const h4 = document.createElement("h4");
        h4.textContent = `${sel.menuName} - ${sel.daysUsed} día${
          sel.daysUsed > 1 ? "s" : ""
        }`;
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

  // Botón para copiar resumen (solo texto)
  const btnCopy = document.createElement("button");
  btnCopy.textContent = "Copiar Resumen";
  btnCopy.classList.add("btn-copy");
  btnCopy.style.marginRight = "1rem";
  btnCopy.addEventListener("click", copySummaryToClipboard);
  summaryDiv.appendChild(btnCopy);

  // Botón para "Regresar" (o "Reiniciar Todo")
  const btnGoHome = document.createElement("button");
  btnGoHome.textContent = "Ir a la página inicial";
  btnGoHome.classList.add("btn-restart");
  btnGoHome.addEventListener("click", () => {
    // Simplemente recarga sin hash, para que no muestre el resumen compartido
    window.location.href = window.location.origin + window.location.pathname;
  });
  summaryDiv.appendChild(btnGoHome);

  appDiv.appendChild(summaryDiv);
}

/**
 * Carga la data de cada archivo JSON y la almacena en "originalMenus".
 */
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
        // Se unifica snack... pero realmente se usa "originalMenus.snack"
        if (targetKey.startsWith("snack")) {
          targetKey = "snack";
        }

        if (!originalMenus[targetKey]) {
          originalMenus[targetKey] = [];
        }

        if (Array.isArray(menuData[key])) {
          originalMenus[targetKey].push(...menuData[key]);
        } else {
          console.warn(`El valor de '${key}' no es un array.`, menuData[key]);
        }
      });
    });
  });
}

/**
 * Inicializa por completo el estado (selectionState).
 */
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
    tempSelections: {},
    /*
     * Aquí guardaremos la versión barajada de allMenus.
     * Si es null => usamos el orden "original" sin barajar.
     */
    shuffledMenus: null
  };
  saveStateToLocalStorage();
}

/**
 * Guarda el estado en localStorage.
 */
function saveStateToLocalStorage() {
  localStorage.setItem("nutriSelectionStateDark", JSON.stringify(selectionState));
}

/**
 * Carga el estado desde localStorage.
 */
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

/**
 * Asegura que "selectionState" sea válido.
 */
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

  // Asegurar que exista la propiedad "shuffledMenus"
  if (!("shuffledMenus" in selectionState)) {
    selectionState.shuffledMenus = null;
  }

  saveStateToLocalStorage();
}

/**
 * Copia "originalMenus" en "allMenus" sin barajar (modo original).
 */
function copyOriginalToAllMenus_NoShuffle() {
  allMenus.breakfast = deepClone(originalMenus.breakfast);
  allMenus.snack1 = deepClone(originalMenus.snack);
  allMenus.snack2 = deepClone(originalMenus.snack);
  allMenus.lunch = deepClone(originalMenus.lunch);
  allMenus.dinner = deepClone(originalMenus.dinner);
}

/**
 * Clona en profundidad un objeto/array anidado (en este caso basta con JSON).
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Barajar un array in-place (Fisher-Yates).
 */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Baraja cada categoría en "allMenus" de manera independiente.
 */
function shuffleAllMenus() {
  shuffleArray(allMenus.breakfast);
  shuffleArray(allMenus.snack1);
  shuffleArray(allMenus.snack2);
  shuffleArray(allMenus.lunch);
  shuffleArray(allMenus.dinner);
}

/**
 * Lógica principal de renderizado:
 * Si se completó todo => renderSummary,
 * en caso contrario => render de la selección de la categoría actual.
 */
function renderApp() {
  const appDiv = document.getElementById("app");
  appDiv.innerHTML = "";

  hideHeaderFooter(false);

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

  // "snack1", "snack2", etc.
  let arrayKey = categoryKey;

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

    // Llenamos el select con las opciones en "allMenus[arrayKey]"
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
      opt.textContent = `${i} día${i > 1 ? "s" : ""}`;
      selectDays.appendChild(opt);
    }
    daysDiv.appendChild(selectDays);

    // Restaurar selección temporal
    const temp = selectionState.tempSelections[categoryKey] || {};
    if (
      temp.menuIndex !== undefined &&
      temp.menuIndex < allMenus[arrayKey].length
    ) {
      selectMenu.value = temp.menuIndex;
    }
    if (temp.dayIndex !== undefined && temp.dayIndex < selectDays.options.length) {
      selectDays.selectedIndex = temp.dayIndex;
    }

    // Guardar selección temporal al cambiar
    selectMenu.addEventListener("change", () => {
      selectionState.tempSelections[categoryKey] =
        selectionState.tempSelections[categoryKey] || {};
      selectionState.tempSelections[categoryKey].menuIndex = selectMenu.value;
      saveStateToLocalStorage();
    });

    selectDays.addEventListener("change", () => {
      selectionState.tempSelections[categoryKey] =
        selectionState.tempSelections[categoryKey] || {};
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

    // Manejo del botón "Reiniciar Todo"
    btnReset.addEventListener("click", () => {
      if (confirm("¿Estás seguro de reiniciar todo?")) {
        resetAll();
      }
    });

    // Manejo del botón "Aceptar"
    btnAccept.addEventListener("click", () => {
      const menuIndexStr = selectMenu.value;
      if (!menuIndexStr) {
        alert("Por favor, selecciona un menú.");
        return;
      }
      const daysSelected = parseInt(selectDays.value, 10);
      const menuIndex = parseInt(menuIndexStr, 10);

      const chosenMenu = allMenus[arrayKey][menuIndex];

      // Guardar la selección "aceptada"
      selectionState[categoryKey].push({
        menuName: chosenMenu.menuName,
        daysUsed: daysSelected,
        dishes: chosenMenu.dishes
      });

      // Aumentar el conteo en esta categoría
      selectionState.completedCategories[categoryKey] += daysSelected;

      // Quitar la opción elegida del array para que no reaparezca
      allMenus[arrayKey].splice(menuIndex, 1);

      // Si tenemos un 'shuffledMenus', también removemos de ahí
      if (selectionState.shuffledMenus && selectionState.shuffledMenus[arrayKey]) {
        selectionState.shuffledMenus[arrayKey].splice(menuIndex, 1);
      }

      // Limpiar la selección temporal
      delete selectionState.tempSelections[categoryKey];

      // Guardamos el estado y la lista actualizada
      saveStateToLocalStorage();

      // Si esta categoría ya sumó 7 días, pasamos a la siguiente
      if (selectionState.completedCategories[categoryKey] >= TOTAL_DAYS) {
        goToNextCategory();
      } else {
        // Si aún faltan días en la misma categoría, volvemos a renderizar
        renderApp();
      }
    });
  }

  appDiv.appendChild(questionBlock);
}

/**
 * Avanza a la siguiente categoría en CATEGORY_ORDER y re-renderiza.
 */
function goToNextCategory() {
  selectionState.currentCategoryIndex++;
  saveStateToLocalStorage();
  renderApp();
}

/**
 * Verifica si ya se completaron las 5 categorías (7 días cada una).
 */
function allCategoriesCompleted() {
  for (let cat of CATEGORY_ORDER) {
    if (selectionState.completedCategories[cat] < TOTAL_DAYS) {
      return false;
    }
  }
  return true;
}

/**
 * Renderiza el resumen final.
 */
function renderSummary() {
  const appDiv = document.getElementById("app");
  appDiv.innerHTML = "";

  // Ocultar header y footer en el resumen
  hideHeaderFooter(true);

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
        h4.textContent = `${sel.menuName} - ${sel.daysUsed} día${
          sel.daysUsed > 1 ? "s" : ""
        }`;
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

  // Botón para copiar resumen (texto)
  const btnCopy = document.createElement("button");
  btnCopy.textContent = "Copiar Resumen";
  btnCopy.classList.add("btn-copy");
  btnCopy.style.marginRight = "1rem";
  btnCopy.addEventListener("click", copySummaryToClipboard);
  summaryDiv.appendChild(btnCopy);

  // Botón para compartir link
  const btnShareLink = document.createElement("button");
  btnShareLink.textContent = "Compartir Resumen (Link)";
  btnShareLink.classList.add("btn-copy");
  btnShareLink.style.marginRight = "1rem";
  btnShareLink.addEventListener("click", shareSummaryLink);
  summaryDiv.appendChild(btnShareLink);

  // Botón Reiniciar Todo
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

/**
 * Copia el contenido del resumen al portapapeles (texto).
 */
function copySummaryToClipboard() {
  const text = buildSummaryText();
  navigator.clipboard.writeText(text)
    .then(() => {
      alert("¡Resumen copiado al portapapeles!");
    })
    .catch(err => {
      console.error("Error al copiar al portapapeles:", err);
      alert("Hubo un error al copiar el resumen.");
    });
}

/**
 * Genera una cadena con saltos de línea que representa el resumen.
 */
function buildSummaryText() {
  let text = "Resumen de tu Semana\n\n";

  CATEGORY_ORDER.forEach(cat => {
    if (selectionState[cat].length > 0) {
      text += `${mapCategoryToSpanish(cat)}\n`;
      selectionState[cat].forEach(sel => {
        text += `  ${sel.menuName} - ${sel.daysUsed} día${
          sel.daysUsed > 1 ? "s" : ""
        }\n`;
        sel.dishes.forEach(dish => {
          text += `    ${dish.name}\n`;
          dish.ingredients.forEach(ing => {
            let ingLine = `      ${ing.name} | ${ing.metricQuantity} ${ing.metricUnit}`;
            if (ing.alternativeQuantity && ing.alternativeUnit) {
              ingLine += ` | ${ing.alternativeQuantity} ${ing.alternativeUnit}`;
            }
            text += ingLine + "\n";
          });
        });
        text += "\n";
      });
      text += "\n";
    }
  });

  return text.trim() + "\n";
}

/**
 * Genera un link que codifica el resumen en base64 dentro de la URL (hash).
 * Luego lo copia al portapapeles.
 */
function shareSummaryLink() {
  try {
    const jsonState = JSON.stringify(selectionState);
    const encoded = btoa(jsonState);
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = baseUrl + "#share=" + encoded;

    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        alert("Link de resumen copiado al portapapeles:\n" + shareUrl);
      })
      .catch(err => {
        console.error("Error al copiar link:", err);
        alert("Ocurrió un error al copiar el link.");
      });
  } catch (err) {
    console.error("Error al generar link de compartir:", err);
    alert("Ocurrió un error al generar el link de compartir.");
  }
}

/**
 * Restablece todo, genera nuevos órdenes aleatorios y vuelve al inicio.
 */
function resetAll() {
  // 1. Eliminar el estado actual de localStorage
  localStorage.removeItem("nutriSelectionStateDark");
  initializeSelectionState();

  // 2. Copiar la base original en "allMenus" (dos arrays para snack1 y snack2)
  copyOriginalToAllMenus_NoShuffle();

  // 3. Barajar cada uno por separado
  shuffleAllMenus();

  // 4. Guardar en "selectionState.shuffledMenus" la versión barajada
  selectionState.shuffledMenus = deepClone(allMenus);
  saveStateToLocalStorage();

  // 5. Limpiamos el hash para evitar confusiones
  window.location.hash = "";

  // 6. Renderizamos todo desde cero
  renderApp();
}

/**
 * Muestra u oculta el header y footer.
 * @param {boolean} hide - true para ocultar, false para mostrar
 */
function hideHeaderFooter(hide) {
  const header = document.querySelector("header");
  const footer = document.querySelector("footer");
  if (header) header.style.display = hide ? "none" : "";
  if (footer) footer.style.display = hide ? "none" : "";
}

/**
 * Traduce la categoría a su nombre en español.
 */
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
