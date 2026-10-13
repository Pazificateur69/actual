import {
  clearServer,
  initServer,
} from '@actual-app/core/platform/client/connection';
import type {
  CategoryEntity,
  CategoryGroupEntity,
  RuleConditionEntity,
  SpendingEntity,
} from '@actual-app/core/types/models';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSpendingSpreadsheet,
  getSpendingBudgetFilters,
} from './spending-spreadsheet';

vi.mock(
  '@actual-app/core/platform/client/connection',
  () => import('#mocks/connection'),
);

const categoryGroups = [
  { id: 'group-bills', name: 'Bills' },
  { id: 'group-fun', name: 'Fun Money' },
] satisfies CategoryGroupEntity[];

const categories = [
  { id: 'cat-rent', name: 'Rent', group: 'group-bills' },
  { id: 'cat-electric', name: 'Electric', group: 'group-bills' },
  { id: 'cat-dining', name: 'Dining Out', group: 'group-fun' },
] satisfies CategoryEntity[];

describe('getSpendingBudgetFilters', () => {
  it('filters budget categories by category group', () => {
    const result = getSpendingBudgetFilters({
      categories,
      categoryGroups,
      conditions: [
        {
          field: 'category_group',
          op: 'is',
          value: 'group-bills',
        },
      ] satisfies RuleConditionEntity[],
    });

    expect(result).toEqual([
      { category: { $oneof: ['cat-rent', 'cat-electric'] } },
    ]);
  });

  it('does not filter budgets when no category condition is present', () => {
    const result = getSpendingBudgetFilters({
      categories,
      categoryGroups,
      conditions: [
        {
          field: 'account',
          op: 'is',
          value: 'account-checking',
        },
      ] satisfies RuleConditionEntity[],
    });

    expect(result).toEqual([]);
  });

  it('filters budget categories by direct category IDs', () => {
    const result = getSpendingBudgetFilters({
      categories,
      categoryGroups,
      conditions: [
        {
          field: 'category',
          op: 'oneOf',
          value: ['cat-rent', 'cat-dining'],
        },
      ] satisfies RuleConditionEntity[],
    });

    expect(result).toEqual([
      { category: { $oneof: ['cat-rent', 'cat-dining'] } },
    ]);
  });
});

describe('createSpendingSpreadsheet', () => {
  afterEach(async () => {
    await clearServer();
  });

  it('excludes income categories from the budgeted total', async () => {
    initServer({
      'make-filters-from-conditions': async () => ({ filters: [] }),
      'get-categories': async () => ({
        grouped: [],
        list: [
          { id: 'cat-food', name: 'Food', group: 'group-expenses' },
          {
            id: 'cat-salary',
            name: 'Salary',
            group: 'group-income',
            is_income: true,
          },
        ],
      }),
      query: async (query: { table: string }) => ({
        data:
          query.table === 'reflect_budgets'
            ? [
                { category: 'cat-food', amount: 10000 },
                { category: 'cat-salary', amount: 50000 },
              ]
            : [],
        dependencies: [],
      }),
    });

    let report: SpendingEntity | undefined;
    await createSpendingSpreadsheet({
      compare: '2026-04',
      compareTo: '2026-03',
      budgetType: 'tracking',
    })(undefined as never, data => {
      report = data;
    });

    // The last day bucket holds the full month's budget.
    expect(report?.intervalData.at(-1)?.budget).toBeCloseTo(-10000);
  });
});
