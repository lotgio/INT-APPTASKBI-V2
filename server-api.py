from flask import Flask, send_from_directory, jsonify, request
from flask_cors import CORS
import json
import os
from datetime import datetime
import uuid
import subprocess
import sys

app = Flask(__name__)
CORS(app)

# Aumenta il limite massimo di dimensione dei file (50 MB)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

# File per persistenza dati
TASKS_FILE = 'data/tasks.json'
MEMBERS_FILE = 'data/members.json'

# Crea directory data se non esiste
os.makedirs('data', exist_ok=True)

def load_json(filepath, default=[]):
    """Carica dati da file JSON"""
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    return default

def save_json(filepath, data):
    """Salva dati in file JSON"""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# API Tasks
@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    tasks = load_json(TASKS_FILE, [])
    return jsonify(tasks)

@app.route('/api/tasks', methods=['POST'])
def create_task():
    data = request.json
    tasks = load_json(TASKS_FILE, [])
    
    # Genera ID se non fornito
    if 'id' not in data or not data['id']:
        data['id'] = str(uuid.uuid4())
    
    # Aggiungi timestamp
    data['createdAt'] = datetime.now().isoformat()
    
    tasks.append(data)
    save_json(TASKS_FILE, tasks)
    
    return jsonify(data), 201

@app.route('/api/tasks/<task_id>', methods=['PUT', 'PATCH'])
def update_task(task_id):
    data = request.json
    tasks = load_json(TASKS_FILE, [])
    
    for i, task in enumerate(tasks):
        if task['id'] == task_id:
            tasks[i] = {**task, **data, 'id': task_id}
            save_json(TASKS_FILE, tasks)
            return jsonify(tasks[i])
    
    return jsonify({'error': 'Task not found'}), 404

@app.route('/api/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    tasks = load_json(TASKS_FILE, [])
    original_len = len(tasks)
    tasks = [t for t in tasks if t['id'] != task_id]
    
    if len(tasks) == original_len:
        return jsonify({'error': 'Task not found'}), 404
    
    save_json(TASKS_FILE, tasks)
    return jsonify({'ok': True}), 200

# API Members
@app.route('/api/members', methods=['GET'])
def get_members():
    members = load_json(MEMBERS_FILE, [])
    return jsonify(members)

@app.route('/api/members', methods=['POST'])
def create_member():
    data = request.json
    members = load_json(MEMBERS_FILE, [])
    
    # Genera ID se non fornito
    if 'id' not in data or not data['id']:
        data['id'] = str(uuid.uuid4())
    
    members.append(data)
    save_json(MEMBERS_FILE, members)
    
    return jsonify(data), 201

@app.route('/api/members/<member_id>', methods=['PUT', 'PATCH'])
def update_member(member_id):
    data = request.json
    members = load_json(MEMBERS_FILE, [])
    
    for i, member in enumerate(members):
        if member['id'] == member_id:
            members[i] = {**member, **data, 'id': member_id}
            save_json(MEMBERS_FILE, members)
            return jsonify(members[i])
    
    return jsonify({'error': 'Member not found'}), 404

@app.route('/api/members/<member_id>', methods=['DELETE'])
def delete_member(member_id):
    members = load_json(MEMBERS_FILE, [])
    original_len = len(members)
    members = [m for m in members if m['id'] != member_id]
    
    if len(members) == original_len:
        return jsonify({'error': 'Member not found'}), 404
    
    save_json(MEMBERS_FILE, members)
    return jsonify({'ok': True}), 200

# Serve file statici
@app.route('/')
def index():
    return send_from_directory('dist', 'index.html')

# Cache globale per jobs (caricato una sola volta all'avvio)
_jobs_cache = None

def load_jobs_cache():
    """Carica i jobs dal file una sola volta"""
    global _jobs_cache
    if _jobs_cache is not None:
        return _jobs_cache
    
    try:
        jobs_path = os.path.join('public', 'jobs.json')
        if not os.path.exists(jobs_path):
            print(f"⚠️  jobs.json non trovato in {jobs_path}")
            return []
        
        with open(jobs_path, 'r', encoding='utf-8') as f:
            _jobs_cache = json.load(f)
        print(f"✓ Cache jobs caricato: {len(_jobs_cache)} record")
        return _jobs_cache
    except Exception as e:
        print(f"❌ Errore caricamento jobs cache: {e}")
        return []

def run_sync_script(script_name, timeout=120):
    """Esegue uno script di sync e restituisce output standardizzato."""
    python_exe = sys.executable
    result = subprocess.run(
        [python_exe, script_name],
        capture_output=True,
        text=True,
        timeout=timeout,
        encoding='utf-8',
        errors='replace'
    )
    return {
        'ok': result.returncode == 0,
        'code': result.returncode,
        'stdout': result.stdout or '',
        'stderr': result.stderr or ''
    }

@app.route('/api/jobs', methods=['GET'])
def get_jobs_paginated():
    """
    Restituisce i jobs con paginazione e filtri
    Query parameters:
    - limit: numero record per pagina (default 50, max 1000)
    - offset: inizio paginazione (default 0)
    - search: ricerca per JobNo, CustomerName, Division
    - division: filtra per division
    - resourceNo: filtra per Resource No
    - excludeTrasferta: se true, esclude descrizioni con TRASFERTA
    - excludeMatching: se true, esclude commesse dove vendute = loggate
    """
    try:
        jobs = load_jobs_cache()
        
        if not jobs:
            return jsonify({'data': [], 'total': 0, 'limit': 0, 'offset': 0})
        
        # Parametri
        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))
        search = request.args.get('search', '').lower()
        division = request.args.get('division', '')
        resource_no = request.args.get('resourceNo', '')
        exclude_trasferta = request.args.get('excludeTrasferta', 'true').lower() == 'true'
        exclude_matching = request.args.get('excludeMatching', 'true').lower() == 'true'
        
        # Limiti di sicurezza
        limit = min(max(limit, 1), 1000)  # max 1000
        offset = max(offset, 0)
        
        # Filtra
        filtered = jobs
        
        if resource_no:
            filtered = [j for j in filtered if j.get('Resource No', '') == resource_no]
        
        # Escludi TRASFERTA - solo le singole righe
        if exclude_trasferta:
            filtered = [j for j in filtered if 'TRASFERTA' not in str(j.get('Detail Description', '')).upper()]
        
        # Escludi dove vendute = loggate - solo le singole righe
        if exclude_matching:
            filtered = [j for j in filtered if float(j.get('Quantity', 0) or 0) != float(j.get('Ore Loggate', 0) or 0)]
        
        if search:
            filtered = [j for j in filtered if (
                search in str(j.get('JobNo', '')).lower() or
                search in str(j.get('Customer Name', '')).lower() or
                search in str(j.get('Division', '')).lower() or
                search in str(j.get('Plan Description', '')).lower()
            )]
        
        if division:
            filtered = [j for j in filtered if j.get('Division', '') == division]
        
        total = len(filtered)
        
        # Pagina
        data = filtered[offset:offset + limit]
        
        return jsonify({
            'data': data,
            'total': total,
            'limit': limit,
            'offset': offset,
            'hasMore': (offset + limit) < total
        })
        
    except Exception as e:
        print(f"❌ Errore /api/jobs: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/jobs/stats', methods=['GET'])
def get_jobs_stats():
    """Statistiche sui jobs"""
    try:
        jobs = load_jobs_cache()
        
        if not jobs:
            return jsonify({'total': 0, 'divisions': []})
        
        total = len(jobs)
        divisions = list(set(j.get('Division', '') for j in jobs if j.get('Division')))
        divisions.sort()
        
        return jsonify({
            'total': total,
            'divisions': divisions
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join('dist', path)):
        return send_from_directory('dist', path)
    else:
        return send_from_directory('dist', 'index.html')

# Endpoint per sincronizzare le commesse da Azure (ricarica manuale)
@app.route('/api/sync-jobs', methods=['POST'])
def sync_jobs_endpoint():
    """Sincronizza le commesse con priorita fonte principale CRM/NAV."""
    global _jobs_cache
    try:
        print("📥 Sincronizzazione commesse richiesta...")

        body = request.get_json(silent=True) or {}
        requested_source = str(body.get('source', 'direct')).strip().lower()

        if requested_source == 'azure':
            azure_sync = run_sync_script('sync-jobs.py', timeout=120)
            if not azure_sync['ok']:
                print(f"⚠️  Errore sincronizzazione Azure: {azure_sync['stderr']}")
                return jsonify({'error': 'Sincronizzazione Azure fallita', 'details': azure_sync['stderr']}), 500

            _jobs_cache = None
            load_jobs_cache()
            print("✅ Sincronizzazione Azure completata")
            return jsonify({
                'ok': True,
                'source': 'azure',
                'message': 'Commesse sincronizzate da Azure Blob',
                'output': azure_sync['stdout']
            }), 200

        direct_sync = run_sync_script('sync-jobs-direct.py', timeout=180)
        if direct_sync['ok']:
            _jobs_cache = None
            load_jobs_cache()
            print("✅ Sincronizzazione direct source completata")
            return jsonify({
                'ok': True,
                'source': 'direct',
                'message': 'Commesse sincronizzate direttamente da CRM/NAV',
                'output': direct_sync['stdout']
            }), 200

        print(f"⚠️  Sync direct fallita, provo fallback Azure: {direct_sync['stderr']}")
        azure_sync = run_sync_script('sync-jobs.py', timeout=120)
        if azure_sync['ok']:
            _jobs_cache = None
            load_jobs_cache()
            print("✅ Fallback Azure completato")
            return jsonify({
                'ok': True,
                'source': 'azure-fallback',
                'message': 'Direct source non disponibile: dati sincronizzati da Azure Blob',
                'directError': direct_sync['stderr'],
                'output': azure_sync['stdout']
            }), 200

        return jsonify({
            'error': 'Sincronizzazione fallita (direct + azure fallback)',
            'directError': direct_sync['stderr'],
            'azureError': azure_sync['stderr']
        }), 500
        
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Timeout durante la sincronizzazione'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Sincronizza jobs al startup (direct source, fallback Azure)
    print("📥 Sincronizzazione jobs al startup (direct source -> fallback Azure)...")
    try:
        startup_direct = run_sync_script('sync-jobs-direct.py', timeout=180)
        if startup_direct['ok']:
            print(startup_direct['stdout'])
        else:
            print("⚠️  Direct source startup fallita, provo Azure fallback...")
            startup_azure = run_sync_script('sync-jobs.py', timeout=120)
            print(startup_azure['stdout'] if startup_azure['ok'] else startup_azure['stderr'])
    except Exception as e:
        print(f"⚠️  Sincronizzazione ignorata: {e}")
    
    # Carica jobs in memoria
    print("📦 Caricamento jobs in cache...")
    load_jobs_cache()
    
    # Usa la porta fornita da Azure o default a 8000
    port = int(os.environ.get('PORT', 8000))
    
    print(f'✓ Server Flask avviato su http://0.0.0.0:{port}')
    print('✓ API disponibili:')
    print('  - GET /api/jobs (paginato con filtri)')
    print('  - GET /api/jobs/stats')
    print('  - GET/POST /api/tasks')
    print('  - GET/POST /api/members')
    print('✓ File statici serviti da dist/')
    print()
    app.run(host='0.0.0.0', port=port, debug=False)

