#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sincronizzazione diretta commesse dalla fonte principale (CRM/NAV) verso public/jobs.json.

Configurazione tramite variabili ambiente (vedi .env.example):
- CRM_SQL_SERVER
- CRM_SQL_DATABASE
- CRM_SQL_USER
- CRM_SQL_PASSWORD
- CRM_SQL_DRIVER (opzionale, default: ODBC Driver 17 for SQL Server)
- NAV_SQL_SERVER (opzionale, default: SERINF-SQL01)
- NAV_SQL_DATABASE (opzionale, default: SERINFSQL900IT05)
- NAV_COMPANY_NAME (opzionale, default: Serenissima Informatica S_p_A_)
- JOBS_MIN_YEAR (opzionale, default: 2022)
"""

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Set UTF-8 encoding for stdout/stderr on Windows.
if sys.platform == "win32":
    import codecs

    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.buffer, errors="replace")
    sys.stderr = codecs.getwriter("utf-8")(sys.stderr.buffer, errors="replace")

try:
    import pandas as pd
    from sqlalchemy import create_engine
except ImportError:
    print(
        "[WARN] Dipendenze mancanti. Installa requirements.txt prima di rieseguire.",
        file=sys.stderr,
    )
    raise


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _build_engine() -> object:
    server = _required_env("CRM_SQL_SERVER")
    database = _required_env("CRM_SQL_DATABASE")
    username = _required_env("CRM_SQL_USER")
    password = _required_env("CRM_SQL_PASSWORD")
    driver = os.getenv("CRM_SQL_DRIVER", "ODBC Driver 17 for SQL Server").strip()

    # Keep credentials URL-safe for SQLAlchemy URL format.
    from urllib.parse import quote_plus

    user_enc = quote_plus(username)
    pass_enc = quote_plus(password)
    server_enc = quote_plus(server)
    db_enc = quote_plus(database)
    driver_enc = quote_plus(driver)

    connection_url = (
        f"mssql+pyodbc://{user_enc}:{pass_enc}@{server_enc}/{db_enc}"
        f"?driver={driver_enc}&TrustServerCertificate=yes"
    )

    return create_engine(
        connection_url,
        fast_executemany=True,
        pool_size=10,
        max_overflow=5,
        pool_pre_ping=True,
        pool_recycle=3600,
    )


def _crm_query(min_year: int) -> str:
    return f"""
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

SELECT
    J.job_jobid,
    J.job_name AS [JobNo],
    J.job_description,
    A.AccountNumber AS [Customer Code],
    A.Name AS [Customer Name],
    A.serinf_ParentChainName AS [Parent Chain Name],
    JD.job_jobdetailid,
    JD.job_no AS [Resource No],
    JD.job_Division AS [Division],
    JD.job_taskno AS [JobTaskNo],
    JD.job_LineNo AS [JobPlanNo],
    JD.job_quantity AS [Quantity],
    JD.job_outstandingquantity AS [Outstanding Qty],
    JD.job_description AS [Detail Description],
    JD.job_fixedprice AS [Fixed Price],
    J.job_DocumentDate,
    ISNULL(COUNT(CASE WHEN sa.ass_jobdetail IS NOT NULL THEN 1 END), 0) AS [Nr Attivita Loggate],
    ISNULL(SUM(CASE WHEN ISNULL(sa.ass_bill_autorizzed, 0) <> 0 AND ISNULL(sa.ass_billed_blocked_by_administration, 0) <> 1
                    THEN 1
                    ELSE 0 END), 0) AS [Nr Enable Invoice],
    ISNULL(SUM(CASE WHEN ISNULL(sa.ass_InvoiceNumber, N'') <> ''
                    THEN 1
                    ELSE 0 END), 0) AS [Nr Fatturate],
    ISNULL(SUM(ISNULL(sa.ass_netactivityduration, 0) - ISNULL(sa.ass_Pausa, 0)), 0) / 60.0 AS [Ore Loggate],
    ISNULL(SUM(CASE WHEN ISNULL(sa.ass_InvoiceNumber, N'') <> ''
                    THEN ISNULL(sa.ass_i_activityduration, 0) - ISNULL(sa.ass_i_break, 0)
                    ELSE 0 END), 0) / 60.0 AS [Ore Vendute Fatturate],
    ISNULL(SUM(CASE WHEN ISNULL(sa.ass_bill_autorizzed, 0) <> 1 AND ISNULL(sa.ass_billed_blocked_by_administration, 0) <> 1 AND ISNULL(sa.ass_InvoiceNumber, N'') = ''
                    THEN ISNULL(sa.ass_i_activityduration, 0) - ISNULL(sa.ass_i_break, 0)
                    ELSE 0 END), 0) / 60.0 AS [Ore Fatturate Non Autorizzate],
    ISNULL(SUM(CASE WHEN ISNULL(sa.ass_bill_autorizzed, 0) <> 0 AND ISNULL(sa.ass_billed_blocked_by_administration, 0) <> 1 AND ISNULL(sa.ass_InvoiceNumber, N'') = ''
                    THEN ISNULL(sa.ass_i_activityduration, 0) - ISNULL(sa.ass_i_break, 0)
                    ELSE 0 END), 0) / 60.0 AS [Ore TA PL]
FROM [{_required_env("CRM_SQL_DATABASE")}].[dbo].[job_job] AS J
LEFT OUTER JOIN [{_required_env("CRM_SQL_DATABASE")}].[dbo].[job_jobdetail] AS JD
    ON J.job_jobid = JD.job_jobid
LEFT OUTER JOIN [{_required_env("CRM_SQL_DATABASE")}].[dbo].[ServiceAppointment] AS sa WITH (NOLOCK)
    ON sa.ass_jobdetail = JD.job_jobdetailid
    AND sa.StateCode = 1 AND sa.StatusCode = 8
INNER JOIN [{_required_env("CRM_SQL_DATABASE")}].[dbo].[account] AS A
    ON A.accountid = J.job_selltocustomer
WHERE
    JD.job_Type = 100000000
    AND (YEAR(J.job_DocumentDate) >= {min_year} OR YEAR(JD.ModifiedOn) = YEAR(GETDATE()))
GROUP BY J.job_jobid, J.job_name, J.job_description, A.AccountNumber, A.Name, A.serinf_ParentChainName,
         JD.job_jobdetailid, JD.job_no, JD.job_Division, JD.job_taskno, JD.job_LineNo, JD.job_quantity,
         JD.job_outstandingquantity, JD.job_description, JD.job_fixedprice,
         J.job_DocumentDate
ORDER BY J.job_name, JD.job_taskno, JD.job_LineNo
"""


def _nav_resources_query() -> str:
    nav_server = os.getenv("NAV_SQL_SERVER", "SERINF-SQL01").strip()
    nav_db = os.getenv("NAV_SQL_DATABASE", "SERINFSQL900IT05").strip()
    nav_company = os.getenv("NAV_COMPANY_NAME", "Serenissima Informatica S_p_A_").strip()
    resource_table = f"[{nav_server}].{nav_db}.dbo.[{nav_company}$Resource]"
    return f"""
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
SELECT r.No_ AS [No], r.Name
FROM {resource_table} AS r WITH (NOLOCK)
WHERE r.Type = 1
ORDER BY r.No_
"""


def _nav_query(job_names: list[str]) -> str:
    nav_server = os.getenv("NAV_SQL_SERVER", "SERINF-SQL01").strip()
    nav_db = os.getenv("NAV_SQL_DATABASE", "SERINFSQL900IT05").strip()
    nav_company = os.getenv("NAV_COMPANY_NAME", "Serenissima Informatica S_p_A_").strip()

    job_table = f"[{nav_server}].{nav_db}.dbo.[{nav_company}$Job]"
    plan_table = f"[{nav_server}].{nav_db}.dbo.[{nav_company}$Job Planning Line]"

    escaped = [name.replace("'", "''") for name in job_names if name]
    if not escaped:
        return ""

    in_clause = "','".join(escaped)

    return f"""
SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;

SELECT DISTINCT
    nav_job.No_ AS [JobNo],
    CASE WHEN (nav_job.Status = 0) THEN 'Pianificazione'
         WHEN (nav_job.Status = 1) THEN 'Offerta'
         WHEN (nav_job.Status = 2) THEN 'Ordine'
         ELSE 'Completato' END AS [Job Status],
    nav_plan.[Job Task No_],
    nav_plan.[Line No_],
    nav_plan.[Unit Price],
    nav_plan.Description AS [Plan Description],
    nav_plan.[Invoiced Amount (LCY) SER] AS [Invoiced Amount],
    CASE WHEN (nav_plan.Status = 0) THEN 'Pianificazione'
         WHEN (nav_plan.Status = 1) THEN 'Offerta'
         WHEN (nav_plan.Status = 2) THEN 'Ordine'
         ELSE 'Completato' END AS [Plan Status]
FROM {job_table} AS nav_job WITH (NOLOCK)
INNER JOIN {plan_table} AS nav_plan WITH (NOLOCK)
    ON nav_plan.[Job No_] = nav_job.No_
WHERE nav_job.No_ IN ('{in_clause}')
"""


def _normalize_for_json(df: pd.DataFrame) -> list[dict]:
    records = df.to_dict(orient="records")

    def clean(value):
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items()}
        if isinstance(value, list):
            return [clean(v) for v in value]
        if isinstance(value, float) and pd.isna(value):
            return None
        if pd.isna(value):
            return None
        return value

    return [clean(record) for record in records]


def sync_jobs_direct() -> int:
    min_year = int(os.getenv("JOBS_MIN_YEAR", "2022"))
    engine = _build_engine()

    print("[SYNC] Lettura diretta da CRM/NAV in corso...")
    crm_sql = _crm_query(min_year)

    with engine.connect() as conn:
        df_crm = pd.read_sql(crm_sql, conn)

    if df_crm.empty:
        print("[SYNC] Nessun record CRM trovato. Scrivo jobs.json vuoto.")
        df_result = df_crm
    else:
        print(f"[SYNC] CRM rows: {len(df_crm)}")
        nav_sql = _nav_query(df_crm["JobNo"].dropna().astype(str).unique().tolist())

        if nav_sql:
            with engine.connect() as conn:
                df_nav = pd.read_sql(nav_sql, conn)
        else:
            df_nav = pd.DataFrame()

        if not df_nav.empty:
            df_crm["JobTaskNo"] = df_crm["JobTaskNo"].astype(str)
            df_crm["JobPlanNo"] = df_crm["JobPlanNo"].astype(str)
            df_nav["Job Task No_"] = df_nav["Job Task No_"].astype(str)
            df_nav["Line No_"] = df_nav["Line No_"].astype(str)

            df_result = df_crm.merge(
                df_nav,
                left_on=["JobNo", "JobTaskNo", "JobPlanNo"],
                right_on=["JobNo", "Job Task No_", "Line No_"],
                how="left",
            )
            df_result = df_result.drop(columns=["Job Task No_", "Line No_"], errors="ignore")
        else:
            df_result = df_crm

    if "Quantity" in df_result.columns and "Ore Loggate" in df_result.columns:
        df_result["Ore Residue"] = df_result["Quantity"] - df_result["Ore Loggate"]

    public_dir = Path(__file__).parent / "public"
    public_dir.mkdir(parents=True, exist_ok=True)
    output_file = public_dir / "jobs.json"

    payload = _normalize_for_json(df_result)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, default=str, separators=(",", ":"))

    print(f"[SYNC] Completato: {len(payload)} record scritti in {output_file}")

    # Scrivi tabella risorse (No_ → Name) da NAV
    try:
        resources_sql = _nav_resources_query()
        with engine.connect() as conn:
            df_resources = pd.read_sql(resources_sql, conn)
        resources_payload = df_resources.to_dict(orient="records")
        resources_file = public_dir / "resources.json"
        with open(resources_file, "w", encoding="utf-8") as f:
            json.dump(resources_payload, f, ensure_ascii=False, default=str, separators=(",", ":"))
        print(f"[SYNC] Risorse: {len(resources_payload)} record scritti in {resources_file}")
    except Exception as exc:
        print(f"[WARN] Impossibile scrivere resources.json: {exc}", file=sys.stderr)

    return len(payload)


if __name__ == "__main__":
    try:
        sync_jobs_direct()
    except Exception as exc:
        print(f"[ERROR] Sync diretto fallito: {exc}", file=sys.stderr)
        sys.exit(1)