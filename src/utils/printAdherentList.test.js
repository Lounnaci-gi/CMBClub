import { paginateItems } from './printAdherentList';

describe('paginateItems', () => {
  it('splits the list into pages of at most 20 items', () => {
    const items = Array.from({ length: 41 }, (_, index) => index);
    const pages = paginateItems(items);

    expect(pages.map(page => page.length)).toEqual([20, 20, 1]);
    expect(pages.flat()).toEqual(items);
  });

  it('returns no pages for an empty list', () => {
    expect(paginateItems([])).toEqual([]);
  });

  it('rejects invalid page sizes', () => {
    expect(() => paginateItems([], 0)).toThrow(RangeError);
    expect(() => paginateItems([], 1.5)).toThrow(RangeError);
  });
});
