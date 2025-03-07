import { calculateStrength } from './attackFunctions';
import UserModel from '../models/Users';

describe('calculateStrength', () => {
  it('should calculate the strength for offense units', () => {
    const user = new UserModel(null);
    user.units = [
      { type: 'OFFENSE', quantity: 5, level: 1 },
      { type: 'DEFENSE', quantity: 10, level: 1 },
    ];
    user.items = [
      user.items = [
        { type: 'WEAPON', level: 1, usage: 'OFFENSE', quantity: 2, name: 'Dagger', bonus: 25, cost: 12500, race: 'ALL', armoryLevel: 1 },
        { type: 'WEAPON', level: 2, usage: 'OFFENSE', quantity: 1, name: 'Hatchet', bonus: 50, cost: 25000, race: 'ALL', armoryLevel: 2 },
        { type: 'HELM', level: 1, usage: 'OFFENSE', quantity: 1, name: 'Padded Hood', bonus: 6, cost: 3000, race: 'ALL', armoryLevel: 1 },
      ];
  
      const strength = calculateStrength(user, 'OFFENSE');
      expect(strength.killingStrength).toBe(106);
    });
  
    it('should calculate the strength for defense units', () => {
      const user = new UserModel(null);
      user.units = [
        { type: 'OFFENSE', quantity: 5, level: 1 },
        { type: 'DEFENSE', quantity: 10, level: 1 },
      ];
      user.items = [
        { type: 'WEAPON', level: 1, usage: 'DEFENSE', quantity: 2, name: 'Sling', bonus: 25, cost: 12500, race: 'ALL', armoryLevel: 1 },
        { type: 'WEAPON', level: 2, usage: 'DEFENSE', quantity: 1, name: 'Hatchet', bonus: 50, cost: 25000, race: 'ALL', armoryLevel: 2 },
        { type: 'HELM', level: 1, usage: 'DEFENSE', quantity: 1, name: 'Padded Hood', bonus: 6, cost: 3000, race: 'ALL', armoryLevel: 1 },
      ];
  
      const strength = calculateStrength(user, 'DEFENSE');
      expect(strength.killingStrength).toBe(111);
    });
  it('should handle empty units and items', () => {
    const user = new UserModel(null);
    user.units = [];
    user.items = [];

    const strength = calculateStrength(user, 'OFFENSE');
    expect(strength).toBe(0);
  });
});