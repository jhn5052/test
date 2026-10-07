#!/usr/bin/env python3
"""Rebuild the question bank from Q-Net archives and the OCR-reviewed 2025 set."""

from pathlib import Path
import json
import re
import subprocess
import unicodedata
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXAM = ROOT / "exam"
DATA = ROOT / "data"
SUBJECTS = [
    "부동산학개론",
    "민법 및 민사특별법",
    "공인중개사법령 및 중개실무",
    "부동산공법",
    "부동산공시에 관한 법령 및 부동산 관련 세법",
]


def question_docs(year):
    found = {}
    for archive in EXAM.glob("*.zip"):
        if str(year) not in unicodedata.normalize("NFC", archive.name):
            continue
        with zipfile.ZipFile(archive) as source:
            for name in source.namelist():
                if not name.lower().endswith(".pdf"):
                    continue
                stem = Path(name).stem
                normalized = unicodedata.normalize("NFC", stem)
                if year < 2022 and not re.search(r"\bA\b", stem):
                    continue
                if year < 2022:
                    if "_1┬≈" in stem:
                        part = 1
                    elif "2┬≈ 1" in stem:
                        part = 2
                    elif "2┬≈ 2" in stem:
                        part = 3
                    else:
                        continue
                elif ("2차" in normalized and "2교시" in normalized) or ("2┬≈" in stem and "2▒│" in stem):
                    part = 3
                elif "2차" in normalized or ("2┬≈" in stem and "1▒│" in stem):
                    part = 2
                elif "1차" in normalized or ("1┬≈" in stem and "2┬≈" not in stem):
                    part = 1
                else:
                    continue
                if part in found:
                    continue
                pdf = DATA / f".question-{year}-{part}.pdf"
                pdf.write_bytes(source.read(name))
                result = subprocess.run(
                    ["pdftotext", "-raw", str(pdf), "-"],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                found[part] = result.stdout
                pdf.unlink()
    return found


START = re.compile(r"(?m)^\s*(\d{1,2})\.\s+")
MARK = re.compile(r"([①②③④⑤])\s*")


def clean_footer(value):
    return re.sub(r"\s*20\d{2}년\s*제\d+회\s*공인중개사.*$", "", value).strip()


def split_questions(text, part):
    starts = []
    expected = 1
    limit = 40 if part == 3 else 80
    for match in START.finditer(text):
        number = int(match.group(1))
        if number == expected and number <= limit:
            starts.append((match.start(), number))
            expected += 1
    results = []
    for index, (start, number) in enumerate(starts):
        end = starts[index + 1][0] if index + 1 < len(starts) else len(text)
        block = re.sub(r"^\d{1,2}\.\s*", "", text[start:end].strip())
        markers = list(MARK.finditer(block))[:5]
        if len(markers) != 5:
            continue
        stem = clean_footer(re.sub(r"\s+", " ", block[: markers[0].start()]).strip())
        choices = []
        for choice_index, marker in enumerate(markers):
            choice_end = markers[choice_index + 1].start() if choice_index < 4 else len(block)
            choices.append(clean_footer(re.sub(r"\s+", " ", block[marker.end() : choice_end]).strip()))
        if stem and all(choices):
            results.append((number, stem, choices))
    return results


def main():
    answer_keys = json.loads((DATA / "answer-keys.json").read_text())["answerKeys"]
    questions = []
    for year in range(2020, 2025):
        docs = question_docs(year)
        year_questions = []
        for part in (1, 2, 3):
            for number, stem, choices in split_questions(docs.get(part, ""), part):
                subject_index = (0 if part == 1 else 2 if part == 2 else 4) + (number - 1) // 40
                local_number = (number - 1) % 40 + 1
                question_id = f"{year}-{subject_index + 1}-{local_number}"
                if question_id not in answer_keys:
                    raise ValueError(f"No official answer key for {question_id}")
                answer = answer_keys[question_id]
                accepted = answer if isinstance(answer, list) else [answer]
                year_questions.append(
                    {
                        "id": question_id,
                        "year": year,
                        "subject": SUBJECTS[subject_index],
                        "number": local_number,
                        "text": clean_footer(stem),
                        "choices": [clean_footer(choice) for choice in choices],
                        "answer": answer,
                        "explanation": (
                            f"정답은 {'·'.join(map(str, accepted))}번입니다. "
                            "원문에는 별도 해설이 포함되어 있지 않아 정답표를 기준으로 채점합니다."
                        ),
                    }
                )
        if len(year_questions) != 200:
            raise ValueError(f"{year}: expected 200 source questions, found {len(year_questions)}")
        questions.extend(year_questions)

    year_2025 = json.loads((DATA / "questions-2025-source.json").read_text())["questions"]
    if len(year_2025) != 200:
        raise ValueError(f"2025: expected 200 OCR-reviewed questions, found {len(year_2025)}")
    for question in year_2025:
        question_id = question["id"]
        if question_id not in answer_keys:
            raise ValueError(f"No official answer key for {question_id}")
        question["answer"] = answer_keys[question_id]
        accepted = question["answer"] if isinstance(question["answer"], list) else [question["answer"]]
        question["explanation"] = (
            f"정답은 {'·'.join(map(str, accepted))}번입니다. "
            "원문에는 별도 해설이 포함되어 있지 않아 정답표를 기준으로 채점합니다."
        )
    questions.extend(year_2025)

    expected_ids = {f"{year}-{subject}-{number}" for year in range(2020, 2026) for subject in range(1, 6) for number in range(1, 41)}
    actual_ids = {question["id"] for question in questions}
    if len(questions) != 1200 or actual_ids != expected_ids:
        raise ValueError(f"Expected 1,200 unique questions; got {len(questions)} records and {len(actual_ids)} IDs")
    for question in questions:
        if len(question["choices"]) != 5 or any(not choice.strip() for choice in question["choices"]):
            raise ValueError(f"Incomplete stem/options for {question['id']}")

    output = {"source": "Q-Net 2020–2025 question papers and final answer sheets", "questions": questions}
    (DATA / "questions.json").write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n")
    print("Built 1,200 questions: 6 years × 5 subjects × 40 questions")


if __name__ == "__main__":
    main()
