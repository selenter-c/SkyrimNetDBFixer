import ftfy

class StringFixer:
    DEFAULT_MANUAL_FIXES = {
        "скреств": "скрестив",
    }

    def __init__(self, manual_fixes: dict = None):
        self.manual_fixes = manual_fixes if manual_fixes else self.DEFAULT_MANUAL_FIXES.copy()

    def fix_text(self, text: str) -> str:
        fixed = ftfy.fix_text(
            text,
            uncurl_quotes=False,
            fix_character_width=False,
            fix_line_breaks=False,
            normalization=None
        )
        
        for broken, correct in self.manual_fixes.items():
            fixed = fixed.replace(broken, correct)
            
        return fixed