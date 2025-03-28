import { ShareableArmyData } from "@/types/typings";
import LZString from "lz-string";

// Encoding Function
export function encodeBattleData(attacker: ShareableArmyData, defender: ShareableArmyData, turns: number): string | null {
  try {
    const payload = { attacker, defender, turns };
    const json = JSON.stringify(payload);
    console.log('json', json)
    return LZString.compressToEncodedURIComponent(json);
  } catch (err) {
    logError("Encoding failed:", err);
    return null;
  }
}

// Decoding Function
export function decodeBattleData(encoded: string): { attacker: ShareableArmyData, defender: ShareableArmyData, turns: number } | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    return JSON.parse(json);
  } catch (err) {
    logError("Decoding failed:", err);
    return null;
  }
}