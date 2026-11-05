# Little Readers — Vocabulary upload & download templates

Use these from **phone Admin** (Vocabulary Manager) or **website Admin**.

## 0) A–Z alphabet sheet (Symbol + Word + Example Sentence)

**Files**
- `A_to_Z_Alphabet_with_Symbols.xlsx` (preferred)
- `A_to_Z_Alphabet_with_Symbols.csv`

### Columns
| Column | Required | Notes |
|--------|----------|-------|
| Capital Letter | Recommended | Used for sort order / phonetic |
| Small Letter | Optional | Combined with capital as phonetic |
| Symbol | Optional | Use a real emoji (🍎). Excel Wingdings/private glyphs show as □ on phones and are auto-replaced by word/letter emoji |
| Word | Yes | Headword (e.g. Apple) |
| Example Sentence | Recommended | Stored as the kid-friendly meaning |

### How to upload
1. **Structure** → create/select the target category (e.g. Alphabet)
2. **Vocabulary Manager** → select that **category** chip
3. **Upload sheet** → pick this XLSX (or CSV)
4. Words land in the selected category (create or update by word text)

### How to download the live version
1. Vocabulary Manager → select **ABC Learning** (or other A–Z category)
2. **Download CSV** → exports the **live** A–Z sheet (`Capital Letter, Small Letter, Symbol, Word, Example Sentence`) with real emoji (UTF-8)
3. Do not reuse an old Downloads copy of the original Excel — that file had private font glyphs that show as □ on phones

Does **not** invent new categories. Grade/level CSV still works for bulk edits across the tree.

---

## 1) Grade / level / category word sheet (recommended for bulk edit)

**File:** `little-readers-words-by-grade-level-template.csv`

Use this when you want to **download existing words**, edit in Excel, and **upload back** without scrolling the app.

### Columns
| Column | Required | Notes |
|--------|----------|-------|
| grade_code | Yes | `GRADE_1` … `GRADE_4` |
| level_code | Yes | e.g. `LEVEL_1` |
| group_code | Optional | e.g. `A` or `B` (helps disambiguate) |
| category_code **or** category_label | Yes | Must match an existing category (app does not invent categories) |
| word | Yes | Headword |
| meaning | Yes | Short child-friendly meaning |
| emoji, phonetic, difficulty, sort_order, is_active | Optional | Defaults applied if blank |
| grade_label, level_label, group_label, origin | Optional | For humans; ignored on match except codes/labels above |

### Download what you already have
1. Phone: **Vocabulary → Vocabulary Manager**
2. Pick **GRADE_1** (or other grade)
3. Optional: pick a **category** chip (e.g. Family and People) so you only export that set
4. Tap **Download CSV**
5. Open the file in Excel / Google Sheets

### Upload edits
1. Keep the header row exactly
2. Only use grades/levels/categories that already exist under **Structure**
3. Phone: **Upload grade/level CSV** (same Vocabulary Manager screen)
4. Or website: **Manage Words → Upload sheet**

Upload **updates** a word if the same `word` already exists in that category; otherwise **creates** it. It does **not** delete words.

---

## 2) Kids dictionary starter (classify → approve → publish)

**Files**
- `little-readers-kids-dictionary-template.xlsx`
- `little-readers-kids-dictionary-template.csv`

### Columns
| Column | Required | Notes |
|--------|----------|-------|
| headword | Yes | The English word |
| definition | Yes | Short child-friendly meaning |
| pos | Optional | noun / verb / adjective |
| example | Optional | One simple sentence |

This path goes through **Dictionary → Classify → Approve → Publish** (AI suggestions never auto-publish).

### Phone
1. **Vocabulary → Dictionary upload**
2. Optional: clear old published words first
3. Upload starter or pick CSV/XLSX
4. Classify → Approve all → Publish all

### Website
1. Admin → Dictionary
2. Upload → Classify → Pending → Approve → Publish

---

## Tips
- Prefer the **A–Z alphabet XLSX** when filling one category with letter words + emoji symbols.
- Prefer the **grade/level sheet** for fixing Family and People (or mixed categories) without endless scrolling.
- Keep meanings short and age-appropriate.
- Do not upload copyrighted commercial dictionary dumps.
- Categories must already exist in Structure (Publish empty categories first if needed).
