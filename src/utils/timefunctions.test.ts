import { getTimeRemaining } from './timefunctions';

describe('getTimeRemaining', () => {
  it('should return the correct time remaining', () => {
    const endtime = '2022-12-31T23:59:59Z';
    const currentTime = new Date('2022-12-31T12:00:00Z');
    jest.spyOn(global, 'Date').mockImplementation(() => currentTime as any);

    const expectedTimeRemaining = {
      total: Date.parse(endtime) - currentTime.getTime(),
      days: 0,
      hours: 11,
      minutes: 59,
      seconds: 59,
    };

    expect(getTimeRemaining(endtime)).toEqual(expectedTimeRemaining);
  });

  // Add more test cases for different endtime values and expected results
});