/**
 * Curated kid-safe starter packs. Emoji stands in for photos (no Google scrape).
 * Matched by category code/label keywords.
 */

export type StarterWord = {
  text: string;
  meaning: string;
  emoji: string;
  phonetic?: string;
  difficulty?: number;
};

const FAMILY: StarterWord[] = [
  { text: "mom", meaning: "a mother", emoji: "👩", difficulty: 1 },
  { text: "dad", meaning: "a father", emoji: "👨", difficulty: 1 },
  { text: "baby", meaning: "a very young child", emoji: "👶", difficulty: 1 },
  { text: "brother", meaning: "a boy sibling", emoji: "👦", difficulty: 1 },
  { text: "sister", meaning: "a girl sibling", emoji: "👧", difficulty: 1 },
  { text: "friend", meaning: "someone you like to play with", emoji: "🤝", difficulty: 1 },
  { text: "family", meaning: "people who live together and care for you", emoji: "👨‍👩‍👧", difficulty: 1 },
  { text: "grandma", meaning: "your mother's or father's mother", emoji: "👵", difficulty: 1 },
  { text: "grandpa", meaning: "your mother's or father's father", emoji: "👴", difficulty: 1 },
  { text: "teacher", meaning: "a person who helps children learn", emoji: "👩‍🏫", difficulty: 1 },
];

const ANIMALS: StarterWord[] = [
  { text: "cat", meaning: "a small furry pet", emoji: "🐱", difficulty: 1 },
  { text: "dog", meaning: "a friendly animal pet", emoji: "🐶", difficulty: 1 },
  { text: "bird", meaning: "an animal that can fly", emoji: "🐦", difficulty: 1 },
  { text: "fish", meaning: "an animal that lives in water", emoji: "🐟", difficulty: 1 },
  { text: "lion", meaning: "a big wild cat", emoji: "🦁", difficulty: 1 },
  { text: "elephant", meaning: "a very large animal with a trunk", emoji: "🐘", difficulty: 2 },
  { text: "monkey", meaning: "an animal that climbs trees", emoji: "🐵", difficulty: 1 },
  { text: "rabbit", meaning: "a soft animal with long ears", emoji: "🐰", difficulty: 1 },
  { text: "cow", meaning: "a farm animal that gives milk", emoji: "🐄", difficulty: 1 },
  { text: "horse", meaning: "a large animal people can ride", emoji: "🐴", difficulty: 1 },
];

const FRUITS: StarterWord[] = [
  { text: "apple", meaning: "a sweet round fruit", emoji: "🍎", difficulty: 1 },
  { text: "banana", meaning: "a long yellow fruit", emoji: "🍌", difficulty: 1 },
  { text: "mango", meaning: "a sweet tropical fruit", emoji: "🥭", difficulty: 1 },
  { text: "orange", meaning: "a round citrus fruit", emoji: "🍊", difficulty: 1 },
  { text: "grapes", meaning: "small sweet fruits in a bunch", emoji: "🍇", difficulty: 1 },
  { text: "watermelon", meaning: "a big juicy fruit", emoji: "🍉", difficulty: 2 },
  { text: "strawberry", meaning: "a small red sweet fruit", emoji: "🍓", difficulty: 2 },
  { text: "pineapple", meaning: "a tropical fruit with a spiky top", emoji: "🍍", difficulty: 2 },
  { text: "carrot", meaning: "an orange vegetable", emoji: "🥕", difficulty: 1 },
  { text: "tomato", meaning: "a red fruit used like a vegetable", emoji: "🍅", difficulty: 1 },
];

const COLORS: StarterWord[] = [
  { text: "red", meaning: "the color of an apple", emoji: "🔴", difficulty: 1 },
  { text: "blue", meaning: "the color of the sky", emoji: "🔵", difficulty: 1 },
  { text: "green", meaning: "the color of grass", emoji: "🟢", difficulty: 1 },
  { text: "yellow", meaning: "the color of a banana", emoji: "🟡", difficulty: 1 },
  { text: "orange", meaning: "a bright warm color", emoji: "🟠", difficulty: 1 },
  { text: "purple", meaning: "a mix of blue and red", emoji: "🟣", difficulty: 1 },
  { text: "circle", meaning: "a round shape", emoji: "⚪", difficulty: 1 },
  { text: "square", meaning: "a shape with four equal sides", emoji: "⬜", difficulty: 1 },
  { text: "triangle", meaning: "a shape with three sides", emoji: "🔺", difficulty: 1 },
  { text: "star", meaning: "a shape with points", emoji: "⭐", difficulty: 1 },
];

const BODY: StarterWord[] = [
  { text: "hand", meaning: "the part of the body at the end of the arm", emoji: "✋", difficulty: 1 },
  { text: "foot", meaning: "the part of the body you stand on", emoji: "🦶", difficulty: 1 },
  { text: "eye", meaning: "the body part you see with", emoji: "👁️", difficulty: 1 },
  { text: "ear", meaning: "the body part you hear with", emoji: "👂", difficulty: 1 },
  { text: "nose", meaning: "the body part you smell with", emoji: "👃", difficulty: 1 },
  { text: "mouth", meaning: "the body part you eat and talk with", emoji: "👄", difficulty: 1 },
  { text: "head", meaning: "the top part of your body", emoji: "🗣️", difficulty: 1 },
  { text: "arm", meaning: "the part between shoulder and hand", emoji: "💪", difficulty: 1 },
  { text: "leg", meaning: "the part you walk with", emoji: "🦵", difficulty: 1 },
  { text: "hair", meaning: "grows on your head", emoji: "💇", difficulty: 1 },
];

const SCHOOL: StarterWord[] = [
  { text: "book", meaning: "pages you can read", emoji: "📖", difficulty: 1 },
  { text: "pencil", meaning: "a tool for writing", emoji: "✏️", difficulty: 1 },
  { text: "bag", meaning: "something that holds your things", emoji: "🎒", difficulty: 1 },
  { text: "school", meaning: "a place where children learn", emoji: "🏫", difficulty: 1 },
  { text: "desk", meaning: "a table for school work", emoji: "🪑", difficulty: 1 },
  { text: "crayon", meaning: "a colorful stick for drawing", emoji: "🖍️", difficulty: 1 },
  { text: "paper", meaning: "a thin sheet to write on", emoji: "📄", difficulty: 1 },
  { text: "eraser", meaning: "something that removes pencil marks", emoji: "🧼", difficulty: 2 },
  { text: "ruler", meaning: "a tool for measuring lines", emoji: "📏", difficulty: 1 },
  { text: "glue", meaning: "something sticky used to join paper", emoji: "🧴", difficulty: 1 },
];

const HOUSEHOLD: StarterWord[] = [
  { text: "chair", meaning: "a seat with a back", emoji: "🪑", difficulty: 1 },
  { text: "table", meaning: "a flat top with legs", emoji: "🪵", difficulty: 1 },
  { text: "bed", meaning: "a place to sleep", emoji: "🛏️", difficulty: 1 },
  { text: "door", meaning: "an opening you walk through", emoji: "🚪", difficulty: 1 },
  { text: "window", meaning: "glass you look through", emoji: "🪟", difficulty: 1 },
  { text: "cup", meaning: "something you drink from", emoji: "🥤", difficulty: 1 },
  { text: "spoon", meaning: "a tool for eating soft food", emoji: "🥄", difficulty: 1 },
  { text: "plate", meaning: "a flat dish for food", emoji: "🍽️", difficulty: 1 },
  { text: "lamp", meaning: "a light for a room", emoji: "💡", difficulty: 1 },
  { text: "clock", meaning: "shows the time", emoji: "🕐", difficulty: 1 },
];

const FOOD: StarterWord[] = [
  { text: "milk", meaning: "a white drink from cows", emoji: "🥛", difficulty: 1 },
  { text: "bread", meaning: "food made from flour", emoji: "🍞", difficulty: 1 },
  { text: "water", meaning: "a clear drink", emoji: "💧", difficulty: 1 },
  { text: "rice", meaning: "small grains people cook and eat", emoji: "🍚", difficulty: 1 },
  { text: "egg", meaning: "food from a hen", emoji: "🥚", difficulty: 1 },
  { text: "cheese", meaning: "a food made from milk", emoji: "🧀", difficulty: 1 },
  { text: "juice", meaning: "a drink made from fruit", emoji: "🧃", difficulty: 1 },
  { text: "cookie", meaning: "a sweet baked snack", emoji: "🍪", difficulty: 1 },
  { text: "soup", meaning: "a warm liquid food", emoji: "🍲", difficulty: 1 },
  { text: "butter", meaning: "a soft yellow food from milk", emoji: "🧈", difficulty: 2 },
];

const NATURE: StarterWord[] = [
  { text: "sun", meaning: "the bright light in the day sky", emoji: "☀️", difficulty: 1 },
  { text: "moon", meaning: "the light in the night sky", emoji: "🌙", difficulty: 1 },
  { text: "rain", meaning: "water that falls from clouds", emoji: "🌧️", difficulty: 1 },
  { text: "tree", meaning: "a tall plant with a trunk", emoji: "🌳", difficulty: 1 },
  { text: "flower", meaning: "a colorful part of a plant", emoji: "🌸", difficulty: 1 },
  { text: "cloud", meaning: "a white shape in the sky", emoji: "☁️", difficulty: 1 },
  { text: "star", meaning: "a tiny light in the night sky", emoji: "⭐", difficulty: 1 },
  { text: "river", meaning: "water that flows across land", emoji: "🏞️", difficulty: 2 },
  { text: "leaf", meaning: "a green part of a plant", emoji: "🍃", difficulty: 1 },
  { text: "wind", meaning: "moving air you can feel", emoji: "💨", difficulty: 1 },
];

const ACTION: StarterWord[] = [
  { text: "run", meaning: "to move fast on your feet", emoji: "🏃", difficulty: 1 },
  { text: "jump", meaning: "to push up off the ground", emoji: "🦘", difficulty: 1 },
  { text: "eat", meaning: "to take food into your mouth", emoji: "😋", difficulty: 1 },
  { text: "drink", meaning: "to take liquid into your mouth", emoji: "🥤", difficulty: 1 },
  { text: "sleep", meaning: "to rest with your eyes closed", emoji: "😴", difficulty: 1 },
  { text: "play", meaning: "to have fun with toys or friends", emoji: "🎮", difficulty: 1 },
  { text: "read", meaning: "to look at words and understand them", emoji: "📖", difficulty: 1 },
  { text: "sing", meaning: "to make music with your voice", emoji: "🎤", difficulty: 1 },
  { text: "dance", meaning: "to move your body to music", emoji: "💃", difficulty: 1 },
  { text: "walk", meaning: "to move on your feet slowly", emoji: "🚶", difficulty: 1 },
];

const PACKS: Array<{ keys: string[]; words: StarterWord[]; emoji: string }> = [
  { keys: ["FAMILY", "PEOPLE", "PARENT"], words: FAMILY, emoji: "👨‍👩‍👧" },
  { keys: ["ANIMAL"], words: ANIMALS, emoji: "🐾" },
  { keys: ["FRUIT", "VEGETABLE", "VEGGIE"], words: FRUITS, emoji: "🍎" },
  { keys: ["COLOR", "COLOUR", "SHAPE"], words: COLORS, emoji: "🎨" },
  { keys: ["BODY"], words: BODY, emoji: "🧍" },
  { keys: ["SCHOOL", "CLASS", "TEACHER"], words: SCHOOL, emoji: "🏫" },
  { keys: ["HOUSE", "HOME", "OBJECT", "HOUSEHOLD"], words: HOUSEHOLD, emoji: "🏠" },
  { keys: ["FOOD", "DRINK", "SNACK"], words: FOOD, emoji: "🍽️" },
  { keys: ["NATURE", "ENVIRON", "WEATHER"], words: NATURE, emoji: "🌿" },
  { keys: ["ACTION", "VERB"], words: ACTION, emoji: "⚡" },
];

export function resolveStarterPack(
  code: string,
  label: string
): { key: string; emoji: string; words: StarterWord[] } | null {
  const hay = `${code} ${label}`.toUpperCase();
  for (const pack of PACKS) {
    if (pack.keys.some((k) => hay.includes(k))) {
      return { key: pack.keys[0], emoji: pack.emoji, words: pack.words };
    }
  }
  return null;
}

export function listStarterPackThemes() {
  return PACKS.map((p) => ({
    keys: p.keys,
    wordCount: p.words.length,
    sample: p.words.slice(0, 3).map((w) => w.text),
    emoji: p.emoji,
  }));
}
