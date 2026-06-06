"""Build the desktop application executable using PyInstaller."""
import subprocess
import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).parent


def main():
    print("=== Installing desktop build dependencies ===")
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "pywebview", "pyinstaller",
    ])

    print("\n=== Building executable ===")
    spec_path = PROJECT_DIR / "desktop.spec"
    result = subprocess.run([
        sys.executable, "-m", "PyInstaller",
        str(spec_path),
        "--clean",
        "--noconfirm",
    ], cwd=str(PROJECT_DIR))

    if result.returncode != 0:
        print("\nBuild failed!")
        sys.exit(1)

    exe_path = PROJECT_DIR / "dist" / "TestForge" / "TestForge.exe"
    print(f"\n=== Build successful! ===")
    print(f"Executable: {exe_path}")


if __name__ == "__main__":
    main()
