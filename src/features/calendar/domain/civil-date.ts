export function validateYear(year: number): void {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError('Invalid civil exercise year');
  }
}

export function parseCivilDate(date: string): { year: number; month: number; day: number } {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RangeError('Invalid civil date: expected YYYY-MM-DD');
  }
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  validateYear(year);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maximum = daysInMonth[month - 1];
  if (maximum === undefined || day < 1 || day > maximum) {
    throw new RangeError('Invalid civil date');
  }
  return { year, month, day };
}
