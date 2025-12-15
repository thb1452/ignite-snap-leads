/**
 * Tests for constants and helpers
 * Phase 5: Testing - Constants helper function tests
 */

import { describe, it, expect } from 'vitest';
import {
  SNAP_SCORE,
  getSnapScoreCategory,
  getSnapScoreLabel,
  getSnapScoreDescription,
  isUnlimited,
  formatUsageLimit,
} from '../constants';

describe('SnapScore Helpers', () => {
  describe('getSnapScoreCategory', () => {
    it('should return DISTRESSED for scores 70-100', () => {
      expect(getSnapScoreCategory(70)).toBe('DISTRESSED');
      expect(getSnapScoreCategory(85)).toBe('DISTRESSED');
      expect(getSnapScoreCategory(100)).toBe('DISTRESSED');
    });

    it('should return VALUE_ADD for scores 40-69', () => {
      expect(getSnapScoreCategory(40)).toBe('VALUE_ADD');
      expect(getSnapScoreCategory(55)).toBe('VALUE_ADD');
      expect(getSnapScoreCategory(69)).toBe('VALUE_ADD');
    });

    it('should return WATCH for scores 0-39', () => {
      expect(getSnapScoreCategory(0)).toBe('WATCH');
      expect(getSnapScoreCategory(20)).toBe('WATCH');
      expect(getSnapScoreCategory(39)).toBe('WATCH');
    });

    it('should return WATCH for null/undefined', () => {
      expect(getSnapScoreCategory(null)).toBe('WATCH');
      expect(getSnapScoreCategory(undefined)).toBe('WATCH');
    });
  });

  describe('getSnapScoreLabel', () => {
    it('should return correct labels', () => {
      expect(getSnapScoreLabel(85)).toBe(SNAP_SCORE.LABELS.DISTRESSED);
      expect(getSnapScoreLabel(55)).toBe(SNAP_SCORE.LABELS.VALUE_ADD);
      expect(getSnapScoreLabel(20)).toBe(SNAP_SCORE.LABELS.WATCH);
    });
  });

  describe('getSnapScoreDescription', () => {
    it('should return correct descriptions', () => {
      expect(getSnapScoreDescription(85)).toBe(
        SNAP_SCORE.DESCRIPTIONS.DISTRESSED
      );
      expect(getSnapScoreDescription(55)).toBe(
        SNAP_SCORE.DESCRIPTIONS.VALUE_ADD
      );
      expect(getSnapScoreDescription(20)).toBe(SNAP_SCORE.DESCRIPTIONS.WATCH);
    });
  });
});

describe('Usage Limit Helpers', () => {
  describe('isUnlimited', () => {
    it('should return true for -1', () => {
      expect(isUnlimited(-1)).toBe(true);
    });

    it('should return false for other values', () => {
      expect(isUnlimited(0)).toBe(false);
      expect(isUnlimited(10)).toBe(false);
      expect(isUnlimited(100)).toBe(false);
    });
  });

  describe('formatUsageLimit', () => {
    it('should return "Unlimited" for -1', () => {
      expect(formatUsageLimit(-1)).toBe('Unlimited');
    });

    it('should return string number for other values', () => {
      expect(formatUsageLimit(0)).toBe('0');
      expect(formatUsageLimit(10)).toBe('10');
      expect(formatUsageLimit(100)).toBe('100');
    });
  });
});
