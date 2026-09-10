/**
 * REVIEW & DAILY WARMUP ROUTER (RFC 0001)
 *
 * Endpoints:
 * - GET  /api/review/daily-warmup          Returns 3 spaced-review questions and weekly habit status
 * - POST /api/review/daily-warmup/complete Records warmup completion, updates weekly streak, and awards XP
 */

const express = require('express');
const router = express.Router();
const auth = require('../auth');
const logger = require('../lib/logger');
const {
  selectWarmupTopics,
  generateWarmupQuestion,
  normalizeWeeklyHabit,
  isWarmupCompletedToday,
  recordWarmupCompletion,
  getTodayDateString
} = require('../lib/dailyWarmup');

// Helper to safely extract user (registered or null for guests)
async function getOptionalUser(req) {
  const authHeader = req.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!m) return null;

  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(m[1], auth.JWT_SECRET);
    if (payload && payload.username) {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) {
        try {
          const dbUser = await auth.User.findById(payload.sub || payload.username);
          if (dbUser) return dbUser;
        } catch (dbErr) {
          logger.error(null, '[review] DB query error:', dbErr.message);
        }
      }
    }
  } catch (e) {
    // Guest or expired token - continue as guest
  }
  return null;
}

/**
 * GET /api/review/daily-warmup
 * Serves 3 questions tailored via BKT memory decay and returns the weekly habit state.
 */
router.get('/daily-warmup', async (req, res) => {
  try {
    const user = await getOptionalUser(req);
    const guestHabit = req.query.guestHabit ? JSON.parse(req.query.guestHabit) : null;

    let practicedTopics = [];
    let habit = null;

    if (user) {
      // Extract topics the user has previously practiced
      if (Array.isArray(user.completedTopics) && user.completedTopics.length > 0) {
        practicedTopics = user.completedTopics.map(t => ({
          topic: t.replace(/-api$/, ''),
          pMastery: 0.6,
          lastPracticedAt: user.lastActiveDate || user.createdAt
        }));
      }

      habit = normalizeWeeklyHabit(user.weeklyHabit || {});
    } else {
      // Guest learner
      habit = normalizeWeeklyHabit(guestHabit || {});
    }

    const selectedTopics = selectWarmupTopics(practicedTopics, 3);
    const questions = selectedTopics.map(st => generateWarmupQuestion(st.topic, 'easy'));
    const completedToday = isWarmupCompletedToday(habit);

    res.json({
      success: true,
      date: getTodayDateString(),
      completedToday,
      questions,
      weeklyHabit: {
        targetDaysPerWeek: habit.targetDaysPerWeek,
        currentWeekYear: habit.currentWeekYear,
        activeDaysThisWeek: habit.activeDaysThisWeek,
        daysCompletedThisWeek: habit.activeDaysThisWeek.length,
        weeklyStreak: habit.weeklyStreak,
        targetMet: habit.activeDaysThisWeek.length >= habit.targetDaysPerWeek
      }
    });
  } catch (err) {
    logger.error(null, '[review] GET /daily-warmup error:', err);
    res.status(500).json({ error: 'Failed to generate daily warmup', details: err.message });
  }
});

/**
 * POST /api/review/daily-warmup/complete
 * Submits the completed warmup session, updates the weekly habit tracker, and awards +15 XP.
 */
router.post('/daily-warmup/complete', express.json(), async (req, res) => {
  try {
    const user = await getOptionalUser(req);
    const guestHabit = req.body.guestHabit || null;

    const baseHabit = user ? (user.weeklyHabit || {}) : (guestHabit || {});
    const result = recordWarmupCompletion(baseHabit);

    const xpAwarded = 15;

    if (user) {
      user.weeklyHabit = result.habit;
      user.xp = (user.xp || 0) + xpAwarded;
      user.coins = (user.coins || 0) + xpAwarded;
      user.totalSolved = (user.totalSolved || 0) + 3;

      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1 && typeof user.save === 'function') {
        await user.save();
      }
    }

    res.json({
      success: true,
      xpAwarded,
      justAchievedTarget: result.justAchievedTarget,
      weeklyHabit: {
        targetDaysPerWeek: result.targetDaysPerWeek,
        currentWeekYear: result.habit.currentWeekYear,
        activeDaysThisWeek: result.habit.activeDaysThisWeek,
        daysCompletedThisWeek: result.daysCompletedThisWeek,
        weeklyStreak: result.weeklyStreak,
        targetMet: result.targetMet,
        lastWarmupCompletedAt: result.habit.lastWarmupCompletedAt
      },
      message: result.justAchievedTarget
        ? '🎉 Congratulations! You achieved your 3-day weekly mastery target!'
        : '🌟 Great job completing your daily warmup!'
    });
  } catch (err) {
    logger.error(null, '[review] POST /daily-warmup/complete error:', err);
    res.status(500).json({ error: 'Failed to complete daily warmup', details: err.message });
  }
});

module.exports = router;
