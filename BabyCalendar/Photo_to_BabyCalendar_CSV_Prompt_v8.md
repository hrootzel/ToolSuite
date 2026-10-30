# Reusable prompt: Maxim's Log photo → BabyCalendar CSV

I am attaching one or more photographs of handwritten **Maxim's Log** sheets. Convert them into an **import-ready CSV file** for my BabyCalendar app. **First do your best to transcribe the photos and generate the CSV**, then ask targeted questions about genuinely ambiguous entries.

## Sheet layout to expect

Each sheet is a tall daily log strip. It contains:

- a title header (`Maxim's Log`)
- a handwritten `Start Date:` line
- optional weekday checkboxes
- **30 numbered rows**, labeled subtly `01` through `30` in tiny OCR-friendly monospaced text in the **left strip margin** just outside the table
- a **Time** column with guided full-height `HH:MM` cells and stacked `AM` / `PM` checkboxes
- an **Activity** column with **five full-height activity cells**
- a **Notes** line for each row

The activity icons appear in the header only, and their order is **left to right**:

1. 🌞 = `sleep-end`, label `Sleep End`, emoji 🌞 (**Wake**)
2. 🌛 = `sleep-start`, label `Sleep Start`, emoji 🌛 (**Sleep**)
3. 🍼 = `feeding`, label `Feeding`, emoji 🍼
4. 💦 = `pee`, label `Pee`, emoji 💧
5. 💩 = `poo`, label `Poo`, emoji 💩

There may also be smaller faint watermark icons inside each activity cell. Treat those as printed guides only. Only a handwritten check mark, X, slash, or other deliberate mark indicates that the activity happened.

## How to interpret each row

- Read the handwritten time from the `HH:MM` cells.
- Read whether `AM` or `PM` is checked.
- Determine which activity cells are marked.
- Read the handwritten notes on the same row.
- **Create one CSV record per marked activity cell.**
- If multiple activity cells are marked in one row, create multiple CSV records that share the same timestamp.
- Never invent an event from an unmarked activity cell.
- If a row has a time/date but **no marked activity**, create one `other` event instead:
  - `event_type_id = other`
  - `label = Other`
  - `emoji = ⭐`

## Dates, chronology, and overnight rollover

Read the main **Start Date** from the header. The Start Date is the date for **row 01**. Later rows may belong to the following day.

Assume rows are **chronological from top to bottom**.

Start with `current_date = Start Date`.

When `AM/PM` is missing or appears inconsistent, infer the most plausible interpretation from the surrounding rows so that chronological order is preserved whenever possible.

Examples:

- If `PM/AM` is omitted, assume it follows the most plausible progression from the previous row.
- If a 12-hour time is obviously mislabeled, let chronology win. Example: `11:00pm, 12:05pm, 1:00am` should interpret `12:05pm` as **12:05am** (midnight), not noon.
- Similar for sequences like `11:50am, 12:10, 1:00pm`: infer `12:10pm` if missing.
- There may be occasional out-of-order entries, but those should be treated as rare exceptions and flagged in the transcription review rather than forcing a wrong rollover.

Advance `current_date` by one day when the sequence clearly crosses midnight, typically from a late PM entry to a subsequent early AM entry. Ignore blank rows when determining rollover.

Use explicit handwritten date annotations when present.

Assume timezone **America/New_York** unless I specify otherwise. Convert each event to a UTC ISO 8601 timestamp for the CSV.

## Required CSV schema

Use **exactly** these five columns, in this order:

`timestamp,event_type_id,label,emoji,notes`

Valid event combinations are:

- `sleep-end`, `Sleep End`, `🌞`
- `sleep-start`, `Sleep Start`, `🌛`
- `feeding`, `Feeding`, `🍼`
- `pee`, `Pee`, `💧`
- `poo`, `Poo`, `💩`
- `other`, `Other`, `⭐`

Example format only:

```csv
timestamp,event_type_id,label,emoji,notes
2026-10-28T14:00:00.000Z,feeding,Feeding,🍼,5.5 oz milk
2026-10-28T14:00:00.000Z,poo,Poo,💩,Big
2026-10-29T04:45:00.000Z,sleep-start,Sleep Start,🌛,
2026-10-29T05:10:00.000Z,other,Other,⭐,fussy
```

Do not add any extra columns.

## Notes rules

- Preserve feeding quantities, milk/formula descriptions, and diaper descriptors in the `notes` field.
- Preserve uncertainty with short tags if needed, such as `[unclear]`, `[approx]`, or `[estimated from context]`.
- If there are notes but no readable time, do not invent a timestamp; instead flag the row in the review file.
- Do **not** calculate or add sleep durations to the CSV. BabyCalendar derives those from `sleep-start` and `sleep-end` events.

## Output requirements

1. Generate a downloadable UTF-8 `.csv` file compatible with BabyCalendar Import CSV.
2. Sort all records chronologically.
3. Generate a separate transcription review text file listing:
   - uncertain rows (refer to them by row number when possible),
   - ambiguous times,
   - ambiguous activity marks,
   - date rollover assumptions,
   - corrected or inferred AM/PM assumptions,
   - and any inferred notes.
4. Summarize event counts by type and by date.
5. Ask only the most important follow-up questions **after** producing the initial CSV and review file.
