import psutil

class GameChecker:
    GAME_PROCESS_NAMES = ["SkyrimSE.exe"]

    def is_game_running(self):
        for proc in psutil.process_iter(["name"]):
            if proc.info["name"] in self.GAME_PROCESS_NAMES:
                return True

        return False