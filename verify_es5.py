"""
Script de validação de compatibilidade ES5 real via AST (ECMAScript 5).
Executa o parser Acorn (ECMAScript 5 strict) para garantir que nenhum constructo
ES6+ esteja presente no código JavaScript que rodará no Chromium 47 da TV.
"""

import subprocess
import sys
import os

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    js_validator = os.path.join(script_dir, "verify_es5.js")

    print("[ES5 AST Validator] Iniciando análise sintática real ECMAScript 5...")
    try:
        res = subprocess.run(
            ["node", js_validator],
            cwd=script_dir,
            capture_output=True,
            text=True
        )
        print(res.stdout)
        if res.stderr:
            print(res.stderr, file=sys.stderr)
        sys.exit(res.returncode)
    except FileNotFoundError:
        print("ERRO: Node.js não foi encontrado no PATH para executar o parser Acorn ES5.", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
