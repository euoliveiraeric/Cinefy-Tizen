import urllib.request
import json
import time

def test_api():
    endpoints = [
        ("Criadores em Destaque", "https://api.cinefy.gg/v1/creators/relevant?page=1&perPage=5"),
        ("Vídeos Gratuitos", "https://api.cinefy.gg/v1/videos?type=free&page=1&perPage=5"),
        ("Vídeos Recentes", "https://api.cinefy.gg/v1/videos?page=1&perPage=5&sortedOrder=desc"),
        ("Busca de Vídeos (query=react)", "https://api.cinefy.gg/v1/videos?query=react&page=1&perPage=5"),
        ("Perfil de Criador (apenas1react)", "https://api.cinefy.gg/v1/user/apenas1react"),
        ("Vídeos do Canal", "https://api.cinefy.gg/v1/videos?author=0ed77d49-dac3-4f3b-ad0e-78333378c8f9&page=1&perPage=5")
    ]

    all_ok = True
    print("Iniciando bateria de testes nas APIs do Cinefy...")
    for name, url in endpoints:
        time.sleep(0.4)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Cinefy-Tizen/1.0'})
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                status = resp.status
                item_count = len(data.get('data', [])) if isinstance(data, dict) and 'data' in data else (1 if 'id' in data else 0)
                print(f"  [OK] {name}: Status {status}, Itens retornados: {item_count}")
        except Exception as e:
            print(f"  [FAIL] {name}: {e}")
            all_ok = False

    if all_ok:
        print("\nTodos os endpoints da API Cinefy responderam perfeitamente!")
    else:
        print("\nFalha em algum endpoint.")

if __name__ == '__main__':
    test_api()
