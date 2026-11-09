import { speakWord } from "../services/speech";

let soundOn = true;

export function setTvSound(on: boolean) {
  soundOn = on;
}

export function sayWord(text: string) {
  if (soundOn) void speakWord(text, { profile: "kid" });
}
