(function () {
  "use strict";

  const config = window.PLANILLA_CONFIG;
  if (!config) {
    console.error("Falta window.PLANILLA_CONFIG en esta página.");
    return;
  }

  const STORAGE_KEY = config.storageKey;
  const defaultData = config.defaultData;

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultData);
      const parsed = JSON.parse(raw);
      return {
        income: typeof parsed.income === "number" ? parsed.income : defaultData.income,
        fixed: Array.isArray(parsed.fixed) ? parsed.fixed : structuredClone(defaultData.fixed),
        cmr: parsed.cmr ? parsed.cmr : structuredClone(defaultData.cmr),
        outings: Array.isArray(parsed.outings) ? parsed.outings : structuredClone(defaultData.outings),
        savings: Array.isArray(parsed.savings) ? parsed.savings : structuredClone(defaultData.savings || [])
      };
    } catch (e) {
      console.warn("No se pudo leer localStorage, usando valores por defecto.", e);
      return structuredClone(defaultData);
    }
  }

  let data = loadData();
  let savedIndicatorTimeout = null;
  let saveDebounceTimer = null;

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const indicator = document.getElementById("savedIndicator");
    if (indicator) {
      indicator.textContent = "Guardado ✓ " + new Date().toLocaleTimeString("es-CL");
      clearTimeout(savedIndicatorTimeout);
      savedIndicatorTimeout = setTimeout(() => { indicator.textContent = ""; }, 2000);
    }
  }

  function saveDebounced() {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(saveData, 300);
  }

  function formatCLP(value) {
    const n = Number(value) || 0;
    return "$" + n.toLocaleString("es-CL");
  }

  function setHeader() {
    const nameEl = document.getElementById("personName");
    if (nameEl) nameEl.textContent = config.headerTitle || ("Planilla de " + config.personName);

    const monthEl = document.getElementById("monthLabel");
    if (monthEl) {
      const now = new Date();
      const label = now.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
      monthEl.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    }
  }

  function sumAmounts(items) {
    return items.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  }

  function renderList(containerId, items, emptyText) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";

    if (items.length === 0) {
      const hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = emptyText || "Sin ítems todavía. Agrega uno abajo.";
      container.appendChild(hint);
      return;
    }

    items.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!item.paid;
      checkbox.addEventListener("change", () => {
        items[index].paid = checkbox.checked;
        nameSpan.classList.toggle("paid", checkbox.checked);
        update();
      });

      const nameSpan = document.createElement("span");
      nameSpan.className = "name" + (item.paid ? " paid" : "");
      nameSpan.textContent = item.name;

      const amountWrap = document.createElement("div");
      amountWrap.className = "amount-wrap";

      const currency = document.createElement("span");
      currency.className = "currency";
      currency.textContent = "$";

      const amountInput = document.createElement("input");
      amountInput.type = "number";
      amountInput.min = "0";
      amountInput.step = "1000";
      amountInput.value = item.amount;
      amountInput.addEventListener("input", () => {
        const val = parseFloat(amountInput.value);
        items[index].amount = isNaN(val) ? 0 : val;
        update();
      });

      amountWrap.appendChild(currency);
      amountWrap.appendChild(amountInput);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.type = "button";
      deleteBtn.textContent = "✕";
      deleteBtn.setAttribute("aria-label", "Eliminar");
      deleteBtn.addEventListener("click", () => {
        items.splice(index, 1);
        renderAll();
      });

      row.appendChild(checkbox);
      row.appendChild(nameSpan);
      row.appendChild(amountWrap);
      row.appendChild(deleteBtn);
      container.appendChild(row);
    });
  }

  function setupAddForm(prefix, items) {
    const nameInput = document.getElementById(prefix + "AddName");
    const amountInput = document.getElementById(prefix + "AddAmount");
    const addBtn = document.getElementById(prefix + "AddBtn");

    function addItem() {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      const amount = parseFloat(amountInput.value);
      items.push({ name: name, amount: isNaN(amount) ? 0 : amount, paid: false });
      nameInput.value = "";
      amountInput.value = "";
      renderAll();
      nameInput.focus();
    }

    addBtn.addEventListener("click", addItem);
    [nameInput, amountInput].forEach((el) => {
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          addItem();
        }
      });
    });
  }

  function renderAll() {
    document.getElementById("incomeInput").value = data.income;
    document.getElementById("cmrDebt").value = data.cmr.debt;
    document.getElementById("cmrMin").value = data.cmr.min;
    document.getElementById("cmrPaid").checked = !!data.cmr.paid;

    renderList("fixedList", data.fixed, "Sin gastos fijos todavía. Agrega uno abajo.");
    renderList("outingList", data.outings, "Sin salidas todavía. Agrega una abajo.");
    renderList("savingsList", data.savings, "Sin ahorros todavía. Agrega uno abajo.");

    update();
  }

  function update() {
    const income = Number(data.income) || 0;
    const fixedTotal = sumAmounts(data.fixed);
    const outingTotal = sumAmounts(data.outings);
    const savingsTotal = sumAmounts(data.savings);
    const cmrMin = Number(data.cmr.min) || 0;
    const cmrDebt = Number(data.cmr.debt) || 0;

    const totalExpenses = fixedTotal + outingTotal + cmrMin + savingsTotal;
    const available = income - totalExpenses;

    document.getElementById("fixedTotalLabel").textContent = formatCLP(fixedTotal);
    document.getElementById("outingTotalLabel").textContent = formatCLP(outingTotal);
    document.getElementById("savingsTotalLabel").textContent = formatCLP(savingsTotal);

    document.getElementById("sumIncome").textContent = formatCLP(income);
    document.getElementById("sumFixed").textContent = formatCLP(fixedTotal);
    document.getElementById("sumCmr").textContent = formatCLP(cmrMin);
    document.getElementById("sumOuting").textContent = formatCLP(outingTotal);
    document.getElementById("sumSavings").textContent = formatCLP(savingsTotal);

    const availableEl = document.getElementById("sumAvailable");
    availableEl.textContent = formatCLP(available);
    availableEl.className = available < 0 ? "amount-red" : "amount-green";

    const summaryBox = document.getElementById("summaryBox");
    summaryBox.classList.toggle("alert", available < 0);

    const remaining = cmrDebt - cmrMin;
    document.getElementById("cmrRemaining").textContent =
      "Deuda restante tras pago mínimo: " + formatCLP(remaining < 0 ? 0 : remaining);

    saveDebounced();
  }

  document.getElementById("incomeInput").addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    data.income = isNaN(val) ? 0 : val;
    update();
  });

  document.getElementById("cmrDebt").addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    data.cmr.debt = isNaN(val) ? 0 : val;
    update();
  });

  document.getElementById("cmrMin").addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    data.cmr.min = isNaN(val) ? 0 : val;
    update();
  });

  document.getElementById("cmrPaid").addEventListener("change", (e) => {
    data.cmr.paid = e.target.checked;
    update();
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!confirm("¿Resetear el mes? Esto desmarcará todos los gastos y ahorros pagados, pero mantendrá los montos.")) {
      return;
    }
    data.fixed.forEach((item) => { item.paid = false; });
    data.outings.forEach((item) => { item.paid = false; });
    data.savings.forEach((item) => { item.paid = false; });
    data.cmr.paid = false;
    renderAll();
    saveData();
  });

  setupAddForm("fixed", data.fixed);
  setupAddForm("outing", data.outings);
  setupAddForm("savings", data.savings);

  setHeader();
  renderAll();
})();
