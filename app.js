(() => {
  "use strict";

  const WEEK_STARTS_ON = 1;
  const CLOUD_SYNC_DEBOUNCE_MS = 450;
  const CLOUD_PULL_INTERVAL_MS = 45000;
  const CLOUD_PUSH_RETRY_MS = 1400;
  const CLOUD_PUSH_ERROR_RETRY_MS = 15000;
  const BOOT_SYNC_MAX_WAIT_MS = 8000;
  const BOOT_SYNC_MIN_VISIBLE_MS = 450;
  const LOCAL_STATE_KEY = "discipline_os_state_v2";
  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const HABIT_TYPE_CORNERSTONE = "cornerstone";
  const HABIT_TYPE_REGULAR = "regular";
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  const HABIT_COLOR_PALETTE = [
    "#2563d2",
    "#2f8b5d",
    "#d7842c",
    "#2f94bc",
    "#b1454f",
    "#6a5cb6",
    "#704b8d",
    "#8b6a35",
    "#4c7f95",
    "#4e8a54",
  ];
  const FALLBACK_CLOUD_BOOT_CONFIG = {
    enabled: false,
    webAppUrl: "",
    userId: "default",
  };
  const FALLBACK_AUTH_CONFIG = {
    googleClientId: "",
    allowedEmail: "",
  };
  const CLOUD_BOOT_CONFIG = readCloudBootConfig();
  const AUTH_CONFIG = readAuthConfig();

  const DEFAULT_HABITS = [
    {
      id: "habit_strength_training",
      name: "Strength Training",
      icon: "🏋️",
      color: "#2563d2",
      targetPerWeek: 3,
      scheduledDays: [1, 3, 5],
      type: HABIT_TYPE_CORNERSTONE,
      archived: false,
    },
    {
      id: "habit_sleep",
      name: "7-8 hrs Sleep",
      icon: "😴",
      color: "#5a6fc9",
      targetPerWeek: 7,
      scheduledDays: ALL_DAYS,
      type: HABIT_TYPE_CORNERSTONE,
      archived: false,
    },
    {
      id: "habit_meals",
      name: "Eat Healthy Meals",
      icon: "🥗",
      color: "#2f8b5d",
      targetPerWeek: 7,
      scheduledDays: ALL_DAYS,
      type: HABIT_TYPE_CORNERSTONE,
      archived: false,
    },
    {
      id: "habit_study",
      name: "Study",
      icon: "📚",
      color: "#d7842c",
      targetPerWeek: 6,
      scheduledDays: [0, 1, 2, 3, 4, 5],
      type: HABIT_TYPE_REGULAR,
      archived: false,
    },
    {
      id: "habit_hydration",
      name: "Drink 2L",
      icon: "💧",
      color: "#2f94bc",
      targetPerWeek: 7,
      scheduledDays: ALL_DAYS,
      type: HABIT_TYPE_REGULAR,
      archived: false,
    },
    {
      id: "habit_no_alcohol",
      name: "No Alcohol",
      icon: "🚫",
      color: "#b1454f",
      targetPerWeek: 7,
      scheduledDays: ALL_DAYS,
      type: HABIT_TYPE_REGULAR,
      archived: false,
    },
    {
      id: "habit_social",
      name: "Social Media < 90m",
      icon: "📵",
      color: "#6a5cb6",
      targetPerWeek: 7,
      scheduledDays: ALL_DAYS,
      type: HABIT_TYPE_REGULAR,
      archived: false,
    },
    {
      id: "habit_no_porn",
      name: "No Porn",
      icon: "🧠",
      color: "#704b8d",
      targetPerWeek: 7,
      scheduledDays: ALL_DAYS,
      type: HABIT_TYPE_REGULAR,
      archived: false,
    },
    {
      id: "habit_plan",
      name: "Plan Tomorrow",
      icon: "📝",
      color: "#69707d",
      targetPerWeek: 7,
      scheduledDays: ALL_DAYS,
      type: HABIT_TYPE_REGULAR,
      archived: false,
    },
    {
      id: "habit_mobility",
      name: "Mobility 15m",
      icon: "🤸",
      color: "#8b6a35",
      targetPerWeek: 5,
      scheduledDays: [1, 2, 3, 4, 5],
      type: HABIT_TYPE_REGULAR,
      archived: false,
    },
  ];

  const cloudRuntime = {
    inFlight: false,
    pushTimer: null,
    pullTimer: null,
    hasLocalChanges: false,
    lastPullReason: "none",
    status: "local",
    message: "Local only",
  };

  let state = normalizeState(loadPersistedState());
  let weekCursor = startOfDay(new Date());
  let monthCursor = startOfMonth(new Date());
  let activeDayDetailsKey = "";
  let toastTimer = null;

  const refs = {
    todayLabel: byId("todayLabel"),
    mainHeading: byId("mainHeading"),
    mainSubheading: byId("mainSubheading"),
    periodLabel: byId("periodLabel"),
    syncBadge: byId("syncBadge"),
    authBadge: byId("authBadge"),

    modeButtons: Array.from(document.querySelectorAll(".mode-btn")),
    viewButtons: Array.from(document.querySelectorAll(".view-btn")),

    dailyPanel: byId("dailyPanel"),
    analyticsPanel: byId("analyticsPanel"),
    todayChecklist: byId("todayChecklist"),
    todaySegmentTrack: byId("todaySegmentTrack"),
    todaySummaryLabel: byId("todaySummaryLabel"),
    analyticsHabitList: byId("analyticsHabitList"),

    manageHabitsBtn: byId("manageHabitsBtn"),
    quickStrengthBtn: byId("quickStrengthBtn"),

    prevPeriodBtn: byId("prevPeriodBtn"),
    nextPeriodBtn: byId("nextPeriodBtn"),
    todayBtn: byId("todayBtn"),

    weekView: byId("weekView"),
    weekCards: byId("weekCards"),
    monthView: byId("monthView"),
    heatmapView: byId("heatmapView"),
    weekTableHead: byId("weekTableHead"),
    weekTableBody: byId("weekTableBody"),
    monthGrid: byId("monthGrid"),
    habitHeatmap: byId("habitHeatmap"),

    openSyncBtn: byId("openSyncBtn"),
    syncModal: byId("syncModal"),
    closeSyncBtn: byId("closeSyncBtn"),
    habitsModal: byId("habitsModal"),
    closeHabitsBtn: byId("closeHabitsBtn"),
    habitEditorList: byId("habitEditorList"),
    newHabitName: byId("newHabitName"),
    newHabitEmoji: byId("newHabitEmoji"),
    newHabitType: byId("newHabitType"),
    newHabitTarget: byId("newHabitTarget"),
    addHabitBtn: byId("addHabitBtn"),

    dayDetailsModal: byId("dayDetailsModal"),
    closeDayDetailsBtn: byId("closeDayDetailsBtn"),
    saveDayDetailsBtn: byId("saveDayDetailsBtn"),
    dayDetailsTitle: byId("dayDetailsTitle"),
    dayDetailsSummary: byId("dayDetailsSummary"),
    dayDetailsTrack: byId("dayDetailsTrack"),
    dayDetailsRate: byId("dayDetailsRate"),
    dayDetailsNoteInput: byId("dayDetailsNoteInput"),
    dayDetailsHabitsList: byId("dayDetailsHabitsList"),

    cloudEnabled: byId("cloudEnabled"),
    cloudWebAppUrl: byId("cloudWebAppUrl"),
    cloudUserId: byId("cloudUserId"),
    saveSyncBtn: byId("saveSyncBtn"),
    testSyncBtn: byId("testSyncBtn"),
    pullSyncBtn: byId("pullSyncBtn"),
    pushSyncBtn: byId("pushSyncBtn"),
    syncStatusText: byId("syncStatusText"),
    syncLastText: byId("syncLastText"),
    authStatusText: byId("authStatusText"),
    googleSignInButton: byId("googleSignInButton"),
    signOutBtn: byId("signOutBtn"),

    bootOverlay: byId("bootOverlay"),
    bootOverlayText: byId("bootOverlayText"),
    toast: byId("toast"),
  };

  initialize();

  function initialize() {
    bindEvents();
    initializeGoogleAuth();

    const shouldBootFromCloud = canUseCloudSync();
    if (shouldBootFromCloud) {
      setBootOverlay(true, "Loading your latest habits...");
      persistState({ skipCloud: true, silent: true });
      const bootStartedAt = Date.now();

      let finished = false;
      const finishBoot = () => {
        if (finished) {
          return;
        }
        finished = true;
        const elapsed = Date.now() - bootStartedAt;
        const waitMs = Math.max(0, BOOT_SYNC_MIN_VISIBLE_MS - elapsed);
        window.setTimeout(() => {
          setBootOverlay(false);
          renderAll();
        }, waitMs);
      };

      const timeoutId = window.setTimeout(() => {
        finishBoot();
      }, BOOT_SYNC_MAX_WAIT_MS);

      initializeCloudSync().finally(() => {
        window.clearTimeout(timeoutId);
        finishBoot();
      });
      return;
    }

    setBootOverlay(false);
    renderAll();
    persistState({ skipCloud: true, silent: true });
    initializeCloudSync();
  }

  function bindEvents() {
    refs.modeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.sidebarMode = button.dataset.sidebarMode;
        persistState({ skipCloud: true });
        renderSidebarMode();
      });
    });

    refs.viewButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.viewMode = button.dataset.viewMode;
        persistState({ skipCloud: true });
        renderMainContent();
        renderHeader();
      });
    });

    refs.prevPeriodBtn.addEventListener("click", () => {
      if (state.viewMode === "week") {
        weekCursor = addDays(weekCursor, -15);
      } else {
        monthCursor = addMonths(monthCursor, -1);
      }
      renderMainContent();
    });

    refs.nextPeriodBtn.addEventListener("click", () => {
      if (state.viewMode === "week") {
        weekCursor = minDate(addDays(weekCursor, 15), startOfDay(new Date()));
      } else {
        monthCursor = addMonths(monthCursor, 1);
      }
      renderMainContent();
    });

    refs.todayBtn.addEventListener("click", () => {
      weekCursor = startOfDay(new Date());
      monthCursor = startOfMonth(new Date());
      renderMainContent();
    });

    refs.quickStrengthBtn.addEventListener("click", () => {
      const strengthHabit = getStrengthHabit();
      if (!strengthHabit) {
        showToast("Strength Training habit not found.");
        return;
      }
      const key = todayKey();
      toggleCompletion(strengthHabit.id, key);
    });

    refs.manageHabitsBtn.addEventListener("click", () => {
      renderHabitEditor();
      refs.habitsModal.showModal();
    });

    refs.closeHabitsBtn.addEventListener("click", () => {
      refs.habitsModal.close();
    });

    refs.addHabitBtn.addEventListener("click", () => {
      addHabitFromInputs();
    });

    if (refs.newHabitType && refs.newHabitTarget) {
      refs.newHabitType.addEventListener("change", () => {
        const isCornerstone = refs.newHabitType.value === HABIT_TYPE_CORNERSTONE;
        refs.newHabitTarget.disabled = isCornerstone;
        refs.newHabitTarget.value = isCornerstone ? "7" : "3";
      });
    }

    refs.newHabitName.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      addHabitFromInputs();
    });

    refs.habitEditorList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }

      const row = button.closest("[data-habit-id]");
      if (!row) {
        return;
      }

      const action = button.dataset.action;
      const habitId = row.dataset.habitId;
      if (!habitId) {
        return;
      }

      if (action === "save-habit") {
        saveHabitFromEditorRow(habitId, row);
      } else if (action === "delete-habit") {
        deleteHabit(habitId);
      }
    });

    refs.habitEditorList.addEventListener("change", (event) => {
      const select = event.target.closest("select[data-field='type']");
      if (!select) {
        return;
      }
      const row = select.closest("[data-habit-id]");
      const targetInput = row?.querySelector("input[data-field='targetPerWeek']");
      if (!targetInput) {
        return;
      }

      const isCornerstone = select.value === HABIT_TYPE_CORNERSTONE;
      targetInput.disabled = isCornerstone;
      targetInput.value = isCornerstone ? "7" : targetInput.value || "3";
    });

    refs.todayChecklist.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }

      const action = button.dataset.action;
      const habitId = button.dataset.habitId;
      if (!habitId) {
        return;
      }

      if (action === "toggle") {
        toggleCompletion(habitId, todayKey());
      }
    });

    refs.weekTableBody.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }

      const action = button.dataset.action;
      const dateKey = button.dataset.dateKey;
      if (!dateKey) {
        return;
      }

      if (action === "toggle") {
        const habitId = button.dataset.habitId;
        if (!habitId) {
          return;
        }
        toggleCompletion(habitId, dateKey);
        return;
      }

      if (action === "open-day-details") {
        openDayDetails(dateKey);
      }
    });

    refs.weekTableBody.addEventListener("change", (event) => {
      const input = event.target.closest("input[data-action='note']");
      if (!input) {
        return;
      }

      const dateKey = input.dataset.dateKey;
      if (!dateKey) {
        return;
      }

      state.dayNotes[dateKey] = String(input.value || "").trim();
      persistState();
    });

    refs.weekCards.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action='toggle']");
      if (!button) {
        return;
      }

      const habitId = button.dataset.habitId;
      const dateKey = button.dataset.dateKey;
      if (!habitId || !dateKey) {
        return;
      }

      toggleCompletion(habitId, dateKey);
    });

    refs.weekCards.addEventListener("change", (event) => {
      const input = event.target.closest("input[data-action='note']");
      if (!input) {
        return;
      }
      const dateKey = input.dataset.dateKey;
      if (!dateKey) {
        return;
      }

      state.dayNotes[dateKey] = String(input.value || "").trim();
      persistState();
    });

    refs.dayDetailsHabitsList.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action='toggle-day-detail-habit']");
      if (!button) {
        return;
      }

      const habitId = button.dataset.habitId;
      const dateKey = button.dataset.dateKey;
      if (!habitId || !dateKey) {
        return;
      }

      toggleCompletion(habitId, dateKey);
      renderDayDetails(dateKey);
    });

    refs.saveDayDetailsBtn.addEventListener("click", () => {
      if (!activeDayDetailsKey) {
        return;
      }

      state.dayNotes[activeDayDetailsKey] = String(refs.dayDetailsNoteInput.value || "").trim();
      persistState();
      renderAll();
      refs.dayDetailsModal.close();
      showToast("Day details saved.");
    });

    refs.closeDayDetailsBtn.addEventListener("click", () => {
      refs.dayDetailsModal.close();
    });

    refs.monthGrid.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action='toggle-month-habit']");
      if (!button) {
        return;
      }

      const habitId = button.dataset.habitId;
      const dateKey = button.dataset.dateKey;
      if (!habitId || !dateKey) {
        return;
      }

      toggleCompletion(habitId, dateKey);
    });

    refs.habitHeatmap.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action='toggle-heatmap-habit']");
      if (!button) {
        return;
      }

      const habitId = button.dataset.habitId;
      const dateKey = button.dataset.dateKey;
      if (!habitId || !dateKey) {
        return;
      }

      toggleCompletion(habitId, dateKey);
    });

    refs.openSyncBtn.addEventListener("click", () => {
      refs.syncModal.showModal();
      renderSyncPanel();
      renderGoogleSignInButton();
    });

    refs.closeSyncBtn.addEventListener("click", () => {
      refs.syncModal.close();
    });

    refs.cloudEnabled.addEventListener("change", () => {
      state.cloud.enabled = refs.cloudEnabled.checked;
      persistState({ skipCloud: true });
      renderSyncPanel();
      if (!state.cloud.enabled) {
        clearCloudTimers();
        cloudRuntime.hasLocalChanges = false;
        updateSyncStatus("local", "Local only");
      } else {
        startCloudPullTicker();
        updateSyncStatus("local", "Cloud enabled, save config");
      }
      renderHeader();
    });

    refs.saveSyncBtn.addEventListener("click", () => {
      const config = readCloudInputs();
      state.cloud.webAppUrl = config.webAppUrl;
      state.cloud.userId = config.userId;
      persistState({ skipCloud: true });

      if (!canUseCloudSync()) {
        updateSyncStatus("error", "Missing URL or Google sign-in");
        renderSyncPanel();
        return;
      }

      updateSyncStatus("local", "Config saved");
      void bootstrapCloudSyncNow();
      renderSyncPanel();
      showToast("Cloud config saved.");
    });

    refs.testSyncBtn.addEventListener("click", async () => {
      const ok = await testCloudConnection();
      if (ok) {
        showToast("Cloud connection works.");
      }
    });

    refs.signOutBtn.addEventListener("click", () => {
      signOutGoogle();
    });

    refs.pullSyncBtn.addEventListener("click", async () => {
      const ok = await pullFromCloud({ interactive: true });
      if (ok) {
        showToast("Pulled cloud data.");
      }
    });

    refs.pushSyncBtn.addEventListener("click", async () => {
      const ok = await pushToCloud({ reason: "manual" });
      if (ok) {
        showToast("Pushed data to cloud.");
      }
    });
  }

  function renderAll() {
    renderHeader();
    renderSidebarMode();
    renderMainContent();
    renderSyncPanel();
  }

  function renderHeader() {
    refs.todayLabel.textContent = formatDateReadable(new Date());
    if (state.viewMode === "week") {
      refs.mainHeading.textContent = "Last 15 Days";
      refs.mainSubheading.textContent = "Today first, then your previous 14 days of history.";
    } else if (state.viewMode === "month") {
      refs.mainHeading.textContent = "This Month";
      refs.mainSubheading.textContent = "Calendar-driven daily execution and consistency.";
    } else {
      refs.mainHeading.textContent = "Monthly Heatmap";
      refs.mainSubheading.textContent = "How each habit performed through this month.";
    }
    const strengthHabit = getStrengthHabit();
    refs.quickStrengthBtn.disabled = !strengthHabit;
    refs.quickStrengthBtn.textContent = strengthHabit ? `Toggle ${strengthHabit.name}` : "No Strength Habit";

    updateSyncIndicators();
    renderAuthIndicators();
  }

  function renderSidebarMode() {
    refs.modeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.sidebarMode === state.sidebarMode);
    });

    refs.dailyPanel.classList.toggle("active", state.sidebarMode === "daily");
    refs.analyticsPanel.classList.toggle("active", state.sidebarMode === "analytics");

    renderTodayPanel();
    renderAnalyticsPanel();
  }

  function renderTodayPanel() {
    const today = new Date();
    const key = toDateKey(today);
    const fragment = document.createDocumentFragment();
    const cornerstoneHabits = getHabitsByType(HABIT_TYPE_CORNERSTONE);
    const regularHabits = getHabitsByType(HABIT_TYPE_REGULAR);

    if (!cornerstoneHabits.length && !regularHabits.length) {
      const empty = document.createElement("p");
      empty.className = "month-empty";
      empty.textContent = "No habits yet. Click Manage Habits to add one.";
      refs.todayChecklist.replaceChildren(empty);
    } else {
      fragment.appendChild(renderTodayGroup("Cornerstone Habits", cornerstoneHabits, today, key));
      fragment.appendChild(renderTodayGroup("Regular Habits", regularHabits, today, key));
      refs.todayChecklist.replaceChildren(fragment);
    }

    const totals = getDayTotals(today);
    renderSegmentTrack(refs.todaySegmentTrack, totals.rate);
    refs.todaySummaryLabel.textContent = `${totals.completed}/${totals.scheduled} • ${Math.round(totals.rate * 100)}%`;
  }

  function renderTodayGroup(title, habits, today, dateKey) {
    const section = document.createElement("section");
    section.className = "today-group";

    const heading = document.createElement("p");
    heading.className = "today-group-title";
    heading.textContent = title;
    section.appendChild(heading);

    if (!habits.length) {
      const empty = document.createElement("p");
      empty.className = "month-empty";
      empty.textContent =
        title === "Cornerstone Habits" ? "No cornerstone habits yet." : "No regular habits yet.";
      section.appendChild(empty);
      return section;
    }

    const list = document.createElement("div");
    list.className = "today-group-list";
    habits.forEach((habit) => {
      list.appendChild(renderTodayHabitRow(habit, today, dateKey));
    });
    section.appendChild(list);
    return section;
  }

  function renderTodayHabitRow(habit, today, dateKey) {
    const isScheduled = isScheduledDay(habit, today);
    const isDone = isCompleted(habit.id, dateKey);

    const row = document.createElement("article");
    row.className = `today-item${isScheduled ? "" : " offday"}`;
    row.style.setProperty("--habit-color", habit.color);
    row.innerHTML = `
      <button type="button" data-action="noop">
        <span>${habit.icon}</span>
        <span>${escapeHtml(habit.name)}</span>
      </button>
      <button
        class="mark-btn ${isDone ? "done" : ""}"
        type="button"
        data-action="toggle"
        data-habit-id="${habit.id}"
        title="${isDone ? "Undo" : "Mark done"}"
      >✓</button>
    `;
    return row;
  }

  function renderAnalyticsPanel() {
    const habits = getActiveHabits();
    const fragment = document.createDocumentFragment();

    habits.forEach((habit) => {
      const rate = getHabitCompletionRate(habit, 30);
      const item = document.createElement("article");
      item.className = "analytics-item";
      item.innerHTML = `
        <div class="analytics-item-head">
          <strong>${habit.icon} ${escapeHtml(habit.name)}</strong>
          <span>${Math.round(rate * 100)}%</span>
        </div>
        <div class="micro-track"><span style="width:${Math.round(rate * 100)}%"></span></div>
      `;
      fragment.appendChild(item);
    });

    refs.analyticsHabitList.replaceChildren(fragment);
  }

  function renderHabitEditor() {
    const fragment = document.createDocumentFragment();
    const cornerstoneHabits = getHabitsByType(HABIT_TYPE_CORNERSTONE);
    const regularHabits = getHabitsByType(HABIT_TYPE_REGULAR);

    if (!cornerstoneHabits.length && !regularHabits.length) {
      const empty = document.createElement("p");
      empty.className = "month-empty";
      empty.textContent = "No habits created yet.";
      fragment.appendChild(empty);
    } else {
      fragment.appendChild(renderHabitEditorGroup("Cornerstone Habits", cornerstoneHabits));
      fragment.appendChild(renderHabitEditorGroup("Regular Habits", regularHabits));
    }

    refs.habitEditorList.replaceChildren(fragment);
  }

  function renderHabitEditorGroup(title, habits) {
    const section = document.createElement("section");
    section.className = "habit-editor-group";

    const heading = document.createElement("p");
    heading.className = "habit-editor-group-title";
    heading.textContent = title;
    section.appendChild(heading);

    if (!habits.length) {
      const empty = document.createElement("p");
      empty.className = "month-empty";
      empty.textContent =
        title === "Cornerstone Habits" ? "No cornerstone habits yet." : "No regular habits yet.";
      section.appendChild(empty);
      return section;
    }

    habits.forEach((habit) => {
      const row = document.createElement("article");
      row.className = "habit-editor-item";
      row.dataset.habitId = habit.id;
      const isCornerstone = habit.type === HABIT_TYPE_CORNERSTONE;
      row.innerHTML = `
        <input class="habit-editor-emoji" data-field="icon" type="text" value="${escapeHtmlAttr(habit.icon)}" maxlength="4" />
        <input class="habit-editor-name" data-field="name" type="text" value="${escapeHtmlAttr(habit.name)}" />
        <select data-field="type" class="habit-editor-type">
          <option value="${HABIT_TYPE_CORNERSTONE}"${isCornerstone ? " selected" : ""}>Cornerstone</option>
          <option value="${HABIT_TYPE_REGULAR}"${isCornerstone ? "" : " selected"}>Regular</option>
        </select>
        <input
          class="habit-editor-target"
          data-field="targetPerWeek"
          type="number"
          min="1"
          max="7"
          value="${isCornerstone ? "7" : String(habit.targetPerWeek || 3)}"
          ${isCornerstone ? "disabled" : ""}
          title="Days per week"
        />
        <button type="button" class="btn secondary" data-action="save-habit">Save</button>
        <button type="button" class="btn ghost" data-action="delete-habit">Delete</button>
      `;
      section.appendChild(row);
    });

    return section;
  }

  function renderMainContent() {
    renderViewMode();
    if (state.viewMode === "week") {
      try {
        renderWeekTable();
      } catch (error) {
        refs.weekTableBody.innerHTML = `<tr><td colspan=\"99\">Could not render week table.</td></tr>`;
      }
    } else if (state.viewMode === "month") {
      try {
        renderMonthGrid();
      } catch (error) {
        refs.monthGrid.innerHTML = `<article class=\"month-day\"><p class=\"month-empty\">Could not render month view. Please refresh.</p></article>`;
      }
    } else {
      try {
        renderHabitHeatmap();
      } catch (error) {
        refs.habitHeatmap.innerHTML = `<p class=\"month-empty\">Could not render heatmap. Please refresh.</p>`;
      }
    }
  }

  function renderViewMode() {
    refs.viewButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.viewMode === state.viewMode);
    });

    refs.weekView.classList.toggle("active", state.viewMode === "week");
    refs.monthView.classList.toggle("active", state.viewMode === "month");
    refs.heatmapView.classList.toggle("active", state.viewMode === "heatmap");
  }

  function renderWeekTable() {
    const topDate = startOfDay(weekCursor);
    const oldestDate = addDays(topDate, -14);
    refs.periodLabel.textContent = `${formatShortDate(topDate)} to ${formatShortDate(oldestDate)} (15 days)`;

    const habits = getActiveHabits();
    const compactDate = isCompactViewport();
    const headRow = document.createElement("tr");

    headRow.appendChild(makeTh("Date"));
    habits.forEach((habit) => {
      const th = makeTh(habit.icon);
      th.className = "habit-col-head";
      th.title = habit.name;
      headRow.appendChild(th);
    });
    if (!compactDate) {
      headRow.appendChild(makeTh("Progress"));
      headRow.appendChild(makeTh("Notes"));
    }
    refs.weekTableHead.replaceChildren(headRow);

    const bodyFragment = document.createDocumentFragment();

    for (let i = 0; i < 15; i += 1) {
      const date = addDays(topDate, -i);
      const dateKey = toDateKey(date);
      const row = document.createElement("tr");

      const dateCell = document.createElement("td");
      dateCell.className = "date-cell";
      dateCell.innerHTML = `
        <div class="date-cell-wrap">
          <strong>${compactDate ? formatDateCompact(date) : formatDateWithWeekday(date)}</strong>
          <button
            type="button"
            class="date-detail-btn"
            data-action="open-day-details"
            data-date-key="${dateKey}"
            aria-label="Open details for ${formatDateReadable(date)}"
            title="Open day details"
          >Details</button>
        </div>
      `;
      row.appendChild(dateCell);

      habits.forEach((habit) => {
        const scheduled = isScheduledDay(habit, date);
        const done = isCompleted(habit.id, dateKey);

        const td = document.createElement("td");
        td.className = "habit-cell";
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = "toggle";
        button.dataset.habitId = habit.id;
        button.dataset.dateKey = dateKey;
        button.className = `habit-toggle${done ? " done" : ""}${scheduled ? "" : " unscheduled"}${
          dateKey === todayKey() ? " today" : ""
        }`;
        button.style.setProperty("--habit-color", habit.color);
        button.textContent = done ? "✓" : "✓";
        button.title = `${habit.name} • ${formatDateReadable(date)}`;
        td.appendChild(button);
        row.appendChild(td);
      });

      if (!compactDate) {
        const totals = getDayTotals(date);
        const progressCell = document.createElement("td");
        progressCell.className = "row-progress";

        const track = document.createElement("div");
        track.className = "segment-track";
        renderSegmentTrack(track, totals.rate);
        const label = document.createElement("span");
        label.className = "row-progress-value";
        label.textContent = `${Math.round(totals.rate * 100)}%`;
        progressCell.append(track, label);
        row.appendChild(progressCell);

        const noteCell = document.createElement("td");
        const input = document.createElement("input");
        input.className = "day-note-input";
        input.type = "text";
        input.placeholder = "Notes";
        input.value = state.dayNotes[dateKey] || "";
        input.dataset.action = "note";
        input.dataset.dateKey = dateKey;
        noteCell.appendChild(input);
        row.appendChild(noteCell);
      }

      bodyFragment.appendChild(row);
    }

    refs.weekTableBody.replaceChildren(bodyFragment);
  }

  function openDayDetails(dateKey) {
    activeDayDetailsKey = String(dateKey || "");
    if (!activeDayDetailsKey) {
      return;
    }
    renderDayDetails(activeDayDetailsKey);
    refs.dayDetailsModal.showModal();
  }

  function renderDayDetails(dateKey) {
    const date = fromDateKey(dateKey);
    if (!date) {
      return;
    }

    const totals = getDayTotals(date);
    refs.dayDetailsTitle.textContent = formatDateWithWeekday(date);
    refs.dayDetailsSummary.textContent = `${totals.completed}/${totals.scheduled} habits completed`;
    renderSegmentTrack(refs.dayDetailsTrack, totals.rate);
    refs.dayDetailsRate.textContent = `${Math.round(totals.rate * 100)}%`;
    refs.dayDetailsNoteInput.value = state.dayNotes[dateKey] || "";

    const habits = getActiveHabits();
    const fragment = document.createDocumentFragment();
    habits.forEach((habit) => {
      const scheduled = isScheduledDay(habit, date);
      const done = isCompleted(habit.id, dateKey);
      const row = document.createElement("div");
      row.className = `day-detail-habit-row${scheduled ? "" : " offday"}`;
      row.style.setProperty("--habit-color", habit.color);
      row.innerHTML = `
        <span>${habit.icon} ${escapeHtml(habit.name)}</span>
        <button
          type="button"
          class="mark-btn ${done ? "done" : ""}"
          data-action="toggle-day-detail-habit"
          data-habit-id="${habit.id}"
          data-date-key="${dateKey}"
          title="${done ? "Undo" : "Mark done"}"
        >✓</button>
      `;
      fragment.appendChild(row);
    });

    refs.dayDetailsHabitsList.replaceChildren(fragment);
  }

  function renderWeekCards(weekStart, habits) {
    if (!refs.weekCards) {
      return;
    }

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < 7; i += 1) {
      const date = addDays(weekStart, i);
      const dateKey = toDateKey(date);
      const totals = getDayTotals(date);

      const card = document.createElement("article");
      card.className = "week-card";
      if (dateKey === todayKey()) {
        card.classList.add("today");
      }

      const head = document.createElement("header");
      head.className = "week-card-head";
      head.innerHTML = `<strong>${formatDateWithWeekday(date)}</strong><span>${Math.round(totals.rate * 100)}%</span>`;
      card.appendChild(head);

      const list = document.createElement("div");
      list.className = "week-card-list";
      habits.forEach((habit) => {
        const done = isCompleted(habit.id, dateKey);
        const scheduled = isScheduledDay(habit, date);

        const item = document.createElement("div");
        item.className = `week-card-item${scheduled ? "" : " offday"}`;
        item.style.setProperty("--habit-color", habit.color);
        item.innerHTML = `
          <span>${habit.icon} ${escapeHtml(habit.name)}</span>
          <button
            type="button"
            class="mark-btn ${done ? "done" : ""}"
            data-action="toggle"
            data-habit-id="${habit.id}"
            data-date-key="${dateKey}"
            title="${done ? "Undo" : "Mark done"}"
          >✓</button>
        `;
        list.appendChild(item);
      });
      card.appendChild(list);

      const note = document.createElement("input");
      note.className = "day-note-input";
      note.type = "text";
      note.placeholder = "Notes";
      note.value = state.dayNotes[dateKey] || "";
      note.dataset.action = "note";
      note.dataset.dateKey = dateKey;
      card.appendChild(note);

      fragment.appendChild(card);
    }

    refs.weekCards.replaceChildren(fragment);
  }

  function renderMonthGrid() {
    const monthStart = startOfMonth(monthCursor);
    refs.periodLabel.textContent = monthStart.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    const habits = getActiveHabits();
    const gridStart = startOfWeek(monthStart, WEEK_STARTS_ON);
    const fragment = document.createDocumentFragment();

    orderedDays().forEach((day) => {
      const header = document.createElement("p");
      header.className = "month-header";
      header.textContent = DAY_LABELS[day];
      fragment.appendChild(header);
    });

    for (let cellIndex = 0; cellIndex < 42; cellIndex += 1) {
      const date = addDays(gridStart, cellIndex);
      const dateKey = toDateKey(date);
      const dayCard = document.createElement("article");
      dayCard.className = "month-day";
      if (date.getMonth() !== monthStart.getMonth()) {
        dayCard.classList.add("other-month");
      }
      if (dateKey === todayKey()) {
        dayCard.classList.add("today");
      }

      const totals = getDayTotals(date);
      const dueHabits = habits.filter((habit) => isScheduledDay(habit, date));
      const topDueHabits = dueHabits.slice(0, 5);

      const head = document.createElement("div");
      head.className = "month-day-head";
      head.innerHTML = `<strong>${date.getDate()}</strong><span>${Math.round(totals.rate * 100)}%</span>`;
      dayCard.appendChild(head);

      const list = document.createElement("div");
      list.className = "month-habit-list";

      if (!topDueHabits.length) {
        const empty = document.createElement("p");
        empty.className = "month-empty";
        empty.textContent = "Rest day";
        list.appendChild(empty);
      }

      topDueHabits.forEach((habit) => {
        const done = isCompleted(habit.id, dateKey);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `month-habit-btn${done ? " done" : ""}`;
        button.style.setProperty("--habit-color", habit.color);
        button.dataset.action = "toggle-month-habit";
        button.dataset.habitId = habit.id;
        button.dataset.dateKey = dateKey;
        button.innerHTML = `<span class="tick">✓</span><span>${habit.icon} ${escapeHtml(habit.name)}</span>`;
        list.appendChild(button);
      });

      if (dueHabits.length > topDueHabits.length) {
        const more = document.createElement("p");
        more.className = "month-empty";
        more.textContent = `+${dueHabits.length - topDueHabits.length} more`;
        list.appendChild(more);
      }

      dayCard.appendChild(list);

      const miniTrack = document.createElement("div");
      miniTrack.className = "segment-track";
      renderSegmentTrack(miniTrack, totals.rate);
      dayCard.appendChild(miniTrack);

      fragment.appendChild(dayCard);
    }

    refs.monthGrid.replaceChildren(fragment);
  }

  function renderHabitHeatmap() {
    const monthStart = startOfMonth(monthCursor);
    refs.periodLabel.textContent = monthStart.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    const habits = getActiveHabits();
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();

    if (!habits.length) {
      refs.habitHeatmap.innerHTML = `<p class="month-empty">No habits yet. Click Manage Habits to add one.</p>`;
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "heatmap-wrap";

    const legend = document.createElement("div");
    legend.className = "heatmap-legend";
    legend.innerHTML = `
      <span>Low</span>
      <span class="heatmap-legend-cell rest" title="Not scheduled"></span>
      <span class="heatmap-legend-cell missed" title="Scheduled but missed"></span>
      <span class="heatmap-legend-cell done level-1" title="Completed"></span>
      <span class="heatmap-legend-cell done level-2" title="Completed"></span>
      <span class="heatmap-legend-cell done level-3" title="Completed"></span>
      <span class="heatmap-legend-cell done level-4" title="Completed"></span>
      <span>High</span>
    `;
    wrapper.appendChild(legend);

    const table = document.createElement("div");
    table.className = "heatmap-table";
    table.style.setProperty("--heatmap-days", String(daysInMonth));

    const headRow = document.createElement("div");
    headRow.className = "heatmap-row heatmap-head-row";
    headRow.innerHTML = `<p class="heatmap-habit-head">Habit</p>`;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dayLabel = document.createElement("span");
      dayLabel.className = "heatmap-day-label";
      dayLabel.textContent = day % 2 === 0 || day === 1 || day === daysInMonth ? String(day) : "";
      headRow.appendChild(dayLabel);
    }
    table.appendChild(headRow);

    habits.forEach((habit) => {
      const row = document.createElement("div");
      row.className = "heatmap-row";

      const label = document.createElement("p");
      label.className = "heatmap-habit-label";
      const monthRate = getHabitCompletionRateForMonth(habit, monthStart, daysInMonth);
      label.innerHTML = `
        <span>${habit.icon} ${escapeHtml(habit.name)}</span>
        <strong>${Math.round(monthRate * 100)}%</strong>
      `;
      row.appendChild(label);

      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
        const dateKey = toDateKey(date);
        const heat = getHabitHeatCell(habit, date, monthStart);

        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "heatmap-cell";
        cell.classList.add(heat.kind);
        if (heat.kind === "done") {
          cell.classList.add(`level-${heat.level}`);
        }
        if (dateKey === todayKey()) {
          cell.classList.add("today");
        }
        cell.dataset.action = "toggle-heatmap-habit";
        cell.dataset.habitId = habit.id;
        cell.dataset.dateKey = dateKey;
        cell.title = `${habit.name} • ${formatDateReadable(date)} • ${heat.label}`;
        cell.setAttribute("aria-label", `${habit.name}, ${formatDateReadable(date)}, ${heat.label}`);
        row.appendChild(cell);
      }

      table.appendChild(row);
    });

    wrapper.appendChild(table);
    refs.habitHeatmap.replaceChildren(wrapper);
  }

  function renderSyncPanel() {
    refs.cloudEnabled.checked = Boolean(state.cloud.enabled);
    refs.cloudWebAppUrl.value = state.cloud.webAppUrl || "";
    refs.cloudUserId.value = state.cloud.userId || "default";

    const canActions = canUseCloudSync();
    refs.testSyncBtn.disabled = !canActions;
    refs.pullSyncBtn.disabled = !canActions;
    refs.pushSyncBtn.disabled = !canActions;

    const lastDate = state.cloud.lastSyncedAt ? new Date(state.cloud.lastSyncedAt) : null;
    refs.syncLastText.textContent =
      lastDate && Number.isFinite(lastDate.getTime())
        ? `Last sync: ${formatDateTimeReadable(lastDate)}`
        : "Last sync: never";

    updateSyncIndicators();
    renderAuthIndicators();
    renderGoogleSignInButton();
  }

  function toggleCompletion(habitId, dateKey) {
    const current = getEntry(habitId, dateKey);
    const next = !Boolean(current.completed);
    upsertEntry(habitId, dateKey, {
      ...current,
      completed: next,
      updatedAt: new Date().toISOString(),
    });

    if (!next && !current.note && !current.duration && !current.intensity) {
      const byHabit = state.entries[habitId];
      if (byHabit) {
        delete byHabit[dateKey];
      }
    }

    persistState();
    renderAll();
  }

  function addHabitFromInputs() {
    const name = sanitizeHabitName(refs.newHabitName.value);
    const icon = sanitizeHabitIcon(refs.newHabitEmoji.value);
    const type = normalizeHabitType(refs.newHabitType?.value);
    const targetInput = clampNumber(Number(refs.newHabitTarget?.value || 3), 1, 7);
    const targetPerWeek = type === HABIT_TYPE_CORNERSTONE ? 7 : targetInput;

    if (!name) {
      showToast("Please enter a habit name.");
      refs.newHabitName.focus();
      return;
    }

    const newHabit = {
      id: `habit_${generateId()}`,
      name,
      icon,
      color: pickHabitColor(name),
      type,
      targetPerWeek,
      scheduledDays: buildScheduledDaysFromTarget(targetPerWeek, type),
      archived: false,
    };

    state.habits.push(newHabit);
    state.entries[newHabit.id] = {};

    refs.newHabitName.value = "";
    refs.newHabitEmoji.value = "";
    if (refs.newHabitType && refs.newHabitTarget) {
      refs.newHabitType.value = HABIT_TYPE_REGULAR;
      refs.newHabitTarget.value = "3";
      refs.newHabitTarget.disabled = false;
    }

    persistState();
    renderAll();
    renderHabitEditor();
    showToast("Habit added.");
  }

  function saveHabitFromEditorRow(habitId, row) {
    const index = findHabitIndexById(habitId);
    if (index < 0) {
      return;
    }

    const nameInput = row.querySelector("[data-field='name']");
    const iconInput = row.querySelector("[data-field='icon']");
    const typeInput = row.querySelector("[data-field='type']");
    const targetInput = row.querySelector("[data-field='targetPerWeek']");

    const nextName = sanitizeHabitName(nameInput?.value);
    const nextIcon = sanitizeHabitIcon(iconInput?.value);
    const nextType = normalizeHabitType(typeInput?.value);
    const nextTarget = clampNumber(Number(targetInput?.value || 3), 1, 7);

    if (!nextName) {
      showToast("Habit name cannot be empty.");
      if (nameInput) {
        nameInput.focus();
      }
      return;
    }

    const prevHabit = state.habits[index];
    const isCornerstone = nextType === HABIT_TYPE_CORNERSTONE;
    const resolvedTarget = isCornerstone ? 7 : nextTarget;
    const shouldRebuildSchedule =
      prevHabit.type !== nextType || prevHabit.targetPerWeek !== resolvedTarget || isCornerstone;

    state.habits[index] = {
      ...prevHabit,
      name: nextName,
      icon: nextIcon,
      type: nextType,
      targetPerWeek: resolvedTarget,
      scheduledDays: shouldRebuildSchedule
        ? buildScheduledDaysFromTarget(resolvedTarget, nextType)
        : normalizeDays(prevHabit.scheduledDays),
    };

    persistState();
    renderAll();
    renderHabitEditor();
    showToast("Habit updated.");
  }

  function deleteHabit(habitId) {
    const index = findHabitIndexById(habitId);
    if (index < 0) {
      return;
    }

    if (state.habits.length <= 1) {
      showToast("At least one habit is required.");
      return;
    }

    const habit = state.habits[index];
    const confirmed = window.confirm(`Delete "${habit.name}"?`);
    if (!confirmed) {
      return;
    }

    state.habits.splice(index, 1);
    delete state.entries[habitId];

    persistState();
    renderAll();
    renderHabitEditor();
    showToast("Habit deleted.");
  }

  function getActiveHabits() {
    return state.habits
      .filter((habit) => !habit.archived)
      .sort((a, b) => getHabitTypeRank(a.type) - getHabitTypeRank(b.type));
  }

  function getHabitsByType(type) {
    return getActiveHabits().filter((habit) => habit.type === type);
  }

  function findHabitIndexById(habitId) {
    return state.habits.findIndex((habit) => habit.id === habitId);
  }

  function getStrengthHabit() {
    const habits = getActiveHabits();
    const exact = habits.find((habit) => habit.id === "habit_strength_training");
    if (exact) {
      return exact;
    }
    return habits.find((habit) => habit.name.toLowerCase().includes("strength")) || null;
  }

  function getEntry(habitId, dateKey) {
    return state.entries[habitId]?.[dateKey] || {};
  }

  function upsertEntry(habitId, dateKey, patch) {
    if (!state.entries[habitId]) {
      state.entries[habitId] = {};
    }
    state.entries[habitId][dateKey] = {
      ...(state.entries[habitId][dateKey] || {}),
      ...patch,
    };
  }

  function isCompleted(habitId, dateKey) {
    return Boolean(state.entries[habitId]?.[dateKey]?.completed);
  }

  function getDayTotals(date) {
    const habits = getActiveHabits();
    const key = toDateKey(date);
    let scheduled = 0;
    let completed = 0;

    habits.forEach((habit) => {
      if (!isScheduledDay(habit, date)) {
        return;
      }
      scheduled += 1;
      if (isCompleted(habit.id, key)) {
        completed += 1;
      }
    });

    return {
      scheduled,
      completed,
      rate: scheduled ? completed / scheduled : 0,
    };
  }

  function getHabitCompletionRate(habit, daysBack) {
    let scheduled = 0;
    let completed = 0;

    for (let i = 0; i < daysBack; i += 1) {
      const date = addDays(new Date(), -i);
      if (!isScheduledDay(habit, date)) {
        continue;
      }

      scheduled += 1;
      if (isCompleted(habit.id, toDateKey(date))) {
        completed += 1;
      }
    }

    return scheduled ? completed / scheduled : 0;
  }

  function getHabitCompletionRateForMonth(habit, monthStart, daysInMonth) {
    let scheduled = 0;
    let completed = 0;

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      if (!isScheduledDay(habit, date)) {
        continue;
      }
      scheduled += 1;
      if (isCompleted(habit.id, toDateKey(date))) {
        completed += 1;
      }
    }

    return scheduled ? completed / scheduled : 0;
  }

  function getHabitHeatCell(habit, date, monthStart) {
    const scheduled = isScheduledDay(habit, date);
    if (!scheduled) {
      return {
        kind: "rest",
        level: 0,
        label: "Rest day",
      };
    }

    const done = isCompleted(habit.id, toDateKey(date));
    if (!done) {
      return {
        kind: "missed",
        level: 0,
        label: "Missed",
      };
    }

    let streak = 0;
    for (let i = 0; i < 31; i += 1) {
      const current = addDays(date, -i);
      if (current < monthStart) {
        break;
      }
      if (!isScheduledDay(habit, current)) {
        continue;
      }
      if (isCompleted(habit.id, toDateKey(current))) {
        streak += 1;
      } else {
        break;
      }
    }

    let level = 1;
    if (streak >= 7) {
      level = 4;
    } else if (streak >= 4) {
      level = 3;
    } else if (streak >= 2) {
      level = 2;
    }

    return {
      kind: "done",
      level,
      label: `Done • ${streak}-day streak`,
    };
  }

  function renderSegmentTrack(container, rate) {
    container.replaceChildren();
    const filled = Math.max(0, Math.min(10, Math.round(rate * 10)));

    for (let i = 0; i < 10; i += 1) {
      const seg = document.createElement("span");
      seg.className = `segment${i < filled ? " filled" : ""}`;
      container.appendChild(seg);
    }
  }

  function makeTh(text) {
    const th = document.createElement("th");
    th.textContent = text;
    return th;
  }

  function isScheduledDay(habit, date) {
    const schedule = normalizeDays(habit.scheduledDays);
    return schedule.includes(date.getDay());
  }

  function orderedDays() {
    return [1, 2, 3, 4, 5, 6, 0];
  }

  function readCloudInputs() {
    return {
      webAppUrl: normalizeCloudUrl(refs.cloudWebAppUrl.value),
      userId: normalizeCloudUserId(refs.cloudUserId.value),
    };
  }

  function initializeCloudSync() {
    startCloudPullTicker();

    if (!state.cloud.enabled) {
      updateSyncStatus("local", "Cloud not configured");
      return Promise.resolve(false);
    }

    if (!canUseCloudSync()) {
      updateSyncStatus("error", "Missing cloud config");
      return Promise.resolve(false);
    }

    updateSyncStatus("syncing", "Connecting...");
    return bootstrapCloudSyncNow();
  }

  async function bootstrapCloudSyncNow() {
    if (!canUseCloudSync()) {
      return false;
    }

    updateSyncStatus("syncing", "Starting cloud sync...");

    const pulled = await pullFromCloud({ interactive: false, force: false });
    if (!pulled && cloudRuntime.lastPullReason === "empty") {
      updateSyncStatus("syncing", "Initializing cloud record...");
      await pushToCloud({ reason: "manual" });
      return true;
    }
    return pulled;
  }

  function startCloudPullTicker() {
    if (cloudRuntime.pullTimer) {
      clearInterval(cloudRuntime.pullTimer);
    }

    cloudRuntime.pullTimer = window.setInterval(() => {
      if (!canUseCloudSync()) {
        return;
      }
      void pullFromCloud({ interactive: false, skipIfDirty: true });
    }, CLOUD_PULL_INTERVAL_MS);
  }

  function clearCloudTimers() {
    if (cloudRuntime.pullTimer) {
      clearInterval(cloudRuntime.pullTimer);
      cloudRuntime.pullTimer = null;
    }

    if (cloudRuntime.pushTimer) {
      clearTimeout(cloudRuntime.pushTimer);
      cloudRuntime.pushTimer = null;
    }
  }

  function canUseCloudSync() {
    return Boolean(
      state.cloud.enabled &&
        state.cloud.webAppUrl &&
        state.auth &&
        state.auth.idToken &&
        !isJwtExpired(state.auth.idToken, 45),
    );
  }

  function scheduleCloudPush(options = {}) {
    const { delayMs = CLOUD_SYNC_DEBOUNCE_MS, statusMessage = "Sync queued" } = options;

    if (!canUseCloudSync()) {
      return;
    }

    cloudRuntime.hasLocalChanges = true;
    updateSyncStatus("syncing", statusMessage);

    if (cloudRuntime.pushTimer) {
      clearTimeout(cloudRuntime.pushTimer);
    }

    cloudRuntime.pushTimer = window.setTimeout(() => {
      cloudRuntime.pushTimer = null;
      void pushToCloud({ reason: "auto" });
    }, Math.max(100, Number(delayMs) || CLOUD_SYNC_DEBOUNCE_MS));
  }

  async function testCloudConnection() {
    if (!canUseCloudSync()) {
      updateSyncStatus("error", "Missing URL or Google sign-in");
      renderAll();
      return false;
    }

    if (cloudRuntime.inFlight) {
      return false;
    }

    cloudRuntime.inFlight = true;
    updateSyncStatus("syncing", "Testing...");
    renderAll();

    try {
      await requestCloudApi("ping");
      updateSyncStatus("synced", "Cloud connected");
      return true;
    } catch (error) {
      updateSyncStatus("error", `Test failed: ${getErrorMessage(error)}`);
      return false;
    } finally {
      cloudRuntime.inFlight = false;
      renderAll();
    }
  }

  async function pullFromCloud(options = {}) {
    const { interactive = false, skipIfDirty = false, force = false } = options;

    if (!canUseCloudSync()) {
      cloudRuntime.lastPullReason = "missing_config";
      return false;
    }

    if (cloudRuntime.inFlight) {
      cloudRuntime.lastPullReason = "busy";
      return false;
    }

    if (skipIfDirty && cloudRuntime.hasLocalChanges) {
      cloudRuntime.lastPullReason = "dirty";
      return false;
    }

    cloudRuntime.inFlight = true;
    updateSyncStatus("syncing", "Pulling...");
    renderAll();

    try {
      const response = await requestCloudApi("sync");
      const serverState = response.state;
      const serverUpdatedAt = String(response.updatedAt || "");

      if (!serverState || typeof serverState !== "object") {
        updateSyncStatus("local", "Cloud empty");
        cloudRuntime.lastPullReason = "empty";
        return false;
      }

      if (!interactive && !state.cloud.lastSyncedAt && hasMeaningfulLocalData() && !force) {
        updateSyncStatus("local", "Cloud connected. Push local data first");
        cloudRuntime.lastPullReason = "needs_manual_push";
        return false;
      }

      const isNewer =
        force ||
        !state.cloud.lastSyncedAt ||
        !serverUpdatedAt ||
        serverUpdatedAt > state.cloud.lastSyncedAt;

      if (!isNewer) {
        updateSyncStatus("synced", "Already up to date");
        cloudRuntime.lastPullReason = "up_to_date";
        return true;
      }

      if (cloudRuntime.hasLocalChanges && !interactive) {
        scheduleCloudPush({ delayMs: CLOUD_PUSH_RETRY_MS, statusMessage: "Sync waiting..." });
        updateSyncStatus("offline", "Local changes waiting to upload");
        cloudRuntime.lastPullReason = "local_changes_pending";
        return false;
      }

      if (interactive) {
        const confirmed = window.confirm("Replace local data with cloud data?");
        if (!confirmed) {
          updateSyncStatus("local", "Pull cancelled");
          cloudRuntime.lastPullReason = "cancelled";
          return false;
        }
      }

      const localCloud = { ...state.cloud };
      const localAuth = { ...state.auth };
      state = normalizeState(serverState);
      state.cloud = {
        ...state.cloud,
        enabled: localCloud.enabled,
        webAppUrl: localCloud.webAppUrl,
        userId: localCloud.userId,
        lastSyncedAt: serverUpdatedAt || new Date().toISOString(),
      };
      const preservedToken = isJwtExpired(localAuth.idToken, 45) ? "" : localAuth.idToken;
      state.auth = {
        ...state.auth,
        email: preservedToken ? localAuth.email || "" : "",
        idToken: preservedToken || "",
        signedIn: Boolean(preservedToken),
      };

      cloudRuntime.hasLocalChanges = false;
      persistState({ skipCloud: true, silent: true });
      renderAll();
      updateSyncStatus("synced", "Pulled from cloud");
      cloudRuntime.lastPullReason = "pulled";
      return true;
    } catch (error) {
      updateSyncStatus("error", `Pull failed: ${getErrorMessage(error)}`);
      cloudRuntime.lastPullReason = "error";
      return false;
    } finally {
      cloudRuntime.inFlight = false;
      renderAll();
    }
  }

  async function pushToCloud(options = {}) {
    const { reason = "auto" } = options;

    if (!canUseCloudSync()) {
      return false;
    }

    if (cloudRuntime.inFlight) {
      scheduleCloudPush({ delayMs: CLOUD_PUSH_RETRY_MS, statusMessage: "Sync waiting..." });
      return false;
    }

    cloudRuntime.inFlight = true;
    updateSyncStatus("syncing", reason === "manual" ? "Pushing..." : "Syncing...");
    renderAll();

    try {
      const response = await requestCloudApi("push", {
        state: buildCloudPayload(),
        clientUpdatedAt: new Date().toISOString(),
      });

      state.cloud.lastSyncedAt = String(response.updatedAt || new Date().toISOString());
      cloudRuntime.hasLocalChanges = false;
      persistState({ skipCloud: true, silent: true });
      updateSyncStatus("synced", "Synced");
      return true;
    } catch (error) {
      cloudRuntime.hasLocalChanges = true;
      scheduleCloudPush({ delayMs: CLOUD_PUSH_ERROR_RETRY_MS, statusMessage: "Retrying sync..." });
      updateSyncStatus("offline", `Push pending: ${getErrorMessage(error)}`);
      return false;
    } finally {
      cloudRuntime.inFlight = false;
      renderAll();
    }
  }

  async function requestCloudApi(action, payload = {}) {
    const requestBody = {
      action,
      idToken: state.auth.idToken,
      userId: state.cloud.userId,
      ...payload,
    };

    let response;
    try {
      response = await fetch(state.cloud.webAppUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      throw new Error("Network request failed");
    }

    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error("Invalid response from Apps Script");
    }

    if (!response.ok || !parsed || parsed.ok !== true) {
      const message = parsed?.error || `HTTP ${response.status}`;
      if (/unauthorized/i.test(String(message))) {
        state.auth.idToken = "";
        state.auth.email = "";
        state.auth.signedIn = false;
        persistState({ skipCloud: true, silent: true });
        renderAuthIndicators();
      }
      throw new Error(message);
    }

    return parsed;
  }

  function buildCloudPayload() {
    const snapshot = cloneData(state);
    snapshot.cloud = {
      enabled: state.cloud.enabled,
      userId: state.cloud.userId,
      lastSyncedAt: state.cloud.lastSyncedAt,
    };
    snapshot.auth = {
      email: "",
      idToken: "",
      signedIn: false,
    };
    return snapshot;
  }

  function hasMeaningfulLocalData() {
    return getTotalCompletions() > 0 || Object.keys(state.dayNotes).length > 0;
  }

  function getTotalCompletions() {
    let count = 0;
    Object.values(state.entries).forEach((byDate) => {
      Object.values(byDate).forEach((entry) => {
        if (entry && entry.completed) {
          count += 1;
        }
      });
    });
    return count;
  }

  function updateSyncStatus(status, message) {
    cloudRuntime.status = status;
    cloudRuntime.message = message;
  }

  function updateSyncIndicators() {
    refs.syncBadge.textContent = cloudRuntime.message;
    refs.syncBadge.className = `sync-badge ${cloudRuntime.status}`;

    refs.syncStatusText.textContent = cloudRuntime.message;
    refs.syncStatusText.className = `sync-badge ${cloudRuntime.status}`;
  }

  function normalizeState(raw) {
    const template = buildStateTemplate();
    const next = {
      ...template,
      ...(raw && typeof raw === "object" ? raw : {}),
    };

    next.version = Number(next.version) || template.version;
    next.sidebarMode = next.sidebarMode === "analytics" ? "analytics" : "daily";
    next.viewMode = ["week", "month", "heatmap"].includes(next.viewMode) ? next.viewMode : "week";

    next.habits = Array.isArray(next.habits) ? next.habits : [];
    next.habits = next.habits
      .filter((habit) => habit && typeof habit === "object")
      .map((habit) => {
        const type = normalizeHabitType(habit.type);
        const targetPerWeek = type === HABIT_TYPE_CORNERSTONE ? 7 : clampNumber(Number(habit.targetPerWeek || 3), 1, 7);
        return {
          id: String(habit.id || `habit_${generateId()}`),
          name: String(habit.name || "Untitled Habit"),
          icon: String(habit.icon || "✅").slice(0, 4),
          color: normalizeHexColor(habit.color || "#2563d2"),
          type,
          targetPerWeek,
          scheduledDays: buildScheduledDaysFromTarget(targetPerWeek, type, habit.scheduledDays),
          archived: Boolean(habit.archived),
        };
      });

    seedDefaultHabits(next);

    next.entries = next.entries && typeof next.entries === "object" ? next.entries : {};
    next.habits.forEach((habit) => {
      if (!next.entries[habit.id] || typeof next.entries[habit.id] !== "object") {
        next.entries[habit.id] = {};
      }
    });

    next.dayNotes = next.dayNotes && typeof next.dayNotes === "object" ? next.dayNotes : {};

    next.cloud = {
      ...template.cloud,
      ...(next.cloud && typeof next.cloud === "object" ? next.cloud : {}),
    };
    next.cloud.enabled = Boolean(next.cloud.enabled);
    next.cloud.webAppUrl = normalizeCloudUrl(next.cloud.webAppUrl);
    next.cloud.userId = normalizeCloudUserId(next.cloud.userId);
    next.cloud.lastSyncedAt = String(next.cloud.lastSyncedAt || "");

    next.auth = {
      ...template.auth,
      ...(next.auth && typeof next.auth === "object" ? next.auth : {}),
    };
    next.auth.email = String(next.auth.email || "").toLowerCase();
    next.auth.idToken = String(next.auth.idToken || "");
    if (isJwtExpired(next.auth.idToken, 45)) {
      next.auth.idToken = "";
    }
    if (AUTH_CONFIG.allowedEmail && next.auth.email && next.auth.email !== AUTH_CONFIG.allowedEmail) {
      next.auth.idToken = "";
      next.auth.email = "";
    }
    next.auth.signedIn = Boolean(next.auth.idToken);

    return next;
  }

  function seedDefaultHabits(targetState) {
    if (targetState.habits.length > 0) {
      return;
    }
    targetState.habits = cloneData(DEFAULT_HABITS);
  }

  function buildStateTemplate() {
    return {
      version: 2,
      sidebarMode: "daily",
      viewMode: "week",
      habits: cloneData(DEFAULT_HABITS),
      entries: {},
      dayNotes: {},
      cloud: {
        enabled: Boolean(CLOUD_BOOT_CONFIG.enabled),
        webAppUrl: normalizeCloudUrl(CLOUD_BOOT_CONFIG.webAppUrl),
        userId: normalizeCloudUserId(CLOUD_BOOT_CONFIG.userId),
        lastSyncedAt: "",
      },
      auth: {
        email: "",
        idToken: "",
        signedIn: false,
      },
    };
  }

  function readCloudBootConfig() {
    const fromWindow =
      typeof window !== "undefined" &&
      window.DISCIPLINE_OS_CLOUD_CONFIG &&
      typeof window.DISCIPLINE_OS_CLOUD_CONFIG === "object"
        ? window.DISCIPLINE_OS_CLOUD_CONFIG
        : null;

    const merged = {
      ...FALLBACK_CLOUD_BOOT_CONFIG,
      ...(fromWindow || {}),
    };

    return {
      enabled: Boolean(merged.enabled),
      webAppUrl: normalizeCloudUrl(merged.webAppUrl),
      userId: normalizeCloudUserId(merged.userId),
    };
  }

  function readAuthConfig() {
    const fromWindow =
      typeof window !== "undefined" &&
      window.DISCIPLINE_OS_AUTH_CONFIG &&
      typeof window.DISCIPLINE_OS_AUTH_CONFIG === "object"
        ? window.DISCIPLINE_OS_AUTH_CONFIG
        : null;

    const merged = {
      ...FALLBACK_AUTH_CONFIG,
      ...(fromWindow || {}),
    };

    return {
      googleClientId: String(merged.googleClientId || "").trim(),
      allowedEmail: String(merged.allowedEmail || "").trim().toLowerCase(),
    };
  }

  function persistState(options = {}) {
    saveStateLocally();
    if (!options.skipCloud) {
      scheduleCloudPush();
    }
  }

  function loadPersistedState() {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(LOCAL_STATE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function saveStateLocally() {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    try {
      window.localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      // Ignore storage failures (private mode / quota).
    }
  }

  function initializeGoogleAuth() {
    renderAuthIndicators();
    if (!AUTH_CONFIG.googleClientId) {
      return;
    }

    waitForGoogleIdentity(8000).then((ready) => {
      if (!ready || !window.google || !window.google.accounts || !window.google.accounts.id) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: AUTH_CONFIG.googleClientId,
        callback: handleGoogleCredential,
        auto_select: true,
        itp_support: true,
        use_fedcm_for_prompt: true,
      });
      renderGoogleSignInButton();
      window.google.accounts.id.prompt();
    });
  }

  function waitForGoogleIdentity(timeoutMs) {
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (window.google && window.google.accounts && window.google.accounts.id) {
          window.clearInterval(timer);
          resolve(true);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          window.clearInterval(timer);
          resolve(false);
        }
      }, 120);
    });
  }

  function renderGoogleSignInButton() {
    if (!refs.googleSignInButton) {
      return;
    }
    if (!AUTH_CONFIG.googleClientId) {
      refs.googleSignInButton.replaceChildren();
      return;
    }
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      return;
    }
    refs.googleSignInButton.replaceChildren();
    window.google.accounts.id.renderButton(refs.googleSignInButton, {
      theme: "outline",
      size: "large",
      width: 280,
      text: "signin_with",
    });
  }

  function handleGoogleCredential(response) {
    const idToken = String(response?.credential || "");
    if (!idToken) {
      return;
    }

    const payload = decodeJwtPayload(idToken);
    const email = String(payload?.email || "").toLowerCase();
    if (AUTH_CONFIG.allowedEmail && email !== AUTH_CONFIG.allowedEmail) {
      signOutGoogle();
      updateSyncStatus("error", "Wrong Google account");
      showToast("Please sign in with your allowed Google account.");
      renderAll();
      return;
    }

    state.auth.idToken = idToken;
    state.auth.email = email;
    state.auth.signedIn = true;
    persistState({ skipCloud: true, silent: true });
    renderAuthIndicators();

    if (canUseCloudSync()) {
      void bootstrapCloudSyncNow();
    }
  }

  function signOutGoogle() {
    state.auth.idToken = "";
    state.auth.email = "";
    state.auth.signedIn = false;
    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    persistState({ skipCloud: true, silent: true });
    renderAuthIndicators();
    updateSyncStatus("local", "Signed out");
    renderAll();
  }

  function renderAuthIndicators() {
    const hadToken = Boolean(state.auth?.idToken);
    const signedIn = Boolean(state.auth?.idToken) && !isJwtExpired(state.auth.idToken, 45);
    if (state.auth) {
      state.auth.signedIn = signedIn;
      if (!signedIn) {
        state.auth.idToken = "";
        state.auth.email = "";
        if (hadToken) {
          saveStateLocally();
        }
      }
    }
    const email = signedIn ? state.auth?.email || "" : "";
    const text = signedIn ? `Signed in${email ? `: ${email}` : ""}` : "Not signed in";

    if (refs.authBadge) {
      refs.authBadge.textContent = text;
      refs.authBadge.className = `sync-badge ${signedIn ? "synced" : "local"}`;
    }

    if (refs.authStatusText) {
      refs.authStatusText.textContent = AUTH_CONFIG.googleClientId
        ? text
        : "Missing Google Client ID in cloud-config.js";
    }

    if (refs.signOutBtn) {
      refs.signOutBtn.disabled = !signedIn;
    }
  }

  function setBootOverlay(isVisible, message) {
    if (!refs.bootOverlay) {
      return;
    }

    if (refs.bootOverlayText && message) {
      refs.bootOverlayText.textContent = message;
    }

    refs.bootOverlay.hidden = !isVisible;
  }

  function showToast(message) {
    refs.toast.textContent = message;
    refs.toast.classList.add("show");

    if (toastTimer) {
      clearTimeout(toastTimer);
    }

    toastTimer = setTimeout(() => {
      refs.toast.classList.remove("show");
    }, 1800);
  }

  function normalizeHabitType(value) {
    return String(value || "").toLowerCase() === HABIT_TYPE_CORNERSTONE
      ? HABIT_TYPE_CORNERSTONE
      : HABIT_TYPE_REGULAR;
  }

  function getHabitTypeRank(type) {
    return normalizeHabitType(type) === HABIT_TYPE_CORNERSTONE ? 0 : 1;
  }

  function buildScheduledDaysFromTarget(targetPerWeek, type, existingDays) {
    const habitType = normalizeHabitType(type);
    if (habitType === HABIT_TYPE_CORNERSTONE) {
      return [...ALL_DAYS];
    }

    const normalizedExisting = normalizeDays(existingDays);
    if (Array.isArray(existingDays) && normalizedExisting.length) {
      return normalizedExisting;
    }

    const target = clampNumber(Number(targetPerWeek || 3), 1, 7);
    const patterns = {
      1: [1],
      2: [1, 4],
      3: [1, 3, 5],
      4: [1, 2, 4, 6],
      5: [1, 2, 3, 5, 6],
      6: [1, 2, 3, 4, 5, 6],
      7: [...ALL_DAYS],
    };
    return patterns[target] ? [...patterns[target]] : [1, 3, 5];
  }

  function isJwtExpired(token, skewSeconds = 0) {
    const payload = decodeJwtPayload(token);
    const exp = Number(payload?.exp || 0);
    if (!Number.isFinite(exp) || exp <= 0) {
      return Boolean(token);
    }
    const now = Math.floor(Date.now() / 1000);
    return exp <= now + Math.max(0, Number(skewSeconds) || 0);
  }

  function normalizeDays(days) {
    if (!Array.isArray(days)) {
      return [1, 3, 5];
    }

    const valid = Array.from(
      new Set(
        days
          .map((day) => Number(day))
          .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
      ),
    );

    return valid.length ? valid.sort((a, b) => a - b) : [1, 3, 5];
  }

  function sanitizeHabitName(value) {
    return String(value || "").trim().slice(0, 64);
  }

  function sanitizeHabitIcon(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "✅";
    }
    return text.slice(0, 4);
  }

  function pickHabitColor(seed) {
    const text = String(seed || "");
    if (!text) {
      return HABIT_COLOR_PALETTE[0];
    }

    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return HABIT_COLOR_PALETTE[hash % HABIT_COLOR_PALETTE.length];
  }

  function normalizeHexColor(value) {
    if (typeof value !== "string") {
      return "#2563d2";
    }
    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    return "#2563d2";
  }

  function normalizeCloudUrl(value) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }

    try {
      return new URL(text).toString();
    } catch (error) {
      return "";
    }
  }

  function normalizeCloudUserId(value) {
    const cleaned = String(value || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 40);
    return cleaned || "default";
  }

  function formatDateReadable(date) {
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatDateWithWeekday(date) {
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatDateCompact(date) {
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function formatShortDate(date) {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function formatDateTimeReadable(date) {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function todayKey() {
    return toDateKey(new Date());
  }

  function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function fromDateKey(value) {
    const text = String(value || "");
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) {
      return null;
    }
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!Number.isFinite(date.getTime())) {
      return null;
    }
    return date;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, amount) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    copy.setDate(copy.getDate() + amount);
    return copy;
  }

  function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
  }

  function minDate(a, b) {
    return a.getTime() <= b.getTime() ? a : b;
  }

  function startOfWeek(date, weekStartsOn) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = (copy.getDay() - weekStartsOn + 7) % 7;
    copy.setDate(copy.getDate() - diff);
    return copy;
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function isCompactViewport() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  }

  function clampNumber(value, min, max) {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(max, Math.max(min, value));
  }

  function escapeHtml(value) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return String(value).replace(/[&<>"']/g, (ch) => map[ch]);
  }

  function escapeHtmlAttr(value) {
    return escapeHtml(value);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function cloneData(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function generateId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function decodeJwtPayload(token) {
    try {
      const parts = String(token || "").split(".");
      if (parts.length < 2) {
        return null;
      }
      const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
      const json = atob(padded);
      return JSON.parse(json);
    } catch (error) {
      return null;
    }
  }

  function getErrorMessage(error) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error || "Unknown error");
  }
})();
