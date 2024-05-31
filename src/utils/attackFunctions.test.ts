import { calculateStrength } from './attackFunctions';
import UserModel from '../models/Users';

describe('calculateStrength', () => {
  it('should calculate the strength for offense units', () => {
    const user = new UserModel(null);
    user.units = [
      { type: 'OFFENSE', quantity: 5 },
      { type: 'DEFENSE', quantity: 10 },
    ];
    user.items = [
      { type: 'WEAPON', level: 1, usage: 'OFFENSE', quantity: 2 },
      { type: 'WEAPON', level: 2, usage: 'OFFENSE', quantity: 1 },
      { type: 'HELM', level: 1, usage: 'OFFENSE', quantity: 1 },
    ];

    const strength = calculateStrength(user, 'OFFENSE');
    expect(strength).toBe(106);
  });

  it('should calculate the strength for defense units', () => {
    const user = new UserModel(null);
    user.units = [
      { type: 'OFFENSE', quantity: 5 },
      { type: 'DEFENSE', quantity: 10 },
    ];
    user.items = [
      { type: 'WEAPON', level: 1, usage: 'DEFENSE', quantity: 2 },
      { type: 'WEAPON', level: 2, usage: 'DEFENSE', quantity: 1 },
      { type: 'HELM', level: 1, usage: 'DEFENSE', quantity: 1 },
    ];

    const strength = calculateStrength(user, 'DEFENSE');
    expect(strength).toBe(112); 
  });

  it('should handle empty units and items', () => {
    const user = new UserModel(null);
    user.units = [];
    user.items = [];

    const strength = calculateStrength(user, 'OFFENSE');
    expect(strength).toBe(0);
  });
});