import { describe, expect, it } from 'bun:test';

import { parseEraCalibrationExportOptions } from './export-era-calibration';

describe('ERA calibration export CLI', () => {
  it('parses a completed-era export request', () => {
    const options = parseEraCalibrationExportOptions([
      '--era-id',
      '7',
      '--output',
      '/tmp/era-7.json',
    ]);

    expect(options.eraId).toBe(7);
    expect(options.output).toEndWith('/tmp/era-7.json');
  });

  it('rejects unsafe or incomplete CLI input', () => {
    expect(() => parseEraCalibrationExportOptions(['--era-id', '0'])).toThrow(
      '--era-id must be a positive safe integer',
    );
    expect(() =>
      parseEraCalibrationExportOptions(['--output', '/tmp/a']),
    ).toThrow('--era-id must be a positive safe integer');
  });
});
