/**
 * TEST SUITE: Daily Warmup & Weekly Habit Engine (RFC 0001 Milestone 1)
 */

const assert = require('assert');
const {
  calculateDecayPriority,
  selectWarmupTopics,
  generateWarmupQuestion,
  normalizeWeeklyHabit,
  isWarmupCompletedToday,
  recordWarmupCompletion,
  getIsoWeek,
  getTodayDateString
} = require('./lib/dailyWarmup');

console.log('--- RUNNING DAILY WARMUP & WEEKLY HABIT TESTS ---');

// 1. Test BKT Decay Math
console.log('\n[1] Testing Memory Decay Priority Calculation...');
const now = Date.now();
const todayTopic = calculateDecayPriority(0.8, now); // practiced today
const weekAgoTopic = calculateDecayPriority(0.8, now - 7 * 86400000); // practiced 7 days ago
const lowMasteryWeekAgo = calculateDecayPriority(0.2, now - 7 * 86400000); // low mastery 7 days ago

assert(todayTopic < weekAgoTopic, 'Freshly practiced topic must have lower decay priority than 7-day-old topic');
assert(weekAgoTopic < lowMasteryWeekAgo, 'Low mastery topic must have higher decay priority than high mastery topic');
console.log(`✓ Decay scores: today=${todayTopic}, weekAgo=${weekAgoTopic}, lowMasteryWeekAgo=${lowMasteryWeekAgo}`);

// 2. Test Warmup Topic Selection
console.log('\n[2] Testing Warmup Topic Selection...');
// Guest / empty history fallback:
const guestSelection = selectWarmupTopics([], 3);
assert.strictEqual(guestSelection.length, 3, 'Guest selection should return exactly 3 questions');
assert(guestSelection.every(s => s.isFallback), 'Empty history should use fallback foundational topics');
console.log('✓ Guest fallback topics:', guestSelection.map(s => s.topic));

// User with history:
const userHistory = [
  { topic: 'addition', pMastery: 0.9, lastPracticedAt: now },
  { topic: 'lineq', pMastery: 0.3, lastPracticedAt: now - 10 * 86400000 },
  { topic: 'fractions', pMastery: 0.5, lastPracticedAt: now - 5 * 86400000 }
];
const userSelection = selectWarmupTopics(userHistory, 3);
assert.strictEqual(userSelection.length, 3);
assert.strictEqual(userSelection[0].topic, 'lineq', 'Most decayed topic (lineq) should be prioritized first');
console.log('✓ Priority sorted topics:', userSelection.map(s => `${s.topic} (decay: ${s.decayPriority})`));

// 3. Test Question Generators
console.log('\n[3] Testing Question Generation...');
const topicsToTest = ['addition', 'multiplication', 'arithmetic', 'fractions', 'lineq', 'squares', 'sqrt'];
topicsToTest.forEach(topic => {
  const q = generateWarmupQuestion(topic, 'easy');
  assert(q.prompt && q.prompt.length > 0, `Prompt must be non-empty for topic ${topic}`);
  assert(q.answer !== undefined && q.answer !== '', `Answer must be non-empty for topic ${topic}`);
  console.log(`✓ [${topic}] Prompt: "${q.prompt}" -> Answer: "${q.answer}"`);
});

// 4. Test Weekly Habit Tracker
console.log('\n[4] Testing Flexible Weekly Habit (3 Days/Week)...');
let habit = normalizeWeeklyHabit({ targetDaysPerWeek: 3 });
assert.strictEqual(habit.targetDaysPerWeek, 3);
assert.strictEqual(habit.activeDaysThisWeek.length, 0);
assert.strictEqual(habit.weeklyStreak, 0);

// Day 1 completion
const day1 = recordWarmupCompletion(habit);
assert.strictEqual(day1.daysCompletedThisWeek, 1);
assert.strictEqual(day1.targetMet, false);
assert.strictEqual(day1.weeklyStreak, 0);
assert.strictEqual(day1.justAchievedTarget, false);
console.log('✓ Day 1 recorded: 1/3 days complete');

// Day 1 repeat on same day (should not double count)
const day1Repeat = recordWarmupCompletion(day1.habit);
assert.strictEqual(day1Repeat.daysCompletedThisWeek, 1, 'Same-day completion must not increment count');
console.log('✓ Duplicate same-day check passed');

// Simulate Day 2 and Day 3 (Target hit!)
day1.habit.activeDaysThisWeek.push('2026-09-02'); // Mock Day 2
const day3 = recordWarmupCompletion(day1.habit); // Today is Day 3
assert.strictEqual(day3.daysCompletedThisWeek, 3);
assert.strictEqual(day3.targetMet, true);
assert.strictEqual(day3.justAchievedTarget, true, 'Reaching 3/3 target must trigger justAchievedTarget');
assert.strictEqual(day3.weeklyStreak, 1, 'Weekly streak must increment to 1 upon achieving target');
console.log('✓ Target hit (3/3 days): weekly streak incremented to 1!');

// Week rollover simulation: target met in previous week -> streak preserved
const rolledOverHabit = normalizeWeeklyHabit({
  targetDaysPerWeek: 3,
  currentWeekYear: '2026-W36', // Previous week
  activeDaysThisWeek: ['2026-09-01', '2026-09-02', '2026-09-03'], // 3 days met
  weeklyStreak: 1
});
assert.strictEqual(rolledOverHabit.weeklyStreak, 1, 'Streak should be preserved into new week');
assert.strictEqual(rolledOverHabit.activeDaysThisWeek.length, 0, 'New week active days should reset to 0');
console.log('✓ Week transition verified: streak preserved, new week initialized');

console.log('\n========================================');
console.log('🎉 ALL TESTS PASSED SUCCESSFULLY (100%)');
console.log('========================================\n');
