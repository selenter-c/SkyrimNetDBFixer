from pathlib import Path
import re

class PathResolver:
    def __init__(self, base_path: str, is_mo2: bool):
        self.base_path = Path(base_path)
        self.is_mo2 = is_mo2

    def get_data_folder(self) -> Path | None:
        if self.is_mo2:
            candidate = self.base_path / "overwrite" / "SKSE" / "Plugins" / "SkyrimNet" / "data"
        else:
            candidate = self.base_path / "SKSE" / "Plugins" / "SkyrimNet" / "data"

        if candidate.exists() and candidate.is_dir():
            return candidate

        return None

    def get_db_files(self, data_folder: Path):
        if not data_folder.exists():
            return []

        files = []

        for f in data_folder.glob("*.db"):
            if re.search(r"\.backup\d+$", f.name):
                continue

            stat = f.stat()
            files.append({
                "path": f,
                "name": f.name,
                "size": stat.st_size,
                "mtime": stat.st_mtime
            })

        return files