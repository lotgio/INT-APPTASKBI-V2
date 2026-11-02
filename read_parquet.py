#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script per leggere il file parquet da Azure Blob Storage e convertirlo in JSON
"""
import json
import os
import sys
from io import BytesIO

# Set UTF-8 encoding for stdout
if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())
    sys.stderr = codecs.getwriter("utf-8")(sys.stderr.detach())

try:
    import pandas as pd
    from azure.storage.blob import BlobServiceClient
except ImportError:
    print(json.dumps({"error": "Missing dependencies. Run: pip install pandas pyarrow azure-storage-blob"}), file=sys.stderr)
    sys.exit(1)

def read_jobs_from_azure():
    """Legge il file parquet da Azure e restituisce i dati come JSON"""
    try:
        # Configurazione Azure (da variabili ambiente)
        account_name = os.getenv("AZURE_STORAGE_ACCOUNT")
        account_key = os.getenv("AZURE_STORAGE_KEY")
        container_name = os.getenv("AZURE_STORAGE_CONTAINER", "crmreport")
        blob_name = os.getenv("AZURE_STORAGE_BLOB", "jobs_complete.parquet")

        if not account_name or not account_key:
            raise ValueError("Missing AZURE_STORAGE_ACCOUNT or AZURE_STORAGE_KEY")

        # Connetti ad Azure
        connection_string = f"DefaultEndpointsProtocol=https;AccountName={account_name};AccountKey={account_key};EndpointSuffix=core.windows.net"
        blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)
        
        # Scarica il blob
        stream = BytesIO()
        blob_client.download_blob().readinto(stream)
        stream.seek(0)
        
        # Leggi il parquet con pandas
        df = pd.read_parquet(stream)
        
        # Converti in JSON
        records = df.to_dict(orient='records')
        
        # Stampa JSON su stdout
        print(json.dumps(records, ensure_ascii=False, default=str))
        
    except Exception as e:
        error_msg = {"error": f"Errore lettura parquet: {str(e)}"}
        print(json.dumps(error_msg), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    read_jobs_from_azure()
