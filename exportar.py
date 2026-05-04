"""
exportar.py — Re-exporta a planilha Excel para JSON (backend/data/)
Uso: python3 exportar.py Controle_Frete_Minimo.xlsx
"""
import sys, json, pandas as pd
from pathlib import Path

arquivo = sys.argv[1] if len(sys.argv) > 1 else 'Controle_Frete_Minimo.xlsx'
saida = Path('backend/data')
saida.mkdir(parents=True, exist_ok=True)

print(f'Lendo {arquivo}...')
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

print('\nPronto! Reinicie o servidor.')
