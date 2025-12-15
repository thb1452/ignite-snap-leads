/**
 * Tests for utility functions
 * Phase 5: Testing - Critical utility function tests
 */

import { describe, it, expect } from 'vitest';
import {
  escapeCSV,
  normalizeStatus,
  normalizePhone,
  formatPhoneDisplay,
  normalizeEmail,
  isValidEmail,
  formatAddress,
  formatNumber,
  formatCurrency,
  clamp,
  truncate,
  capitalize,
  unique,
  chunk,
  getErrorMessage,
  sleep,
} from '../utils';
import { VIOLATION_STATUS } from '../constants';

describe('CSV Utilities', () => {
  describe('escapeCSV', () => {
    it('should return empty string for null/undefined', () => {
      expect(escapeCSV(null)).toBe('');
      expect(escapeCSV(undefined)).toBe('');
    });

    it('should not escape simple strings', () => {
      expect(escapeCSV('Hello')).toBe('Hello');
      expect(escapeCSV('123')).toBe('123');
    });

    it('should escape strings with commas', () => {
      expect(escapeCSV('Hello, World')).toBe('"Hello, World"');
    });

    it('should escape strings with newlines', () => {
      expect(escapeCSV('Hello\nWorld')).toBe('"Hello\nWorld"');
    });

    it('should escape strings with quotes', () => {
      expect(escapeCSV('Hello "World"')).toBe('"Hello ""World"""');
    });
  });
});

describe('Status Normalization', () => {
  describe('normalizeStatus', () => {
    it('should return UNKNOWN for null/undefined', () => {
      expect(normalizeStatus(null)).toBe(VIOLATION_STATUS.UNKNOWN);
      expect(normalizeStatus(undefined)).toBe(VIOLATION_STATUS.UNKNOWN);
    });

    it('should normalize to OPEN', () => {
      expect(normalizeStatus('open')).toBe(VIOLATION_STATUS.OPEN);
      expect(normalizeStatus('OPEN')).toBe(VIOLATION_STATUS.OPEN);
      expect(normalizeStatus('pending')).toBe(VIOLATION_STATUS.OPEN);
      expect(normalizeStatus('active')).toBe(VIOLATION_STATUS.OPEN);
      expect(normalizeStatus('in progress')).toBe(VIOLATION_STATUS.OPEN);
      expect(normalizeStatus('new')).toBe(VIOLATION_STATUS.OPEN);
    });

    it('should normalize to CLOSED', () => {
      expect(normalizeStatus('closed')).toBe(VIOLATION_STATUS.CLOSED);
      expect(normalizeStatus('CLOSED')).toBe(VIOLATION_STATUS.CLOSED);
      expect(normalizeStatus('resolved')).toBe(VIOLATION_STATUS.CLOSED);
      expect(normalizeStatus('complete')).toBe(VIOLATION_STATUS.CLOSED);
      expect(normalizeStatus('complied')).toBe(VIOLATION_STATUS.CLOSED);
      expect(normalizeStatus('dismissed')).toBe(VIOLATION_STATUS.CLOSED);
      expect(normalizeStatus('abated')).toBe(VIOLATION_STATUS.CLOSED);
    });

    it('should return UNKNOWN for unrecognized status', () => {
      expect(normalizeStatus('unknown status')).toBe(VIOLATION_STATUS.UNKNOWN);
    });
  });
});

describe('Phone Utilities', () => {
  describe('normalizePhone', () => {
    it('should return null for null/undefined', () => {
      expect(normalizePhone(null)).toBeNull();
      expect(normalizePhone(undefined)).toBeNull();
    });

    it('should normalize 10-digit numbers', () => {
      expect(normalizePhone('1234567890')).toBe('+11234567890');
      expect(normalizePhone('(123) 456-7890')).toBe('+11234567890');
    });

    it('should normalize 11-digit numbers starting with 1', () => {
      expect(normalizePhone('11234567890')).toBe('+11234567890');
    });

    it('should handle other lengths', () => {
      expect(normalizePhone('123456789')).toBe('+123456789');
    });
  });

  describe('formatPhoneDisplay', () => {
    it('should return empty string for null/undefined', () => {
      expect(formatPhoneDisplay(null)).toBe('');
      expect(formatPhoneDisplay(undefined)).toBe('');
    });

    it('should format 10-digit numbers', () => {
      expect(formatPhoneDisplay('1234567890')).toBe('(123) 456-7890');
    });

    it('should format 11-digit numbers starting with 1', () => {
      expect(formatPhoneDisplay('11234567890')).toBe('(123) 456-7890');
    });

    it('should return original for other formats', () => {
      expect(formatPhoneDisplay('123')).toBe('123');
    });
  });
});

describe('Email Utilities', () => {
  describe('normalizeEmail', () => {
    it('should return null for null/undefined', () => {
      expect(normalizeEmail(null)).toBeNull();
      expect(normalizeEmail(undefined)).toBeNull();
    });

    it('should lowercase and trim emails', () => {
      expect(normalizeEmail('  TEST@EMAIL.COM  ')).toBe('test@email.com');
      expect(normalizeEmail('Test@Email.Com')).toBe('test@email.com');
    });
  });

  describe('isValidEmail', () => {
    it('should validate correct emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user+tag@domain.co.uk')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
    });
  });
});

describe('Address Utilities', () => {
  describe('formatAddress', () => {
    it('should format full address', () => {
      expect(formatAddress('123 Main St', 'Chicago', 'IL', '60601')).toBe(
        '123 Main St, Chicago, IL, 60601'
      );
    });

    it('should handle partial addresses', () => {
      expect(formatAddress('123 Main St', 'Chicago')).toBe('123 Main St, Chicago');
      expect(formatAddress('123 Main St')).toBe('123 Main St');
    });
  });
});

describe('Number Utilities', () => {
  describe('formatNumber', () => {
    it('should return "0" for null/undefined', () => {
      expect(formatNumber(null)).toBe('0');
      expect(formatNumber(undefined)).toBe('0');
    });

    it('should format numbers with commas', () => {
      expect(formatNumber(1000)).toBe('1,000');
      expect(formatNumber(1000000)).toBe('1,000,000');
    });
  });

  describe('formatCurrency', () => {
    it('should return "$0.00" for null/undefined', () => {
      expect(formatCurrency(null)).toBe('$0.00');
      expect(formatCurrency(undefined)).toBe('$0.00');
    });

    it('should format currency', () => {
      expect(formatCurrency(1000)).toBe('$1,000.00');
      expect(formatCurrency(39.99)).toBe('$39.99');
    });
  });

  describe('clamp', () => {
    it('should clamp value to min', () => {
      expect(clamp(5, 10, 20)).toBe(10);
    });

    it('should clamp value to max', () => {
      expect(clamp(25, 10, 20)).toBe(20);
    });

    it('should return value if in range', () => {
      expect(clamp(15, 10, 20)).toBe(15);
    });
  });
});

describe('String Utilities', () => {
  describe('truncate', () => {
    it('should not truncate short strings', () => {
      expect(truncate('Hello', 10)).toBe('Hello');
    });

    it('should truncate long strings', () => {
      expect(truncate('Hello World!', 8)).toBe('Hello...');
    });
  });

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('HELLO')).toBe('Hello');
      expect(capitalize('hELLO')).toBe('Hello');
    });

    it('should return empty string for empty input', () => {
      expect(capitalize('')).toBe('');
    });
  });
});

describe('Array Utilities', () => {
  describe('unique', () => {
    it('should return unique values', () => {
      expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
    });

    it('should filter out null/undefined', () => {
      expect(unique([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
    });
  });

  describe('chunk', () => {
    it('should chunk array into smaller arrays', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should handle empty array', () => {
      expect(chunk([], 2)).toEqual([]);
    });
  });
});

describe('Error Utilities', () => {
  describe('getErrorMessage', () => {
    it('should extract message from Error', () => {
      expect(getErrorMessage(new Error('Test error'))).toBe('Test error');
    });

    it('should return string errors as-is', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should return default message for unknown errors', () => {
      expect(getErrorMessage({})).toBe('An unknown error occurred');
      expect(getErrorMessage(123)).toBe('An unknown error occurred');
    });
  });
});

describe('Async Utilities', () => {
  describe('sleep', () => {
    it('should delay for specified milliseconds', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow small tolerance
    });
  });
});
