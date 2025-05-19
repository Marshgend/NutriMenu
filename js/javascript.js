/************************************************************
 * javascript.js
 * Optimizado y robusto, con eliminación segura y estilos mejorados
 * + Separadores de ingredientes solo si hay datos
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

window.addEventListener("DOMContentLoaded", init);

function init() {
  const sharedData = checkForSharedSummary();
  if (sharedData) {
    try {
      const decoded = JSON.parse(atob(sharedData));
      selectionState = decoded;
      hideHeaderFooter(true);
      renderSharedSummary();
      return;
    } catch (err) {
      showModal("No se pudo decodificar el resumen compartido.", { type: "error" });
    }
  }

  loadStateFromLocalStorage();
  ensureSelectionStateIntegrity();

  fetch("json_directory.json")
    .then((res) => res.json())
    .then((directoryData) => {
      const files = directoryData.jsonFiles || [];
      return loadAllJsonMenus(files);
    })
    .then((loadResult) => {
      if (loadResult && loadResult.errors && loadResult.errors.length > 0) {
        showModal(
          `Algunos menús no se pudieron cargar:<br>${loadResult.errors
            .map((e) => `<div style="color:#e88">${e}</div>`)
            .join("")}`,
          { type: "warning" }
        );
      }
      if (selectionState.shuffledMenus) {
        allMenus = deepClone(selectionState.shuffledMenus);
      } else {
        copyOriginalToAllMenus_NoShuffle();
      }
      renderApp();
    })
    .catch((err) => {
      showModal("Error al cargar la lista de archivos JSON.", { type: "error" });
      const appDiv = document.getElementById("app");
      appDiv.textContent = "Error al cargar la lista de archivos JSON.";
    });
}

function checkForSharedSummary() {
  const hash = window.location.hash || "";
  const prefix = "#share=";
  if (hash.startsWith(prefix)) {
    return hash.slice(prefix.length);
  }
  return null;
}

function renderSharedSummary() {
  const appDiv = document.getElementById("app");
  appDiv.innerHTML = "";
  hideHeaderFooter(true);

  const summaryDiv = document.createElement("div");
  summaryDiv.className = "selection-summary";

  summaryDiv.appendChild(createElement("h2", "Resumen de tu Semana (Compartido)"));

  CATEGORY_ORDER.forEach((cat) => {
    if (selectionState[cat] && selectionState[cat].length > 0) {
      summaryDiv.appendChild(createElement("h3", mapCategoryToSpanish(cat)));
      selectionState[cat].forEach((sel) => {
        summaryDiv.appendChild(renderMenuBlock(sel));
      });
    }
  });

  summaryDiv.appendChild(createButton("Copiar Resumen", "btn-copy", copySummaryToClipboard));
  summaryDiv.appendChild(
    createButton("Ir a la página inicial", "btn-restart", () => {
      window.location.href = window.location.origin + window.location.pathname;
    })
  );

  appDiv.appendChild(summaryDiv);
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
          } else {
            errors.push(`El valor de '${key}' no es un array en ${file}.`);
          }
        });
      })
      .catch((err) => {
        errors.push(`Error al cargar el archivo ${file}: ${err.message}`);
      })
  );

  return Promise.all(promises).then(() => ({ errors }));
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
      dinner: 0,
    },
    currentCategoryIndex: 0,
    tempSelections: {},
    shuffledMenus: null,
    globalUndoHistory: [],
  };
  saveStateToLocalStorage();
}

function saveStateToLocalStorage() {
  try {
    localStorage.setItem("nutriSelectionStateDark", JSON.stringify(selectionState));
  } catch (e) {
    showModal("No se pudo guardar el estado local.", { type: "error" });
  }
}

function loadStateFromLocalStorage() {
  const data = localStorage.getItem("nutriSelectionStateDark");
  if (data) {
    try {
      selectionState = JSON.parse(data);
    } catch (err) {
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
  if (
    !selectionState.tempSelections ||
    typeof selectionState.tempSelections !== "object"
  )
    selectionState.tempSelections = {};
  if (selectionState.currentCategoryIndex === undefined)
    selectionState.currentCategoryIndex = 0;
  if (!selectionState.initialized) selectionState.initialized = true;
  if (!("shuffledMenus" in selectionState)) selectionState.shuffledMenus = null;
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

  appDiv.appendChild(renderProgressBar(categoryKey, usedDays));

  const questionBlock = createElement("div", null, "question-block");
  questionBlock.appendChild(createElement("h3", `Selecciona tu opción de ${mapCategoryToSpanish(categoryKey)}`));

  const selectionRow = createElement("div", null, "selection-row");
  questionBlock.appendChild(selectionRow);

  const menuDiv = createElement("div", null, "selection-menu");
  selectionRow.appendChild(menuDiv);

  const daysDiv = createElement("div", null, "selection-days");
  selectionRow.appendChild(daysDiv);

  let arrayKey = categoryKey;

  if (!allMenus[arrayKey] || allMenus[arrayKey].length === 0) {
    questionBlock.appendChild(createElement("p", "No hay menús disponibles para esta categoría."));
  } else {
    const selectMenu = createElement("select", null, "menu-select");
    menuDiv.appendChild(selectMenu);

    selectMenu.appendChild(createElement("option", "--Selecciona--", null, { value: "" }));

    allMenus[arrayKey].forEach((menuObj, idx) => {
      selectMenu.appendChild(
        createElement("option", menuObj.menuName, null, { value: idx })
      );
    });

    const remainingDays = TOTAL_DAYS - usedDays;
    const selectDays = createElement("select", null, "days-select");
    for (let i = 1; i <= remainingDays; i++) {
      selectDays.appendChild(
        createElement("option", `${i} día${i > 1 ? "s" : ""}`, null, { value: i })
      );
    }
    daysDiv.appendChild(selectDays);

    const temp = selectionState.tempSelections[categoryKey] || {};
    if (
      temp.menuIndex !== undefined &&
      temp.menuIndex < allMenus[arrayKey].length
    ) {
      selectMenu.value = temp.menuIndex;
    }
    if (
      temp.dayIndex !== undefined &&
      temp.dayIndex < selectDays.options.length
    ) {
      selectDays.selectedIndex = temp.dayIndex;
    }

    selectMenu.addEventListener("change", () => {
      selectionState.tempSelections[categoryKey] =
        selectionState.tempSelections[categoryKey] || {};
      selectionState.tempSelections[categoryKey].menuIndex = selectMenu.value;
      saveStateToLocalStorage();
    });

    selectDays.addEventListener("change", () => {
      selectionState.tempSelections[categoryKey] =
        selectionState.tempSelections[categoryKey] || {};
      selectionState.tempSelections[categoryKey].dayIndex =
        selectDays.selectedIndex;
      saveStateToLocalStorage();
    });

    const buttonRow = createElement("div", null, "button-row");
    questionBlock.appendChild(buttonRow);

    buttonRow.appendChild(
      createButton("Aceptar", "btn-accept-light", async () => {
        const menuIndexStr = selectMenu.value;
        if (!menuIndexStr) {
          await showModal("Por favor, selecciona un menú.");
          return;
        }
        const daysSelected = parseInt(selectDays.value, 10);
        const menuIndex = parseInt(menuIndexStr, 10);

        if (
          isNaN(menuIndex) ||
          menuIndex < 0 ||
          menuIndex >= allMenus[arrayKey].length
        ) {
          await showModal("Selección inválida.");
          return;
        }

        const chosenMenu = allMenus[arrayKey][menuIndex];
        if (!chosenMenu || !chosenMenu.menuName) {
          await showModal("Menú inválido.");
          return;
        }

        selectionState[categoryKey].push({
          menuName: chosenMenu.menuName,
          daysUsed: daysSelected,
          dishes: chosenMenu.dishes,
        });

        selectionState.completedCategories[categoryKey] += daysSelected;

        selectionState.globalUndoHistory = selectionState.globalUndoHistory || [];
        selectionState.globalUndoHistory.push({
          category: categoryKey,
          menu: deepClone(chosenMenu),
          menuIndex: menuIndex,
          daysUsed: daysSelected,
        });

        allMenus[arrayKey].splice(menuIndex, 1);

        delete selectionState.tempSelections[categoryKey];

        saveStateToLocalStorage();

        if (selectionState.completedCategories[categoryKey] >= TOTAL_DAYS) {
          goToNextCategory();
        } else {
          renderApp();
        }
      })
    );

    if (
      Array.isArray(selectionState.globalUndoHistory) &&
      selectionState.globalUndoHistory.length > 0
    ) {
      buttonRow.appendChild(
        createButton("Deshacer última selección", "btn-undo", undoLastSelectionGlobal)
      );
    }

    buttonRow.appendChild(
      createButton("Reiniciar Todo", "btn-restart", async () => {
        const confirmed = await showModal(
          "¿Estás seguro de reiniciar todo?",
          { confirm: true }
        );
        if (confirmed) resetAll();
      })
    );
  }

  appDiv.appendChild(questionBlock);
}

function undoLastSelectionGlobal() {
  if (
    !Array.isArray(selectionState.globalUndoHistory) ||
    selectionState.globalUndoHistory.length === 0
  ) {
    return;
  }
  const last = selectionState.globalUndoHistory.pop();
  const { category, menu, menuIndex, daysUsed } = last;

  if (
    Array.isArray(selectionState[category]) &&
    selectionState[category].length > 0
  ) {
    selectionState[category].pop();
    selectionState.completedCategories[category] -= daysUsed;

    if (!allMenus[category]) allMenus[category] = [];
    const idx = Math.max(0, Math.min(menuIndex, allMenus[category].length));
    allMenus[category].splice(idx, 0, menu);
  }

  const catIdx = CATEGORY_ORDER.indexOf(category);
  if (catIdx < selectionState.currentCategoryIndex) {
    selectionState.currentCategoryIndex = catIdx;
  }

  saveStateToLocalStorage();

  if (!allCategoriesCompleted()) {
    renderApp();
  } else {
    renderSummary();
  }
}

function goToNextCategory() {
  selectionState.currentCategoryIndex++;
  saveStateToLocalStorage();
  renderApp();
}

function allCategoriesCompleted() {
  return CATEGORY_ORDER.every(
    (cat) => selectionState.completedCategories[cat] >= TOTAL_DAYS
  );
}

function renderSummary() {
  const appDiv = document.getElementById("app");
  appDiv.innerHTML = "";
  hideHeaderFooter(true);

  const summaryDiv = createElement("div", null, "selection-summary");
  summaryDiv.appendChild(createElement("h2", "Resumen de tu Semana"));

  CATEGORY_ORDER.forEach((cat) => {
    if (selectionState[cat].length > 0) {
      summaryDiv.appendChild(createElement("h3", mapCategoryToSpanish(cat)));
      selectionState[cat].forEach((sel) => {
        summaryDiv.appendChild(renderMenuBlock(sel));
      });
    }
  });

  summaryDiv.appendChild(createButton("Copiar Resumen", "btn-copy", copySummaryToClipboard));
  summaryDiv.appendChild(createButton("Compartir Resumen (Link)", "btn-copy", shareSummaryLink));

  if (
    Array.isArray(selectionState.globalUndoHistory) &&
    selectionState.globalUndoHistory.length > 0
  ) {
    const btnUndo = createButton("Deshacer última selección", "btn-undo btn-undo-summary", undoLastSelectionGlobal);
    summaryDiv.appendChild(btnUndo);
  }

  summaryDiv.appendChild(
    createButton("Reiniciar Todo", "btn-restart", async () => {
      const confirmed = await showModal(
        "¿Estás seguro de reiniciar todo?",
        { confirm: true }
      );
      if (confirmed) resetAll();
    })
  );

  appDiv.appendChild(summaryDiv);
}

async function copySummaryToClipboard() {
  const text = buildSummaryText();
  try {
    await navigator.clipboard.writeText(text);
    await showModal("¡Resumen copiado al portapapeles!");
  } catch (err) {
    await showModal("Hubo un error al copiar el resumen.", { type: "error" });
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
            text += `      ${buildIngredientLine(ing)}\n`;
          });
        });
        text += "\n";
      });
      text += "\n";
    }
  });
  return text.trim() + "\n";
}

// NUEVO: Construye la línea del ingrediente solo con los datos presentes
function buildIngredientLine(ing) {
  const parts = [];
  // Métrica
  if (ing.metricQuantity && ing.metricUnit) {
    parts.push(`${ing.metricQuantity} ${ing.metricUnit}`);
  } else if (ing.metricQuantity) {
    parts.push(`${ing.metricQuantity}`);
  } else if (ing.metricUnit) {
    parts.push(`${ing.metricUnit}`);
  }
  // Alternativa
  if (ing.alternativeQuantity && ing.alternativeUnit) {
    parts.push(`${ing.alternativeQuantity} ${ing.alternativeUnit}`);
  } else if (ing.alternativeQuantity) {
    parts.push(`${ing.alternativeQuantity}`);
  } else if (ing.alternativeUnit) {
    parts.push(`${ing.alternativeUnit}`);
  }
  return [ing.name, ...parts].join(" | ");
}

async function shareSummaryLink() {
  try {
    const jsonState = JSON.stringify(selectionState);
    const encoded = btoa(jsonState);
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = baseUrl + "#share=" + encoded;
    await navigator.clipboard.writeText(shareUrl);
    await showModal(
      "Link de resumen copiado al portapapeles:<br><small>" + shareUrl + "</small>"
    );
  } catch (err) {
    await showModal("Ocurrió un error al copiar el link.", { type: "error" });
  }
}

function resetAll() {
  localStorage.removeItem("nutriSelectionStateDark");
  initializeSelectionState();
  copyOriginalToAllMenus_NoShuffle();
  shuffleAllMenus();
  selectionState.shuffledMenus = deepClone(allMenus);
  saveStateToLocalStorage();
  window.location.hash = "";
  renderApp();
}

function hideHeaderFooter(hide) {
  const header = document.querySelector("header");
  const footer = document.querySelector("footer");
  if (header) header.style.display = hide ? "none" : "";
  if (footer) footer.style.display = hide ? "none" : "";
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

// --------- COMPONENTES Y UTILIDADES ---------

function createElement(tag, text, className, attrs = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== null && text !== undefined) el.innerHTML = text;
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function createButton(text, className, onClick) {
  const btn = createElement("button", text, className);
  btn.type = "button";
  btn.addEventListener("click", onClick);
  return btn;
}

function renderMenuBlock(sel) {
  const menuBlock = createElement("div", null, "summary-menu-block");
  menuBlock.appendChild(
    createElement(
      "h4",
      `${sel.menuName} - ${sel.daysUsed} día${sel.daysUsed > 1 ? "s" : ""}`
    )
  );
  sel.dishes.forEach((dish) => {
    menuBlock.appendChild(createElement("div", dish.name, "summary-dish"));
    dish.ingredients.forEach((ing) => {
      // Usar buildIngredientLine para evitar separadores extra
      menuBlock.appendChild(createElement("div", buildIngredientLine(ing), "summary-ingredient"));
    });
  });
  return menuBlock;
}

function renderProgressBar(categoryKey, usedDays) {
  const bar = createElement("div", null, "progress-bar");
  const label = createElement(
    "span",
    `Progreso: ${mapCategoryToSpanish(categoryKey)} (${usedDays} / ${TOTAL_DAYS} días)`,
    "progress-label"
  );
  const outer = createElement("div", null, "progress-outer");
  const inner = createElement("div", null, "progress-inner");
  const percent = Math.min(usedDays / TOTAL_DAYS, 1);
  inner.style.width = `${percent * 100}%`;
  outer.appendChild(inner);
  bar.appendChild(label);
  bar.appendChild(outer);
  return bar;
}

// --------- MODAL ACCESIBLE ---------

function showModal(message, options = {}) {
  return new Promise((resolve) => {
    const oldModal = document.getElementById("nutri-modal-bg");
    if (oldModal) oldModal.remove();

    const bg = document.createElement("div");
    bg.id = "nutri-modal-bg";
    bg.className = "nutri-modal-bg";
    bg.tabIndex = -1;

    const modal = document.createElement("div");
    modal.className = "nutri-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("tabindex", "0");
    modal.innerHTML = `<div class="nutri-modal-message">${message}</div>`;

    const btnRow = document.createElement("div");
    btnRow.className = "nutri-modal-btnrow";

    if (options.confirm) {
      const btnYes = createButton("Sí", "nutri-modal-btn nutri-modal-btn-yes", () => {
        closeModal();
        resolve(true);
      });
      const btnNo = createButton("No", "nutri-modal-btn nutri-modal-btn-no", () => {
        closeModal();
        resolve(false);
      });
      btnRow.appendChild(btnYes);
      btnRow.appendChild(btnNo);
    } else {
      const btnOk = createButton("Aceptar", "nutri-modal-btn nutri-modal-btn-ok", () => {
        closeModal();
        resolve();
      });
      btnRow.appendChild(btnOk);
    }
    modal.appendChild(btnRow);
    bg.appendChild(modal);
    document.body.appendChild(bg);

    setTimeout(() => modal.focus(), 10);

    function closeModal() {
      bg.remove();
      document.removeEventListener("keydown", onKey);
      bg.removeEventListener("mousedown", onClickOutside);
    }

    function onKey(e) {
      if (e.key === "Escape") {
        closeModal();
        if (options.confirm) resolve(false);
        else resolve();
      }
    }
    function onClickOutside(e) {
      if (e.target === bg) {
        closeModal();
        if (options.confirm) resolve(false);
        else resolve();
      }
    }
    document.addEventListener("keydown", onKey);
    bg.addEventListener("mousedown", onClickOutside);
  });
}