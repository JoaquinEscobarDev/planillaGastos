(function () {
  "use strict";

  const config = window.PLANILLA_CONFIG;
  if (!config) {
    console.error("Falta window.PLANILLA_CONFIG en esta página.");
    return;
  }

  const STORAGE_KEY = config.storageKey;
  const API_URL = "/api/data/" + config.personId;
  const defaultData = config.defaultData;

  // Items en secciones "acumulables" (Salidas, Gastos diarios, Ahorro) guardan un
  // monto a sumar (`amount`) por separado del total acumulado (`total`).
  // Los registros viejos solo tenían `amount` representando el total: lo
  // migramos a `total` y dejamos `amount` en 0 para la próxima suma.
  function ensureTotal(items) {
    items.forEach((item) => {
      if (typeof item.total !== "number") {
        item.total = Number(item.amount) || 0;
        item.amount = 0;
      }
    });
    return items;
  }

  function normalize(parsed) {
    return {
      income: typeof parsed.income === "number" ? parsed.income : defaultData.income,
      fixed: Array.isArray(parsed.fixed) ? parsed.fixed : structuredClone(defaultData.fixed),
      cmr: parsed.cmr ? parsed.cmr : structuredClone(defaultData.cmr),
      outings: ensureTotal(Array.isArray(parsed.outings) ? parsed.outings : structuredClone(defaultData.outings)),
      daily: ensureTotal(Array.isArray(parsed.daily) ? parsed.daily : structuredClone(defaultData.daily || [])),
      others: ensureTotal(Array.isArray(parsed.others) ? parsed.others : structuredClone(defaultData.others || [])),
      savings: ensureTotal(Array.isArray(parsed.savings) ? parsed.savings : structuredClone(defaultData.savings || []))
    };
  }

  function loadLocalCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultData);
      return normalize(JSON.parse(raw));
    } catch (e) {
      console.warn("No se pudo leer localStorage, usando valores por defecto.", e);
      return structuredClone(defaultData);
    }
  }

  // `data` keeps stable object/array references so listeners set up once
  // (setupAddForm) keep working after a server sync replaces its contents.
  const data = structuredClone(defaultData);

  function applyRemote(remote) {
    const normalized = normalize(remote);
    data.income = normalized.income;
    data.cmr = normalized.cmr;
    data.fixed.length = 0;
    data.fixed.push(...normalized.fixed);
    data.outings.length = 0;
    data.outings.push(...normalized.outings);
    data.daily.length = 0;
    data.daily.push(...normalized.daily);
    data.others.length = 0;
    data.others.push(...normalized.others);
    data.savings.length = 0;
    data.savings.push(...normalized.savings);
  }

  let savedIndicatorTimeout = null;
  let saveDebounceTimer = null;

  function setIndicator(text) {
    const indicator = document.getElementById("savedIndicator");
    if (!indicator) return;
    indicator.textContent = text;
    clearTimeout(savedIndicatorTimeout);
    savedIndicatorTimeout = setTimeout(() => { indicator.textContent = ""; }, 2500);
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
      .then((res) => {
        if (!res.ok) throw new Error("status " + res.status);
        setIndicator("Sincronizado ✓ " + new Date().toLocaleTimeString("es-CL"));
      })
      .catch((err) => {
        console.warn("No se pudo sincronizar con el servidor, se guardó solo localmente.", err);
        setIndicator("Guardado en este dispositivo (sin conexión)");
      });
  }

  function persistDebounced() {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(persist, 300);
  }

  async function syncFromServer(isInitial) {
    try {
      const res = await fetch(API_URL, { cache: "no-store" });
      if (res.ok) {
        applyRemote(await res.json());
        renderAll();
        return;
      }
      if (isInitial) {
        applyRemote(loadLocalCache());
        renderAll();
        persist();
      }
    } catch (e) {
      console.warn("No se pudo contactar al servidor.", e);
      if (isInitial) {
        applyRemote(loadLocalCache());
        renderAll();
      }
    }
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
      const label = now.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      monthEl.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    }
  }

  function sumAmounts(items) {
    return items.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  }

  function sumTotals(items) {
    return items.reduce((acc, item) => acc + (Number(item.total) || 0), 0);
  }

  function renderList(containerId, items, emptyText, allowTopUp) {
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

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.type = "button";
      deleteBtn.textContent = "✕";
      deleteBtn.setAttribute("aria-label", "Eliminar");
      deleteBtn.addEventListener("click", () => {
        items.splice(index, 1);
        renderAll();
      });

      if (allowTopUp) {
        row.classList.add("topup");

        const main = document.createElement("div");
        main.className = "item-main";

        const totalSpan = document.createElement("span");
        totalSpan.className = "topup-total";
        totalSpan.textContent = formatCLP(item.total);

        main.appendChild(checkbox);
        main.appendChild(nameSpan);
        main.appendChild(totalSpan);
        main.appendChild(deleteBtn);

        const controls = document.createElement("div");
        controls.className = "item-controls";

        const amountInput = document.createElement("input");
        amountInput.type = "number";
        amountInput.min = "0";
        amountInput.step = "100";
        amountInput.placeholder = "Monto a sumar";
        amountInput.className = "topup-input";
        amountInput.value = item.amount || "";
        amountInput.addEventListener("input", () => {
          const val = parseFloat(amountInput.value);
          items[index].amount = isNaN(val) ? 0 : val;
          persistDebounced();
        });

        const minusBtn = document.createElement("button");
        minusBtn.className = "step-btn minus-btn";
        minusBtn.type = "button";
        minusBtn.textContent = "−";
        minusBtn.setAttribute("aria-label", "Restar este monto del total");
        minusBtn.title = "Restar este monto del total (por si apretaste + de más)";
        minusBtn.addEventListener("click", () => {
          const step = Number(items[index].amount) || 0;
          if (step <= 0) return;
          items[index].total = Math.max(0, (Number(items[index].total) || 0) - step);
          renderAll();
        });

        const plusBtn = document.createElement("button");
        plusBtn.className = "step-btn plus-btn";
        plusBtn.type = "button";
        plusBtn.textContent = "+";
        plusBtn.setAttribute("aria-label", "Sumar este monto al total");
        plusBtn.title = "Sumar este monto al total";
        plusBtn.addEventListener("click", () => {
          const step = Number(items[index].amount) || 0;
          if (step <= 0) return;
          items[index].total = (Number(items[index].total) || 0) + step;
          renderAll();
        });

        controls.appendChild(amountInput);
        controls.appendChild(minusBtn);
        controls.appendChild(plusBtn);

        row.appendChild(main);
        row.appendChild(controls);
      } else {
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

        row.appendChild(checkbox);
        row.appendChild(nameSpan);
        row.appendChild(amountWrap);
        row.appendChild(deleteBtn);
      }

      container.appendChild(row);
    });
  }

  function setupAddForm(prefix, items, isTopUp) {
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
      const amt = isNaN(amount) ? 0 : amount;
      if (isTopUp) {
        items.push({ name: name, amount: amt, total: amt, paid: false });
      } else {
        items.push({ name: name, amount: amt, paid: false });
      }
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
    renderList("outingList", data.outings, "Sin salidas todavía. Agrega una abajo.", true);
    renderList("dailyList", data.daily, "Sin gastos diarios todavía. Agrega uno abajo.", true);
    renderList("othersList", data.others, "Sin otros gastos todavía. Agrega uno abajo.", true);
    renderList("savingsList", data.savings, "Sin ahorros todavía. Agrega uno abajo.", true);

    document.querySelector(".container").classList.add("loaded");

    update();
  }

  function update() {
    const income = Number(data.income) || 0;
    const fixedTotal = sumAmounts(data.fixed);
    const outingTotal = sumTotals(data.outings);
    const dailyTotal = sumTotals(data.daily);
    const othersTotal = sumTotals(data.others);
    const savingsTotal = sumTotals(data.savings);
    const cmrMin = Number(data.cmr.min) || 0;
    const cmrDebt = Number(data.cmr.debt) || 0;

    const totalExpenses = fixedTotal + outingTotal + dailyTotal + othersTotal + cmrMin + savingsTotal;
    const available = income - totalExpenses;

    document.getElementById("fixedTotalLabel").textContent = formatCLP(fixedTotal);
    document.getElementById("outingTotalLabel").textContent = formatCLP(outingTotal);
    document.getElementById("dailyTotalLabel").textContent = formatCLP(dailyTotal);
    document.getElementById("othersTotalLabel").textContent = formatCLP(othersTotal);
    document.getElementById("savingsTotalLabel").textContent = formatCLP(savingsTotal);

    document.getElementById("sumIncome").textContent = formatCLP(income);
    document.getElementById("sumFixed").textContent = formatCLP(fixedTotal);
    document.getElementById("sumCmr").textContent = formatCLP(cmrMin);
    document.getElementById("sumOuting").textContent = formatCLP(outingTotal);
    document.getElementById("sumDaily").textContent = formatCLP(dailyTotal);
    document.getElementById("sumOthers").textContent = formatCLP(othersTotal);
    document.getElementById("sumSavings").textContent = formatCLP(savingsTotal);

    const availableEl = document.getElementById("sumAvailable");
    availableEl.textContent = formatCLP(available);
    availableEl.className = available < 0 ? "amount-red" : "amount-green";

    const summaryBox = document.getElementById("summaryBox");
    summaryBox.classList.toggle("alert", available < 0);

    const remaining = cmrDebt - cmrMin;
    document.getElementById("cmrRemaining").textContent =
      "Deuda restante tras pago mínimo: " + formatCLP(remaining < 0 ? 0 : remaining);

    persistDebounced();
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
    data.daily.forEach((item) => { item.paid = false; });
    data.others.forEach((item) => { item.paid = false; });
    data.savings.forEach((item) => { item.paid = false; });
    data.cmr.paid = false;
    renderAll();
    persist();
  });

  setupAddForm("fixed", data.fixed);
  setupAddForm("outing", data.outings, true);
  setupAddForm("daily", data.daily, true);
  setupAddForm("others", data.others, true);
  setupAddForm("savings", data.savings, true);

  // Re-sync when the tab regains focus, so changes made on another device
  // show up without the user needing to know they should refresh.
  function maybeResync() {
    const active = document.activeElement;
    const isEditing = active && (active.tagName === "INPUT");
    if (!isEditing) syncFromServer(false);
  }
  window.addEventListener("focus", maybeResync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") maybeResync();
  });

  setHeader();
  syncFromServer(true);
})();
