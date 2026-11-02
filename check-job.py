#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script per verificare se CO26001118 è nel parquet di Azure
"""
import os
import sys
from io import BytesIO
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

try:
    import pandas as pd
    from azure.storage.blob import BlobServiceClient
except ImportError:
    print("⚠️  Installo dipendenze...")
    os.system('pip install pandas pyarrow azure-storage-blob -q')
    import pandas as pd
    from azure.storage.blob import BlobServiceClient

def check_job_in_azure():
    """Verifica se CO26001118 è nel parquet di Azure"""
    try:
        print("🔍 Connessione ad Azure...")
        
        account_name = os.getenv("AZURE_STORAGE_ACCOUNT")
        account_key = os.getenv("AZURE_STORAGE_KEY")
        container_name = os.getenv("AZURE_STORAGE_CONTAINER", "crmreport")
        blob_name = os.getenv("AZURE_STORAGE_BLOB", "jobs_complete.parquet")

        if not account_name or not account_key:
            print("❌ Credenziali Azure mancanti. Verificare variabili ambiente.")
            return False

        connection_string = f"DefaultEndpointsProtocol=https;AccountName={account_name};AccountKey={account_key};EndpointSuffix=core.windows.net"
        blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)
        
        print(f"📥 Download {blob_name} da {container_name}...")
        stream = BytesIO()
        blob_client.download_blob().readinto(stream)
        stream.seek(0)
        
        print("📊 Parsing parquet...")
        df = pd.read_parquet(stream)
        
        print(f"✓ Parquet: {len(df)} righe totali")
        print(f"✓ Colonne: {list(df.columns)}")
        print()
        
        # Cerca CO26001118
        matching = df[df['JobNo'].astype(str).str.contains('CO26001118', case=False, na=False)]
        
        if len(matching) > 0:
            print(f"✅ TROVATA! {len(matching)} riga(e) con CO26001118:")
            for col in ['JobNo', 'Resource No', 'Customer Name', 'Plan Description', 'Detail Description', 'Ore Residue']:
                if col in matching.columns:
                    val = matching[col].values[0]
                    print(f"   {col}: {val}")
            return True
        else:
            print("❌ CO26001118 NON trovata nel parquet di Azure")
            
            # Prova a trovare commesse simili
            similar = df[df['JobNo'].astype(str).str.contains('CO260', case=False, na=False)]
            if len(similar) > 0:
                print(f"\n💡 Trovate {len(similar)} commesse simili (CO260*):")
                for idx, row in similar.head(10).iterrows():
                    print(f"   - {row['JobNo']}")
            return False
            
    except Exception as e:
        print(f"❌ Errore: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("\n" + "="*60)
    print("  VERIFICA COMMESSA NEL PARQUET")
    print("="*60 + "\n")
    check_job_in_azure()
