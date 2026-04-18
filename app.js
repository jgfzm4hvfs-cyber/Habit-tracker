// ==========================================
// HABIT TRACKER - MAIN APPLICATION
// ==========================================

// ==========================================
// DATA STRUCTURES & CONSTANTS
// ==========================================

const STORAGE_KEY = 'habitTracker';
const XP_PER_COMPLETION = 10;
const XP_PER_LEVEL = 100;

const ACHIEVEMENTS = [
    { id: 'first_habit', name: 'Getting Started', desc: 'Add your first habit', icon: '🌱', xp: 50, check: (data) => data.habits.length >= 1 },
    { id: 'three_habits', name: 'Triple Threat', desc: 'Have 3 active habits', icon: '🎯', xp: 100, check: (data) => data.habits.length >= 3 },
    { id: 'five_habits', name: 'High Achiever', desc: 'Have 5 active habits', icon: '⭐', xp: 150, check: (data) => data.habits.length >= 5 },
    { id: 'first_completion', name: 'First Step', desc: 'Complete a habit', icon: '✅', xp: 25, check: (data) => getTotalCompletions(data) >= 1 },
    { id: 'ten_completions', name: 'Momentum', desc: 'Complete 10 habits total', icon: '🚀', xp: 100, check: (data) => getTotalCompletions(data) >= 10 },
    { id: 'fifty_completions', name: 'Unstoppable', desc: 'Complete 50 habits total', icon: '💪', xp: 200, check: (data) => getTotalCompletions(data) >= 50 },
    { id: 'hundred_completions', name: 'Century Club', desc: 'Complete 100 habits total', icon: '💯', xp: 500, check: (data) => getTotalCompletions(data) >= 100 },
    { id: 'streak_3', name: 'On Fire', desc: 'Reach a 3-day streak', icon: '🔥', xp: 75, check: (data) => data.stats.longestStreak >= 3 },
    { id: 'streak_7', name: 'Week Warrior', desc: 'Reach a 7-day streak', icon: '🏆', xp: 150, check: (data) => data.stats.longestStreak >= 7 },
    { id: 'streak_14', name: 'Two Week Champion', desc: 'Reach a 14-day streak', icon: '👑', xp: 300, check: (data) => data.stats.longestStreak >= 14 },
    { id: 'streak_30', name: 'Monthly Master', desc: 'Reach a 30-day streak', icon: '🎖️', xp: 500, check: (data) => data.stats.longestStreak >= 30 },
    { id: 'perfect_day', name: 'Perfect Day', desc: 'Complete all habits in a day', icon: '🌟', xp: 100, check: (data) => data.stats.perfectDays >= 1 },
    { id: 'five_perfect', name: 'Five Star', desc: 'Have 5 perfect days', icon: '✨', xp: 250, check: (data) => data.stats.perfectDays >= 5 },
    { id: 'level_5', name: 'Rising Star', desc: 'Reach level 5', icon: '📈', xp: 200, check: (data) => getLevel(data.stats.totalXP) >= 5 },
    { id: 'level_10', name: 'Elite Status', desc: 'Reach level 10', icon: '🏅', xp: 500, check: (data) => getLevel(data.stats.totalXP) >= 10 },
];

const MOTIVATIONAL_MESSAGES = {
    start: [
        "Start strong! Complete your habits for today.",
        "A new day, a new opportunity to be great!",
        "Let's crush it today! 💪",
        "Your future self will thank you.",
        "Small steps lead to big changes."
    ],
    partial: [
        "Keep going! You're making progress.",
        "Almost there! Don't stop now.",
        "You've got this! Push through.",
        "Momentum is building! 🚀",
        "Every habit counts. Keep it up!"
    ],
    complete: [
        "Amazing! You completed everything! 🎉",
        "Perfect day! You're unstoppable! 🔥",
        "100%! That's how champions do it! 🏆",
        "Incredible work! You're on fire!",
        "You did it! Pure excellence! ⭐"
    ]
};

// ==========================================
// STATE
// ==========================================

let appData = null;
let currentWeekOffset = 0;
let currentMonthOffset = 0;
let deleteHabitId = null;
let deleteGoalId = null;

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function getDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDayOfWeek(date) {
    return date.getDay(); // 0 = Sunday
}

function formatDate(date) {
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
    });
}

function getWeekDates(weekOffset = 0) {
    const today = new Date();
    // Get Monday as start of week (1 = Monday)
    let dayOfWeek = today.getDay();
    // Convert Sunday (0) to 7 for easier Monday-based calculation
    if (dayOfWeek === 0) dayOfWeek = 7;

    const startOfWeek = new Date(today);
    // Go back to Monday
    startOfWeek.setDate(today.getDate() - dayOfWeek + 1 + (weekOffset * 7));

    const dates = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        dates.push(date);
    }
    return dates;
}

function getMonthDates(monthOffset = 0) {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + monthOffset;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const dates = [];
    for (let d = 1; d <= lastDay.getDate(); d++) {
        dates.push(new Date(year, month, d));
    }
    return dates;
}

function getMonthName(monthOffset = 0) {
    const today = new Date();
    const date = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getLevel(xp) {
    return Math.floor(xp / XP_PER_LEVEL) + 1;
}

function getXPForCurrentLevel(xp) {
    return xp % XP_PER_LEVEL;
}

function getTotalCompletions(data) {
    let total = 0;
    data.habits.forEach(habit => {
        total += Object.keys(habit.completions).length;
    });
    return total;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function shouldShowHabitOnDay(habit, dayOfWeek) {
    switch (habit.frequency) {
        case 'daily':
            return true;
        case 'weekdays':
            return dayOfWeek >= 1 && dayOfWeek <= 5;
        case 'weekends':
            return dayOfWeek === 0 || dayOfWeek === 6;
        case 'custom':
            return habit.customDays.includes(dayOfWeek);
        default:
            return true;
    }
}

// ==========================================
// DATA MANAGEMENT
// ==========================================

function getDefaultData() {
    return {
        habits: [
            {
                id: generateId(),
                name: 'Running',
                emoji: '🏃',
                color: '#10b981',
                frequency: 'daily',
                customDays: [],
                completions: {},
                createdAt: getDateString()
            },
            {
                id: generateId(),
                name: 'Reading',
                emoji: '📚',
                color: '#3b82f6',
                frequency: 'daily',
                customDays: [],
                completions: {},
                createdAt: getDateString()
            },
            {
                id: generateId(),
                name: 'Meditation',
                emoji: '🧘',
                color: '#8b5cf6',
                frequency: 'daily',
                customDays: [],
                completions: {},
                createdAt: getDateString()
            }
        ],
        stats: {
            currentStreak: 0,
            longestStreak: 0,
            totalXP: 0,
            perfectDays: 0,
            completionsByDay: [0, 0, 0, 0, 0, 0, 0]
        },
        achievements: [],
        dailyGoals: [],
        settings: {
            createdAt: getDateString()
        }
    };
}

function loadData() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            appData = JSON.parse(stored);
            // Ensure all required properties exist
            if (!appData.stats) appData.stats = getDefaultData().stats;
            if (!appData.achievements) appData.achievements = [];
            if (!appData.dailyGoals) appData.dailyGoals = [];
            if (!appData.settings) appData.settings = getDefaultData().settings;
        } else {
            appData = getDefaultData();
            saveData();
        }
    } catch (e) {
        console.error('Failed to load data:', e);
        appData = getDefaultData();
    }
}

function saveData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    } catch (e) {
        console.error('Failed to save data:', e);
        showToast('Failed to save data', 'error');
    }
}

// ==========================================
// HABIT OPERATIONS
// ==========================================

function addHabit(name, emoji, color, frequency, customDays = []) {
    const habit = {
        id: generateId(),
        name: name.trim(),
        emoji,
        color,
        frequency,
        customDays,
        completions: {},
        createdAt: getDateString()
    };

    appData.habits.push(habit);
    saveData();
    checkAchievements();
    renderAll();
    showToast(`${emoji} ${name} added!`, 'success');
}

function deleteHabit(habitId) {
    const habitIndex = appData.habits.findIndex(h => h.id === habitId);
    if (habitIndex !== -1) {
        const habit = appData.habits[habitIndex];
        appData.habits.splice(habitIndex, 1);
        saveData();
        renderAll();
        showToast(`${habit.emoji} ${habit.name} deleted`, 'success');
    }
}

function toggleHabitCompletion(habitId, dateString = getDateString()) {
    const habit = appData.habits.find(h => h.id === habitId);
    if (!habit) return;

    const wasCompleted = habit.completions[dateString];

    if (wasCompleted) {
        delete habit.completions[dateString];
        appData.stats.totalXP = Math.max(0, appData.stats.totalXP - XP_PER_COMPLETION);
    } else {
        habit.completions[dateString] = true;
        appData.stats.totalXP += XP_PER_COMPLETION;
        showToast(`+${XP_PER_COMPLETION} XP`, 'xp');

        // Track completion by day of week
        const date = new Date(dateString);
        const dayOfWeek = date.getDay();
        appData.stats.completionsByDay[dayOfWeek]++;
    }

    updateStreaks();
    saveData();
    checkAchievements();
    renderAll();

    // Check for perfect day celebration
    if (!wasCompleted && checkPerfectDay()) {
        appData.stats.perfectDays++;
        saveData();
        checkAchievements();
        showCelebration();
    }
}

function checkPerfectDay(dateString = getDateString()) {
    const date = new Date(dateString);
    const dayOfWeek = getDayOfWeek(date);

    const habitsForToday = appData.habits.filter(h => shouldShowHabitOnDay(h, dayOfWeek));
    if (habitsForToday.length === 0) return false;

    return habitsForToday.every(h => h.completions[dateString]);
}

function updateStreaks() {
    const today = new Date();
    let streak = 0;
    let checkDate = new Date(today);

    // Check today first
    const todayStr = getDateString(today);
    const todayDayOfWeek = getDayOfWeek(today);
    const habitsForToday = appData.habits.filter(h => shouldShowHabitOnDay(h, todayDayOfWeek));

    // If there are habits for today, check if at least one is completed
    // Otherwise, we need to check backwards
    let startFromYesterday = false;
    if (habitsForToday.length > 0) {
        const anyCompletedToday = habitsForToday.some(h => h.completions[todayStr]);
        if (!anyCompletedToday) {
            startFromYesterday = true;
        }
    }

    if (startFromYesterday) {
        checkDate.setDate(checkDate.getDate() - 1);
    }

    // Count consecutive days with at least one completion
    while (true) {
        const dateStr = getDateString(checkDate);
        const dayOfWeek = getDayOfWeek(checkDate);
        const habitsForDay = appData.habits.filter(h => shouldShowHabitOnDay(h, dayOfWeek));

        if (habitsForDay.length === 0) {
            // No habits scheduled for this day, skip it
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
        }

        const anyCompleted = habitsForDay.some(h => h.completions[dateStr]);
        if (anyCompleted) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);

            // Safety limit
            if (streak > 1000) break;
        } else {
            break;
        }
    }

    appData.stats.currentStreak = streak;
    if (streak > appData.stats.longestStreak) {
        appData.stats.longestStreak = streak;
    }
}

// ==========================================
// ACHIEVEMENTS
// ==========================================

function checkAchievements() {
    let newAchievements = [];

    ACHIEVEMENTS.forEach(achievement => {
        if (!appData.achievements.includes(achievement.id) && achievement.check(appData)) {
            appData.achievements.push(achievement.id);
            appData.stats.totalXP += achievement.xp;
            newAchievements.push(achievement);
        }
    });

    if (newAchievements.length > 0) {
        saveData();
        newAchievements.forEach(a => {
            setTimeout(() => {
                showToast(`🏆 Achievement: ${a.name} (+${a.xp} XP)`, 'success');
            }, 500);
        });
    }
}

// ==========================================
// RENDERING
// ==========================================

function renderAll() {
    renderHeader();
    renderTodayView();
    renderDailyGoals();
    renderWeekView();
    renderWeekLineChart();
    // renderWeeklyPlanner(); // Removed to eliminate scrolling in Week view
    renderMonthView();
    renderStatsView();
    renderAchievementsView();
}

function renderHeader() {
    // Date display
    document.getElementById('currentDate').textContent = formatDate(new Date());

    // Level badge
    const level = getLevel(appData.stats.totalXP);
    document.getElementById('levelBadge').innerHTML = `
        <span class="level-icon">⚡</span>
        <span class="level-text">Lv. ${level}</span>
    `;

    // Stats bar
    const todayProgress = calculateTodayProgress();
    const weekProgress = calculateWeekProgress();

    document.getElementById('todayProgress').textContent = `${todayProgress}%`;
    document.getElementById('weekProgress').textContent = `${weekProgress}%`;
    document.getElementById('currentStreak').textContent = appData.stats.currentStreak;
    document.getElementById('totalXP').textContent = appData.stats.totalXP;
}

function calculateTodayProgress() {
    const today = getDateString();
    const dayOfWeek = getDayOfWeek(new Date());
    const habitsForToday = appData.habits.filter(h => shouldShowHabitOnDay(h, dayOfWeek));

    if (habitsForToday.length === 0) return 100;

    const completed = habitsForToday.filter(h => h.completions[today]).length;
    return Math.round((completed / habitsForToday.length) * 100);
}

function calculateWeekProgress() {
    const weekDates = getWeekDates(0);
    const today = new Date();
    let totalHabits = 0;
    let completedHabits = 0;

    weekDates.forEach(date => {
        if (date > today) return; // Don't count future days

        const dateStr = getDateString(date);
        const dayOfWeek = getDayOfWeek(date);

        appData.habits.forEach(habit => {
            if (shouldShowHabitOnDay(habit, dayOfWeek)) {
                totalHabits++;
                if (habit.completions[dateStr]) {
                    completedHabits++;
                }
            }
        });
    });

    if (totalHabits === 0) return 100;
    return Math.round((completedHabits / totalHabits) * 100);
}

function renderTodayView() {
    const today = getDateString();
    const dayOfWeek = getDayOfWeek(new Date());
    const habitsForToday = appData.habits.filter(h => shouldShowHabitOnDay(h, dayOfWeek));

    // Progress ring
    const progress = calculateTodayProgress();
    const circumference = 2 * Math.PI * 52;
    const offset = circumference - (progress / 100) * circumference;

    document.getElementById('todayRing').style.strokeDashoffset = offset;
    document.getElementById('todayPercent').textContent = `${progress}%`;

    // Motivation text
    let messages;
    if (progress === 0) {
        messages = MOTIVATIONAL_MESSAGES.start;
    } else if (progress < 100) {
        messages = MOTIVATIONAL_MESSAGES.partial;
    } else {
        messages = MOTIVATIONAL_MESSAGES.complete;
    }
    document.getElementById('motivationText').textContent =
        messages[Math.floor(Math.random() * messages.length)];

    // Habits list
    const habitsList = document.getElementById('habitsList');

    if (appData.habits.length === 0) {
        habitsList.innerHTML = `
            <div class="empty-state">
                <p>No habits yet. Add your first habit to get started!</p>
            </div>
        `;
        return;
    }

    habitsList.innerHTML = appData.habits.map(habit => {
        const isCompleted = habit.completions[today];
        const isForToday = shouldShowHabitOnDay(habit, dayOfWeek);
        const habitStreak = calculateHabitStreak(habit);

        return `
            <div class="habit-item ${isCompleted ? 'completed' : ''} ${!isForToday ? 'dimmed' : ''}" 
                 style="--habit-color: ${habit.color}"
                 data-habit-id="${habit.id}">
                <div class="habit-checkbox"></div>
                <div class="habit-info">
                    <div class="habit-name">
                        <span class="habit-emoji">${habit.emoji}</span>
                        ${habit.name}
                    </div>
                    ${habitStreak > 0 ? `<div class="habit-streak">${habitStreak} 🔥 streak</div>` : ''}
                </div>
                <div class="habit-actions">
                    <button class="habit-action-btn delete" data-delete-id="${habit.id}" title="Delete">
                        🗑️
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers
    habitsList.querySelectorAll('.habit-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.habit-action-btn')) return;
            const habitId = item.dataset.habitId;
            toggleHabitCompletion(habitId);
        });
    });

    habitsList.querySelectorAll('.habit-action-btn.delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const habitId = btn.dataset.deleteId;
            showDeleteModal(habitId);
        });
    });
}

function calculateHabitStreak(habit) {
    let streak = 0;
    const today = new Date();
    let checkDate = new Date(today);

    while (true) {
        const dateStr = getDateString(checkDate);
        const dayOfWeek = getDayOfWeek(checkDate);

        if (!shouldShowHabitOnDay(habit, dayOfWeek)) {
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
        }

        if (habit.completions[dateStr]) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
            if (streak > 1000) break;
        } else {
            // If it's today and not completed yet, check yesterday
            if (dateStr === getDateString(today)) {
                checkDate.setDate(checkDate.getDate() - 1);
                continue;
            }
            break;
        }
    }

    return streak;
}

// Render Week View (Matrix Grid)
function renderWeekView() {
    renderWeekGrid();
}


// ==========================================
// DAILY GOALS
// ==========================================

function addDailyGoal(text, date) {
    const goal = {
        id: generateId(),
        text: text.trim(),
        date: date,
        completed: false,
        createdAt: getDateString()
    };

    appData.dailyGoals.push(goal);
    saveData();
    renderDailyGoals();
    showToast('Goal added!', 'success');
}

function toggleGoalCompletion(goalId) {
    const goal = appData.dailyGoals.find(g => g.id === goalId);
    if (!goal) return;

    goal.completed = !goal.completed;

    if (goal.completed) {
        appData.stats.totalXP += 5;
        showToast('+5 XP', 'xp');
    } else {
        appData.stats.totalXP = Math.max(0, appData.stats.totalXP - 5);
    }

    saveData();
    renderAll();
}

function deleteGoal(goalId) {
    const goalIndex = appData.dailyGoals.findIndex(g => g.id === goalId);
    if (goalIndex !== -1) {
        appData.dailyGoals.splice(goalIndex, 1);
        saveData();
        renderDailyGoals();
        showToast('Goal deleted', 'success');
    }
}

function renderDailyGoals() {
    const today = getDateString();
    const todayGoals = appData.dailyGoals.filter(g => g.date === today);

    const goalsList = document.getElementById('dailyGoalsList');
    const goalsCount = document.getElementById('goalsCount');

    const completedCount = todayGoals.filter(g => g.completed).length;
    goalsCount.textContent = `${completedCount}/${todayGoals.length}`;

    if (todayGoals.length === 0) {
        goalsList.innerHTML = '<div class="empty-goals">No goals for today. Add one!</div>';
        return;
    }

    goalsList.innerHTML = todayGoals.map(goal => `
        <div class="goal-item ${goal.completed ? 'completed' : ''}" data-goal-id="${goal.id}">
            <div class="goal-checkbox"></div>
            <span class="goal-text">${goal.text}</span>
            <button class="goal-delete" data-delete-goal="${goal.id}">🗑️</button>
        </div>
    `).join('');

    // Add click handlers
    goalsList.querySelectorAll('.goal-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.goal-delete')) return;
            toggleGoalCompletion(item.dataset.goalId);
        });
    });

    goalsList.querySelectorAll('.goal-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteGoal(btn.dataset.deleteGoal);
        });
    });
}

// ==========================================
// LINE CHART
// ==========================================

function calculateDayCompletion(dateStr) {
    const date = new Date(dateStr);
    const dayOfWeek = getDayOfWeek(date);

    const habitsForDay = appData.habits.filter(h => shouldShowHabitOnDay(h, dayOfWeek));
    if (habitsForDay.length === 0) return 100;

    const completed = habitsForDay.filter(h => h.completions[dateStr]).length;
    return Math.round((completed / habitsForDay.length) * 100);
}

function renderWeekLineChart() {
    const weekDates = getWeekDates(currentWeekOffset);
    const today = new Date();
    const chartContainer = document.getElementById('weekLineChart');

    if (!chartContainer) return;

    const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    let chartHTML = '';
    weekDates.forEach((date, i) => {
        const dateStr = getDateString(date);
        const isFuture = date > today;
        const completion = isFuture ? 0 : calculateDayCompletion(dateStr);
        const height = Math.max(4, completion);

        chartHTML += `
            <div class="chart-bar ${completion === 0 ? 'zero' : ''}" 
                 style="height: ${height}%" 
                 data-value="${completion}%"
                 title="${date.toLocaleDateString()}: ${completion}%">
            </div>
        `;
    });

    chartHTML += `
        <div class="chart-labels">
            ${dayNames.map(d => `<span class="chart-day-label">${d}</span>`).join('')}
        </div>
    `;

    chartContainer.innerHTML = chartHTML;
}

// ==========================================
// MONTH VIEW
// ==========================================

function renderMonthView() {
    const monthDates = getMonthDates(currentMonthOffset);
    const today = new Date();
    const todayStr = getDateString(today);

    // Month label
    document.getElementById('monthLabel').textContent = getMonthName(currentMonthOffset);

    // Month stats
    let totalScheduled = 0;
    let totalCompleted = 0;

    monthDates.forEach(date => {
        if (date > today) return;
        const dateStr = getDateString(date);
        const dayOfWeek = getDayOfWeek(date);

        appData.habits.forEach(habit => {
            if (shouldShowHabitOnDay(habit, dayOfWeek)) {
                totalScheduled++;
                if (habit.completions[dateStr]) {
                    totalCompleted++;
                }
            }
        });
    });

    const monthCompletion = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;

    document.getElementById('monthCompletion').textContent = `${monthCompletion}%`;
    document.getElementById('monthCompleted').textContent = totalCompleted;
    document.getElementById('monthTotal').textContent = totalScheduled;

    // Month line chart
    renderMonthLineChart(monthDates, today);

    // Month grid
    const monthGrid = document.getElementById('monthGrid');
    const daysInMonth = monthDates.length;

    let gridHTML = `
        <div class="month-header">
            <div class="month-day-header"></div>
            ${monthDates.map(date => {
        const isToday = getDateString(date) === todayStr;
        return `<div class="month-day-header ${isToday ? 'today' : ''}">${date.getDate()}</div>`;
    }).join('')}
        </div>
    `;

    appData.habits.forEach(habit => {
        gridHTML += `
            <div class="month-habit-row">
                <div class="month-habit-name">
                    <span class="month-habit-emoji">${habit.emoji}</span>
                    ${habit.name.substring(0, 5)}
                </div>
                ${monthDates.map(date => {
            const dateStr = getDateString(date);
            const isCompleted = habit.completions[dateStr];
            const isFuture = date > today;
            const isToday = dateStr === todayStr;
            const dayOfWeek = getDayOfWeek(date);

            return `
                        <div class="month-cell ${isCompleted ? 'completed' : ''} ${isFuture ? 'future' : ''} ${isToday ? 'today' : ''}"
                             style="--habit-color: ${habit.color}"
                             data-habit-id="${habit.id}"
                             data-date="${dateStr}">
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    });

    monthGrid.innerHTML = gridHTML;
}



function renderMonthView() {
    const today = new Date();
    const todayStr = getDateString(today);

    // Update Month Label
    document.getElementById('monthLabel').textContent = getMonthName(currentMonthOffset);

    // 7-Column Calendar Layout
    const monthDates = getMonthDates(currentMonthOffset);
    const firstDay = monthDates[0];

    // ISO Week: Monday = 1, Sunday = 7
    let startDay = firstDay.getDay();
    if (startDay === 0) startDay = 7; // Convert Sunday 0 to 7

    // Pad empty cells before first day (startDay - 1 blanks)
    const blanks = startDay - 1;

    const monthGrid = document.getElementById('monthGrid');

    // Headers (Mo Tu We Th Fr Sa Su)
    const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    let gridHTML = `
        <div class="calendar-header-row">
            ${days.map(d => `<div class="calendar-header">${d}</div>`).join('')}
        </div>
        <div class="calendar-body">
    `;

    // Blank cells
    for (let i = 0; i < blanks; i++) {
        gridHTML += `<div class="calendar-cell empty"></div>`;
    }

    // Content cells
    monthDates.forEach(date => {
        const dateStr = getDateString(date);
        const isToday = dateStr === todayStr;
        const completion = calculateDayCompletion(dateStr);
        const dayNum = date.getDate();

        // Color intensity based on completion
        // 0% -> bg-secondary
        // 100% -> primary
        const opacity = Math.max(0.1, completion / 100);
        const bgStyle = completion > 0
            ? `style="background: rgba(16, 185, 129, ${opacity}); color: ${completion > 50 ? '#fff' : 'var(--text-primary)'}"`
            : '';

        gridHTML += `
            <div class="calendar-cell ${isToday ? 'today' : ''}" ${bgStyle}>
                <span class="calendar-date">${dayNum}</span>
            </div>
        `;
    });

    gridHTML += `</div>`; // Close body

    monthGrid.innerHTML = gridHTML;

    // Update Monthly Stats
    // ... (Calculate stats logic)
    let totalScheduled = 0;
    let totalCompleted = 0;

    monthDates.forEach(date => {
        if (date > today) return;
        const dateStr = getDateString(date);
        const dayOfWeek = getDayOfWeek(date);

        appData.habits.forEach(habit => {
            if (shouldShowHabitOnDay(habit, dayOfWeek)) {
                totalScheduled++;
                if (habit.completions[dateStr]) totalCompleted++;
            }
        });
    });

    const monthCompletion = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;
    document.getElementById('monthCompletion').textContent = `${monthCompletion}%`;
    document.getElementById('monthCompleted').textContent = totalCompleted;
    document.getElementById('monthTotal').textContent = totalScheduled;

    renderMonthLineChart(monthDates, today);
}

function renderMonthLineChart(monthDates, today) {
    const chartContainer = document.getElementById('monthLineChart');
    if (!chartContainer) return;

    let chartHTML = '';
    monthDates.forEach((date, i) => {
        const dateStr = getDateString(date);
        const isFuture = date > today;
        const completion = isFuture ? 0 : calculateDayCompletion(dateStr);
        const height = Math.max(2, completion);

        chartHTML += `
            <div class="chart-bar ${completion === 0 ? 'zero' : ''}" 
                 style="height: ${height}%; min-width: 6px; max-width: 12px;" 
                 data-value="${completion}%"
                 title="${date.getDate()}: ${completion}%">
            </div>
        `;
    });

    chartContainer.innerHTML = chartHTML;
}

function renderStatsView() {
    // Overall completion
    const totalCompletions = getTotalCompletions(appData);
    const totalPossible = calculateTotalPossibleCompletions();
    const overallRate = totalPossible > 0 ? Math.round((totalCompletions / totalPossible) * 100) : 0;

    document.getElementById('overallCompletion').textContent = `${overallRate}%`;
    document.getElementById('currentStreakStat').textContent = appData.stats.currentStreak;
    document.getElementById('longestStreak').textContent = appData.stats.longestStreak;

    // Habit performance
    const performanceList = document.getElementById('habitPerformance');
    performanceList.innerHTML = appData.habits.map(habit => {
        const completionCount = Object.keys(habit.completions).length;
        const possibleDays = calculatePossibleDaysForHabit(habit);
        const rate = possibleDays > 0 ? Math.round((completionCount / possibleDays) * 100) : 0;

        return `
            <div class="performance-item">
                <span class="performance-emoji">${habit.emoji}</span>
                <div class="performance-info">
                    <div class="performance-name">${habit.name}</div>
                    <div class="performance-bar">
                        <div class="performance-fill" style="width: ${rate}%; background: ${habit.color}"></div>
                    </div>
                </div>
                <span class="performance-percent">${rate}%</span>
            </div>
        `;
    }).join('') || '<p style="color: var(--text-muted); text-align: center;">No habits yet</p>';

    // Best days
    const bestDays = document.getElementById('bestDays');
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const maxCompletions = Math.max(...appData.stats.completionsByDay, 1);

    bestDays.innerHTML = dayNames.map((name, i) => {
        const count = appData.stats.completionsByDay[i];
        const intensity = count / maxCompletions;
        const color = `rgba(16, 185, 129, ${0.2 + intensity * 0.8})`;

        return `
            <div class="best-day-item" style="background: ${color}">
                <div class="best-day-name">${name}</div>
                <div class="best-day-value" style="color: ${intensity > 0.5 ? 'white' : 'var(--text-secondary)'}">${count}</div>
            </div>
        `;
    }).join('');
}

function calculateTotalPossibleCompletions() {
    let total = 0;
    const today = new Date();

    appData.habits.forEach(habit => {
        const createdDate = new Date(habit.createdAt);
        let checkDate = new Date(createdDate);

        while (checkDate <= today) {
            if (shouldShowHabitOnDay(habit, getDayOfWeek(checkDate))) {
                total++;
            }
            checkDate.setDate(checkDate.getDate() + 1);
        }
    });

    return total;
}

function calculatePossibleDaysForHabit(habit) {
    let total = 0;
    const today = new Date();
    const createdDate = new Date(habit.createdAt);
    let checkDate = new Date(createdDate);

    while (checkDate <= today) {
        if (shouldShowHabitOnDay(habit, getDayOfWeek(checkDate))) {
            total++;
        }
        checkDate.setDate(checkDate.getDate() + 1);
    }

    return total;
}

function renderAchievementsView() {
    // XP and Level
    const xp = appData.stats.totalXP;
    const level = getLevel(xp);
    const xpInLevel = getXPForCurrentLevel(xp);

    document.getElementById('totalXPDisplay').textContent = `${xp} XP`;
    document.getElementById('currentLevel').textContent = `Level ${level}`;
    document.getElementById('nextLevel').textContent = `Level ${level + 1}`;
    document.getElementById('levelFill').style.width = `${(xpInLevel / XP_PER_LEVEL) * 100}%`;
    document.getElementById('xpToNext').textContent = `${xpInLevel} / ${XP_PER_LEVEL} XP`;

    // Achievements grid
    const grid = document.getElementById('achievementsGrid');
    grid.innerHTML = ACHIEVEMENTS.map(achievement => {
        const unlocked = appData.achievements.includes(achievement.id);

        return `
            <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
                <div class="achievement-icon">${achievement.icon}</div>
                <div class="achievement-name">${achievement.name}</div>
                <div class="achievement-desc">${achievement.desc}</div>
                <div class="achievement-xp">+${achievement.xp} XP</div>
            </div>
        `;
    }).join('');
}

// ==========================================
// MODALS
// ==========================================

function showAddHabitModal() {
    document.getElementById('addHabitModal').classList.add('active');
    document.getElementById('habitName').value = '';
    document.getElementById('habitName').focus();

    // Reset selections
    document.querySelectorAll('.emoji-btn').forEach(btn => btn.classList.remove('selected'));
    document.querySelector('.emoji-btn').classList.add('selected');

    document.querySelectorAll('.color-btn').forEach(btn => btn.classList.remove('selected'));
    document.querySelector('.color-btn').classList.add('selected');

    document.querySelectorAll('.freq-btn').forEach(btn => btn.classList.remove('selected'));
    document.querySelector('.freq-btn[data-freq="daily"]').classList.add('selected');

    document.querySelectorAll('.day-btn').forEach(btn => btn.classList.remove('selected'));
    document.getElementById('customDays').classList.add('hidden');
}

function hideAddHabitModal() {
    document.getElementById('addHabitModal').classList.remove('active');
}

function showDeleteModal(habitId) {
    deleteHabitId = habitId;
    const habit = appData.habits.find(h => h.id === habitId);
    if (!habit) return;

    document.getElementById('deleteHabitName').textContent = `${habit.emoji} ${habit.name}`;
    document.getElementById('deleteModal').classList.add('active');
}

function hideDeleteModal() {
    document.getElementById('deleteModal').classList.remove('active');
    deleteHabitId = null;
}

function showSettingsModal() {
    document.getElementById('settingsModal').classList.add('active');
}

function hideSettingsModal() {
    document.getElementById('settingsModal').classList.remove('active');
}

function showAddGoalModal() {
    document.getElementById('addGoalModal').classList.add('active');
    document.getElementById('goalText').value = '';
    document.getElementById('goalDate').value = getDateString();
    document.getElementById('goalText').focus();
}

function hideAddGoalModal() {
    document.getElementById('addGoalModal').classList.remove('active');
}

// ==========================================
// CELEBRATIONS & TOASTS
// ==========================================

function showCelebration() {
    const overlay = document.getElementById('celebrationOverlay');
    overlay.classList.remove('hidden');

    // Create confetti
    createConfetti();

    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 2500);
}

function createConfetti() {
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];

    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDuration = (Math.random() * 2 + 1) + 's';
        confetti.style.animationDelay = Math.random() * 0.5 + 's';

        document.body.appendChild(confetti);

        // Animate falling
        confetti.animate([
            { transform: 'translateY(-10vh) rotate(0deg)', opacity: 1 },
            { transform: `translateY(100vh) rotate(${Math.random() * 720}deg)`, opacity: 0 }
        ], {
            duration: 2000 + Math.random() * 1000,
            easing: 'cubic-bezier(.25,.46,.45,.94)'
        }).onfinish = () => confetti.remove();
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✓',
        error: '✕',
        xp: '⚡'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || '✓'}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ==========================================
// DATA IMPORT/EXPORT
// ==========================================

function exportData() {
    const dataStr = JSON.stringify(appData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `habit-tracker-backup-${getDateString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Data exported successfully!', 'success');
}

function importData(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);

            // Validate structure
            if (!importedData.habits || !Array.isArray(importedData.habits)) {
                throw new Error('Invalid data format');
            }

            appData = importedData;
            saveData();
            renderAll();
            showToast('Data imported successfully!', 'success');
            hideSettingsModal();
        } catch (err) {
            showToast('Failed to import data', 'error');
        }
    };
    reader.readAsText(file);
}

function resetData() {
    if (confirm('Are you sure you want to reset ALL data? This cannot be undone.')) {
        appData = getDefaultData();
        saveData();
        renderAll();
        showToast('All data has been reset', 'success');
        hideSettingsModal();
    }
}

// ==========================================
// EVENT LISTENERS
// ==========================================

function initEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab + 'Tab';

            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');

            // Layout adjustments via CSS class
            const tab = btn.dataset.tab;
            document.body.classList.toggle('week-view-active', tab === 'week');

            // Optimization: Only render the current tab
            if (tab === 'today') {
                renderHeader();
                renderTodayView();
                renderDailyGoals();
            } else if (tab === 'week') {
                renderWeekView();
            } else if (tab === 'month') {
                renderMonthView();
            } else if (tab === 'stats') {
                renderStatsView();
            } else if (tab === 'achievements') {
                renderAchievementsView();
            }
        });
    });

    // Week navigation
    document.getElementById('prevWeek').addEventListener('click', () => {
        currentWeekOffset--;
        renderWeekView();
        renderWeekLineChart();
    });

    document.getElementById('nextWeek').addEventListener('click', () => {
        if (currentWeekOffset < 0) {
            currentWeekOffset++;
            renderWeekView();
            renderWeekLineChart();
        }
    });

    // Month navigation
    document.getElementById('prevMonth').addEventListener('click', () => {
        currentMonthOffset--;
        renderMonthView();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
        if (currentMonthOffset < 0) {
            currentMonthOffset++;
            renderMonthView();
        }
    });

    // Daily goals modal
    document.getElementById('addGoalBtn').addEventListener('click', showAddGoalModal);
    document.getElementById('closeGoalModal').addEventListener('click', hideAddGoalModal);
    document.getElementById('cancelAddGoal').addEventListener('click', hideAddGoalModal);
    document.getElementById('confirmAddGoal').addEventListener('click', () => {
        const text = document.getElementById('goalText').value.trim();
        const date = document.getElementById('goalDate').value;

        if (!text) {
            showToast('Please enter a goal', 'error');
            return;
        }

        if (!date) {
            showToast('Please select a date', 'error');
            return;
        }

        addDailyGoal(text, date);
        hideAddGoalModal();
    });

    // Add habit modal
    document.getElementById('addHabitBtn').addEventListener('click', showAddHabitModal);
    document.getElementById('closeAddModal').addEventListener('click', hideAddHabitModal);
    document.getElementById('cancelAddHabit').addEventListener('click', hideAddHabitModal);

    // Emoji picker
    document.getElementById('emojiPicker').addEventListener('click', (e) => {
        if (e.target.classList.contains('emoji-btn')) {
            document.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
        }
    });

    // Color picker
    document.getElementById('colorPicker').addEventListener('click', (e) => {
        if (e.target.classList.contains('color-btn')) {
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
        }
    });

    // Frequency picker
    document.getElementById('frequencyPicker').addEventListener('click', (e) => {
        if (e.target.classList.contains('freq-btn')) {
            document.querySelectorAll('.freq-btn').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');

            const freq = e.target.dataset.freq;
            document.getElementById('customDays').classList.toggle('hidden', freq !== 'custom');
        }
    });

    // Custom days
    document.getElementById('customDays').addEventListener('click', (e) => {
        if (e.target.classList.contains('day-btn')) {
            e.target.classList.toggle('selected');
        }
    });

    // Confirm add habit
    document.getElementById('confirmAddHabit').addEventListener('click', () => {
        const name = document.getElementById('habitName').value.trim();
        if (!name) {
            showToast('Please enter a habit name', 'error');
            return;
        }

        const emoji = document.querySelector('.emoji-btn.selected').dataset.emoji;
        const color = document.querySelector('.color-btn.selected').dataset.color;
        const frequency = document.querySelector('.freq-btn.selected').dataset.freq;

        let customDays = [];
        if (frequency === 'custom') {
            customDays = Array.from(document.querySelectorAll('.day-btn.selected'))
                .map(b => parseInt(b.dataset.day));

            if (customDays.length === 0) {
                showToast('Please select at least one day', 'error');
                return;
            }
        }

        addHabit(name, emoji, color, frequency, customDays);
        hideAddHabitModal();
    });

    // Delete modal
    document.getElementById('closeDeleteModal').addEventListener('click', hideDeleteModal);
    document.getElementById('cancelDelete').addEventListener('click', hideDeleteModal);
    document.getElementById('confirmDelete').addEventListener('click', () => {
        if (deleteHabitId) {
            deleteHabit(deleteHabitId);
            hideDeleteModal();
        }
    });

    // Settings modal
    document.getElementById('settingsBtn').addEventListener('click', showSettingsModal);
    document.getElementById('closeSettingsModal').addEventListener('click', hideSettingsModal);

    // Data management
    document.getElementById('exportData').addEventListener('click', exportData);
    document.getElementById('importData').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importData(e.target.files[0]);
        }
    });
    document.getElementById('resetData').addEventListener('click', resetData);

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    // Close celebration on click
    document.getElementById('celebrationOverlay').addEventListener('click', () => {
        document.getElementById('celebrationOverlay').classList.add('hidden');
    });
}

// ==========================================
// SERVICE WORKER REGISTRATION
// ==========================================

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed:', err));
    }
}

// ==========================================
// INITIALIZATION
// ==========================================

function init() {
    loadData();
    initEventListeners();
    renderAll();
    registerServiceWorker();

    // Check and update streaks on app load
    updateStreaks();
    saveData();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);

function renderWeekKanban() {
    // This function is still used by renderAll if called, but not by renderWeekView currently.
    // It is kept for historical/alternative view support if needed later.
}

function renderWeekGrid() {
    const weekGrid = document.getElementById('weekGrid');
    if (!weekGrid) return;

    // Clear and setup
    weekGrid.innerHTML = '';

    const weekDates = getWeekDates(currentWeekOffset);
    const todayStr = getDateString();
    const dayNames = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

    let gridHTML = `
        <div class="week-header">
            <div class="week-day-header spacer"></div>
            ${weekDates.map((date, i) => {
        const isToday = getDateString(date) === todayStr;
        return `<div class="week-day-header ${isToday ? 'today' : ''}">
                    <span class="day-name">${dayNames[i]}</span>
                    <span class="day-num">${date.getDate()}</span>
                </div>`;
    }).join('')}
        </div>
    `;

    appData.habits.forEach(habit => {
        gridHTML += `
            <div class="habit-row">
                <div class="habit-row-name">
                    <span class="habit-row-emoji">${habit.emoji}</span>
                    <span class="habit-name-text">${habit.name}</span>
                </div>
                ${weekDates.map(date => {
            const dateStr = getDateString(date);
            const isCompleted = habit.completions[dateStr];
            const isFuture = date > new Date() && dateStr !== todayStr;
            const isToday = dateStr === todayStr;
            const dayOfWeek = getDayOfWeek(date);
            const isScheduled = shouldShowHabitOnDay(habit, dayOfWeek);

            return `
                        <div class="week-cell ${isCompleted ? 'completed' : ''} ${isFuture ? 'future' : ''} ${isToday ? 'today' : ''}"
                             style="--habit-color: ${habit.color}"
                             data-habit-id="${habit.id}"
                             data-date="${dateStr}"
                             ${!isScheduled ? 'data-not-scheduled="true"' : ''}>
                             ${isCompleted ? '✓' : ''}
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    });

    // Add Weekly To-Dos row to Matrix
    gridHTML += `
        <div class="habit-row goals-row">
            <div class="habit-row-name">
                <span class="habit-row-emoji">📌</span>
                <span class="habit-name-text">To-Dos</span>
            </div>
            ${weekDates.map(date => {
        const dateStr = getDateString(date);
        const dayGoals = appData.dailyGoals.filter(g => g.date === dateStr);
        const allDone = dayGoals.length > 0 && dayGoals.every(g => g.completed);
        const isFuture = date > new Date() && dateStr !== todayStr;
        const isToday = dateStr === todayStr;

        return `
                    <div class="week-cell goal-cell ${allDone ? 'completed' : ''} ${isFuture ? 'future' : ''} ${isToday ? 'today' : ''}"
                         style="--habit-color: var(--accent)"
                         data-date="${dateStr}">
                         ${allDone ? '✓' : ''}
                    </div>
                `;
    }).join('')}
        </div>
    `;

    weekGrid.innerHTML = gridHTML;

    // Add click handlers
    weekGrid.querySelectorAll('.week-cell:not(.future)').forEach(cell => {
        cell.addEventListener('click', () => {
            const habitId = cell.dataset.habitId;
            const dateStr = cell.dataset.date;
            toggleHabitCompletion(habitId, dateStr);
        });
    });

    // Handle Summary
    const weekSummary = document.getElementById('weekSummary');
    if (weekSummary) {
        weekSummary.style.display = 'block';
        renderWeeklySummary();
    }
}

function renderWeeklySummary() {
    const weekSummary = document.getElementById('weekSummary');
    if (!weekSummary) return;

    const weekDates = getWeekDates(currentWeekOffset);
    const today = new Date();
    let totalScheduled = 0;
    let totalCompleted = 0;

    weekDates.forEach(date => {
        if (date > today) return;
        const dateStr = getDateString(date);
        const dayOfWeek = getDayOfWeek(date);

        appData.habits.forEach(habit => {
            if (shouldShowHabitOnDay(habit, dayOfWeek)) {
                totalScheduled++;
                if (habit.completions[dateStr]) totalCompleted++;
            }
        });
    });

    const percent = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;

    weekSummary.innerHTML = `
        <div class="summary-card">
            <div class="summary-title">Weekly Progress</div>
            <div class="summary-stats">
                <div class="summary-stat">
                    <span class="summary-val">${percent}%</span>
                    <span class="summary-label">Completion</span>
                </div>
                <div class="summary-stat">
                    <span class="summary-val">${totalCompleted}/${totalScheduled}</span>
                    <span class="summary-label">Habits</span>
                </div>
            </div>
        </div>
    `;
}
