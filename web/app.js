let currentScreen = 'gameCheck';
let currentMode = 'mo2';
let currentTable = 'events';
let pendingDbPath = null;
let hasChanges = false;
let editedCells = new Set();

document.addEventListener('DOMContentLoaded', () => {
    checkGameStatus();
    setupEventListeners();

    const useFixedBtn = document.getElementById('useFixedBtn');
    if (useFixedBtn) {
        useFixedBtn.addEventListener('click', () => {
            const fixedDiv = document.getElementById('editFixedText');
            const textarea = document.getElementById('editTextarea');
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = fixedDiv.innerHTML;
            textarea.value = tempDiv.textContent;
        });
    }
});

function setupEventListeners() {
    document.getElementById('copyBtn').addEventListener('click', () => {
        const output = document.getElementById('quickOutput').innerText;
        if (output) {
            navigator.clipboard.writeText(output).then(() => {
                showNotification('Скопировано в буфер обмена', 'success');
            });
        }
    });

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMode = btn.dataset.mode;
        });
    });

    document.getElementById('browseFolderBtn').addEventListener('click', async () => {
        const path = await eel.browse_folder()();
        if (path) {
            document.getElementById('pathInput').value = path;
        }
    });

    document.getElementById('browseFileBtn').addEventListener('click', async () => {
        const path = await eel.browse_file()();
        if (path) {
            selectDbFile(path);
        }
    });

    document.getElementById('scanBtn').addEventListener('click', async () => {
        const path = document.getElementById('pathInput').value.trim();
        if (!path) return;
        
        const result = await eel.scan_for_db_files(path, currentMode === 'mo2')();
        const filesList = document.getElementById('filesList');
        
        if (result.success && result.files.length > 0) {
            filesList.style.display = 'flex';
            filesList.innerHTML = result.files.map(file => `
                <div class="file-item" ondblclick="selectDbFile('${file.path.replace(/\\/g, '\\\\')}')">
                    <span style="font-weight: 500;">${file.name}</span>
                    <span style="color: var(--text-secondary); font-size: 13px;">${file.size_formatted} | ${file.mtime}</span>
                </div>
            `).join('');
        } else {
            filesList.style.display = 'block';
            filesList.innerHTML = `<p style="color: var(--danger); text-align: center; padding: 10px;">Файлы не найдены или произошла ошибка.</p>`;
        }
    });

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentTable = tab.dataset.table;
            loadTableData(currentTable);
        });
    });

    document.getElementById('searchBrokenBtn').addEventListener('click', searchBrokenStrings);
    document.getElementById('saveBtn').addEventListener('click', saveAllChanges);
    document.getElementById('mainMenuBtn').addEventListener('click', returnToMainMenu);
    
    document.getElementById('quickEditorBtn').addEventListener('click', () => {
        document.getElementById('quickInput').value = '';
        document.getElementById('quickOutput').innerHTML = 'Здесь появится исправленный текст...';
        document.getElementById('quickModal').classList.add('active');
    });
    
    document.getElementById('doQuickFixBtn').addEventListener('click', async () => {
        const input = document.getElementById('quickInput').value;
        if (!input.trim()) return;
        const result = await eel.quick_fix_text(input)();
        if (result.success) {
            document.getElementById('quickOutput').innerHTML = result.fixed_html;
            document.getElementById('quickInput').style.display = 'none';
            
            let origDiffDiv = document.getElementById('quickOrigDiff');
            if (!origDiffDiv) {
                origDiffDiv = document.createElement('div');
                origDiffDiv.id = 'quickOrigDiff';
                origDiffDiv.className = 'text-box';
                document.getElementById('quickInput').parentNode.appendChild(origDiffDiv);
            }
            origDiffDiv.style.display = 'block';
            origDiffDiv.innerHTML = result.orig_html;
            
            document.getElementById('doQuickFixBtn').textContent = 'Сбросить';
            document.getElementById('doQuickFixBtn').onclick = () => {
                document.getElementById('quickInput').value = '';
                document.getElementById('quickInput').style.display = 'block';
                if (origDiffDiv) origDiffDiv.style.display = 'none';
                document.getElementById('quickOutput').innerHTML = 'Здесь появится исправленный текст...';
                document.getElementById('doQuickFixBtn').textContent = 'Исправить';
                setupEventListeners();
            };
        }
    });

    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('.modal').classList.remove('active');
            if (btn.closest('#quickModal')) {
                document.getElementById('quickInput').style.display = 'block';
                const d = document.getElementById('quickOrigDiff');
                if (d) d.style.display = 'none';
                document.getElementById('doQuickFixBtn').textContent = 'Исправить';
            }
        });
    });

    document.getElementById('backupYesBtn').addEventListener('click', () => openDatabase(true));
    document.getElementById('backupNoBtn').addEventListener('click', () => openDatabase(false));
    document.getElementById('saveEditBtn').addEventListener('click', saveCellEdit);
    document.getElementById('applyFixesBtn').addEventListener('click', applyAllFixes);

    window.addEventListener('beforeunload', (e) => {
        if (hasChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

async function checkGameStatus() {
    const statusDiv = document.getElementById('gameStatus');
    const check = async () => {
        const running = await eel.check_game_running()();
        if (running) {
            statusDiv.innerHTML = `<p style="color: var(--danger); font-weight: 500;">Skyrim запущен. Пожалуйста, закройте игру.</p>`;
            setTimeout(check, 1000);
        } else {
            statusDiv.innerHTML = `<p style="color: var(--success); font-weight: 500;">Skyrim не запущен. Можно продолжать.</p>`;
            setTimeout(() => showScreen('pathSelect'), 600);
        }
    };
    check();
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId + 'Screen').classList.add('active');
}

function selectDbFile(path) {
    pendingDbPath = path;
    document.getElementById('backupModal').classList.add('active');
}

async function openDatabase(createBackup) {
    document.getElementById('backupModal').classList.remove('active');
    const result = await eel.open_database(pendingDbPath, createBackup)();
    
    if (result.success) {
        if (result.backup) showNotification(`Бекап создан: ${result.backup}`, 'success');
        
        document.getElementById('quickEditorBtn').style.display = 'none';
        document.getElementById('mainMenuBtn').style.display = 'inline-flex';
        document.getElementById('saveBtn').style.display = 'inline-flex';
        
        editedCells.clear();
        showScreen('editor');
        loadTableData('events');
        hasChanges = false;
        updateSaveButton();
    } else {
        showNotification('Ошибка открытия базы', 'error');
    }
}

async function returnToMainMenu() {
    if (hasChanges) {
        const confirmLeave = confirm("Есть несохраненные изменения. Вы уверены, что хотите выйти?");
        if (!confirmLeave) return;
    }
    
    await eel.close_database()();
    
    document.getElementById('quickEditorBtn').style.display = 'inline-flex';
    document.getElementById('mainMenuBtn').style.display = 'none';
    document.getElementById('saveBtn').style.display = 'none';
    
    showScreen('pathSelect');
    hasChanges = false;
    editedCells.clear();
    updateSaveButton();
}

async function loadTableData(table) {
    const result = await eel.get_table_data(table)();
    if (!result.success) return;
    
    const thead = document.querySelector('#dataTable thead');
    const tbody = document.querySelector('#dataTable tbody');
    
    thead.innerHTML = '<tr>' + result.columns.map(col => `<th>${col}</th>`).join('') + '</tr>';
    
    tbody.innerHTML = result.rows.map(row => {
        const rowId = row.id || row.ID;
        return '<tr>' + result.columns.map(col => {
            const cellId = `${table}-${rowId}-${col}`;
            const isEdited = editedCells.has(cellId);
            const className = isEdited ? 'edited-cell' : '';
            return `<td class="${className}" ondblclick="editCell('${table}', ${rowId}, '${col}')">${escapeHtml(row[col] || '')}</td>`;
        }).join('') + '</tr>';
    }).join('');
}

async function editCell(table, rowId, column) {
    if (column.toLowerCase() === 'id') return;

    const result = await eel.get_table_data(table)();
    const row = result.rows.find(r => (r.id || r.ID) == rowId);
    const originalText = row ? row[column] : '';
    
    const fixResult = await eel.quick_fix_text(originalText)();
    
    const textarea = document.getElementById('editTextarea');
    const originalDiv = document.getElementById('editOriginalText');
    const fixedDiv = document.getElementById('editFixedText');
    
    if (fixResult.success) {
        originalDiv.innerHTML = fixResult.orig_html;
        fixedDiv.innerHTML = fixResult.fixed_html;
        textarea.value = fixResult.fixed;
    } else {
        originalDiv.innerHTML = escapeHtml(originalText);
        fixedDiv.innerHTML = 'Не удалось исправить';
        textarea.value = originalText;
    }
    
    textarea.dataset.table = table;
    textarea.dataset.rowId = rowId;
    textarea.dataset.column = column;
    textarea.dataset.originalValue = originalText;
    
    document.getElementById('editModal').classList.add('active');
}

async function saveCellEdit() {
    const textarea = document.getElementById('editTextarea');
    const table = textarea.dataset.table;
    const rowId = textarea.dataset.rowId;
    const col = textarea.dataset.column;
    const newValue = textarea.value;
    const originalValue = textarea.dataset.originalValue;
    
    if (newValue === originalValue) {
        document.getElementById('editModal').classList.remove('active');
        return;
    }
    
    const result = await eel.update_cell(table, rowId, col, newValue)();
    
    if (result.success) {
        document.getElementById('editModal').classList.remove('active');
        
        editedCells.add(`${table}-${rowId}-${col}`);
        
        loadTableData(table);
        hasChanges = result.has_changes;
        updateSaveButton();
        showNotification('Ячейка обновлена', 'success');
    } else {
        showNotification('Ошибка при сохранении: ' + result.error, 'error');
    }
}

async function saveAllChanges() {
    const result = await eel.save_all_changes()();
    if (result.success) {
        hasChanges = false;
        editedCells.clear();
        updateSaveButton();
        showNotification('Изменения успешно сохранены в базу', 'success');
        loadTableData(currentTable);
    }
}

async function searchBrokenStrings() {
    const result = await eel.search_broken_strings(currentTable)();
    if (!result.success) return;
    
    const container = document.getElementById('fixesContainer');
    const applyBtn = document.getElementById('applyFixesBtn');
    
    if (result.candidates.length === 0) {
        container.innerHTML = `<p style="text-align: center; padding: 20px;">Сломанных строк не найдено.</p>`;
        applyBtn.style.display = 'none';
    } else {
        applyBtn.style.display = 'inline-flex';
        container.innerHTML = result.candidates.map((c, i) => `
            <div class="fix-card" style="margin-bottom: 10px;">
                <div class="fix-card-header">ID: ${c.row_id} | ${c.column}</div>
                <div class="fix-card-grid" style="padding: 10px; height: 150px;">
                    <div class="fix-col">
                        <div class="text-box" style="font-size: 12px;">${c.original_html}</div>
                    </div>
                    <div class="fix-col">
                        <textarea data-index="${i}">${escapeHtml(c.final)}</textarea>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    document.getElementById('fixModal').classList.add('active');
    window._fixCandidates = result.candidates;
}

async function applyAllFixes() {
    const candidates = window._fixCandidates || [];
    const textareas = document.querySelectorAll('#fixesContainer textarea');
    
    const fixes = candidates.map((c, i) => ({
        ...c,
        final: textareas[i] ? textareas[i].value : c.final
    }));
    
    const result = await eel.apply_fixes(fixes)();
    if (result.success) {
        document.getElementById('fixModal').classList.remove('active');
        
        fixes.forEach(fix => {
            if (fix.original !== fix.final) {
                editedCells.add(`${fix.table}-${fix.row_id}-${fix.column}`);
            }
        });
        
        loadTableData(currentTable);
        hasChanges = result.has_changes;
        updateSaveButton();
        showNotification('Исправления успешно добавлены', 'success');
    }
}

function updateSaveButton() {
    document.getElementById('saveBtn').disabled = !hasChanges;
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    setTimeout(() => notification.classList.remove('show'), 3000);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}