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

  const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"];
  const MEAL_COLORS = {
    breakfast: "#f1a34a",
    lunch: "#2f8b5d",
    dinner: "#2563d2",
    snack: "#a06ed1",
  };
  const MEAL_LABELS = {
    breakfast: "Breakfast",
    lunch: "Lunch",
    dinner: "Dinner",
    snack: "Snack",
  };
  const MEAL_ICONS = {
    breakfast: "🥞",
    lunch: "🥗",
    dinner: "🍽",
    snack: "🍎",
  };
  const MUSCLE_GROUPS = [
    "legs",
    "marklift",
    "back",
    "shoulders",
    "triceps",
    "biceps",
    "pecs",
    "abs",
  ];
  const MUSCLE_GROUP_LABELS = {
    legs: "Legs",
    marklift: "Markløft",
    back: "Back",
    shoulders: "Shoulders",
    triceps: "Triceps",
    biceps: "Biceps",
    pecs: "Pecs",
    abs: "Abs",
  };
  const MUSCLE_GROUP_COLORS = {
    legs: "#d7842c",
    marklift: "#8b6a35",
    back: "#2563d2",
    shoulders: "#2f94bc",
    triceps: "#6a5cb6",
    biceps: "#b1454f",
    pecs: "#2f8b5d",
    abs: "#5b6173",
  };
  // Maps the legacy single-type field to the new muscle-group array, so any
  // workouts the user logged before this change come across without manual edit.
  const LEGACY_TYPE_TO_GROUPS = {
    push: ["pecs", "triceps", "shoulders"],
    pull: ["back", "biceps"],
    upper: ["pecs", "back", "shoulders", "triceps", "biceps"],
    lower: ["legs", "marklift"],
    legs: ["legs"],
    other: [],
  };
  // Migration: any pre-existing workouts that used "lowerback" as a muscle
  // group should be remapped to "marklift" on load.
  const MUSCLE_GROUP_RENAMES = {
    lowerback: "marklift",
  };
  const DEFAULT_EXERCISES = [
    { id: "ex_benkpress", name: "Benkpress", builtin: true },
    { id: "ex_squat", name: "Squat", builtin: true },
    { id: "ex_marklift", name: "Markløft", builtin: true },
    { id: "ex_skulderpress_db", name: "Skulderpress dumbbells", builtin: true },
    { id: "ex_pulldown_rygg", name: "Pull down rygg", builtin: true },
  ];
  const DEFAULT_GOAL_CALORIES = 2500;
  const DEFAULT_GOAL_PROTEIN = 180;
  const MAX_REPS_FOR_E1RM = 12;

  // Transient UI state for the Exercise tab — declared early so that the
  // initial renderAll() at boot can safely read it. NOT persisted/synced.
  const exUi = {
    selectedMealType: "breakfast",
    // Multi-select muscle groups for the "log workout" form. Set of group keys.
    selectedMuscleGroups: new Set(),
    selectedProgressionExerciseId: "",
    weightRangeDays: 30,
    editingMealKey: "",
    editingWorkoutKey: "",
    dayWorkoutsModalDate: "",
  };

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
  let progressRangeDays = 7;
  let hasRenderedProgressChart = false;
  let hasRenderedHeatmap = false;

  const refs = {
    todayLabel: byId("todayLabel"),
    periodLabel: byId("periodLabel"),
    syncBadge: byId("syncBadge"),
    authBadge: byId("authBadge"),

    viewButtons: Array.from(document.querySelectorAll(".view-btn")),

    todayChecklist: byId("todayChecklist"),
    todaySegmentTrack: byId("todaySegmentTrack"),
    todaySummaryLabel: byId("todaySummaryLabel"),

    prevPeriodBtn: byId("prevPeriodBtn"),
    nextPeriodBtn: byId("nextPeriodBtn"),
    todayBtn: byId("todayBtn"),

    weekView: byId("weekView"),
    weekCards: byId("weekCards"),
    heatmapView: byId("heatmapView"),
    weekTableHead: byId("weekTableHead"),
    weekTableBody: byId("weekTableBody"),
    habitHeatmap: byId("habitHeatmap"),

    // Sidebar drawer
    openSidebarBtn: byId("openSidebarBtn"),
    closeSidebarBtn: byId("closeSidebarBtn"),
    sidebarDrawer: byId("sidebarDrawer"),
    drawerBackdrop: byId("drawerBackdrop"),

    // Sign-in banner
    signInBanner: byId("signInBanner"),
    signInBannerBtn: byId("signInBannerBtn"),
    dismissSignInBannerBtn: byId("dismissSignInBannerBtn"),

    // Habits editor (now in drawer)
    habitEditorList: byId("habitEditorList"),
    newHabitName: byId("newHabitName"),
    newHabitEmoji: byId("newHabitEmoji"),
    newHabitType: byId("newHabitType"),
    newHabitTarget: byId("newHabitTarget"),
    addHabitBtn: byId("addHabitBtn"),

    // Sync modal
    openSyncBtn: byId("openSyncBtn"),
    syncModal: byId("syncModal"),
    closeSyncBtn: byId("closeSyncBtn"),

    // Day details modal
    dayDetailsModal: byId("dayDetailsModal"),
    closeDayDetailsBtn: byId("closeDayDetailsBtn"),
    saveDayDetailsBtn: byId("saveDayDetailsBtn"),
    dayDetailsTitle: byId("dayDetailsTitle"),
    dayDetailsSummary: byId("dayDetailsSummary"),
    dayDetailsTrack: byId("dayDetailsTrack"),
    dayDetailsRate: byId("dayDetailsRate"),
    dayDetailsNoteInput: byId("dayDetailsNoteInput"),
    dayDetailsHabitsList: byId("dayDetailsHabitsList"),

    // Sync fields
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

    progressTop: byId("progressTop"),
    progressGraphList: byId("progressGraphList"),
    progressTopSubheading: byId("progressTopSubheading"),
    progressRangeButtons: Array.from(document.querySelectorAll(".progress-range-btn")),

    // Top tab switcher
    topTabButtons: Array.from(document.querySelectorAll(".top-tab-btn")),
    habitsApp: byId("habitsApp"),
    exerciseApp: byId("exerciseApp"),

    // Snapshot
    exSnapshotDateLabel: byId("exSnapshotDateLabel"),
    exEditGoalsBtn: byId("exEditGoalsBtn"),
    exTodayCalories: byId("exTodayCalories"),
    exTodayCaloriesGoal: byId("exTodayCaloriesGoal"),
    exTodayCaloriesBar: byId("exTodayCaloriesBar"),
    exTodayCaloriesRemain: byId("exTodayCaloriesRemain"),
    exTodayCaloriesCheck: byId("exTodayCaloriesCheck"),
    exTodayProtein: byId("exTodayProtein"),
    exTodayProteinGoal: byId("exTodayProteinGoal"),
    exTodayProteinBar: byId("exTodayProteinBar"),
    exTodayProteinRemain: byId("exTodayProteinRemain"),
    exTodayProteinCheck: byId("exTodayProteinCheck"),
    exWeekWorkouts: byId("exWeekWorkouts"),
    exWeekWorkoutsSub: byId("exWeekWorkoutsSub"),
    exCurrentWeight: byId("exCurrentWeight"),
    exWeightDelta: byId("exWeightDelta"),

    // Calories quick-add
    exCaloriesSection: byId("exCaloriesSection"),
    exMealTagButtons: Array.from(document.querySelectorAll("#exCaloriesSection .ex-tag-btn[data-meal-type]")),
    exMealCaloriesInput: byId("exMealCaloriesInput"),
    exMealProteinInput: byId("exMealProteinInput"),
    exMealDateInput: byId("exMealDateInput"),
    exMealNoteInput: byId("exMealNoteInput"),
    exAddMealBtn: byId("exAddMealBtn"),
    exMealsList: byId("exMealsList"),
    exMealsListTitle: byId("exMealsListTitle"),
    exMealsListTotals: byId("exMealsListTotals"),
    exCaloriesChart: byId("exCaloriesChart"),

    // Workouts
    exWorkoutsSection: byId("exWorkoutsSection"),
    exMuscleGroupButtons: Array.from(document.querySelectorAll("#exWorkoutsSection .ex-tag-btn[data-muscle-group]")),
    exWorkoutExerciseSelect: byId("exWorkoutExerciseSelect"),
    exNewExerciseName: byId("exNewExerciseName"),
    exSaveNewExerciseBtn: byId("exSaveNewExerciseBtn"),
    exAddExerciseDetails: byId("exAddExerciseDetails"),
    exCustomExerciseList: byId("exCustomExerciseList"),
    exWorkoutWeightInput: byId("exWorkoutWeightInput"),
    exWorkoutRepsInput: byId("exWorkoutRepsInput"),
    exWorkoutDateInput: byId("exWorkoutDateInput"),
    exWorkoutE1rmPreview: byId("exWorkoutE1rmPreview"),
    exAddWorkoutBtn: byId("exAddWorkoutBtn"),
    exStatWeekCount: byId("exStatWeekCount"),
    exStatMonthCount: byId("exStatMonthCount"),
    exStatExerciseCount: byId("exStatExerciseCount"),
    exWorkoutCalendar: byId("exWorkoutCalendar"),
    exMuscleFrequencyList: byId("exMuscleFrequencyList"),
    exMuscleFrequencyMeta: byId("exMuscleFrequencyMeta"),
    exDaysSinceList: byId("exDaysSinceList"),
    exProgressionChart: byId("exProgressionChart"),
    exProgressionLegend: byId("exProgressionLegend"),

    // Weight
    exWeightInput: byId("exWeightInput"),
    exWeightDateInput: byId("exWeightDateInput"),
    exAddWeightBtn: byId("exAddWeightBtn"),
    exWeightChart: byId("exWeightChart"),
    exWeightHistory: byId("exWeightHistory"),
    exWeightRangeButtons: Array.from(document.querySelectorAll(".ex-range-btn")),

    // Goals modal
    exGoalsModal: byId("exGoalsModal"),
    exGoalCaloriesInput: byId("exGoalCaloriesInput"),
    exGoalProteinInput: byId("exGoalProteinInput"),
    exSaveGoalsBtn: byId("exSaveGoalsBtn"),
    exCloseGoalsBtn: byId("exCloseGoalsBtn"),

    // Meal edit modal
    exMealEditModal: byId("exMealEditModal"),
    exMealEditTypeButtons: Array.from(document.querySelectorAll("#exMealEditModal .ex-tag-btn[data-edit-meal-type]")),
    exMealEditMeta: byId("exMealEditMeta"),
    exMealEditCalories: byId("exMealEditCalories"),
    exMealEditProtein: byId("exMealEditProtein"),
    exMealEditDate: byId("exMealEditDate"),
    exMealEditNote: byId("exMealEditNote"),
    exSaveMealEditBtn: byId("exSaveMealEditBtn"),
    exDeleteMealBtn: byId("exDeleteMealBtn"),
    exCloseMealEditBtn: byId("exCloseMealEditBtn"),

    // Day-workouts modal (multi-lift list)
    exDayWorkoutsModal: byId("exDayWorkoutsModal"),
    exDayWorkoutsTitle: byId("exDayWorkoutsTitle"),
    exDayWorkoutsMeta: byId("exDayWorkoutsMeta"),
    exDayWorkoutsList: byId("exDayWorkoutsList"),
    exAddAnotherLiftBtn: byId("exAddAnotherLiftBtn"),
    exCloseDayWorkoutsBtn: byId("exCloseDayWorkoutsBtn"),

    // Workout edit modal
    exWorkoutEditModal: byId("exWorkoutEditModal"),
    exWorkoutEditGroupButtons: Array.from(document.querySelectorAll("#exWorkoutEditModal .ex-tag-btn[data-edit-muscle-group]")),
    exWorkoutEditMeta: byId("exWorkoutEditMeta"),
    exWorkoutEditExercise: byId("exWorkoutEditExercise"),
    exWorkoutEditWeight: byId("exWorkoutEditWeight"),
    exWorkoutEditReps: byId("exWorkoutEditReps"),
    exWorkoutEditDate: byId("exWorkoutEditDate"),
    exWorkoutEditE1rm: byId("exWorkoutEditE1rm"),
    exSaveWorkoutEditBtn: byId("exSaveWorkoutEditBtn"),
    exDeleteWorkoutBtn: byId("exDeleteWorkoutBtn"),
    exCloseWorkoutEditBtn: byId("exCloseWorkoutEditBtn"),
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
    bindExerciseEvents();
    // Scroll-aware top bar (glass gets more opaque on scroll).
    const topBar = document.querySelector(".top-bar");
    if (topBar) {
      const updateScrolled = () => {
        topBar.classList.toggle("scrolled", window.scrollY > 8);
      };
      updateScrolled();
      window.addEventListener("scroll", updateScrolled, { passive: true });
    }

    // Sidebar drawer open/close
    if (refs.openSidebarBtn) {
      refs.openSidebarBtn.addEventListener("click", () => openSidebar());
    }
    if (refs.closeSidebarBtn) {
      refs.closeSidebarBtn.addEventListener("click", () => closeSidebar());
    }
    if (refs.drawerBackdrop) {
      refs.drawerBackdrop.addEventListener("click", () => closeSidebar());
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && refs.sidebarDrawer && !refs.sidebarDrawer.hidden) {
        closeSidebar();
      }
    });

    // Sign-in banner actions
    if (refs.signInBannerBtn) {
      refs.signInBannerBtn.addEventListener("click", () => {
        if (window.google && window.google.accounts && window.google.accounts.id) {
          try {
            window.google.accounts.id.prompt();
          } catch (e) {
            // If FedCM prompt fails, open drawer where the Google button lives.
            openSidebar();
          }
        } else {
          openSidebar();
        }
      });
    }
    if (refs.dismissSignInBannerBtn) {
      refs.dismissSignInBannerBtn.addEventListener("click", () => {
        dismissSignInBannerForToday_();
        renderSignInBanner();
      });
    }

    refs.progressRangeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const next = Number(button.dataset.progressRange) || 7;
        if (next === progressRangeDays) {
          return;
        }
        progressRangeDays = next === 30 ? 30 : 7;
        renderProgressTop();
      });
    });

    refs.viewButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.dataset.viewMode;
        state.viewMode = mode === "heatmap" ? "heatmap" : "week";
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

    // Month heatmap is view-only now — no click handler.

    refs.openSyncBtn.addEventListener("click", () => {
      refs.syncModal.showModal();
      renderSyncPanel();
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
    renderProgressTop();
    renderHeader();
    renderTodayPanel();
    renderHabitEditor();
    renderMainContent();
    renderSyncPanel();
    renderSignInBanner();
    renderTopTabs();
    renderExerciseDashboard();
  }

  function openSidebar() {
    if (!refs.sidebarDrawer) {
      return;
    }
    refs.sidebarDrawer.hidden = false;
    if (refs.drawerBackdrop) {
      refs.drawerBackdrop.hidden = false;
    }
    // Re-render the drawer contents so they're current.
    renderTodayPanel();
    renderHabitEditor();
    renderAuthIndicators();
    renderGoogleSignInButton();
    document.body.classList.add("drawer-open");
  }

  function closeSidebar() {
    if (!refs.sidebarDrawer) {
      return;
    }
    refs.sidebarDrawer.hidden = true;
    if (refs.drawerBackdrop) {
      refs.drawerBackdrop.hidden = true;
    }
    document.body.classList.remove("drawer-open");
  }

  function renderSignInBanner() {
    if (!refs.signInBanner) {
      return;
    }
    const canSignIn = Boolean(AUTH_CONFIG.googleClientId);
    const idTokenValid =
      Boolean(state.auth?.idToken) && !isJwtExpired(state.auth.idToken, 45);
    const signedIn = idTokenValid || hasValidSessionToken_();
    const dismissed = isSignInBannerDismissedToday_();
    refs.signInBanner.hidden = !(canSignIn && !signedIn && !dismissed);
  }

  function isSignInBannerDismissedToday_() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      return (
        window.localStorage &&
        window.localStorage.getItem("discipline_os_dismissed_signin_banner") === today
      );
    } catch (e) {
      return false;
    }
  }

  function dismissSignInBannerForToday_() {
    try {
      if (!window.localStorage) return;
      const today = new Date().toISOString().slice(0, 10);
      window.localStorage.setItem("discipline_os_dismissed_signin_banner", today);
    } catch (e) {
      // ignore
    }
  }

  function renderProgressTop() {
    if (!refs.progressGraphList) {
      return;
    }

    const habits = getActiveHabits();

    if (!habits.length) {
      refs.progressGraphList.innerHTML =
        '<p class="month-empty">Add a habit to see your progress.</p>';
      if (refs.progressTopSubheading) {
        refs.progressTopSubheading.textContent =
          "Rolling 7-day and 30-day completion. 100% = weekly goal hit.";
      }
      refs.progressRangeButtons.forEach((b) => (b.style.display = "none"));
      return;
    }

    // Hide the 7/30 toggle (both lines are shown now)
    refs.progressRangeButtons.forEach((b) => (b.style.display = "none"));

    const data = habits.map((h) => ({
      habit: h,
      rate7: getWeeklyGoalRate(h, 7),
      rate30: getWeeklyGoalRate(h, 30),
    }));

    const padT = 20;
    const padR = 22;
    const padB = 58;
    const padL = 52;
    const plotHeight = 180;
    const minSpacing = 58;
    const plotWidth = Math.max(260, Math.max(1, habits.length - 1) * minSpacing);
    const width = padL + plotWidth + padR;
    const height = padT + plotHeight + padB;

    // Auto-scale Y axis: at least 0-100%, extend in 25% steps if any habit exceeds 100%.
    const allRates = [];
    data.forEach((d) => {
      allRates.push(d.rate7, d.rate30);
    });
    const observedMax = allRates.length ? Math.max.apply(null, allRates) : 0;
    const yMax = Math.max(1, Math.ceil(observedMax * 4 + 0.0001) / 4);

    const xAt = (i) =>
      padL + (habits.length > 1 ? (i / (habits.length - 1)) * plotWidth : plotWidth / 2);
    const yAt = (rate) => padT + plotHeight - (Math.max(0, rate) / yMax) * plotHeight;

    const ticks = [];
    for (let t = 0; t <= yMax + 0.0001; t += 0.25) {
      ticks.push(Math.round(t * 100) / 100);
    }

    const gridlines = ticks
      .map((t) => {
        const y = yAt(t);
        const isHundred = Math.abs(t - 1) < 0.001;
        return (
          `<line x1="${padL}" y1="${y}" x2="${padL + plotWidth}" y2="${y}" class="chart-grid${
            isHundred ? " chart-grid-goal" : ""
          }"></line>` +
          `<text x="${padL - 10}" y="${y + 4}" class="chart-y-label" text-anchor="end">${Math.round(
            t * 100,
          )}%</text>`
        );
      })
      .join("");

    const axis =
      `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotHeight}" class="chart-axis"></line>` +
      `<line x1="${padL}" y1="${padT + plotHeight}" x2="${padL + plotWidth}" y2="${padT + plotHeight}" class="chart-axis"></line>`;

    const points7 = data.map((d, i) => `${xAt(i)},${yAt(d.rate7)}`).join(" ");
    const points30 = data.map((d, i) => `${xAt(i)},${yAt(d.rate30)}`).join(" ");

    const dots30 = data
      .map(
        (d, i) =>
          `<circle cx="${xAt(i)}" cy="${yAt(d.rate30)}" r="3.8" class="chart-dot chart-dot-30"><title>${escapeHtml(
            d.habit.name,
          )} · 30-day: ${Math.round(d.rate30 * 100)}%</title></circle>`,
      )
      .join("");
    const dots7 = data
      .map(
        (d, i) =>
          `<circle cx="${xAt(i)}" cy="${yAt(d.rate7)}" r="3.8" class="chart-dot chart-dot-7"><title>${escapeHtml(
            d.habit.name,
          )} · 7-day: ${Math.round(d.rate7 * 100)}%</title></circle>`,
      )
      .join("");

    const xLabels = data
      .map((d, i) => {
        const x = xAt(i);
        const short =
          d.habit.name.length > 10 ? d.habit.name.slice(0, 10).trim() + "…" : d.habit.name;
        return (
          `<text x="${x}" y="${padT + plotHeight + 18}" class="chart-x-icon" text-anchor="middle">${d.habit.icon}</text>` +
          `<text x="${x}" y="${padT + plotHeight + 36}" class="chart-x-label" text-anchor="end" transform="rotate(-30, ${x}, ${padT +
            plotHeight +
            36})">${escapeHtml(short)}</text>`
        );
      })
      .join("");

    // Only animate on the very first render of this session. Re-renders
    // (after every habit toggle) skip animations so the chart doesn't spasm.
    const animateClass = hasRenderedProgressChart ? "" : " chart-animate-in";
    hasRenderedProgressChart = true;
    const svg = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" class="progress-chart-svg${animateClass}" role="img" aria-label="Weekly goal completion chart: 7-day and 30-day rolling averages per habit">
        ${gridlines}
        ${axis}
        <polyline points="${points30}" pathLength="100" class="chart-line chart-line-30" fill="none"></polyline>
        <polyline points="${points7}" pathLength="100" class="chart-line chart-line-7" fill="none"></polyline>
        ${dots30}
        ${dots7}
        ${xLabels}
      </svg>
      <div class="progress-chart-legend">
        <span class="chart-legend-item"><span class="chart-legend-swatch chart-legend-7"></span>7-day rolling</span>
        <span class="chart-legend-item"><span class="chart-legend-swatch chart-legend-30"></span>30-day rolling</span>
      </div>
    `;

    refs.progressGraphList.innerHTML = svg;

    if (refs.progressTopSubheading) {
      refs.progressTopSubheading.textContent =
        "Rolling 7-day and 30-day completion. 100% = weekly goal hit.";
    }
  }

  function countCompletionsInRange(habit, daysBack) {
    let completed = 0;
    for (let i = 0; i < daysBack; i += 1) {
      const date = addDays(new Date(), -i);
      if (isCompleted(habit.id, toDateKey(date))) {
        completed += 1;
      }
    }
    return completed;
  }

  function getWeeklyGoalRate(habit, daysBack) {
    const target = clampNumber(Number(habit.targetPerWeek || 3), 1, 7);
    const expected = daysBack === 7 ? target : (target * daysBack) / 7;
    if (expected <= 0) {
      return 0;
    }
    const completed = countCompletionsInRange(habit, daysBack);
    // No upper cap: beating your weekly goal can exceed 100% (e.g. target 4/wk, did 5 → 125%).
    return Math.max(0, completed / expected);
  }

  function renderHeader() {
    if (refs.todayLabel) {
      refs.todayLabel.textContent = formatDateReadable(new Date());
    }
    updateSyncIndicators();
    renderAuthIndicators();
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
      empty.textContent = "No habits yet. Open the menu to add one.";
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

  // Analytics panel was removed from the UI; the progress chart at the top
  // plus the habit list in the drawer cover this need.
  function renderAnalyticsPanel() {
    return;
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
    // Normalize state.viewMode: we only support "week" and "heatmap" now.
    if (state.viewMode !== "week" && state.viewMode !== "heatmap") {
      state.viewMode = "week";
    }
    renderViewMode();
    if (state.viewMode === "week") {
      try {
        renderWeekTable();
      } catch (error) {
        refs.weekTableBody.innerHTML = `<tr><td colspan=\"99\">Could not render week table.</td></tr>`;
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
    if (refs.weekView) {
      refs.weekView.classList.toggle("active", state.viewMode === "week");
    }
    if (refs.heatmapView) {
      refs.heatmapView.classList.toggle("active", state.viewMode === "heatmap");
    }
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

  // The old calendar-style month grid (with swiping on mobile) was replaced
  // by the view-only heatmap. Kept as a no-op for safety in case any stale
  // reference survives.
  function renderMonthGrid() {
    return;
  }

  // GitHub-style year-long contribution heatmap.
  // 53 weeks × 7 days grid. Each cell's shade is based on that day's
  // overall completion rate (completed / scheduled across all habits).
  function renderHabitHeatmap() {
    if (!refs.habitHeatmap) {
      return;
    }

    const habits = getActiveHabits();
    if (!habits.length) {
      refs.habitHeatmap.innerHTML = `<p class="month-empty">No habits yet. Open the menu to add one.</p>`;
      if (refs.periodLabel) refs.periodLabel.textContent = "";
      return;
    }

    const today = startOfDay(new Date());
    const TOTAL_WEEKS = 53;

    // Align grid to Monday: find the Monday of today's week, then go back 52 weeks.
    const todayDow = today.getDay(); // 0=Sun..6=Sat
    const daysFromMonday = todayDow === 0 ? 6 : todayDow - 1;
    const thisMonday = addDays(today, -daysFromMonday);
    const gridStart = addDays(thisMonday, -(TOTAL_WEEKS - 1) * 7);

    // Aggregate totals over the whole range to drive the header metrics.
    let totalCompleted = 0;
    let totalScheduled = 0;
    let perfectDays = 0;
    let activeDays = 0;

    // Build cell data
    const cells = [];
    for (let i = 0; i < TOTAL_WEEKS * 7; i += 1) {
      const date = addDays(gridStart, i);
      if (date > today) {
        cells.push({ future: true, date });
        continue;
      }
      const totals = getDayTotals(date);
      if (totals.scheduled > 0) {
        totalScheduled += totals.scheduled;
        totalCompleted += totals.completed;
        activeDays += 1;
        if (totals.completed === totals.scheduled) {
          perfectDays += 1;
        }
      }
      cells.push({ date, totals });
    }

    const overallRate = totalScheduled > 0 ? totalCompleted / totalScheduled : 0;

    if (refs.periodLabel) {
      refs.periodLabel.textContent = `Last 365 days · ${perfectDays} perfect`;
    }

    // Cells HTML (column-first ordering matches CSS grid-auto-flow: column)
    const cellsHtml = cells
      .map((cell, i) => {
        // Stagger delay based on week-column index, so reveal sweeps
        // left-to-right like a wave.
        const colIdx = Math.floor(i / 7);
        const delayMs = colIdx * 7;
        const styleDelay = ` style="animation-delay:${delayMs}ms"`;
        if (cell.future) {
          return `<div class="heat-cell heat-future heat-reveal" aria-hidden="true"${styleDelay}></div>`;
        }
        const { totals, date } = cell;
        let level;
        if (totals.scheduled === 0) {
          level = "rest";
        } else if (totals.rate <= 0) {
          level = "0";
        } else if (totals.rate < 0.25) {
          level = "1";
        } else if (totals.rate < 0.5) {
          level = "2";
        } else if (totals.rate < 0.75) {
          level = "3";
        } else if (totals.rate < 1) {
          level = "4";
        } else {
          level = "5";
        }
        const isToday = toDateKey(date) === todayKey();
        const todayCls = isToday ? " heat-today" : "";
        const title =
          totals.scheduled === 0
            ? `${formatDateWithWeekday(date)} — rest day`
            : `${formatDateWithWeekday(date)} — ${totals.completed}/${totals.scheduled} (${Math.round(
                totals.rate * 100,
              )}%)`;
        return `<div class="heat-cell heat-level-${level} heat-reveal${todayCls}" title="${escapeHtmlAttr(
          title,
        )}"${styleDelay}></div>`;
      })
      .join("");

    // Month labels — first week that starts each month, skip duplicates too close together.
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const monthLabels = [];
    let lastMonthLabelAt = -99;
    for (let w = 0; w < TOTAL_WEEKS; w += 1) {
      const firstCell = cells[w * 7];
      if (!firstCell || !firstCell.date) continue;
      const m = firstCell.date.getMonth();
      // Label the week if it's the first week of a month AND far enough from the last label.
      if (firstCell.date.getDate() <= 7 && w - lastMonthLabelAt >= 3) {
        monthLabels.push({ col: w + 1, name: monthNames[m] });
        lastMonthLabelAt = w;
      }
    }
    const monthLabelsHtml = monthLabels
      .map(
        (ml) =>
          `<span class="heat-month" style="grid-column-start:${ml.col}">${ml.name}</span>`,
      )
      .join("");

    // Day labels on the left column: Mon, Wed, Fri (others empty for visual breathing room)
    const dayLabels = ["Mon", "", "Wed", "", "Fri", "", ""];
    const dayLabelsHtml = dayLabels
      .map((l) => `<span class="heat-day">${l}</span>`)
      .join("");

    // Animate only on first render of this session.
    const heatAnimateClass = hasRenderedHeatmap ? "" : " heat-animate-in";
    hasRenderedHeatmap = true;
    refs.habitHeatmap.innerHTML = `
      <div class="heatmap-new${heatAnimateClass}">
        <header class="heatmap-new-head">
          <div>
            <p class="heatmap-big-stat">${Math.round(overallRate * 100)}%</p>
            <p class="heatmap-stat-label">overall completion · ${activeDays} scheduled days</p>
          </div>
          <div class="heatmap-new-legend">
            <span class="muted">Less</span>
            <span class="heat-cell heat-level-0"></span>
            <span class="heat-cell heat-level-1"></span>
            <span class="heat-cell heat-level-2"></span>
            <span class="heat-cell heat-level-3"></span>
            <span class="heat-cell heat-level-4"></span>
            <span class="heat-cell heat-level-5"></span>
            <span class="muted">More</span>
          </div>
        </header>
        <div class="heatmap-months-row" style="grid-template-columns: repeat(${TOTAL_WEEKS}, var(--heat-cell-w, 13px));">
          ${monthLabelsHtml}
        </div>
        <div class="heatmap-body">
          <div class="heatmap-day-col">${dayLabelsHtml}</div>
          <div class="heatmap-cells">${cellsHtml}</div>
        </div>
      </div>
    `;
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
    if (!state.cloud.enabled || !state.cloud.webAppUrl || !state.auth) {
      return false;
    }
    if (hasValidSessionToken_()) {
      return true;
    }
    return Boolean(state.auth.idToken && !isJwtExpired(state.auth.idToken, 45));
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
      const preservedIdToken = isJwtExpired(localAuth.idToken, 45) ? "" : localAuth.idToken;
      const preservedSessionToken = isSessionTokenExpiredAt_(localAuth.sessionExpiresAt, 60)
        ? ""
        : localAuth.sessionToken || "";
      state.auth = {
        ...state.auth,
        email: preservedIdToken || preservedSessionToken ? localAuth.email || "" : "",
        idToken: preservedIdToken || "",
        sessionToken: preservedSessionToken,
        sessionExpiresAt: preservedSessionToken ? localAuth.sessionExpiresAt || "" : "",
        signedIn: Boolean(preservedIdToken) || Boolean(preservedSessionToken),
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
    const useSession = hasValidSessionToken_() && action !== "exchange-token";
    const requestBody = {
      action,
      userId: state.cloud.userId,
      ...payload,
    };
    if (useSession) {
      requestBody.sessionToken = state.auth.sessionToken;
    } else {
      requestBody.idToken = state.auth.idToken;
    }

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
      if (/unauthorized|session expired/i.test(String(message))) {
        // Session token is bad or expired — clear it. If we still have a valid ID token,
        // the next request can fall back to using that. Otherwise the user will be re-prompted.
        if (useSession) {
          state.auth.sessionToken = "";
          state.auth.sessionExpiresAt = "";
        } else {
          state.auth.idToken = "";
          state.auth.sessionToken = "";
          state.auth.sessionExpiresAt = "";
          state.auth.email = "";
          state.auth.signedIn = false;
        }
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
    // Legacy field kept in state for compatibility with older clients, but unused.
    next.sidebarMode = next.sidebarMode === "analytics" ? "analytics" : "daily";
    next.viewMode = ["week", "heatmap"].includes(next.viewMode) ? next.viewMode : "week";
    next.activeTopTab = next.activeTopTab === "exercise" ? "exercise" : "habits";
    next.exercise = normalizeExerciseSlice(next.exercise);

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
    next.auth.sessionToken = String(next.auth.sessionToken || "");
    next.auth.sessionExpiresAt = String(next.auth.sessionExpiresAt || "");
    if (isJwtExpired(next.auth.idToken, 45)) {
      next.auth.idToken = "";
    }
    if (isSessionTokenExpiredAt_(next.auth.sessionExpiresAt, 60)) {
      next.auth.sessionToken = "";
      next.auth.sessionExpiresAt = "";
    }
    if (AUTH_CONFIG.allowedEmail && next.auth.email && next.auth.email !== AUTH_CONFIG.allowedEmail) {
      next.auth.idToken = "";
      next.auth.sessionToken = "";
      next.auth.sessionExpiresAt = "";
      next.auth.email = "";
    }
    next.auth.signedIn = Boolean(next.auth.idToken) || Boolean(next.auth.sessionToken);

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
      version: 3,
      sidebarMode: "daily",
      viewMode: "week",
      activeTopTab: "habits",
      habits: cloneData(DEFAULT_HABITS),
      entries: {},
      dayNotes: {},
      exercise: buildExerciseTemplate(),
      cloud: {
        enabled: Boolean(CLOUD_BOOT_CONFIG.enabled),
        webAppUrl: normalizeCloudUrl(CLOUD_BOOT_CONFIG.webAppUrl),
        userId: normalizeCloudUserId(CLOUD_BOOT_CONFIG.userId),
        lastSyncedAt: "",
      },
      auth: {
        email: "",
        idToken: "",
        sessionToken: "",
        sessionExpiresAt: "",
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

      // Only show Google's One Tap popup if we don't already have a working
      // login. With a valid session token (90-day) or fresh ID token (1-hour),
      // there's no reason to prompt — the user is already authenticated.
      const idTokenValid =
        Boolean(state.auth?.idToken) && !isJwtExpired(state.auth.idToken, 45);
      const alreadyAuthenticated = hasValidSessionToken_() || idTokenValid;
      if (!alreadyAuthenticated) {
        window.google.accounts.id.prompt();
      }
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

    // Exchange the short-lived Google ID token for a 90-day session token.
    // We run this in the background; even if it fails we can still use the ID token for the next hour.
    void exchangeIdTokenForSession();

    if (canUseCloudSync()) {
      void bootstrapCloudSyncNow();
    }
  }

  async function exchangeIdTokenForSession() {
    if (!state.auth.idToken || !state.cloud.webAppUrl) {
      return;
    }
    try {
      const response = await fetch(state.cloud.webAppUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "exchange-token",
          idToken: state.auth.idToken,
          userId: state.cloud.userId,
        }),
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data && data.ok && data.sessionToken) {
        state.auth.sessionToken = String(data.sessionToken);
        state.auth.sessionExpiresAt = String(data.expiresAt || "");
        state.auth.signedIn = true;
        persistState({ skipCloud: true, silent: true });
        renderAuthIndicators();
      }
    } catch (error) {
      // Silent fail — ID token still works for the next hour.
    }
  }

  function signOutGoogle() {
    state.auth.idToken = "";
    state.auth.sessionToken = "";
    state.auth.sessionExpiresAt = "";
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
    const hadToken = Boolean(state.auth?.idToken) || Boolean(state.auth?.sessionToken);
    const idTokenValid =
      Boolean(state.auth?.idToken) && !isJwtExpired(state.auth.idToken, 45);
    const sessionValid = hasValidSessionToken_();
    const signedIn = idTokenValid || sessionValid;
    if (state.auth) {
      state.auth.signedIn = signedIn;
      if (!idTokenValid && state.auth.idToken) {
        state.auth.idToken = "";
      }
      if (!sessionValid && state.auth.sessionToken) {
        state.auth.sessionToken = "";
        state.auth.sessionExpiresAt = "";
      }
      if (!signedIn && hadToken) {
        state.auth.email = "";
        saveStateLocally();
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

    // Keep the sign-in banner in sync with auth state.
    renderSignInBanner();
  }

  function setBootOverlay(isVisible, message) {
    if (!refs.bootOverlay) {
      return;
    }

    if (refs.bootOverlayText && message) {
      refs.bootOverlayText.textContent = message;
    }

    if (isVisible) {
      refs.bootOverlay.hidden = false;
      refs.bootOverlay.classList.remove("hiding");
    } else {
      refs.bootOverlay.classList.add("hiding");
      window.setTimeout(() => {
        if (refs.bootOverlay.classList.contains("hiding")) {
          refs.bootOverlay.hidden = true;
        }
      }, 260);
    }
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

  function isSessionTokenExpiredAt_(expiresAtIso, skewSeconds = 0) {
    if (!expiresAtIso) {
      return true;
    }
    const expMs = Date.parse(expiresAtIso);
    if (!Number.isFinite(expMs)) {
      return true;
    }
    return expMs <= Date.now() + Math.max(0, Number(skewSeconds) || 0) * 1000;
  }

  function hasValidSessionToken_() {
    return (
      Boolean(state.auth && state.auth.sessionToken) &&
      !isSessionTokenExpiredAt_(state.auth.sessionExpiresAt, 60)
    );
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

  // ===========================================================================
  // Exercise module (calories, workouts, body weight)
  // ---------------------------------------------------------------------------
  // Adds three trackers under a top-level "Exercise" tab. Persists to the same
  // state JSON blob as the habits app, so existing Google Sign-In + Google
  // Sheet sync covers it for free. The Telegram reminder logic in Code.gs only
  // counts state.entries (habit completions), so logging meals/workouts/weight
  // does NOT suppress the daily reminder.
  // ===========================================================================

  // (exUi is declared near the top of the IIFE so the initial renderAll() at
  // boot can read it without hitting the const-TDZ.)

  function buildExerciseTemplate() {
    return {
      goals: {
        calories: DEFAULT_GOAL_CALORIES,
        protein: DEFAULT_GOAL_PROTEIN,
      },
      meals: {},
      workouts: {},
      exercises: cloneData(DEFAULT_EXERCISES),
      weights: {},
    };
  }

  function normalizeExerciseSlice(raw) {
    const template = buildExerciseTemplate();
    const next = {
      ...template,
      ...(raw && typeof raw === "object" ? raw : {}),
    };

    // Goals
    next.goals = {
      ...template.goals,
      ...(next.goals && typeof next.goals === "object" ? next.goals : {}),
    };
    next.goals.calories = clampNumber(
      Math.round(Number(next.goals.calories) || DEFAULT_GOAL_CALORIES),
      500,
      10000,
    );
    next.goals.protein = clampNumber(
      Math.round(Number(next.goals.protein) || DEFAULT_GOAL_PROTEIN),
      20,
      500,
    );

    // Exercises (custom + builtin)
    const seen = new Set();
    const cleanExercises = [];
    const rawExercises = Array.isArray(next.exercises) ? next.exercises : [];
    rawExercises.forEach((ex) => {
      if (!ex || typeof ex !== "object") return;
      const name = String(ex.name || "").trim();
      if (!name) return;
      const id = String(ex.id || `ex_${generateId()}`).trim() || `ex_${generateId()}`;
      const lowerName = name.toLowerCase();
      if (seen.has(lowerName)) return;
      seen.add(lowerName);
      cleanExercises.push({
        id,
        name: name.slice(0, 80),
        builtin: Boolean(ex.builtin),
      });
    });
    DEFAULT_EXERCISES.forEach((d) => {
      if (!seen.has(d.name.toLowerCase())) {
        cleanExercises.push({ ...d });
        seen.add(d.name.toLowerCase());
      }
    });
    next.exercises = cleanExercises;
    const validExerciseIds = new Set(next.exercises.map((e) => e.id));

    // Meals: { dateKey: [meal, meal, ...] }
    const cleanMeals = {};
    const rawMeals = next.meals && typeof next.meals === "object" ? next.meals : {};
    Object.keys(rawMeals).forEach((dateKey) => {
      if (!isValidDateKey(dateKey)) return;
      const list = Array.isArray(rawMeals[dateKey]) ? rawMeals[dateKey] : [];
      const cleanList = list
        .map((m) => normalizeMealEntry(m))
        .filter(Boolean);
      if (cleanList.length) cleanMeals[dateKey] = cleanList;
    });
    next.meals = cleanMeals;

    // Workouts: { dateKey: [workout, workout, ...] }
    const cleanWorkouts = {};
    const rawWorkouts = next.workouts && typeof next.workouts === "object" ? next.workouts : {};
    Object.keys(rawWorkouts).forEach((dateKey) => {
      if (!isValidDateKey(dateKey)) return;
      const list = Array.isArray(rawWorkouts[dateKey]) ? rawWorkouts[dateKey] : [];
      const cleanList = list
        .map((w) => normalizeWorkoutEntry(w, validExerciseIds))
        .filter(Boolean);
      if (cleanList.length) cleanWorkouts[dateKey] = cleanList;
    });
    next.workouts = cleanWorkouts;

    // Weights: { dateKey: { kg, createdAt } } — at most one per day
    const cleanWeights = {};
    const rawWeights = next.weights && typeof next.weights === "object" ? next.weights : {};
    Object.keys(rawWeights).forEach((dateKey) => {
      if (!isValidDateKey(dateKey)) return;
      const entry = rawWeights[dateKey];
      if (!entry || typeof entry !== "object") return;
      const kg = clampNumber(Number(entry.kg), 20, 400);
      if (!Number.isFinite(kg) || kg <= 0) return;
      cleanWeights[dateKey] = {
        kg: roundTo(kg, 1),
        createdAt: String(entry.createdAt || new Date().toISOString()),
      };
    });
    next.weights = cleanWeights;

    return next;
  }

  function normalizeMealEntry(raw) {
    if (!raw || typeof raw !== "object") return null;
    const calories = clampNumber(Math.round(Number(raw.calories) || 0), 0, 20000);
    const protein = clampNumber(roundTo(Number(raw.protein) || 0, 1), 0, 1000);
    if (calories === 0 && protein === 0 && !raw.note) return null;
    const mealType = MEAL_TYPES.includes(raw.mealType) ? raw.mealType : "snack";
    return {
      id: String(raw.id || `meal_${generateId()}`),
      mealType,
      calories,
      protein,
      note: String(raw.note || "").trim().slice(0, 200),
      createdAt: String(raw.createdAt || new Date().toISOString()),
    };
  }

  function normalizeWorkoutEntry(raw, validExerciseIds) {
    if (!raw || typeof raw !== "object") return null;
    const weight = clampNumber(roundTo(Number(raw.weight) || 0, 1), 0, 1000);
    const reps = clampNumber(Math.floor(Number(raw.reps) || 0), 1, 100);
    if (weight <= 0 || reps < 1) return null;

    // Muscle groups: prefer the new array; fall back to legacy `type` mapping
    // so workouts logged before this change keep their meaning.
    let muscleGroups;
    if (Array.isArray(raw.muscleGroups)) {
      muscleGroups = raw.muscleGroups
        .map((g) => MUSCLE_GROUP_RENAMES[g] || g)
        .filter((g) => MUSCLE_GROUPS.includes(g));
    } else if (raw.type && LEGACY_TYPE_TO_GROUPS[raw.type]) {
      muscleGroups = LEGACY_TYPE_TO_GROUPS[raw.type].slice();
    } else {
      muscleGroups = [];
    }
    // Dedupe + preserve canonical order from MUSCLE_GROUPS
    const seen = new Set(muscleGroups);
    muscleGroups = MUSCLE_GROUPS.filter((g) => seen.has(g));

    let exerciseId = String(raw.exerciseId || "").trim();
    if (!exerciseId || !validExerciseIds.has(exerciseId)) {
      exerciseId = DEFAULT_EXERCISES[0].id;
    }
    return {
      id: String(raw.id || `wk_${generateId()}`),
      muscleGroups,
      exerciseId,
      weight,
      reps,
      e1rm: roundTo(calcE1rm(weight, reps), 1),
      createdAt: String(raw.createdAt || new Date().toISOString()),
    };
  }

  // ---------------------------------------------------------------------------
  // 1RM estimation — Epley formula.
  // 1RM = weight × (1 + reps / 30)   for reps > 1
  // 1RM = weight                     for reps = 1
  // Validated against direct 1RM testing in LeSuer et al. (1997) and Reynolds
  // et al. (2006) for rep ranges 1–10. Most accurate at lower reps; flagged
  // beyond MAX_REPS_FOR_E1RM since the rep-weight curve flattens at high reps.
  // ---------------------------------------------------------------------------
  function calcE1rm(weight, reps) {
    const w = Number(weight);
    const r = Math.max(1, Math.floor(Number(reps) || 0));
    if (!Number.isFinite(w) || w <= 0 || r < 1) return 0;
    if (r === 1) return w;
    return w * (1 + r / 30);
  }

  function isValidDateKey(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function roundTo(value, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(Number(value) * factor) / factor;
  }

  function dateKeyDaysAgo(daysBack) {
    return toDateKey(addDays(new Date(), -daysBack));
  }

  function lastNDateKeys(n) {
    const arr = [];
    for (let i = n - 1; i >= 0; i -= 1) arr.push(dateKeyDaysAgo(i));
    return arr;
  }

  // ===========================================================================
  // Mutations (each calls persistState() so cloud sync picks them up)
  // ===========================================================================

  function exAddMeal({ mealType, calories, protein, note, dateKey }) {
    const ex = state.exercise;
    const date = isValidDateKey(dateKey) ? dateKey : todayKey();
    const meal = normalizeMealEntry({
      mealType,
      calories,
      protein,
      note,
      createdAt: new Date().toISOString(),
    });
    if (!meal) return null;
    if (!ex.meals[date]) ex.meals[date] = [];
    ex.meals[date].push(meal);
    persistState();
    return { meal, dateKey: date };
  }

  function exUpdateMeal(dateKey, mealId, patch) {
    const ex = state.exercise;
    const targetDate = isValidDateKey(patch.dateKey) ? patch.dateKey : dateKey;
    const list = ex.meals[dateKey] || [];
    const idx = list.findIndex((m) => m.id === mealId);
    if (idx < 0) return false;
    const old = list[idx];
    const updated = normalizeMealEntry({
      ...old,
      mealType: patch.mealType ?? old.mealType,
      calories: patch.calories ?? old.calories,
      protein: patch.protein ?? old.protein,
      note: patch.note ?? old.note,
    });
    if (!updated) return false;
    if (targetDate !== dateKey) {
      list.splice(idx, 1);
      if (list.length === 0) delete ex.meals[dateKey];
      if (!ex.meals[targetDate]) ex.meals[targetDate] = [];
      ex.meals[targetDate].push(updated);
    } else {
      list[idx] = updated;
    }
    persistState();
    return true;
  }

  function exDeleteMeal(dateKey, mealId) {
    const ex = state.exercise;
    const list = ex.meals[dateKey] || [];
    const idx = list.findIndex((m) => m.id === mealId);
    if (idx < 0) return false;
    list.splice(idx, 1);
    if (list.length === 0) delete ex.meals[dateKey];
    persistState();
    return true;
  }

  function exDeleteExercise(exerciseId) {
    const ex = state.exercise;
    const idx = ex.exercises.findIndex((e) => e.id === exerciseId);
    if (idx < 0) return false;
    if (ex.exercises[idx].builtin) return false;
    ex.exercises.splice(idx, 1);
    persistState();
    return true;
  }

  function countWorkoutsForExercise(exerciseId) {
    let n = 0;
    Object.values(state.exercise.workouts).forEach((list) => {
      list.forEach((w) => {
        if (w.exerciseId === exerciseId) n += 1;
      });
    });
    return n;
  }

  function exAddExercise(name) {
    const ex = state.exercise;
    const trimmed = String(name || "").trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    const existing = ex.exercises.find((e) => e.name.toLowerCase() === lower);
    if (existing) return existing;
    const created = {
      id: `ex_${generateId()}`,
      name: trimmed.slice(0, 80),
      builtin: false,
    };
    ex.exercises.push(created);
    persistState();
    return created;
  }

  function exAddWorkout({ muscleGroups, exerciseId, weight, reps, dateKey }) {
    const ex = state.exercise;
    const date = isValidDateKey(dateKey) ? dateKey : todayKey();
    const validIds = new Set(ex.exercises.map((e) => e.id));
    const workout = normalizeWorkoutEntry(
      { muscleGroups, exerciseId, weight, reps, createdAt: new Date().toISOString() },
      validIds,
    );
    if (!workout) return null;
    if (!ex.workouts[date]) ex.workouts[date] = [];
    ex.workouts[date].push(workout);
    persistState();
    return { workout, dateKey: date };
  }

  function exUpdateWorkout(dateKey, workoutId, patch) {
    const ex = state.exercise;
    const targetDate = isValidDateKey(patch.dateKey) ? patch.dateKey : dateKey;
    const list = ex.workouts[dateKey] || [];
    const idx = list.findIndex((w) => w.id === workoutId);
    if (idx < 0) return false;
    const old = list[idx];
    const validIds = new Set(ex.exercises.map((e) => e.id));
    const updated = normalizeWorkoutEntry(
      {
        ...old,
        muscleGroups: patch.muscleGroups ?? old.muscleGroups,
        exerciseId: patch.exerciseId ?? old.exerciseId,
        weight: patch.weight ?? old.weight,
        reps: patch.reps ?? old.reps,
      },
      validIds,
    );
    if (!updated) return false;
    if (targetDate !== dateKey) {
      list.splice(idx, 1);
      if (list.length === 0) delete ex.workouts[dateKey];
      if (!ex.workouts[targetDate]) ex.workouts[targetDate] = [];
      ex.workouts[targetDate].push(updated);
    } else {
      list[idx] = updated;
    }
    persistState();
    return true;
  }

  function exDeleteWorkout(dateKey, workoutId) {
    const ex = state.exercise;
    const list = ex.workouts[dateKey] || [];
    const idx = list.findIndex((w) => w.id === workoutId);
    if (idx < 0) return false;
    list.splice(idx, 1);
    if (list.length === 0) delete ex.workouts[dateKey];
    persistState();
    return true;
  }

  function exAddWeight({ kg, dateKey }) {
    const ex = state.exercise;
    const date = isValidDateKey(dateKey) ? dateKey : todayKey();
    const value = clampNumber(roundTo(Number(kg) || 0, 1), 20, 400);
    if (!Number.isFinite(value) || value <= 0) return null;
    ex.weights[date] = { kg: value, createdAt: new Date().toISOString() };
    persistState();
    return { kg: value, dateKey: date };
  }

  function exDeleteWeight(dateKey) {
    const ex = state.exercise;
    if (!ex.weights[dateKey]) return false;
    delete ex.weights[dateKey];
    persistState();
    return true;
  }

  function exSetGoals(calories, protein) {
    const ex = state.exercise;
    ex.goals.calories = clampNumber(Math.round(Number(calories) || DEFAULT_GOAL_CALORIES), 500, 10000);
    ex.goals.protein = clampNumber(Math.round(Number(protein) || DEFAULT_GOAL_PROTEIN), 20, 500);
    persistState();
  }

  // ===========================================================================
  // Top tab switcher (Habits | Exercise)
  // ===========================================================================

  function setTopTab(tab) {
    const next = tab === "exercise" ? "exercise" : "habits";
    if (state.activeTopTab === next) return;
    state.activeTopTab = next;
    persistState({ skipCloud: true });
    renderTopTabs();
    if (next === "exercise") {
      renderExerciseDashboard();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderTopTabs() {
    if (!refs.topTabButtons || !refs.habitsApp || !refs.exerciseApp) return;
    const tab = state.activeTopTab === "exercise" ? "exercise" : "habits";
    refs.topTabButtons.forEach((btn) => {
      const isActive = btn.dataset.topTab === tab;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    refs.habitsApp.hidden = tab !== "habits";
    refs.exerciseApp.hidden = tab !== "exercise";
  }

  // ===========================================================================
  // Render orchestration
  // ===========================================================================

  function renderExerciseDashboard() {
    if (!refs.exerciseApp) return;
    renderExSnapshot();
    renderExCaloriesSection();
    renderExWorkoutsSection();
    renderExWeightSection();
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------
  function renderExSnapshot() {
    const ex = state.exercise;
    if (!ex || !refs.exTodayCalories) return;

    if (refs.exSnapshotDateLabel) {
      // "Sun, May 3" — the year is implicit; eyebrow already says "Today".
      refs.exSnapshotDateLabel.textContent = formatDateShort(new Date());
    }

    const today = todayKey();
    const meals = ex.meals[today] || [];
    const totals = sumMeals(meals);
    const goalCal = ex.goals.calories;
    const goalPro = ex.goals.protein;

    refs.exTodayCalories.textContent = formatNumber(totals.calories);
    refs.exTodayCaloriesGoal.textContent = formatNumber(goalCal);
    refs.exTodayCaloriesBar.style.width = `${Math.min(100, (totals.calories / goalCal) * 100)}%`;
    const calMet = totals.calories >= goalCal;
    refs.exTodayCaloriesBar.classList.toggle("goal-met", calMet);
    if (refs.exTodayCaloriesCheck) refs.exTodayCaloriesCheck.hidden = !calMet;
    const calRemain = goalCal - totals.calories;
    refs.exTodayCaloriesRemain.textContent =
      calRemain > 0
        ? `${formatNumber(calRemain)} kcal left`
        : calRemain === 0
          ? "Goal hit"
          : `${formatNumber(Math.abs(calRemain))} kcal over`;

    refs.exTodayProtein.textContent = formatNumber(totals.protein);
    refs.exTodayProteinGoal.textContent = formatNumber(goalPro);
    refs.exTodayProteinBar.style.width = `${Math.min(100, (totals.protein / goalPro) * 100)}%`;
    const proMet = totals.protein >= goalPro;
    refs.exTodayProteinBar.classList.toggle("goal-met", proMet);
    if (refs.exTodayProteinCheck) refs.exTodayProteinCheck.hidden = !proMet;
    const proRemain = goalPro - totals.protein;
    refs.exTodayProteinRemain.textContent =
      proRemain > 0
        ? `${formatNumber(roundTo(proRemain, 1))} g protein left`
        : proRemain === 0
          ? "Goal hit"
          : `${formatNumber(roundTo(Math.abs(proRemain), 1))} g over`;

    // Workouts in the last 7 days (rolling, matches the stats row).
    let weekCount = 0;
    let bestE1rmThisWeek = 0;
    let bestE1rmExercise = "";
    for (let i = 0; i < 7; i += 1) {
      const dKey = dateKeyDaysAgo(i);
      const list = ex.workouts[dKey] || [];
      weekCount += list.length;
      list.forEach((w) => {
        if (w.e1rm > bestE1rmThisWeek) {
          bestE1rmThisWeek = w.e1rm;
          const e = ex.exercises.find((x) => x.id === w.exerciseId);
          bestE1rmExercise = e ? e.name : "";
        }
      });
    }
    refs.exWeekWorkouts.textContent = String(weekCount);
    refs.exWeekWorkoutsSub.textContent = bestE1rmThisWeek
      ? `Top e1RM: ${formatNumber(roundTo(bestE1rmThisWeek, 1))} kg · ${bestE1rmExercise}`
      : weekCount
        ? `${weekCount} session${weekCount === 1 ? "" : "s"}`
        : "No workouts logged";

    // Weight + delta vs ~7 days ago.
    const weightEntries = Object.entries(ex.weights)
      .map(([dKey, v]) => ({ dateKey: dKey, kg: v.kg }))
      .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
    if (weightEntries.length === 0) {
      refs.exCurrentWeight.textContent = "—";
      refs.exWeightDelta.textContent = "No log yet";
    } else {
      const latest = weightEntries[weightEntries.length - 1];
      refs.exCurrentWeight.textContent = formatNumber(latest.kg);
      const cutoff = dateKeyDaysAgo(7);
      const earlier = [...weightEntries]
        .reverse()
        .find((e) => e.dateKey <= cutoff && e.dateKey !== latest.dateKey);
      if (earlier) {
        const delta = roundTo(latest.kg - earlier.kg, 1);
        const sign = delta > 0 ? "+" : "";
        refs.exWeightDelta.textContent = `${sign}${formatNumber(delta)} kg vs ${earlier.dateKey}`;
      } else {
        refs.exWeightDelta.textContent = `Logged ${latest.dateKey}`;
      }
    }
  }

  function sumMeals(meals) {
    let calories = 0;
    let protein = 0;
    meals.forEach((m) => {
      calories += m.calories;
      protein += m.protein;
    });
    return { calories, protein: roundTo(protein, 1) };
  }

  // ---------------------------------------------------------------------------
  // Calories section
  // ---------------------------------------------------------------------------
  function renderExCaloriesSection() {
    syncMealTagButtons();
    setDateInputDefault(refs.exMealDateInput);
    renderExMealsList();
    renderExCaloriesChart();
  }

  function syncMealTagButtons() {
    refs.exMealTagButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mealType === exUi.selectedMealType);
    });
  }

  function setDateInputDefault(input) {
    if (!input) return;
    if (!input.value) input.value = todayKey();
    if (!input.max) input.max = todayKey();
  }

  function renderExMealsList() {
    if (!refs.exMealsList) return;
    const ex = state.exercise;
    const date = refs.exMealDateInput?.value && isValidDateKey(refs.exMealDateInput.value)
      ? refs.exMealDateInput.value
      : todayKey();
    const meals = (ex.meals[date] || []).slice().sort((a, b) => {
      const order = MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType);
      if (order !== 0) return order;
      return a.createdAt < b.createdAt ? -1 : 1;
    });
    const totals = sumMeals(meals);

    if (refs.exMealsListTitle) {
      const isToday = date === todayKey();
      refs.exMealsListTitle.textContent = isToday ? "Today's meals" : `Meals on ${date}`;
    }
    if (refs.exMealsListTotals) {
      refs.exMealsListTotals.textContent = `${formatNumber(totals.calories)} kcal · ${formatNumber(totals.protein)} g protein`;
    }

    if (meals.length === 0) {
      refs.exMealsList.innerHTML =
        '<p class="ex-empty">No meals logged for this day yet. Add one above.</p>';
      return;
    }

    refs.exMealsList.innerHTML = meals
      .map((m) => {
        const color = MEAL_COLORS[m.mealType];
        const icon = MEAL_ICONS[m.mealType];
        const label = MEAL_LABELS[m.mealType];
        const note = m.note ? `<p class="ex-meal-note">${escapeHtml(m.note)}</p>` : "";
        const time = formatTimeOfDay(m.createdAt);
        const labelLine = time
          ? `${label}<span class="ex-meal-time"> · ${time}</span>`
          : label;
        return `
          <button class="ex-meal-row" type="button" data-edit-meal="${escapeHtmlAttr(date)}|${escapeHtmlAttr(m.id)}" style="--meal-color:${color}">
            <span class="ex-meal-icon" aria-hidden="true">${icon}</span>
            <span class="ex-meal-body">
              <span class="ex-meal-label">${labelLine}</span>
              ${note}
            </span>
            <span class="ex-meal-stats">
              <span class="ex-meal-cal">${formatNumber(m.calories)} <span class="ex-meal-unit">kcal</span></span>
              <span class="ex-meal-pro muted">${formatNumber(m.protein)} g protein</span>
            </span>
          </button>
        `;
      })
      .join("");
  }

  function renderExCaloriesChart() {
    if (!refs.exCaloriesChart) return;
    const ex = state.exercise;
    const days = lastNDateKeys(30);
    const goalCal = ex.goals.calories;
    const goalPro = ex.goals.protein;

    const dayData = days.map((dKey) => {
      const list = ex.meals[dKey] || [];
      const stack = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
      let protein = 0;
      list.forEach((m) => {
        stack[m.mealType] = (stack[m.mealType] || 0) + m.calories;
        protein += m.protein;
      });
      const total = stack.breakfast + stack.lunch + stack.dinner + stack.snack;
      return { dateKey: dKey, stack, protein, total };
    });

    const maxCal = Math.max(goalCal * 1.1, ...dayData.map((d) => d.total), 100);
    const maxPro = Math.max(goalPro * 1.1, ...dayData.map((d) => d.protein), 50);

    const padT = 14;
    const padR = 36;
    const padB = 28;
    const padL = 38;
    const plotH = 160;
    const barGap = 2;
    const slotW = 14;
    const plotW = days.length * slotW;
    const width = padL + plotW + padR;
    const height = padT + plotH + padB;
    const yCal = (v) => padT + plotH - (v / maxCal) * plotH;
    const yPro = (v) => padT + plotH - (v / maxPro) * plotH;
    const xAt = (i) => padL + i * slotW + slotW / 2;

    const goalLineY = yCal(goalCal);
    const grids = `
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" class="chart-axis"></line>
      <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" class="chart-axis"></line>
      <line x1="${padL}" y1="${goalLineY}" x2="${padL + plotW}" y2="${goalLineY}" class="ex-chart-goalline"></line>
      <text x="${padL - 6}" y="${goalLineY + 3}" class="chart-y-label" text-anchor="end">${formatNumber(goalCal)}</text>
    `;

    const bars = dayData
      .map((d, i) => {
        const x = padL + i * slotW + barGap;
        const w = slotW - barGap * 2;
        let y = padT + plotH;
        const segments = [];
        MEAL_TYPES.forEach((mt) => {
          const v = d.stack[mt];
          if (v <= 0) return;
          const segH = (v / maxCal) * plotH;
          y -= segH;
          segments.push(
            `<rect x="${x}" y="${y}" width="${w}" height="${segH}" fill="${MEAL_COLORS[mt]}" class="ex-bar-seg"><title>${d.dateKey} · ${MEAL_LABELS[mt]}: ${formatNumber(v)} kcal</title></rect>`,
          );
        });
        return segments.join("");
      })
      .join("");

    // Protein line (right Y axis).
    const proteinPoints = dayData.map((d, i) => `${xAt(i)},${yPro(d.protein)}`).join(" ");
    const proteinLine = `<polyline points="${proteinPoints}" class="ex-chart-line ex-chart-line-protein" fill="none"></polyline>`;
    const proteinDots = dayData
      .map(
        (d, i) =>
          `<circle cx="${xAt(i)}" cy="${yPro(d.protein)}" r="2" class="ex-chart-dot ex-chart-dot-protein"><title>${d.dateKey}: ${formatNumber(d.protein)} g protein</title></circle>`,
      )
      .join("");

    // X labels (every 5th day for readability)
    const xLabels = dayData
      .map((d, i) => {
        if (i % 5 !== 0 && i !== days.length - 1) return "";
        const short = d.dateKey.slice(5);
        return `<text x="${xAt(i)}" y="${padT + plotH + 14}" class="chart-x-label" text-anchor="middle">${short}</text>`;
      })
      .join("");

    refs.exCaloriesChart.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="ex-chart-svg" role="img" aria-label="30-day calorie and protein chart">
        ${grids}
        ${bars}
        ${proteinLine}
        ${proteinDots}
        ${xLabels}
      </svg>
    `;
  }

  // ---------------------------------------------------------------------------
  // Workouts section
  // ---------------------------------------------------------------------------
  function renderExWorkoutsSection() {
    syncMuscleGroupButtons();
    setDateInputDefault(refs.exWorkoutDateInput);
    populateExerciseSelect(refs.exWorkoutExerciseSelect);
    populateExerciseSelect(refs.exWorkoutEditExercise);
    renderExCustomExerciseList();
    renderExE1rmPreview();
    renderExWorkoutStats();
    renderExWorkoutCalendar();
    renderExMuscleFrequency();
    renderExDaysSinceTrained();
    renderExProgressionChart();
    updateAddWorkoutButtonLabel();
  }

  // Switches the primary action label to "+ Add another PR" once at least one
  // lift has been logged for the form's selected date — makes it obvious you
  // can stack multiple PRs on the same session.
  function updateAddWorkoutButtonLabel() {
    if (!refs.exAddWorkoutBtn || !refs.exWorkoutDateInput) return;
    const dKey = refs.exWorkoutDateInput.value || todayKey();
    const count = isValidDateKey(dKey) ? (state.exercise.workouts[dKey] || []).length : 0;
    refs.exAddWorkoutBtn.textContent = count > 0 ? "＋ Add another PR" : "＋ Log workout";
  }

  function syncMuscleGroupButtons() {
    refs.exMuscleGroupButtons.forEach((btn) => {
      const g = btn.dataset.muscleGroup;
      btn.classList.toggle("active", exUi.selectedMuscleGroups.has(g));
      btn.style.setProperty("--type-color", MUSCLE_GROUP_COLORS[g]);
      btn.setAttribute("aria-pressed", exUi.selectedMuscleGroups.has(g) ? "true" : "false");
    });
  }

  function renderExCustomExerciseList() {
    if (!refs.exCustomExerciseList) return;
    const custom = state.exercise.exercises.filter((e) => !e.builtin);
    if (custom.length === 0) {
      refs.exCustomExerciseList.innerHTML = "";
      return;
    }
    refs.exCustomExerciseList.innerHTML = `
      <p class="ex-custom-list-head">Your custom exercises</p>
      ${custom
        .map((e) => {
          const used = countWorkoutsForExercise(e.id);
          const usedNote = used
            ? `<span class="ex-custom-used muted">${used} workout${used === 1 ? "" : "s"}</span>`
            : `<span class="ex-custom-used muted">unused</span>`;
          return `<div class="ex-custom-row">
            <span class="ex-custom-name">${escapeHtml(e.name)}</span>
            ${usedNote}
            <button type="button" class="ex-custom-del" data-delete-exercise="${escapeHtmlAttr(e.id)}" aria-label="Delete ${escapeHtmlAttr(e.name)}">✕</button>
          </div>`;
        })
        .join("")}
    `;
  }

  function populateExerciseSelect(select) {
    if (!select) return;
    const previous = select.value;
    const ex = state.exercise;
    select.innerHTML = ex.exercises
      .map((e) => `<option value="${escapeHtmlAttr(e.id)}">${escapeHtml(e.name)}</option>`)
      .join("");
    if (previous && ex.exercises.some((e) => e.id === previous)) {
      select.value = previous;
    } else if (ex.exercises.length) {
      select.value = ex.exercises[0].id;
    }
  }

  function renderExE1rmPreview() {
    if (!refs.exWorkoutE1rmPreview) return;
    const w = parseLocaleNumber(refs.exWorkoutWeightInput?.value);
    const r = Math.floor(parseLocaleNumber(refs.exWorkoutRepsInput?.value));
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r < 1) {
      refs.exWorkoutE1rmPreview.textContent = "Estimated 1RM appears here as you type.";
      refs.exWorkoutE1rmPreview.classList.add("muted");
      return;
    }
    const e1 = roundTo(calcE1rm(w, r), 1);
    const note = r > MAX_REPS_FOR_E1RM ? " (less accurate above 12 reps)" : "";
    refs.exWorkoutE1rmPreview.textContent = `Estimated 1RM: ${formatNumber(e1)} kg (Epley: ${formatNumber(w)} × ${r})${note}`;
    refs.exWorkoutE1rmPreview.classList.remove("muted");
  }

  function renderExWorkoutStats() {
    const ex = state.exercise;
    // Rolling windows so "Last 30d" is always >= "Last 7d", regardless of where
    // we are in the calendar month (avoids the "5 this week / 3 this month"
    // confusion that calendar-month windows produce early in the month).
    const week7 = countWorkoutsInLastNDays(ex, 7);
    const month30 = countWorkoutsInLastNDays(ex, 30);
    if (refs.exStatWeekCount) refs.exStatWeekCount.textContent = String(week7);
    if (refs.exStatMonthCount) refs.exStatMonthCount.textContent = String(month30);
    if (refs.exStatExerciseCount) refs.exStatExerciseCount.textContent = String(ex.exercises.length);
    setUnitText(refs.exStatWeekCount, week7 === 1 ? "workout" : "workouts");
    setUnitText(refs.exStatMonthCount, month30 === 1 ? "workout" : "workouts");
  }

  function countWorkoutsInLastNDays(ex, n) {
    let count = 0;
    for (let i = 0; i < n; i += 1) {
      const dKey = dateKeyDaysAgo(i);
      count += (ex.workouts[dKey] || []).length;
    }
    return count;
  }

  function setUnitText(valueEl, text) {
    if (!valueEl) return;
    const parent = valueEl.parentElement;
    if (!parent) return;
    const unit = parent.querySelector(".ex-stat-unit");
    if (unit) unit.textContent = text;
  }

  function renderExWorkoutCalendar() {
    if (!refs.exWorkoutCalendar) return;
    const ex = state.exercise;
    // Reverse-chronological so today sits top-left and 30-days-ago is at the
    // bottom — keeps the most relevant info above the fold.
    const days = lastNDateKeys(30).slice().reverse();
    const todayK = todayKey();
    const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const cells = days
      .map((dKey, idx) => {
        // In reverse-chrono order we get a new month every time the previous
        // cell's month differs from this one — anchors the calendar to a real
        // calendar boundary regardless of which day-of-month falls there.
        const dayNum = dKey.slice(8);
        const monthIdx = Number(dKey.slice(5, 7)) - 1;
        const prevMonthIdx = idx > 0 ? Number(days[idx - 1].slice(5, 7)) - 1 : -1;
        const showMonthPill = idx === 0 || monthIdx !== prevMonthIdx;
        const monthPill = showMonthPill
          ? `<span class="ex-day-month-pill">${monthShort[monthIdx]}</span>`
          : "";
        const list = ex.workouts[dKey] || [];
        const todayClass = dKey === todayK ? " is-today" : "";
        if (list.length === 0) {
          return `<div class="ex-day-cell empty${todayClass}">${monthPill}<span class="ex-day-num">${dayNum}</span></div>`;
        }
        const best = list.reduce((a, b) => (b.e1rm > a.e1rm ? b : a), list[0]);
        const exercise = ex.exercises.find((e) => e.id === best.exerciseId);
        const exName = exercise ? exercise.name : "";
        // Color the cell with the first selected muscle group's color (falls
        // back to neutral if the workout has none, e.g. legacy "other").
        const groups = best.muscleGroups || [];
        const color = groups.length ? MUSCLE_GROUP_COLORS[groups[0]] : "#5b6173";
        const groupsLabel = groups.length
          ? groups.map((g) => MUSCLE_GROUP_LABELS[g]).join(" · ")
          : "—";
        // If there are multiple lifts on this day, route to a list modal that
        // shows them all. Single-lift days keep going straight to the edit form.
        const extra = list.length - 1;
        const moreBadge = extra > 0
          ? `<span class="ex-day-more-badge" title="${extra} more lift${extra === 1 ? "" : "s"} this day">+${extra}</span>`
          : "";
        const clickAttr = list.length > 1
          ? `data-open-day-workouts="${escapeHtmlAttr(dKey)}"`
          : `data-edit-workout="${escapeHtmlAttr(dKey)}|${escapeHtmlAttr(best.id)}"`;
        return `
          <button class="ex-day-cell filled${todayClass}" type="button" ${clickAttr} style="--type-color:${color}">
            ${monthPill}
            ${moreBadge}
            <span class="ex-day-num">${dayNum}</span>
            <span class="ex-day-type" title="${escapeHtmlAttr(groupsLabel)}">${escapeHtml(groupsLabel)}</span>
            <span class="ex-day-pr">${formatNumber(best.weight)}×${best.reps}</span>
            <span class="ex-day-e1rm">${formatNumber(roundTo(best.e1rm, 0))}kg e1RM</span>
            <span class="ex-day-exname">${escapeHtml(truncate(exName, 14))}</span>
          </button>
        `;
      })
      .join("");
    refs.exWorkoutCalendar.innerHTML = cells;
  }

  function renderExMuscleFrequency() {
    if (!refs.exMuscleFrequencyList) return;
    const ex = state.exercise;

    // Adaptive window: 7-day floor (so brand-new users see meaningful numbers
    // from day 1), 28-day cap (so ancient history doesn't dilute the rate
    // forever), and in between we grow with the user's actual logging history.
    const FLOOR = 7;
    const CAP = 28;
    const firstKey = findFirstWorkoutDateKey(ex);
    const today = todayKey();
    const daysSinceFirst = firstKey ? daysBetween(firstKey, today) + 1 : 0;
    const effectiveDays = Math.max(FLOOR, Math.min(CAP, daysSinceFirst || FLOOR));
    const weeks = effectiveDays / 7;

    const days = lastNDateKeys(effectiveDays);

    const counts = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0]));
    let totalWorkouts = 0;
    days.forEach((dKey) => {
      const list = ex.workouts[dKey] || [];
      totalWorkouts += list.length;
      list.forEach((w) => {
        (w.muscleGroups || []).forEach((g) => {
          if (counts[g] !== undefined) counts[g] += 1;
        });
      });
    });

    // Subtitle reflects the actual window so the user knows what the rate is
    // based on (e.g. "Last 5 days · sessions / week" while they're new).
    if (refs.exMuscleFrequencyMeta) {
      refs.exMuscleFrequencyMeta.textContent =
        effectiveDays === 28
          ? "Last 4 weeks · sessions / week"
          : `Last ${effectiveDays} days · sessions / week`;
    }

    if (totalWorkouts === 0) {
      refs.exMuscleFrequencyList.innerHTML =
        '<p class="ex-empty">Log a workout to see how often each muscle group gets trained.</p>';
      return;
    }

    // Sort by count desc so neglected groups land at the bottom — easy to spot.
    const rows = MUSCLE_GROUPS
      .map((g) => ({ group: g, count: counts[g], perWeek: counts[g] / weeks }))
      .sort((a, b) => b.count - a.count);

    const maxCount = Math.max(1, ...rows.map((r) => r.count));

    refs.exMuscleFrequencyList.innerHTML = rows
      .map((r) => {
        const color = MUSCLE_GROUP_COLORS[r.group];
        const pct = (r.count / maxCount) * 100;
        const valueClass = r.count === 0 ? "ex-muscle-freq-val zero" : "ex-muscle-freq-val";
        return `
          <div class="ex-muscle-freq-row" style="--row-color:${color}">
            <span class="ex-muscle-freq-name">${MUSCLE_GROUP_LABELS[r.group]}</span>
            <div class="ex-muscle-freq-bar"><div class="ex-muscle-freq-fill" style="width:${pct}%;background:${color}"></div></div>
            <span class="${valueClass}"><strong>${r.perWeek.toFixed(1)}</strong> <span class="muted">/ wk</span></span>
          </div>
        `;
      })
      .join("");
  }

  function renderExDaysSinceTrained() {
    if (!refs.exDaysSinceList) return;
    const ex = state.exercise;
    const today = todayKey();

    // Find most-recent date per group.
    const lastTrained = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, null]));
    Object.keys(ex.workouts).forEach((dKey) => {
      const list = ex.workouts[dKey] || [];
      list.forEach((w) => {
        (w.muscleGroups || []).forEach((g) => {
          if (!lastTrained.hasOwnProperty(g)) return;
          if (!lastTrained[g] || dKey > lastTrained[g]) lastTrained[g] = dKey;
        });
      });
    });

    const rows = MUSCLE_GROUPS.map((g) => {
      const last = lastTrained[g];
      const days = last ? daysBetween(last, today) : Infinity;
      return { group: g, last, days };
    }).sort((a, b) => b.days - a.days);

    refs.exDaysSinceList.innerHTML = rows
      .map((r) => {
        const color = MUSCLE_GROUP_COLORS[r.group];
        let valueText;
        let valueClass = "ex-muscle-freq-val";
        if (r.last == null) {
          valueText = "Never";
          valueClass += " never";
        } else if (r.days === 0) {
          valueText = "Today";
        } else if (r.days === 1) {
          valueText = "Yesterday";
        } else {
          valueText = `${r.days} days ago`;
        }
        // Bar visualizes "how stale is it" — full bar = never trained, empty
        // bar = trained today.
        const maxDays = Math.max(1, ...rows.filter((x) => x.days !== Infinity).map((x) => x.days), 7);
        const pct = r.last == null ? 100 : Math.min(100, (r.days / maxDays) * 100);
        return `
          <div class="ex-muscle-freq-row" style="--row-color:${color}">
            <span class="ex-muscle-freq-name">${MUSCLE_GROUP_LABELS[r.group]}</span>
            <div class="ex-muscle-freq-bar"><div class="ex-muscle-freq-fill" style="width:${pct}%;background:${color}"></div></div>
            <span class="${valueClass}">${valueText}</span>
          </div>
        `;
      })
      .join("");
  }

  function findFirstWorkoutDateKey(ex) {
    const keys = Object.keys(ex.workouts).filter(
      (k) => Array.isArray(ex.workouts[k]) && ex.workouts[k].length > 0,
    );
    if (keys.length === 0) return null;
    keys.sort();
    return keys[0];
  }

  function renderExProgressionChart() {
    if (!refs.exProgressionChart) return;
    const ex = state.exercise;

    // Group all workouts by exercise → ordered points.
    const byExercise = {};
    Object.keys(ex.workouts).forEach((dKey) => {
      (ex.workouts[dKey] || []).forEach((w) => {
        if (!byExercise[w.exerciseId]) byExercise[w.exerciseId] = [];
        byExercise[w.exerciseId].push({
          dateKey: dKey,
          e1rm: w.e1rm,
          weight: w.weight,
          reps: w.reps,
        });
      });
    });
    const exercisesWithData = ex.exercises.filter(
      (e) => byExercise[e.id] && byExercise[e.id].length > 0,
    );

    if (exercisesWithData.length === 0) {
      refs.exProgressionChart.innerHTML =
        '<p class="ex-empty">No workouts logged yet. Log one to start tracking strength.</p>';
      if (refs.exProgressionLegend) refs.exProgressionLegend.innerHTML = "";
      return;
    }

    exercisesWithData.forEach((e) => {
      byExercise[e.id].sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
    });

    // Date span from earliest to latest workout (across ALL exercises).
    const allDates = new Set();
    Object.values(byExercise).forEach((pts) => pts.forEach((p) => allDates.add(p.dateKey)));
    const sortedDates = Array.from(allDates).sort();
    const minDate = sortedDates[0];
    const maxDate = sortedDates[sortedDates.length - 1];
    const totalDays = Math.max(1, daysBetween(minDate, maxDate));

    // Y range across all exercises so lines share a common scale.
    const allValues = [];
    Object.values(byExercise).forEach((pts) => pts.forEach((p) => allValues.push(p.e1rm)));
    const minV = Math.min(...allValues);
    const maxV = Math.max(...allValues);
    const span = Math.max(2, maxV - minV);
    const yMin = Math.floor((minV - span * 0.15) / 5) * 5;
    const yMax = Math.ceil((maxV + span * 0.15) / 5) * 5;

    const padT = 16;
    const padR = 14;
    const padB = 28;
    const padL = 44;
    const plotH = 200;
    const plotW = 520;
    const width = padL + plotW + padR;
    const height = padT + plotH + padB;
    const yAt = (v) => padT + plotH - ((v - yMin) / Math.max(1, yMax - yMin)) * plotH;
    const xAt = (dKey) =>
      totalDays === 0
        ? padL + plotW / 2
        : padL + (daysBetween(minDate, dKey) / totalDays) * plotW;

    const ticks = [];
    for (let t = 0; t <= 4; t += 1) ticks.push(yMin + ((yMax - yMin) * t) / 4);
    const grid = ticks
      .map((v) => {
        const y = yAt(v);
        return `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" class="chart-grid"></line>
                <text x="${padL - 6}" y="${y + 3}" class="chart-y-label" text-anchor="end">${formatNumber(roundTo(v, 0))}</text>`;
      })
      .join("");

    const colorFor = (exId) => {
      const idx = ex.exercises.findIndex((e) => e.id === exId);
      return HABIT_COLOR_PALETTE[idx % HABIT_COLOR_PALETTE.length];
    };

    // One line + dots per exercise.
    const lines = exercisesWithData
      .map((e) => {
        const pts = byExercise[e.id];
        const color = colorFor(e.id);
        const linePoints = pts.map((p) => `${xAt(p.dateKey)},${yAt(p.e1rm)}`).join(" ");
        const linePart =
          pts.length > 1
            ? `<polyline points="${linePoints}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />`
            : "";
        const dots = pts
          .map(
            (p) =>
              `<circle cx="${xAt(p.dateKey)}" cy="${yAt(p.e1rm)}" r="3.4" fill="${color}" stroke="#fff" stroke-width="1.4"><title>${escapeHtml(e.name)} · ${p.dateKey} · ${formatNumber(p.weight)}×${p.reps} → ${formatNumber(roundTo(p.e1rm, 1))} kg e1RM</title></circle>`,
          )
          .join("");
        return linePart + dots;
      })
      .join("");

    // X labels: first date, last date, and a midpoint or two if range is wide.
    const xLabelDates = new Set([minDate, maxDate]);
    if (totalDays > 14) {
      const mid = addDaysToKey(minDate, Math.floor(totalDays / 2));
      xLabelDates.add(mid);
    }
    const xLabels = Array.from(xLabelDates)
      .map(
        (d) =>
          `<text x="${xAt(d)}" y="${padT + plotH + 16}" class="chart-x-label" text-anchor="middle">${d.slice(5)}</text>`,
      )
      .join("");

    refs.exProgressionChart.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" class="ex-chart-svg" role="img" aria-label="Strength progression for all exercises">
        ${grid}
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" class="chart-axis"></line>
        <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" class="chart-axis"></line>
        ${lines}
        ${xLabels}
      </svg>
    `;

    if (refs.exProgressionLegend) {
      refs.exProgressionLegend.innerHTML = exercisesWithData
        .map(
          (e) =>
            `<span class="ex-legend-item"><span class="ex-legend-swatch" style="background:${colorFor(e.id)}"></span>${escapeHtml(e.name)}</span>`,
        )
        .join("");
    }
  }

  function daysBetween(aKey, bKey) {
    const ay = Number(aKey.slice(0, 4));
    const am = Number(aKey.slice(5, 7)) - 1;
    const ad = Number(aKey.slice(8, 10));
    const by = Number(bKey.slice(0, 4));
    const bm = Number(bKey.slice(5, 7)) - 1;
    const bd = Number(bKey.slice(8, 10));
    const a = Date.UTC(ay, am, ad);
    const b = Date.UTC(by, bm, bd);
    return Math.round((b - a) / (24 * 3600 * 1000));
  }

  function addDaysToKey(dKey, n) {
    const y = Number(dKey.slice(0, 4));
    const m = Number(dKey.slice(5, 7)) - 1;
    const d = Number(dKey.slice(8, 10));
    const dt = new Date(Date.UTC(y, m, d + n));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }

  // ---------------------------------------------------------------------------
  // Weight section
  // ---------------------------------------------------------------------------
  function renderExWeightSection() {
    setDateInputDefault(refs.exWeightDateInput);
    refs.exWeightRangeButtons?.forEach((btn) => {
      const isActive = String(btn.dataset.weightRange) === String(exUi.weightRangeDays);
      btn.classList.toggle("active", isActive);
    });
    renderExWeightChart();
    renderExWeightHistory();
  }

  function renderExWeightChart() {
    if (!refs.exWeightChart) return;
    const ex = state.exercise;
    const all = Object.entries(ex.weights)
      .map(([dKey, v]) => ({ dateKey: dKey, kg: v.kg }))
      .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));

    let points = all;
    if (exUi.weightRangeDays !== "all") {
      const cutoff = dateKeyDaysAgo(Number(exUi.weightRangeDays) - 1);
      points = all.filter((p) => p.dateKey >= cutoff);
    }

    if (points.length === 0) {
      refs.exWeightChart.innerHTML =
        '<p class="ex-empty">No weight logged in this range yet.</p>';
      return;
    }

    const padT = 16;
    const padR = 16;
    const padB = 28;
    const padL = 48;
    const plotH = 180;
    const minPlotW = 300;
    const stepW = Math.max(20, Math.min(60, 600 / Math.max(1, points.length - 1)));
    const plotW = Math.max(minPlotW, (points.length - 1) * stepW || minPlotW);
    const width = padL + plotW + padR;
    const height = padT + plotH + padB;

    const values = points.map((p) => p.kg);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const span = Math.max(1, maxV - minV);
    const yMin = Math.floor((minV - span * 0.2) * 2) / 2;
    const yMax = Math.ceil((maxV + span * 0.2) * 2) / 2;
    const yAt = (v) => padT + plotH - ((v - yMin) / Math.max(0.5, yMax - yMin)) * plotH;
    const xAt = (i) => (points.length === 1 ? padL + plotW / 2 : padL + (i / (points.length - 1)) * plotW);

    const ticks = [];
    for (let t = 0; t <= 4; t += 1) {
      const v = yMin + ((yMax - yMin) * t) / 4;
      ticks.push(v);
    }
    const grid = ticks
      .map((v) => {
        const y = yAt(v);
        return `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" class="chart-grid"></line>
                <text x="${padL - 6}" y="${y + 3}" class="chart-y-label" text-anchor="end">${formatNumber(roundTo(v, 1))}</text>`;
      })
      .join("");

    const linePoints = points.map((p, i) => `${xAt(i)},${yAt(p.kg)}`).join(" ");
    const dots = points
      .map(
        (p, i) =>
          `<circle cx="${xAt(i)}" cy="${yAt(p.kg)}" r="3" class="ex-chart-dot ex-chart-dot-weight"><title>${p.dateKey}: ${formatNumber(p.kg)} kg</title></circle>`,
      )
      .join("");

    const labelIndexes = new Set([0, points.length - 1]);
    if (points.length > 4) {
      labelIndexes.add(Math.floor(points.length / 3));
      labelIndexes.add(Math.floor((points.length * 2) / 3));
    }
    const xLabels = points
      .map((p, i) => {
        if (!labelIndexes.has(i)) return "";
        return `<text x="${xAt(i)}" y="${padT + plotH + 16}" class="chart-x-label" text-anchor="middle">${p.dateKey.slice(5)}</text>`;
      })
      .join("");

    refs.exWeightChart.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" class="ex-chart-svg" role="img" aria-label="Body weight trend">
        ${grid}
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" class="chart-axis"></line>
        <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" class="chart-axis"></line>
        <polyline points="${linePoints}" class="ex-chart-line ex-chart-line-weight" fill="none"></polyline>
        ${dots}
        ${xLabels}
      </svg>
    `;
  }

  function renderExWeightHistory() {
    if (!refs.exWeightHistory) return;
    const ex = state.exercise;
    const all = Object.entries(ex.weights)
      .map(([dKey, v]) => ({ dateKey: dKey, kg: v.kg }))
      .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1)) // newest first
      .slice(0, 12);
    if (all.length === 0) {
      refs.exWeightHistory.innerHTML = "";
      return;
    }
    refs.exWeightHistory.innerHTML = all
      .map(
        (p) =>
          `<div class="ex-weight-row">
            <span class="ex-weight-date">${p.dateKey}</span>
            <span class="ex-weight-kg">${formatNumber(p.kg)} <span class="muted">kg</span></span>
            <button class="ex-weight-del" type="button" data-delete-weight="${escapeHtmlAttr(p.dateKey)}" aria-label="Delete">✕</button>
          </div>`,
      )
      .join("");
  }

  // ===========================================================================
  // Event binding
  // ===========================================================================
  function bindExerciseEvents() {
    // Top tab switcher
    refs.topTabButtons.forEach((btn) => {
      btn.addEventListener("click", () => setTopTab(btn.dataset.topTab));
    });

    // Goals modal
    refs.exEditGoalsBtn?.addEventListener("click", () => openExGoalsModal());
    refs.exSaveGoalsBtn?.addEventListener("click", () => {
      exSetGoals(refs.exGoalCaloriesInput.value, refs.exGoalProteinInput.value);
      refs.exGoalsModal.close();
      renderExSnapshot();
      renderExCaloriesChart();
      showToast("Goals updated.");
    });
    refs.exCloseGoalsBtn?.addEventListener("click", () => refs.exGoalsModal.close());

    // -- CALORIES --
    refs.exMealTagButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        exUi.selectedMealType = btn.dataset.mealType;
        syncMealTagButtons();
      });
    });
    refs.exMealDateInput?.addEventListener("change", () => renderExMealsList());
    refs.exAddMealBtn?.addEventListener("click", () => handleAddMeal());
    [refs.exMealCaloriesInput, refs.exMealProteinInput, refs.exMealNoteInput].forEach((input) => {
      input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleAddMeal();
        }
      });
    });
    refs.exMealsList?.addEventListener("click", (e) => {
      const row = e.target.closest("[data-edit-meal]");
      if (!row) return;
      const [dKey, mealId] = row.dataset.editMeal.split("|");
      openExMealEditModal(dKey, mealId);
    });
    refs.exSaveMealEditBtn?.addEventListener("click", () => handleSaveMealEdit());
    refs.exDeleteMealBtn?.addEventListener("click", () => handleDeleteMeal());
    refs.exCloseMealEditBtn?.addEventListener("click", () => refs.exMealEditModal.close());
    refs.exMealEditTypeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        refs.exMealEditTypeButtons.forEach((b) => b.classList.toggle("active", b === btn));
      });
    });

    // -- WORKOUTS --
    refs.exMuscleGroupButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = btn.dataset.muscleGroup;
        if (exUi.selectedMuscleGroups.has(g)) exUi.selectedMuscleGroups.delete(g);
        else exUi.selectedMuscleGroups.add(g);
        syncMuscleGroupButtons();
      });
    });
    refs.exWorkoutWeightInput?.addEventListener("input", renderExE1rmPreview);
    refs.exWorkoutRepsInput?.addEventListener("input", renderExE1rmPreview);
    refs.exWorkoutDateInput?.addEventListener("change", updateAddWorkoutButtonLabel);
    refs.exAddWorkoutBtn?.addEventListener("click", () => handleAddWorkout());
    refs.exSaveNewExerciseBtn?.addEventListener("click", () => handleSaveNewExercise());
    refs.exNewExerciseName?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSaveNewExercise();
      }
    });
    refs.exCustomExerciseList?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-delete-exercise]");
      if (!btn) return;
      handleDeleteCustomExercise(btn.dataset.deleteExercise);
    });
    refs.exWorkoutCalendar?.addEventListener("click", (e) => {
      const dayCell = e.target.closest("[data-open-day-workouts]");
      if (dayCell) {
        openExDayWorkoutsModal(dayCell.dataset.openDayWorkouts);
        return;
      }
      const editCell = e.target.closest("[data-edit-workout]");
      if (editCell) {
        const [dKey, wId] = editCell.dataset.editWorkout.split("|");
        openExWorkoutEditModal(dKey, wId);
      }
    });
    refs.exCloseDayWorkoutsBtn?.addEventListener("click", () => refs.exDayWorkoutsModal.close());
    refs.exAddAnotherLiftBtn?.addEventListener("click", () => handleAddAnotherLift());
    refs.exDayWorkoutsList?.addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-edit-day-workout]");
      if (editBtn) {
        const [dKey, wId] = editBtn.dataset.editDayWorkout.split("|");
        refs.exDayWorkoutsModal.close();
        openExWorkoutEditModal(dKey, wId);
      }
    });

    refs.exSaveWorkoutEditBtn?.addEventListener("click", () => handleSaveWorkoutEdit());
    refs.exDeleteWorkoutBtn?.addEventListener("click", () => handleDeleteWorkout());
    refs.exCloseWorkoutEditBtn?.addEventListener("click", () => refs.exWorkoutEditModal.close());
    refs.exWorkoutEditGroupButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("active");
        btn.setAttribute(
          "aria-pressed",
          btn.classList.contains("active") ? "true" : "false",
        );
      });
    });
    [refs.exWorkoutEditWeight, refs.exWorkoutEditReps].forEach((input) => {
      input?.addEventListener("input", () => {
        const w = parseLocaleNumber(refs.exWorkoutEditWeight.value);
        const r = Math.floor(parseLocaleNumber(refs.exWorkoutEditReps.value));
        if (refs.exWorkoutEditE1rm) {
          if (Number.isFinite(w) && w > 0 && Number.isFinite(r) && r >= 1) {
            refs.exWorkoutEditE1rm.textContent = `Estimated 1RM: ${formatNumber(roundTo(calcE1rm(w, r), 1))} kg`;
          } else {
            refs.exWorkoutEditE1rm.textContent = "";
          }
        }
      });
    });

    // -- WEIGHT --
    refs.exAddWeightBtn?.addEventListener("click", () => handleAddWeight());
    refs.exWeightInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddWeight();
      }
    });
    refs.exWeightRangeButtons?.forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.weightRange;
        exUi.weightRangeDays = v === "all" ? "all" : Number(v);
        renderExWeightSection();
      });
    });
    refs.exWeightHistory?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-delete-weight]");
      if (!btn) return;
      const dKey = btn.dataset.deleteWeight;
      if (!dKey) return;
      if (window.confirm(`Delete weight log for ${dKey}?`)) {
        exDeleteWeight(dKey);
        renderExSnapshot();
        renderExWeightSection();
        showToast("Weight log deleted.");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  function handleAddMeal() {
    const calories = parseLocaleNumber(refs.exMealCaloriesInput.value);
    const protein = parseLocaleNumber(refs.exMealProteinInput.value);
    if ((!Number.isFinite(calories) || calories <= 0) && (!Number.isFinite(protein) || protein <= 0)) {
      showToast("Add at least calories or protein.");
      return;
    }
    const result = exAddMeal({
      mealType: exUi.selectedMealType,
      calories,
      protein,
      note: refs.exMealNoteInput.value,
      dateKey: refs.exMealDateInput.value,
    });
    if (!result) {
      showToast("Couldn't add meal.");
      return;
    }
    refs.exMealCaloriesInput.value = "";
    refs.exMealProteinInput.value = "";
    refs.exMealNoteInput.value = "";
    renderExSnapshot();
    renderExMealsList();
    renderExCaloriesChart();
    const day = result.dateKey === todayKey() ? "today" : result.dateKey;
    showToast(`Added ${MEAL_LABELS[result.meal.mealType]} (${day}).`);
  }

  function openExMealEditModal(dateKey, mealId) {
    const list = state.exercise.meals[dateKey] || [];
    const meal = list.find((m) => m.id === mealId);
    if (!meal) return;
    exUi.editingMealKey = `${dateKey}|${mealId}`;
    const time = formatTimeOfDay(meal.createdAt);
    refs.exMealEditMeta.textContent = time
      ? `Logged ${dateKey} at ${time}`
      : `Logged ${dateKey}`;
    refs.exMealEditCalories.value = meal.calories;
    refs.exMealEditProtein.value = meal.protein;
    refs.exMealEditDate.value = dateKey;
    refs.exMealEditNote.value = meal.note;
    refs.exMealEditTypeButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.editMealType === meal.mealType);
    });
    refs.exMealEditModal.showModal();
  }

  function handleSaveMealEdit() {
    if (!exUi.editingMealKey) return;
    const [dateKey, mealId] = exUi.editingMealKey.split("|");
    const activeType = refs.exMealEditTypeButtons.find((b) => b.classList.contains("active"));
    exUpdateMeal(dateKey, mealId, {
      mealType: activeType?.dataset.editMealType,
      calories: parseLocaleNumber(refs.exMealEditCalories.value),
      protein: parseLocaleNumber(refs.exMealEditProtein.value),
      note: refs.exMealEditNote.value,
      dateKey: refs.exMealEditDate.value,
    });
    refs.exMealEditModal.close();
    exUi.editingMealKey = "";
    renderExSnapshot();
    renderExMealsList();
    renderExCaloriesChart();
    showToast("Meal updated.");
  }

  function handleDeleteMeal() {
    if (!exUi.editingMealKey) return;
    const [dateKey, mealId] = exUi.editingMealKey.split("|");
    if (!window.confirm("Delete this meal?")) return;
    exDeleteMeal(dateKey, mealId);
    refs.exMealEditModal.close();
    exUi.editingMealKey = "";
    renderExSnapshot();
    renderExMealsList();
    renderExCaloriesChart();
    showToast("Meal deleted.");
  }

  function handleSaveNewExercise() {
    const name = refs.exNewExerciseName.value;
    const created = exAddExercise(name);
    if (!created) {
      showToast("Enter a name for the exercise.");
      return;
    }
    refs.exNewExerciseName.value = "";
    populateExerciseSelect(refs.exWorkoutExerciseSelect);
    populateExerciseSelect(refs.exWorkoutEditExercise);
    refs.exWorkoutExerciseSelect.value = created.id;
    renderExCustomExerciseList();
    if (refs.exStatExerciseCount) {
      refs.exStatExerciseCount.textContent = String(state.exercise.exercises.length);
    }
    showToast(`Exercise "${created.name}" saved.`);
  }

  function handleDeleteCustomExercise(exerciseId) {
    const ex = state.exercise.exercises.find((e) => e.id === exerciseId);
    if (!ex || ex.builtin) return;
    const used = countWorkoutsForExercise(exerciseId);
    if (used > 0) {
      window.alert(
        `Can't delete "${ex.name}" — ${used} workout${used === 1 ? "" : "s"} use${used === 1 ? "s" : ""} it. Edit those workouts to use a different exercise first.`,
      );
      return;
    }
    if (!window.confirm(`Delete the exercise "${ex.name}"?`)) return;
    exDeleteExercise(exerciseId);
    populateExerciseSelect(refs.exWorkoutExerciseSelect);
    populateExerciseSelect(refs.exWorkoutEditExercise);
    renderExCustomExerciseList();
    if (refs.exStatExerciseCount) {
      refs.exStatExerciseCount.textContent = String(state.exercise.exercises.length);
    }
    renderExProgressionChart();
    showToast(`Exercise "${ex.name}" deleted.`);
  }

  function handleAddWorkout() {
    const weight = parseLocaleNumber(refs.exWorkoutWeightInput.value);
    const reps = Math.floor(parseLocaleNumber(refs.exWorkoutRepsInput.value));
    if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(reps) || reps < 1) {
      showToast("Enter a valid weight and reps.");
      return;
    }
    const exerciseId = refs.exWorkoutExerciseSelect.value;
    const result = exAddWorkout({
      muscleGroups: Array.from(exUi.selectedMuscleGroups),
      exerciseId,
      weight,
      reps,
      dateKey: refs.exWorkoutDateInput.value,
    });
    if (!result) {
      showToast("Couldn't log workout.");
      return;
    }
    refs.exWorkoutWeightInput.value = "";
    refs.exWorkoutRepsInput.value = "";
    // Reset muscle-group selection after each log so the next one starts fresh.
    exUi.selectedMuscleGroups.clear();
    syncMuscleGroupButtons();
    renderExE1rmPreview();
    renderExSnapshot();
    renderExWorkoutStats();
    renderExWorkoutCalendar();
    renderExMuscleFrequency();
    renderExDaysSinceTrained();
    renderExProgressionChart();
    updateAddWorkoutButtonLabel();
    const day = result.dateKey === todayKey() ? "today" : result.dateKey;
    showToast(`PR logged (${day}) · e1RM ${formatNumber(roundTo(result.workout.e1rm, 1))} kg.`);
  }

  function openExDayWorkoutsModal(dateKey) {
    const list = (state.exercise.workouts[dateKey] || [])
      .slice()
      .sort((a, b) => b.e1rm - a.e1rm);
    if (!refs.exDayWorkoutsModal || !list.length) return;
    refs.exDayWorkoutsTitle.textContent =
      dateKey === todayKey() ? "Today's lifts" : "Lifts on " + dateKey;
    refs.exDayWorkoutsMeta.textContent = `${list.length} lift${list.length === 1 ? "" : "s"} logged`;
    const ex = state.exercise;
    refs.exDayWorkoutsList.innerHTML = list
      .map((w) => {
        const groups = w.muscleGroups || [];
        const color = groups.length ? MUSCLE_GROUP_COLORS[groups[0]] : "#5b6173";
        const groupsLabel = groups.length
          ? groups.map((g) => MUSCLE_GROUP_LABELS[g]).join(" · ")
          : "—";
        const exercise = ex.exercises.find((e) => e.id === w.exerciseId);
        const exName = exercise ? exercise.name : "(unknown exercise)";
        return `
          <button class="ex-day-workout-row" type="button"
                  data-edit-day-workout="${escapeHtmlAttr(dateKey)}|${escapeHtmlAttr(w.id)}"
                  style="--row-color:${color}">
            <span class="ex-day-workout-main">
              <span class="ex-day-workout-exname">${escapeHtml(exName)}</span>
              <span class="ex-day-workout-groups muted">${escapeHtml(groupsLabel)}</span>
            </span>
            <span class="ex-day-workout-stats">
              <span class="ex-day-workout-pr">${formatNumber(w.weight)} × ${w.reps}</span>
              <span class="ex-day-workout-e1rm muted">${formatNumber(roundTo(w.e1rm, 1))} kg e1RM</span>
            </span>
          </button>
        `;
      })
      .join("");
    exUi.dayWorkoutsModalDate = dateKey;
    refs.exDayWorkoutsModal.showModal();
  }

  function handleAddAnotherLift() {
    const dateKey = exUi.dayWorkoutsModalDate;
    refs.exDayWorkoutsModal.close();
    if (dateKey && refs.exWorkoutDateInput) {
      refs.exWorkoutDateInput.value = dateKey;
    }
    // Clear inputs so the user starts fresh.
    if (refs.exWorkoutWeightInput) refs.exWorkoutWeightInput.value = "";
    if (refs.exWorkoutRepsInput) refs.exWorkoutRepsInput.value = "";
    exUi.selectedMuscleGroups.clear();
    syncMuscleGroupButtons();
    renderExE1rmPreview();
    // Scroll the form into view + briefly highlight it so the move is obvious.
    refs.exWorkoutsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(
      dateKey === todayKey()
        ? "Add another lift below."
        : `Adding a lift for ${dateKey} — fill the form below.`,
    );
  }

  function openExWorkoutEditModal(dateKey, workoutId) {
    const list = state.exercise.workouts[dateKey] || [];
    const w = list.find((x) => x.id === workoutId);
    if (!w) return;
    exUi.editingWorkoutKey = `${dateKey}|${workoutId}`;
    refs.exWorkoutEditMeta.textContent = `Logged ${dateKey}`;
    populateExerciseSelect(refs.exWorkoutEditExercise);
    refs.exWorkoutEditExercise.value = w.exerciseId;
    refs.exWorkoutEditWeight.value = w.weight;
    refs.exWorkoutEditReps.value = w.reps;
    refs.exWorkoutEditDate.value = dateKey;
    refs.exWorkoutEditE1rm.textContent = `Estimated 1RM: ${formatNumber(roundTo(w.e1rm, 1))} kg`;
    const activeGroups = new Set(w.muscleGroups || []);
    refs.exWorkoutEditGroupButtons.forEach((btn) => {
      const g = btn.dataset.editMuscleGroup;
      btn.style.setProperty("--type-color", MUSCLE_GROUP_COLORS[g]);
      const isActive = activeGroups.has(g);
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    refs.exWorkoutEditModal.showModal();
  }

  function handleSaveWorkoutEdit() {
    if (!exUi.editingWorkoutKey) return;
    const [dateKey, workoutId] = exUi.editingWorkoutKey.split("|");
    const muscleGroups = refs.exWorkoutEditGroupButtons
      .filter((b) => b.classList.contains("active"))
      .map((b) => b.dataset.editMuscleGroup);
    exUpdateWorkout(dateKey, workoutId, {
      muscleGroups,
      exerciseId: refs.exWorkoutEditExercise.value,
      weight: parseLocaleNumber(refs.exWorkoutEditWeight.value),
      reps: Math.floor(parseLocaleNumber(refs.exWorkoutEditReps.value)),
      dateKey: refs.exWorkoutEditDate.value,
    });
    refs.exWorkoutEditModal.close();
    exUi.editingWorkoutKey = "";
    renderExSnapshot();
    renderExWorkoutStats();
    renderExWorkoutCalendar();
    renderExMuscleFrequency();
    renderExDaysSinceTrained();
    renderExProgressionChart();
    updateAddWorkoutButtonLabel();
    showToast("Workout updated.");
  }

  function handleDeleteWorkout() {
    if (!exUi.editingWorkoutKey) return;
    const [dateKey, workoutId] = exUi.editingWorkoutKey.split("|");
    if (!window.confirm("Delete this workout?")) return;
    exDeleteWorkout(dateKey, workoutId);
    refs.exWorkoutEditModal.close();
    exUi.editingWorkoutKey = "";
    renderExSnapshot();
    renderExWorkoutStats();
    renderExWorkoutCalendar();
    renderExMuscleFrequency();
    renderExDaysSinceTrained();
    renderExProgressionChart();
    updateAddWorkoutButtonLabel();
    showToast("Workout deleted.");
  }

  function handleAddWeight() {
    const kg = parseLocaleNumber(refs.exWeightInput.value);
    if (!Number.isFinite(kg) || kg <= 0) {
      showToast("Enter a valid weight.");
      return;
    }
    const result = exAddWeight({ kg, dateKey: refs.exWeightDateInput.value });
    if (!result) {
      showToast("Couldn't log weight.");
      return;
    }
    refs.exWeightInput.value = "";
    renderExSnapshot();
    renderExWeightSection();
    const day = result.dateKey === todayKey() ? "today" : result.dateKey;
    showToast(`Weight ${formatNumber(result.kg)} kg logged (${day}).`);
  }

  function openExGoalsModal() {
    refs.exGoalCaloriesInput.value = state.exercise.goals.calories;
    refs.exGoalProteinInput.value = state.exercise.goals.protein;
    refs.exGoalsModal.showModal();
  }

  // ---------------------------------------------------------------------------
  // Small formatting helpers
  // ---------------------------------------------------------------------------
  function formatNumber(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "0";
    if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
    return String(roundTo(v, 1)).replace(/\.0$/, "");
  }

  function truncate(str, max) {
    const s = String(str || "");
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  function formatDateShort(date) {
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function formatTimeOfDay(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  // Accept both "22,5" (Norwegian) and "22.5" (English) decimal styles. Some
  // browsers reject comma in <input type="number"> so we normalize before
  // calling Number().
  function parseLocaleNumber(value) {
    if (value == null) return NaN;
    const s = String(value).trim().replace(",", ".");
    if (s === "") return NaN;
    return Number(s);
  }
})();
