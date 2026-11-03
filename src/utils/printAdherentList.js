export function paginateItems(items, pageSize = 20) {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError('La taille de page doit être un entier positif.');
  }

  const pages = [];
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize));
  }
  return pages;
}
