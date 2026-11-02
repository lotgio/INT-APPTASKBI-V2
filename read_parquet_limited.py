#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Legge il primo N job dal parquet e lo salva in JSON"""
import json
import os
import sys
from io import BytesIO

if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())
    sys.stderr = codecs.getwriter("utf-8")(sys.stderr.detach())

try:
    import pandas as pd
    from azure.storage.blob import BlobServiceClient
except ImportError:
    print(json.dumps({"error": "Missing dependencies"}), file=sys.stderr)
    sys.exit(1)

def read_jobs_from_azure():
    """Legge solo i primi 50 job dal parquet"""
    try:
        account_name = os.getenv("AZURE_STORAGE_ACCOUNT")
        account_key = os.getenv("AZURE_STORAGE_KEY")
        container_name = os.getenv("AZURE_STORAGE_CONTAINER", "crmreport")
        blob_name = os.getenv("AZURE_STORAGE_BLOB", "jobs_complete.parquet")

        if not account_name or not account_key:
            raise ValueError("Missing AZURE_STORAGE_ACCOUNT or AZURE_STORAGE_KEY")

        connection_string = f"DefaultEndpointsProtocol=https;AccountName={account_name};AccountKey={account_key};EndpointSuffix=core.windows.net"
        blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        blob_client = blob_service_client.get_blob_client(container=container_name, blob=blob_name)
        
        stream = BytesIO()
        blob_client.download_blob().readinto(stream)
        stream.seek(0)
        
        # Leggi il parquet e filtra per Resource No = "CGSSWPOW"
        df = pd.read_parquet(stream)
        df = df[df['Resource No'] == 'CGSSWPOW']
        
        records = df.to_dict(orient='records')
        print(json.dumps(records, ensure_ascii=False, default=str))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    read_jobs_from_azure()
