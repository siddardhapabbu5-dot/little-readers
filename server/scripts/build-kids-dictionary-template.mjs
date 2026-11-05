import * as XLSX from "xlsx";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = join(root, "docs", "templates");

const rows = [
  { headword: "mom", definition: "a mother", pos: "noun", example: "Mom reads a book." },
  { headword: "dad", definition: "a father", pos: "noun", example: "Dad smiles." },
  { headword: "baby", definition: "a very young child", pos: "noun", example: "The baby sleeps." },
  { headword: "brother", definition: "a boy sibling", pos: "noun", example: "My brother plays." },
  { headword: "sister", definition: "a girl sibling", pos: "noun", example: "My sister sings." },
  { headword: "friend", definition: "someone you like to play with", pos: "noun", example: "I meet my friend." },
  { headword: "teacher", definition: "a person who helps children learn", pos: "noun", example: "The teacher helps us." },
  { headword: "cat", definition: "a small furry pet", pos: "noun", example: "The cat sits." },
  { headword: "dog", definition: "a friendly animal pet", pos: "noun", example: "The dog runs." },
  { headword: "bird", definition: "an animal that can fly", pos: "noun", example: "A bird sings." },
  { headword: "fish", definition: "an animal that lives in water", pos: "noun", example: "The fish swims." },
  { headword: "lion", definition: "a big wild cat", pos: "noun", example: "The lion roars." },
  { headword: "apple", definition: "a sweet fruit", pos: "noun", example: "I eat an apple." },
  { headword: "banana", definition: "a long yellow fruit", pos: "noun", example: "A banana is soft." },
  { headword: "mango", definition: "a sweet tropical fruit", pos: "noun", example: "The mango is ripe." },
  { headword: "milk", definition: "a white drink from cows", pos: "noun", example: "I drink milk." },
  { headword: "bread", definition: "food made from flour", pos: "noun", example: "We eat bread." },
  { headword: "water", definition: "a clear drink", pos: "noun", example: "Drink water." },
  { headword: "red", definition: "the color of an apple", pos: "adjective", example: "A red ball." },
  { headword: "blue", definition: "the color of the sky", pos: "adjective", example: "A blue sky." },
  { headword: "green", definition: "the color of grass", pos: "adjective", example: "Green leaves." },
  { headword: "yellow", definition: "the color of a banana", pos: "adjective", example: "A yellow sun." },
  { headword: "circle", definition: "a round shape", pos: "noun", example: "Draw a circle." },
  { headword: "square", definition: "a shape with four equal sides", pos: "noun", example: "A square block." },
  { headword: "hand", definition: "the part of the body at the end of the arm", pos: "noun", example: "Wave your hand." },
  { headword: "foot", definition: "the part of the body you stand on", pos: "noun", example: "My foot is small." },
  { headword: "eye", definition: "the body part you see with", pos: "noun", example: "Close your eyes." },
  { headword: "ear", definition: "the body part you hear with", pos: "noun", example: "Listen with your ears." },
  { headword: "nose", definition: "the body part you smell with", pos: "noun", example: "Touch your nose." },
  { headword: "mouth", definition: "the body part you eat and talk with", pos: "noun", example: "Open your mouth." },
  { headword: "book", definition: "pages you can read", pos: "noun", example: "Read a book." },
  { headword: "pencil", definition: "a tool for writing", pos: "noun", example: "Use a pencil." },
  { headword: "bag", definition: "something that holds your things", pos: "noun", example: "Carry your bag." },
  { headword: "school", definition: "a place where children learn", pos: "noun", example: "I go to school." },
  { headword: "chair", definition: "a seat with a back", pos: "noun", example: "Sit on the chair." },
  { headword: "table", definition: "a flat top with legs", pos: "noun", example: "Food is on the table." },
  { headword: "bed", definition: "a place to sleep", pos: "noun", example: "Go to bed." },
  { headword: "door", definition: "an opening you walk through", pos: "noun", example: "Open the door." },
  { headword: "sun", definition: "the bright light in the day sky", pos: "noun", example: "The sun is warm." },
  { headword: "moon", definition: "the light in the night sky", pos: "noun", example: "See the moon." },
  { headword: "rain", definition: "water that falls from clouds", pos: "noun", example: "The rain falls." },
  { headword: "tree", definition: "a tall plant with a trunk", pos: "noun", example: "Climb the tree." },
  { headword: "flower", definition: "a colorful part of a plant", pos: "noun", example: "Smell the flower." },
  { headword: "run", definition: "to move fast on your feet", pos: "verb", example: "I run fast." },
  { headword: "jump", definition: "to push up off the ground", pos: "verb", example: "Jump high." },
  { headword: "eat", definition: "to take food into your mouth", pos: "verb", example: "Eat an apple." },
  { headword: "drink", definition: "to take liquid into your mouth", pos: "verb", example: "Drink water." },
  { headword: "sleep", definition: "to rest with your eyes closed", pos: "verb", example: "Babies sleep." },
  { headword: "play", definition: "to have fun with toys or friends", pos: "verb", example: "We play outside." },
  { headword: "read", definition: "to look at words and understand them", pos: "verb", example: "I read a story." },
];

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

mkdirSync(dir, { recursive: true });

const ws = XLSX.utils.json_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "KidsDictionary");
const xlsxPath = join(dir, "little-readers-kids-dictionary-template.xlsx");
XLSX.writeFile(wb, xlsxPath);

const csv = [
  "headword,definition,pos,example",
  ...rows.map((r) =>
    [r.headword, r.definition, r.pos, r.example].map(csvEscape).join(",")
  ),
].join("\n");
writeFileSync(join(dir, "little-readers-kids-dictionary-template.csv"), `${csv}\n`, "utf8");

const readme = `# Little Readers — Kids Dictionary Upload Template

Use this file in **Admin → Vocabulary → Dictionary → Grades**.

## Files
- \`little-readers-kids-dictionary-template.xlsx\` (recommended)
- \`little-readers-kids-dictionary-template.csv\`

## Columns
| Column | Required | Notes |
|--------|----------|-------|
| headword | Yes | The English word |
| definition | Yes | Short child-friendly meaning |
| pos | Optional | noun / verb / adjective |
| example | Optional | One simple sentence |

## Upload steps
1. Open website Admin (\`http://localhost:3100\`)
2. Go to **Dictionary → Grades**
3. Source name: \`Little Readers Kids Starter\`
4. Licence: \`Project-owned sample template for Little Readers\`
5. Upload the xlsx or csv
6. Click **Classify**
7. Review **Pending suggestions**
8. **Approve** then **Publish** good rows
9. Create lessons from published words if needed

## Tips
- Keep meanings short and age-appropriate.
- Add more rows using the same column headers.
- Start with 50–500 words, not a huge adult dictionary.
- Do not upload copyrighted commercial dictionary dumps.
`;
writeFileSync(join(dir, "README.md"), readme, "utf8");

console.log(`Wrote ${rows.length} sample rows to ${dir}`);
