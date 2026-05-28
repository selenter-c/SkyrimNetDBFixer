import sqlite3
import shutil
import re
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional
from .string_fixer import StringFixer

@dataclass
class FixCandidate:
    table: str
    row_id: int
    column: str
    original: str
    fixed: str
    final: str

class DatabaseManager:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.conn = sqlite3.connect(str(db_path))
        self.conn.text_factory = lambda b: b.decode('utf-8', errors='replace')
        self.conn.row_factory = sqlite3.Row
        self.pending_changes: List[tuple] = []

    def close(self):
        if self.conn:
            self.conn.close()

    def create_backup(self) -> Optional[Path]:
        base = self.db_path.stem
        parent = self.db_path.parent
        existing_backups = list(parent.glob(f"{base}.backup*"))
        max_num = 0

        for bkp in existing_backups:
            match = re.search(r"\.backup(\d+)$", bkp.name)

            if match:
                num = int(match.group(1))

                if num > max_num:
                    max_num = num

        new_backup = parent / f"{self.db_path.name}.backup{max_num + 1}"

        shutil.copy2(self.db_path, new_backup)
        return new_backup

    def get_table_columns(self, table: str) -> List[str]:
        cursor = self.conn.execute(f"PRAGMA table_info({table})")

        return [row["name"] for row in cursor.fetchall()]

    def get_all_rows(self, table: str) -> List[sqlite3.Row]:
        cursor = self.conn.execute(f"SELECT * FROM {table}")

        return cursor.fetchall()

    def update_cell(self, table: str, row_id: int, column: str, new_value: str):
        self.pending_changes.append((table, row_id, column, new_value))

    def save_changes(self):
        if not self.pending_changes:
            return
        try:
            cursor = self.conn.cursor()

            for table, row_id, column, new_value in self.pending_changes:
                cursor.execute(
                    f"UPDATE {table} SET {column} = ? WHERE id = ?",
                    (new_value, row_id)
                )

            self.conn.commit()
            self.pending_changes.clear()
        except Exception as e:
            self.conn.rollback()

            raise e

    def has_pending_changes(self) -> bool:
        return len(self.pending_changes) > 0
    
    def search_broken_strings_in_table(self, fixer, table: str) -> List[FixCandidate]:
        candidates = []
        columns = self.get_table_columns(table)
        text_columns = [c for c in columns if c != "id"]
        rows = self.get_all_rows(table)

        for row in rows:
            for col in text_columns:
                value = row[col]

                if value is None or not isinstance(value, str):
                    continue
                fixed = fixer.fix_text(value)

                if fixed != value:
                    candidates.append(FixCandidate(
                        table=table,
                        row_id=row["id"],
                        column=col,
                        original=value,
                        fixed=fixed,
                        final=fixed
                    ))

        return candidates