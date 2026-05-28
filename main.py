import os
import sys
import eel
import ctypes
import tkinter as tk
from tkinter import filedialog
from pathlib import Path
import datetime
import difflib
from html import escape
from core.game_checker import GameChecker
from core.path_resolver import PathResolver
from core.db_manager import DatabaseManager
from core.string_fixer import StringFixer

try:
    myappid = "selenter.skyrimnet.dbfixer.1.0"
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
except Exception:
    pass

def get_path(filename):
    if hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, filename)

    return filename

eel.init("web")

game_checker = GameChecker()
db_manager = None
string_fixer = StringFixer()
current_db_path = None

def generate_diff_html(orig, fixed):
    orig_html = ""
    fixed_html = ""
    matcher = difflib.SequenceMatcher(None, orig, fixed)
    
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        o_part = escape(orig[i1:i2])
        f_part = escape(fixed[j1:j2])
        
        if tag == "replace" or tag == "delete":
            orig_html += f'<span class="highlight-broken">{o_part}</span>'
        else:
            orig_html += o_part
            
        if tag == "replace" or tag == "insert":
            fixed_html += f'<span class="highlight-fixed">{f_part}</span>'
        elif tag == "equal":
            fixed_html += f_part
            
    return orig_html, fixed_html

@eel.expose
def check_game_running():
    return game_checker.is_game_running()

@eel.expose
def browse_folder():
    root = tk.Tk()
    root.attributes("-topmost", True)
    root.withdraw()
    path = filedialog.askdirectory(title="Выберите папку")
    root.destroy()

    return path if path else ""

@eel.expose
def browse_file():
    root = tk.Tk()
    root.attributes("-topmost", True)
    root.withdraw()

    path = filedialog.askopenfilename(
        title="Выберите файл базы данных",
        filetypes=[("Database files", "*.db"), ("All files", "*.*")]
    )

    root.destroy()

    return path if path else ""

@eel.expose
def scan_for_db_files(base_path, is_mo2):
    try:
        resolver = PathResolver(base_path, is_mo2)
        data_folder = resolver.get_data_folder()

        if not data_folder:
            return {"success": False, "error": "Папка SkyrimNet/data не найдена"}
        
        files = resolver.get_db_files(data_folder)
        files_info = []

        for f in files:
            mtime = datetime.datetime.fromtimestamp(f["mtime"]).strftime("%Y-%m-%d %H:%M:%S")

            files_info.append({
                "name": f["name"],
                "path": str(f["path"]),
                "size": f["size"],
                "size_formatted": format_size(f["size"]),
                "mtime": mtime
            })

        return {"success": True, "files": files_info}
    except Exception as e:
        return {"success": False, "error": str(e)}

@eel.expose
def open_database(db_path, create_backup):
    global db_manager, current_db_path

    try:
        current_db_path = Path(db_path)
        db_manager = DatabaseManager(current_db_path)

        if create_backup:
            backup_path = db_manager.create_backup()

            return {"success": True, "backup": str(backup_path.name) if backup_path else None}
        return {"success": True, "backup": None}
    except Exception as e:
        return {"success": False, "error": str(e)}

@eel.expose
def close_database():
    global db_manager, current_db_path

    try:
        if db_manager:
            db_manager.close()
            db_manager = None
            current_db_path = None

        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@eel.expose
def get_table_data(table_name):
    if not db_manager:
        return {"success": False, "error": "База данных не открыта"}
    try:
        columns = db_manager.get_table_columns(table_name)
        rows = db_manager.get_all_rows(table_name)
        data = []
        
        pending_map = {}

        if hasattr(db_manager, "pending_changes"):
            for p_table, p_row_id, p_col, p_val in db_manager.pending_changes:
                if p_table == table_name:
                    if p_row_id not in pending_map:
                        pending_map[p_row_id] = {}

                    pending_map[p_row_id][p_col] = p_val
                    
        for row in rows:
            row_dict = {}
            r_id = row["id"] if "id" in row.keys() else None

            for col in columns:
                val = row[col]
                if r_id in pending_map and col in pending_map[r_id]:
                    val = pending_map[r_id][col]

                row_dict[col] = str(val) if val is not None else ""

            data.append(row_dict)
            
        return {"success": True, "columns": columns, "rows": data}
    except Exception as e:
        return {"success": False, "error": str(e)}

@eel.expose
def update_cell(table, row_id, column, new_value):
    if not db_manager:
        return {"success": False, "error": "База данных не открыта"}
    try:
        db_manager.update_cell(table, int(row_id), column, new_value)

        return {"success": True, "has_changes": db_manager.has_pending_changes()}
    except Exception as e:
        return {"success": False, "error": str(e)}

@eel.expose
def save_all_changes():
    if not db_manager:
        return {"success": False, "error": "База данных не открыта"}
    try:
        db_manager.save_changes()

        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@eel.expose
def search_broken_strings(table_name):
    if not db_manager:
        return {"success": False, "error": "База данных не открыта"}
    try:
        candidates = db_manager.search_broken_strings_in_table(string_fixer, table_name)
        result = []

        for c in candidates:
            orig_html, fixed_html = generate_diff_html(c.original, c.fixed)

            result.append({
                "table": c.table,
                "row_id": c.row_id,
                "column": c.column,
                "original_html": orig_html,
                "fixed_html": fixed_html,
                "final": c.fixed
            })
        return {"success": True, "candidates": result}
    except Exception as e:
        return {"success": False, "error": str(e)}

@eel.expose
def apply_fixes(fixes_data):
    if not db_manager:
        return {"success": False, "error": "База данных не открыта"}
    try:
        for fix in fixes_data:
            db_manager.update_cell(fix["table"], int(fix["row_id"]), fix["column"], fix["final"])

        return {"success": True, "has_changes": db_manager.has_pending_changes()}
    except Exception as e:
        return {"success": False, "error": str(e)}

@eel.expose
def quick_fix_text(text):
    try:
        fixed = string_fixer.fix_text(text)
        orig_html, fixed_html = generate_diff_html(text, fixed)
        fixed_html = fixed_html.replace("�", '<span class="highlight-unknown">�</span>')

        return {"success": True, "fixed": fixed, "orig_html": orig_html, "fixed_html": fixed_html}
    except Exception as e:
        return {"success": False, "error": str(e)}

def format_size(size_bytes):
    for unit in ["Б", "КБ", "МБ", "ГБ"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024

    return f"{size_bytes:.1f} ТБ"

def main():
    try:
        eel.start("index.html", size=(1400, 900), mode="chrome", cmdline_args=['--app-id=skyrimnet.dbfixer'], port=0)
    except (SystemExit, MemoryError, KeyboardInterrupt):
        pass

if __name__ == "__main__":
    main()