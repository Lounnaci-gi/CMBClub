import { CATEGORIES, getThemedCategory } from './categories';

describe('getThemedCategory', () => {
  it('uses the active theme color without changing the source category', () => {
    const senior = CATEGORIES.find(category => category.label === 'Sénior');
    const originalColor = senior.color;

    expect(getThemedCategory(senior, { catSenior: '#DC2626' }).color).toBe('#DC2626');
    expect(senior.color).toBe(originalColor);
  });

  it('keeps the original category when no theme color exists', () => {
    const junior = CATEGORIES.find(category => category.label === 'Junior');

    expect(getThemedCategory(junior, {})).toBe(junior);
    expect(getThemedCategory(null, {})).toBeNull();
  });
});