#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script per sincronizzare i dati del parquet da Azure in public/jobs.json
Eseguito automaticamente all'avvio dell'app
"""
import json
import sys
import os
from io import BytesIO
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Set UTF-8 encoding for stdout/stderr
if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.buffer, errors='replace')
    sys.stderr = codecs.getwriter("utf-8")(sys.stderr.buffer, errors='replace')

try:
    import pandas as pd
    from azure.storage.blob import BlobServiceClient
except ImportError:
    print("⚠️  Dipendenze mancanti. Installo pandas e azure-storage-blob...", file=sys.stderr)
    os.system('pip install pandas pyarrow azure-storage-blob -q')
    try:
        import pandas as pd
        from azure.storage.blob import BlobServiceClient
    except ImportError:
        print("❌ Errore: Impossibile importare le dipendenze", file=sys.stderr)
        sys.exit(1)

def sync_jobs_from_azure():
    """Legge il parquet da Azure e sincronizza con public/jobs.json"""
    try:
        print("🔄 Sincronizzazione dati commesse da Azure...")
        
        # Configurazione Azure (da variabili ambiente)
        account_name = os.getenv("AZURE_STORAGE_ACCOUNT")
        account_key = os.getenv("AZURE_STORAGE_KEY")
        container_name = os.getenv("AZURE_STORAGE_CONTAINER", "crmreport")
        blob_name = os.getenv("AZURE_STORAGE_BLOB", "jobs_complete.parquet")

        if not account_name or not account_key:
            raise ValueError("Missing AZURE_STORAGE_ACCOUNT or AZURE_STORAGE_KEY")

        print(f"  📍 Connessione a Azure blob: {account_name}/{container_name}/{blob_name}")

        # Connetti ad Azure
        connection_string = f"DefaultEndpointsProtocol=https;AccountName={account_name};AccountKey={account_key};EndpointSuffix=core.windows.net"
        blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)
        
        # Scarica il blob
        print("  ⬇️  Download del file parquet...")
        stream = BytesIO()
        blob_client.download_blob().readinto(stream)
        stream.seek(0)
        
        # Leggi il parquet con pandas
        print("  📊 Parsing del parquet...")
        df = pd.read_parquet(stream)
        
        print(f"  ✓ Parquet contiene {len(df)} righe, {len(df.columns)} colonne")
        print(f"  ✓ Colonne: {', '.join(df.columns.tolist())}")
        
        # Converti in JSON e rimuovi NaN
        records = df.to_dict(orient='records')
        
        # Funzione personalizzata per JSON encoder che sostituisce NaN con null
        def remove_nan(obj):
            """Ricorsivamente sostituisce NaN con None"""
            if isinstance(obj, dict):
                return {k: remove_nan(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [remove_nan(v) for v in obj]
            elif isinstance(obj, float):
                # Controlla se è NaN
                if pd.isna(obj):
                    return None
                return obj
            return obj
        
        records = [remove_nan(r) for r in records]
        
        # Assicurati che la cartella public esista
        public_dir = Path(__file__).parent / "public"
        public_dir.mkdir(parents=True, exist_ok=True)
        
        jobs_json_path = public_dir / "jobs.json"
        
        # Salva il JSON - usa default=str per gestire eventuali edge cases
        print(f"  💾 Salvataggio in {jobs_json_path}...")
        with open(jobs_json_path, 'w', encoding='utf-8') as f:
            json.dump(records, f, ensure_ascii=False, default=str, separators=(',', ':'))
        
        print(f"✅ Sincronizzazione completata: {len(records)} commesse caricate")
        print(f"✅ File aggiornato: {jobs_json_path}")

        # Scarica resources.json da Azure se disponibile
        try:
            resources_blob_client = blob_service_client.get_blob_client(container=container_name, blob="resources.json")
            resources_stream = BytesIO()
            resources_blob_client.download_blob().readinto(resources_stream)
            resources_stream.seek(0)
            resources_json_path = public_dir / "resources.json"
            with open(resources_json_path, "wb") as f:
                f.write(resources_stream.read())
            print(f"✅ resources.json aggiornato: {resources_json_path}")
        except Exception as res_err:
            print(f"⚠️  resources.json non trovato su Azure (ignorato): {res_err}", file=sys.stderr)

        return True
        
    except Exception as e:
        print(f"⚠️  Errore durante la sincronizzazione: {str(e)}", file=sys.stderr)
        print(f"   Tipo errore: {type(e).__name__}", file=sys.stderr)
        return False

def ensure_jobs_json_exists():
    """Assicura che public/jobs.json esista (anche se vuoto)"""
    public_dir = Path(__file__).parent / "public"
    jobs_json_path = public_dir / "jobs.json"
    
    if not jobs_json_path.exists():
        print("⚠️  jobs.json non trovato, creo file vuoto...")
        public_dir.mkdir(parents=True, exist_ok=True)
        with open(jobs_json_path, 'w', encoding='utf-8') as f:
            json.dump([], f)
        print(f"✓ Creato file vuoto: {jobs_json_path}")

if __name__ == "__main__":
    print("\n" + "="*60)
    print("  SINCRONIZZAZIONE DATI COMMESSE")
    print("="*60 + "\n")
    
    try:
        success = sync_jobs_from_azure()
        if not success:
            print("❌ Deploy interrotto: impossibile aggiornare public/jobs.json da Azure", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"❌ Errore critico: {e}", file=sys.stderr)
        sys.exit(1)
    
    print("\n" + "="*60)
    print("  ✓ App pronta per l'avvio")
    print("="*60 + "\n")
