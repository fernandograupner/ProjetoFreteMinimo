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


def resolver_aba(xl: pd.ExcelFile, nome: str, alternativas: tuple[str, ...] = ()) -> str:
    abas = xl.sheet_names
    for candidato in (nome, *alternativas):
        if candidato in abas:
            return candidato
    return abas[0]


def carregar_aba_ou_json(
    xl: pd.ExcelFile,
    sheet: str,
    json_path: Path,
    alternativas: tuple[str, ...] = (),
) -> pd.DataFrame:
    if sheet in xl.sheet_names:
        return pd.read_excel(xl, sheet_name=sheet)
    if json_path.exists():
        print(f'  · aba "{sheet}" ausente — reutilizando {json_path.name}')
        return pd.DataFrame(json.loads(json_path.read_text(encoding='utf-8')))
    print(f'Erro: falta a aba "{sheet}" no Excel e não há {json_path.name}.')
    print(f'  Abas encontradas: {", ".join(xl.sheet_names)}')
    print('  Use o modelo com abas Base, Clientes e Filiais, ou mantenha clientes.json/filiais.json.')
    sys.exit(1)


arquivo = resolver_excel(sys.argv[1] if len(sys.argv) > 1 else None)
saida = ROOT / 'backend' / 'data'
saida.mkdir(parents=True, exist_ok=True)

print(f'Lendo {arquivo.name}...')
xl = pd.ExcelFile(arquivo)
aba_base = resolver_aba(xl, 'Base', ('Planilha1', 'Sheet1', 'Dados'))
if aba_base != 'Base':
    print(f'  · aba de dados: "{aba_base}" (esperado "Base")')
base = pd.read_excel(xl, sheet_name=aba_base)
clientes = carregar_aba_ou_json(xl, 'Clientes', saida / 'clientes.json')
filiais = carregar_aba_ou_json(xl, 'Filiais', saida / 'filiais.json')

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
print(f'  OK data.json - {len(records)} registros')

with open(saida / 'clientes.json', 'w', encoding='utf-8') as f:
    json.dump(clientes.to_dict(orient='records'), f, ensure_ascii=False)
print(f'  OK clientes.json - {len(clientes)} registros')

with open(saida / 'filiais.json', 'w', encoding='utf-8') as f:
    json.dump(filiais.to_dict(orient='records'), f, ensure_ascii=False)
print(f'  OK filiais.json - {len(filiais)} registros')

print('\nPronto! Reinicie o servidor (npm start).')
