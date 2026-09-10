/**
 * DAILY WARMUP & WEEKLY HABIT ENGINE (RFC 0001)
 *
 * Implements:
 * 1. Spaced Memory Decay Priority:
 *    Decay Priority = (1 - P(L_topic)) * ln(1 + delta_t_days)
 *    P(L) is the Bayesian Knowledge Tracing probability (from server/lib/bkt.js).
 *    delta_t_days is days elapsed since the student last practiced the topic.
 *
 * 2. Flexible Weekly Habit Target (Default: 3 days/week):
 *    A resilient habit system that tracks weekly active days and increments
 *    consecutive weekly streaks without resetting upon a single missed day.
 *
 * 3. Standardized Warmup Question Generators:
 *    Generates 3 calibrated questions across foundational and decaying topics.
 */

const { bktUpdate, clamp } = require('./bkt');

// ─── Constants & Configurations ─────────────────────────────────────────────

const DEFAULT_TARGET_DAYS_PER_WEEK = 3;
const DEFAULT_WARMUP_QUESTIONS_COUNT = 3;

// Foundational fallback topics for new or unauthenticated learners
const FOUNDATIONAL_TOPICS = ['addition', 'multiplication', 'arithmetic', 'fractions', 'subtraction', 'lineq'];

// ─── ISO Week Utilities ─────────────────────────────────────────────────────

/**
 * Returns current ISO week identifier string (e.g. "2026-W37")
 */
function getIsoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Returns today's date in "YYYY-MM-DD" local/UTC format
 */
function getTodayDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Memory Decay Calculator ────────────────────────────────────────────────

/**
 * Calculates decay priority for a topic:
 * Decay Priority = (1 - P(L)) * ln(1 + delta_t_days)
 *
 * Higher decay priority = topic is more urgently in need of review.
 * Freshly practiced topics (delta_t ~ 0) receive priority ~ 0.
 *
 * @param {number} pMastery - BKT mastery probability (0 to 1)
 * @param {Date|string|number|null} lastPracticedAt - Timestamp of last practice
 * @returns {number} Decay score (higher = needs review)
 */
function calculateDecayPriority(pMastery = 0.5, lastPracticedAt = null) {
  const now = Date.now();
  const lastTime = lastPracticedAt ? new Date(lastPracticedAt).getTime() : (now - 3 * 86400000);
  const daysElapsed = Math.max(0, (now - lastTime) / (1000 * 60 * 60 * 24));
  
  const pL = clamp(pMastery);
  const decayPriority = (1 - pL) * Math.log(1 + daysElapsed);
  return Number(decayPriority.toFixed(4));
}

/**
 * Selects top review topics based on memory decay priority.
 * Falls back to foundational arithmetic/algebra if student has < 3 history topics.
 *
 * @param {Array<{ topic: string, pMastery?: number, lastPracticedAt?: any }>} practicedTopics
 * @param {number} count
 * @returns {Array<{ topic: string, decayPriority: number, isFallback: boolean }>}
 */
function selectWarmupTopics(practicedTopics = [], count = DEFAULT_WARMUP_QUESTIONS_COUNT) {
  const scored = (practicedTopics || [])
    .filter(t => t && t.topic)
    .map(t => ({
      topic: t.topic,
      decayPriority: calculateDecayPriority(t.pMastery || 0.4, t.lastPracticedAt || null),
      isFallback: false
    }))
    .sort((a, b) => b.decayPriority - a.decayPriority);

  const selected = [];
  const chosenTopicKeys = new Set();

  // Pick highest decay topics
  for (const item of scored) {
    if (!chosenTopicKeys.has(item.topic)) {
      chosenTopicKeys.add(item.topic);
      selected.push(item);
      if (selected.length >= count) break;
    }
  }

  // If student has fewer than required topics, fill with foundational fallbacks
  if (selected.length < count) {
    for (const fallback of FOUNDATIONAL_TOPICS) {
      if (!chosenTopicKeys.has(fallback)) {
        chosenTopicKeys.add(fallback);
        selected.push({
          topic: fallback,
          decayPriority: 0,
          isFallback: true
        });
        if (selected.length >= count) break;
      }
    }
  }

  return selected;
}

// ─── Standalone Question Generators ─────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generates 1 standardized warmup question for a given topic.
 */
function generateWarmupQuestion(topic = 'addition', difficulty = 'easy') {
  const id = `warmup-${topic}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  switch (topic.toLowerCase()) {
    case 'addition': {
      const a = difficulty === 'hard' ? randInt(50, 250) : randInt(12, 68);
      const b = difficulty === 'hard' ? randInt(50, 250) : randInt(11, 59);
      return {
        id,
        topic: 'addition',
        prompt: `${a} + ${b}`,
        answer: String(a + b),
        inputPlaceholder: 'Enter sum',
        difficulty
      };
    }

    case 'subtraction': {
      const a = randInt(30, 99);
      const b = randInt(11, a - 5);
      return {
        id,
        topic: 'subtraction',
        prompt: `${a} − ${b}`,
        answer: String(a - b),
        inputPlaceholder: 'Enter difference',
        difficulty
      };
    }

    case 'multiplication':
    case 'tables': {
      const a = difficulty === 'hard' ? randInt(11, 19) : randInt(3, 12);
      const b = randInt(3, 12);
      return {
        id,
        topic: 'multiplication',
        prompt: `${a} × ${b}`,
        answer: String(a * b),
        inputPlaceholder: 'Enter product',
        difficulty
      };
    }

    case 'division': {
      const b = randInt(3, 12);
      const ans = randInt(3, 12);
      const a = b * ans;
      return {
        id,
        topic: 'division',
        prompt: `${a} ÷ ${b}`,
        answer: String(ans),
        inputPlaceholder: 'Enter quotient',
        difficulty
      };
    }

    case 'arithmetic': {
      const a = randInt(2, 9);
      const b = randInt(2, 8);
      const c = randInt(2, 6);
      return {
        id,
        topic: 'arithmetic',
        prompt: `${a} + ${b} × ${c}`,
        answer: String(a + (b * c)),
        inputPlaceholder: 'Order of ops: multiply first',
        difficulty
      };
    }

    case 'fractions': {
      const denom = randInt(3, 9);
      const num1 = randInt(1, denom - 2);
      const num2 = randInt(1, denom - num1);
      const sumNum = num1 + num2;
      return {
        id,
        topic: 'fractions',
        prompt: `${num1}/${denom} + ${num2}/${denom}`,
        answer: `${sumNum}/${denom}`,
        inputPlaceholder: `e.g. ${sumNum}/${denom}`,
        difficulty
      };
    }

    case 'lineq': {
      const a = randInt(2, 5);
      const x = randInt(2, 9);
      const b = randInt(1, 15);
      const c = a * x + b;
      return {
        id,
        topic: 'lineq',
        prompt: `${a}x + ${b} = ${c}`,
        answer: String(x),
        inputPlaceholder: 'Find x',
        difficulty
      };
    }

    case 'squares': {
      const n = randInt(4, 15);
      return {
        id,
        topic: 'squares',
        prompt: `${n}²`,
        answer: String(n * n),
        inputPlaceholder: 'Enter square',
        difficulty
      };
    }

    case 'sqrt': {
      const root = randInt(3, 12);
      return {
        id,
        topic: 'sqrt',
        prompt: `√${root * root}`,
        answer: String(root),
        inputPlaceholder: 'Enter square root',
        difficulty
      };
    }

    default: {
      // General arithmetic fallback
      const a = randInt(10, 50);
      const b = randInt(5, 30);
      return {
        id,
        topic: 'addition',
        prompt: `${a} + ${b}`,
        answer: String(a + b),
        inputPlaceholder: 'Enter answer',
        difficulty: 'easy'
      };
    }
  }
}

// ─── Weekly Habit Management ────────────────────────────────────────────────

/**
 * Initializes or refreshes a user's weekly habit object.
 * Resets active days if a new ISO week has started, while maintaining streak
 * continuity if the target was met the previous week.
 */
function normalizeWeeklyHabit(userHabit = {}) {
  const currentWeek = getIsoWeek();
  const habit = {
    targetDaysPerWeek: userHabit?.targetDaysPerWeek || DEFAULT_TARGET_DAYS_PER_WEEK,
    currentWeekYear: userHabit?.currentWeekYear || currentWeek,
    activeDaysThisWeek: Array.isArray(userHabit?.activeDaysThisWeek) ? [...userHabit.activeDaysThisWeek] : [],
    weeklyStreak: Number(userHabit?.weeklyStreak) || 0,
    lastWarmupCompletedAt: userHabit?.lastWarmupCompletedAt || null
  };

  // Week rolled over: check if target was met in previous week
  if (habit.currentWeekYear !== currentWeek) {
    const metLastWeekTarget = habit.activeDaysThisWeek.length >= habit.targetDaysPerWeek;
    if (!metLastWeekTarget) {
      habit.weeklyStreak = 0; // Missed target across the entire week
    }
    habit.currentWeekYear = currentWeek;
    habit.activeDaysThisWeek = [];
  }

  return habit;
}

/**
 * Checks if the user already completed warmup today
 */
function isWarmupCompletedToday(habit) {
  if (!habit || !habit.lastWarmupCompletedAt) return false;
  const today = getTodayDateString();
  const lastDate = getTodayDateString(new Date(habit.lastWarmupCompletedAt));
  return today === lastDate;
}

/**
 * Records completion of today's warmup.
 * Adds today to activeDaysThisWeek and increments weeklyStreak upon reaching target.
 */
function recordWarmupCompletion(existingHabit = {}) {
  const habit = normalizeWeeklyHabit(existingHabit);
  const today = getTodayDateString();

  let justAchievedTarget = false;

  if (!habit.activeDaysThisWeek.includes(today)) {
    habit.activeDaysThisWeek.push(today);

    // When student hits the weekly target (e.g. Day 3 of 3), award weekly streak increment!
    if (habit.activeDaysThisWeek.length === habit.targetDaysPerWeek) {
      habit.weeklyStreak += 1;
      justAchievedTarget = true;
    }
  }

  habit.lastWarmupCompletedAt = new Date();

  return {
    habit,
    justAchievedTarget,
    daysCompletedThisWeek: habit.activeDaysThisWeek.length,
    targetDaysPerWeek: habit.targetDaysPerWeek,
    targetMet: habit.activeDaysThisWeek.length >= habit.targetDaysPerWeek,
    weeklyStreak: habit.weeklyStreak
  };
}

module.exports = {
  calculateDecayPriority,
  selectWarmupTopics,
  generateWarmupQuestion,
  normalizeWeeklyHabit,
  isWarmupCompletedToday,
  recordWarmupCompletion,
  getIsoWeek,
  getTodayDateString,
  DEFAULT_TARGET_DAYS_PER_WEEK,
  DEFAULT_WARMUP_QUESTIONS_COUNT
};
