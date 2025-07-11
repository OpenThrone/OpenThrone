import { calculateStrength } from './attackFunctions';
import UserModel from '../models/Users';
import MockUserGenerator from './MockUserGenerator';

const user = new MockUserGenerator();
    user.setBasicInfo({
      email: 'test@example.com',
      display_name: 'Test User',
      race: 'HUMAN',
      class: 'FIGHTER',
    });
describe('calculateStrength', () => {
  it('should calculate the strength for offense units', () => {
    user.clearItems();
    user.clearUnits();
    user.addUnits([
      { type: 'OFFENSE', quantity: 5, level: 1 },
      { type: 'DEFENSE', quantity: 10, level: 1 },
    ]);
    user.addItems([
      { type: 'WEAPON', level: 1, usage: 'OFFENSE', quantity: 2 },
      { type: 'WEAPON', level: 2, usage: 'OFFENSE', quantity: 1 },
      { type: 'HELM', level: 1, usage: 'OFFENSE', quantity: 1 },
    ]);
    const userModel = new UserModel(user.getUser());
    const strength = calculateStrength(userModel, 'OFFENSE');
    expect(strength.killingStrength).toBe(28);
  });

  it('should calculate the strength for defense units', () => {
    user.clearItems();
    user.clearUnits();
    user.addUnits([
      { type: 'OFFENSE', quantity: 5, level: 1 },
      { type: 'DEFENSE', quantity: 10, level: 1 },
    ]);
    user.addItems([
      { type: 'WEAPON', level: 1, usage: 'DEFENSE', quantity: 2 },
      { type: 'WEAPON', level: 2, usage: 'DEFENSE', quantity: 1 },
      { type: 'HELM', level: 1, usage: 'DEFENSE', quantity: 1 },
    ]);
    const userModel = new UserModel(user.getUser());
    const strength = calculateStrength(userModel, 'DEFENSE');
    expect(strength.killingStrength).toBe(32);
  });
  it('should handle empty units and items', () => {
    user.clearItems();
    user.clearUnits();
    user.addUnits([]);
    user.addItems([]);
    const userModel = new UserModel(user.getUser());
    const strength = calculateStrength(userModel, 'OFFENSE');
    expect(strength.killingStrength).toBe(0);
    });
  it('should handle empty units and items', () => {
    user.clearItems();
    user.clearUnits();
    const userModel = new UserModel(user.getUser());

    const strength = calculateStrength(userModel, 'OFFENSE');
    expect(strength.killingStrength).toBe(0);
    expect(strength.defenseStrength).toBe(0);
  });
});