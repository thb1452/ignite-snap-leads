# Testing Guide

**Phase 5: Testing Infrastructure**

This document describes the testing setup, patterns, and best practices for the Snap Ignite application.

## Table of Contents

- [Overview](#overview)
- [Running Tests](#running-tests)
- [Testing Stack](#testing-stack)
- [Test Utilities](#test-utilities)
- [Writing Tests](#writing-tests)
- [Best Practices](#best-practices)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

The application uses **Vitest** as the test runner with **React Testing Library** for component testing. The testing infrastructure is designed to:

- ✅ Provide fast feedback during development
- ✅ Ensure type safety with TypeScript
- ✅ Mock external dependencies (Supabase, React Query)
- ✅ Test user interactions and accessibility
- ✅ Generate coverage reports

## Running Tests

### Available Commands

```bash
# Run tests in watch mode (recommended for development)
npm test

# Run tests with UI dashboard
npm run test:ui

# Run tests with coverage report
npm run test:coverage

# Run tests once (CI mode)
npm test -- --run
```

### Watch Mode Features

In watch mode, Vitest provides:
- **Auto-rerun** on file changes
- **Filter by filename** - press `p` to filter
- **Filter by test name** - press `t` to filter
- **Rerun only failed tests** - press `f`
- **Quit** - press `q`

## Testing Stack

| Tool | Purpose |
|------|---------|
| **Vitest** | Fast test runner with Vite integration |
| **React Testing Library** | Component testing focused on user behavior |
| **@testing-library/user-event** | Simulate realistic user interactions |
| **@testing-library/jest-dom** | Custom matchers for DOM assertions |
| **jsdom** | DOM implementation for Node.js |

### Configuration

**`vitest.config.ts`**
```typescript
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,              // No need to import describe/it/expect
    environment: 'jsdom',        // Simulate browser environment
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

## Test Utilities

### Location: `src/test/utils.tsx`

#### React Query Helpers

```typescript
import { createTestQueryClient, renderWithProviders } from '@/test/utils';

// Create a test-specific QueryClient
const queryClient = createTestQueryClient();

// Render component with all providers (QueryClient, Router, etc.)
const { getByText } = renderWithProviders(<MyComponent />, { queryClient });
```

#### Mock Data Factories

```typescript
import {
  createMockProperty,
  createMockViolation,
  createMockSubscriptionPlan,
  createMockUserSubscription,
  createMockUsageTracking,
} from '@/test/utils';

// Create mock data with sensible defaults
const property = createMockProperty({
  address: '123 Main St',
  snap_score: 85,
});

const violation = createMockViolation({
  property_id: property.id,
  status: 'Open',
});
```

#### Mock Supabase Client

```typescript
import { createMockSupabaseClient } from '@/test/utils';

// Create a mock Supabase client for testing
const mockSupabase = createMockSupabaseClient({
  // Override specific methods as needed
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      data: mockProperties,
      error: null,
    })),
  })),
});
```

## Writing Tests

### Utility Function Tests

**Location**: `src/lib/__tests__/*.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { normalizePhone, formatCurrency } from '../utils';

describe('normalizePhone', () => {
  it('should normalize phone numbers', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('5551234567');
    expect(normalizePhone('555.123.4567')).toBe('5551234567');
  });

  it('should handle invalid input', () => {
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });
});
```

### Component Tests

**Example**: Testing a component that uses React Query

```typescript
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, createMockProperty } from '@/test/utils';
import { PropertyCard } from '@/components/PropertyCard';

describe('PropertyCard', () => {
  it('should display property information', () => {
    const property = createMockProperty({
      address: '123 Main St',
      city: 'Denver',
      snap_score: 85,
    });

    renderWithProviders(<PropertyCard property={property} />);

    expect(screen.getByText('123 Main St')).toBeInTheDocument();
    expect(screen.getByText('Denver')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
  });

  it('should handle click events', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const property = createMockProperty();

    renderWithProviders(
      <PropertyCard property={property} onClick={onClick} />
    );

    const card = screen.getByRole('button');
    await user.click(card);

    expect(onClick).toHaveBeenCalledWith(property);
  });
});
```

### Hook Tests

**Example**: Testing a React Query hook

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { TestProviders, createTestQueryClient } from '@/test/utils';
import { usePropertiesQuery } from '@/hooks/queries/usePropertiesQuery';
import * as supabaseClient from '@/integrations/supabase/client';

describe('usePropertiesQuery', () => {
  it('should fetch properties', async () => {
    const mockProperties = [createMockProperty(), createMockProperty()];

    vi.spyOn(supabaseClient, 'supabase', 'get').mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            range: vi.fn(() => Promise.resolve({
              data: mockProperties,
              error: null,
              count: 2,
            })),
          })),
        })),
      })),
    } as any);

    const { result } = renderHook(() => usePropertiesQuery(), {
      wrapper: ({ children }) => (
        <TestProviders queryClient={createTestQueryClient()}>
          {children}
        </TestProviders>
      ),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.data).toEqual(mockProperties);
    expect(result.current.data?.count).toBe(2);
  });
});
```

## Best Practices

### 1. Test User Behavior, Not Implementation

❌ **Bad**: Testing internal state
```typescript
expect(component.state.count).toBe(5);
```

✅ **Good**: Testing what the user sees
```typescript
expect(screen.getByText('Count: 5')).toBeInTheDocument();
```

### 2. Use Semantic Queries

Prefer queries that reflect how users interact:

**Priority order**:
1. `getByRole` - Accessibility first
2. `getByLabelText` - Form fields
3. `getByPlaceholderText` - Input hints
4. `getByText` - Text content
5. `getByTestId` - Last resort

```typescript
// ✅ Good
screen.getByRole('button', { name: 'Submit' });
screen.getByLabelText('Email address');

// ❌ Avoid
screen.getByTestId('submit-button');
```

### 3. Use userEvent Over fireEvent

❌ **Bad**: `fireEvent.click(button)`
✅ **Good**: `await user.click(button)`

`userEvent` simulates real user interactions more accurately.

### 4. Wait for Async Updates

```typescript
import { waitFor, screen } from '@testing-library/react';

// Wait for element to appear
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});

// Or use findBy queries (built-in waitFor)
const element = await screen.findByText('Loaded');
```

### 5. Mock External Dependencies

```typescript
import { vi } from 'vitest';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: [], error: null })),
    })),
  },
}));
```

### 6. Keep Tests Focused

Each test should verify **one specific behavior**:

```typescript
// ✅ Good - focused tests
it('should display error message on failed login', () => {
  // Test only error display
});

it('should clear form on successful login', () => {
  // Test only form clearing
});

// ❌ Bad - testing too much
it('should handle login flow', () => {
  // Tests error, success, form clearing, navigation, etc.
});
```

### 7. Use Descriptive Test Names

```typescript
// ✅ Good
it('should display validation error when email is invalid', () => {});
it('should disable submit button while request is pending', () => {});

// ❌ Bad
it('works', () => {});
it('test 1', () => {});
```

## Examples

### Testing Form Validation

```typescript
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { LoginForm } from '@/components/LoginForm';

describe('LoginForm', () => {
  it('should show validation error for invalid email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    const emailInput = screen.getByLabelText('Email');
    await user.type(emailInput, 'invalid-email');
    await user.tab(); // Trigger blur

    expect(screen.getByText('Invalid email address')).toBeInTheDocument();
  });

  it('should enable submit button when form is valid', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Password');
    const submitButton = screen.getByRole('button', { name: 'Sign In' });

    expect(submitButton).toBeDisabled();

    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'password123');

    expect(submitButton).toBeEnabled();
  });
});
```

### Testing API Calls with React Query

```typescript
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, createMockProperty } from '@/test/utils';
import { PropertyList } from '@/components/PropertyList';
import * as supabaseClient from '@/integrations/supabase/client';

describe('PropertyList', () => {
  it('should display loading state', () => {
    vi.spyOn(supabaseClient, 'supabase', 'get').mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            range: vi.fn(() => new Promise(() => {})), // Never resolves
          })),
        })),
      })),
    } as any);

    renderWithProviders(<PropertyList />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should display properties when loaded', async () => {
    const mockProperties = [
      createMockProperty({ address: '123 Main St' }),
      createMockProperty({ address: '456 Oak Ave' }),
    ];

    vi.spyOn(supabaseClient, 'supabase', 'get').mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            range: vi.fn(() => Promise.resolve({
              data: mockProperties,
              error: null,
              count: 2,
            })),
          })),
        })),
      })),
    } as any);

    renderWithProviders(<PropertyList />);

    await waitFor(() => {
      expect(screen.getByText('123 Main St')).toBeInTheDocument();
      expect(screen.getByText('456 Oak Ave')).toBeInTheDocument();
    });
  });

  it('should display error message on failure', async () => {
    vi.spyOn(supabaseClient, 'supabase', 'get').mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => ({
            range: vi.fn(() => Promise.resolve({
              data: null,
              error: { message: 'Network error' },
            })),
          })),
        })),
      })),
    } as any);

    renderWithProviders(<PropertyList />);

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });
});
```

### Testing Accessibility

```typescript
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { PropertyCard } from '@/components/PropertyCard';
import { createMockProperty } from '@/test/utils';

describe('PropertyCard Accessibility', () => {
  it('should have accessible button', () => {
    const property = createMockProperty();
    renderWithProviders(<PropertyCard property={property} />);

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAccessibleName();
  });

  it('should have semantic heading for address', () => {
    const property = createMockProperty({ address: '123 Main St' });
    renderWithProviders(<PropertyCard property={property} />);

    const heading = screen.getByRole('heading', { name: '123 Main St' });
    expect(heading).toBeInTheDocument();
  });

  it('should support keyboard navigation', async () => {
    const user = userEvent.setup();
    const property = createMockProperty();
    const onClick = vi.fn();

    renderWithProviders(<PropertyCard property={property} onClick={onClick} />);

    const button = screen.getByRole('button');
    button.focus();

    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalled();
  });
});
```

## Troubleshooting

### Common Issues

#### 1. "window is not defined"

**Cause**: Trying to access browser APIs in Node environment

**Fix**: Add mocks in `src/test/setup.ts`
```typescript
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});
```

#### 2. "Cannot read property of undefined" in Supabase calls

**Cause**: Supabase client not properly mocked

**Fix**: Use `createMockSupabaseClient()` or mock the module
```typescript
vi.mock('@/integrations/supabase/client', () => ({
  supabase: createMockSupabaseClient(),
}));
```

#### 3. Tests timeout waiting for queries

**Cause**: React Query retries failed requests

**Fix**: Disable retries in test QueryClient
```typescript
const queryClient = createTestQueryClient(); // Already has retry: false
```

#### 4. "Act" warnings

**Cause**: State updates happening outside of React Testing Library's scope

**Fix**: Wrap in `waitFor` or use `findBy` queries
```typescript
// ❌ Bad
expect(screen.getByText('Loaded')).toBeInTheDocument();

// ✅ Good
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});

// ✅ Also good
const element = await screen.findByText('Loaded');
```

#### 5. Import path errors with `@` alias

**Cause**: Vitest config doesn't match Vite config

**Fix**: Ensure `vitest.config.ts` has correct alias resolution
```typescript
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
},
```

## Coverage Goals

Target coverage thresholds:

- **Utilities**: 90%+ (pure functions are easy to test)
- **Hooks**: 80%+ (cover main paths and error cases)
- **Components**: 70%+ (focus on user interactions)
- **Integration**: 60%+ (complex flows, critical paths)

View coverage report:
```bash
npm run test:coverage
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
start coverage/index.html  # Windows
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Vitest UI](https://vitest.dev/guide/ui.html)

---

**Phase 5 Complete**: You now have a comprehensive testing infrastructure with utilities, mocks, and documentation to support test-driven development.
