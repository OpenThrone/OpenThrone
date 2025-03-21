import { ShareableArmyData } from "@/types/typings";

// Encoding Function
export function encodeBattleData(attacker: ShareableArmyData, defender: ShareableArmyData, turns: number): string | null {
  try {
    const payload = { attacker, defender, turns };
    const json = JSON.stringify(payload);
    return encodeURIComponent(Buffer.from(json).toString('base64'));
  } catch (err) {
    console.error("Encoding failed:", err);
    return null;
  }
}

// Decoding Function
export function decodeBattleData(encoded: string): { attacker: ShareableArmyData, defender: ShareableArmyData, turns: number } | null {
  try {
    const json = Buffer.from(decodeURIComponent(encoded), 'base64').toString();
    return JSON.parse(json);
  } catch (err) {
    console.error("Decoding failed:", err);
    return null;
  }
}