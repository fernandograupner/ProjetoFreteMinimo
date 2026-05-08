"""
exportar.py — Re-exporta a planilha Excel para JSON (backend/data/)

Uso (na pasta frete-dashboard onde está este ficheiro):
  python exportar.py "Controle_frete_Minimo.xlsx"

Ou só o nome, desde que o .xlsx esteja nesta mesma pasta:
  python exportar.py "Controle frete Minimo (1)"

Dica: use o nome completo com .xlsx e aspas se houver espaços.
"""
import json
import os
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

DEFAULT = 'Controle_Frete_Minimo.xlsx'


def resolver_excel(argumento: str | None) -> Path:
    raw = (argumento or DEFAULT).strip().strip('"').strip("'")
    tentativas: list[Path] = []

    p = Path(raw)
    if not p.is_absolute():
        p = ROOT / p
    tentativas.append(p)
    if p.suffix.lower() not in ('.xlsx', '.xls', '.xlsm'):
        tentativas.append(p.with_suffix('.xlsx'))
        tentativas.append(p.with_suffix('.xls'))

    for t in tentativas:
        if t.exists() and t.is_file():
            return t

    print('Erro: ficheiro Excel não encontrado.')
    print(f'  Procurou (entre outros): {tentativas[0]}')
    print(f'  Pasta esperada do projeto: {ROOT}')
    print()
    achados = sorted(ROOT.glob('*.xlsx')) + sorted(ROOT.glob('*.xls')) + sorted(ROOT.glob('*.xlsm'))
    if achados:
        print('Ficheiros Excel nesta pasta — copie o nome exato e use no comando:')
        for f in achados:
            print(f'  python exportar.py "{f.name}"')
    else:
        print('Não há nenhum .xlsx / .xls nesta pasta.')
        print('Coloque o Excel na mesma pasta que exportar.py ou passe o caminho completo:')
        print('  python exportar.py "C:\\Users\\...\\Planilha.xlsx"')
    sys.exit(1)


arquivo = resolver_excel(sys.argv[1] if len(sys.argv) > 1 else None)
saida = ROOT / 'backend' / 'data'
saida.mkdir(parents=True, exist_ok=True)

print(f'Lendo {arquivo.name}...')
base = pd.read_excel(arquivo, sheet_name='Base')
clientes = pd.read_excel(arquivo, sheet_name='Clientes')
filiais = pd.read_excel(arquivo, sheet_name='Filiais')

cliente_map = dict(zip(clientes['Cliente'], clientes['Nome Ref']))
filial_map = dict(zip(filiais['Filial'], filiais['Filial Ref']))

base['ClienteNome'] = base['Cliente'].map(cliente_map).fillna(
    base['Cliente'].str.split(' - ').str[-1]
)
base['FilialNome'] = base['Filial'].map(filial_map).fillna(base['Filial'])
base['CNPJ'] = base['Cliente'].str.split(' - ').str[0]
base = base.where(pd.notnull(base), None)

records = base.to_dict(orient='records')
with open(saida / 'data.json', 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, default=str)
print(f'  ✓ data.json — {len(records)} registros')

with open(saida / 'clientes.json', 'w', encoding='utf-8') as f:
    json.dump(clientes.to_dict(orient='records'), f, ensure_ascii=False)
print(f'  ✓ clientes.json — {len(clientes)} registros')

with open(saida / 'filiais.json', 'w', encoding='utf-8') as f:
    json.dump(filiais.to_dict(orient='records'), f, ensure_ascii=False)
print(f'  ✓ filiais.json — {len(filiais)} registros')

print('\nPronto! Reinicie o servidor (npm start).')
