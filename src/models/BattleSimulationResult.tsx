import type { PlayerUnit } from '@/types/typings';

class BattleSimulationResult {
  Result: string; // Either 'Win' or 'Lost'
  Experience: {
    Attacker: number;
    Defender: number;
  };

  constructor() {
    this.Result = '';
    this.Experience = {
      Attacker: 0,
      Defender: 0,
    };
  }
}

export default BattleSimulationResult;
