import { toLocale } from './numberFormatting';

describe('toLocale', () => {
  it('should format a number to the specified locale', () => {
    const num = 1234567;
    const formattedNum = toLocale(num, 'en-US');
    expect(formattedNum).toBe('1,234,567');
  });

  it('should format a string number to the specified locale', () => {
    const num = '9876543';
    const formattedNum = toLocale(num, 'en-US');
    expect(formattedNum).toBe('9,876,543');
  });

  it('should format a string number with commas to the specified locale', () => {
    const num = '1,234,567';
    const formattedNum = toLocale(num, 'en-US');
    expect(formattedNum).toBe('1,234,567');
    const formattedNumInES = toLocale(num, 'es-ES');
    expect(formattedNumInES).toBe('1.234.567');
  });

  it('should format a bigint number to the specified locale', () => {
    const num = BigInt('12345678901234567890');
    const formattedNum = toLocale(num, 'en-US');
    expect(formattedNum).toBe('12.000 Quintillion');
  });

  it('should format a large string number to human-readable format', () => {
    const num = '12345678901234567890';
    const formattedNum = toLocale(num, 'en-US');
    expect(formattedNum).toBe('12.000 Quintillion');
  });

  it('should return "0" for invalid input', () => {
    const num = 'invalid number';
    const formattedNum = toLocale(num, 'en-US');
    expect(formattedNum).toBe('0');
  });
});