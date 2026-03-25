let processedCSV = null;
let processedRows = null;

const INFO_TEXT = `Przygotuj "Release" notes w formacie lista bulletpointów per sekcja. Każdy element ma status zrealizowany.
Każdy element powinien mieć maksymalnie 1 zdanie długości.
Wyeksportuj bez dodatkowych opisów do .doc; pamiętając o UTF – używamy języka polskiego. PRZENANALIZUJ KAŻDE ZDANIE, COPY+PASTE jest nieakceptowalny. Wszystkie informacje jak przetworzyć zdanie i zaklasyfikować masz w tym prompcie. MUSISZ przetworzyć każde zdanie semantycznie i utworzyć podsumowanie. MUSISZ najpierw stworzyć kontent po analizie semantycznej, kroki tworzenia pliku zostaw na później.

sekcja: "1 Nowe funkcjonalności" - bullet point zawiera "Dodano (...)"
sekcja: "2 Poprawki błędów" - bullet point zawiera "Poprawiono (...)"
sekcja: "3 Usprawnienia" - bullet point zawiera "Zmodyfikowano (...)" lub słowa zastępcze: zmieniono, zniesiono, dodano
sekcja: "4 Usunięte" - bullet point zawiera "Usunięto (...)"

Format bullet point: początek frazy zidentyfikowanej sekcja (1,4);
w bierniku i z małej litery - opis funkcjonalności np. możliwość wykonania czegoś lub element, dokument, etap; miejsce w aplikacji dodania funkcjonalności np. jaka baza danych, jaki formularz, i/lub etap, proces np. na etapie konrektnym lub w ramach określonego procesu; powiązania z systemami, validacje; dodatkowo jeśli istnieje - podsumuj cel biznesowy tej implementacji / dlaczego została zaimplementowana`;

const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const status = document.getElementById('status');
const preview = document.getElementById('preview');
const downloadBtn = document.getElementById('downloadBtn');
const downloadExcelBtn = document.getElementById('downloadExcelBtn');
const infoContent = document.getElementById('infoContent');
const copyBtn = document.getElementById('copyBtn');

fileInput.addEventListener('change', handleFileSelect);
downloadBtn.addEventListener('click', downloadCleanedCSV);
downloadExcelBtn.addEventListener('click', downloadAsExcel);
copyBtn.addEventListener('click', copyToClipboard);

// Load info content on page load
infoContent.textContent = INFO_TEXT;

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    fileName.textContent = `Selected: ${file.name}`;
    showStatus('Processing file...', 'info');
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const csvContent = e.target.result;
            processCSV(csvContent);
        } catch (error) {
            showStatus(`Error: ${error.message}`, 'error');
        }
    };
    reader.readAsText(file, 'UTF-8');
}

function processCSV(csvContent) {
    // FIRST: Remove all newline characters from within quoted fields to prevent CSV parsing issues
    // This handles cases where HTML tags or text contain line breaks
    csvContent = cleanNewlinesInQuotedFields(csvContent);
    
    const lines = csvContent.split('\n');
    if (lines.length === 0) {
        showStatus('Error: Empty CSV file', 'error');
        return;
    }

    // Parse header
    const header = parseCSVLine(lines[0]);
    const titleIdx = header.findIndex(col => col.trim().toLowerCase() === 'title');
    const descIdx = header.findIndex(col => col.trim().toLowerCase() === 'description');
    const closedDateIdx = header.findIndex(col => col.trim().toLowerCase() === 'closed date');

    // Process rows
    const cleanedRows = [];
    const originalTitles = new Set();
    let validRows = 0;
    let invalidRows = 0;

    // First pass - collect all original titles
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const columns = parseCSVLine(line);
        const title = titleIdx !== -1 && columns[titleIdx] ? columns[titleIdx].trim() : '';
        
        if (title) {
            originalTitles.add(title);
        }
    }

    // Second pass - process rows and validate against original titles
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const columns = parseCSVLine(line);
        
        const title = titleIdx !== -1 && columns[titleIdx] ? columns[titleIdx].trim() : '';
        const description = descIdx !== -1 && columns[descIdx] ? columns[descIdx].trim() : '';
        const closedDate = closedDateIdx !== -1 && columns[closedDateIdx] ? columns[closedDateIdx].trim() : '';

        // Validate row has at least some data
        if (!title && !description && !closedDate) {
            invalidRows++;
            continue;
        }

        // Clean HTML from description and replace quotes with single quotes
        const cleanedDescription = description ? removeHTMLTags(description).replace(/"/g, "'") : '';
        const cleanedTitle = title.replace(/"/g, "'");
        const cleanedClosedDate = closedDate.replace(/"/g, "'");

        // Validate that the cleaned title matches one of the original titles
        if (title && !originalTitles.has(title)) {
            invalidRows++;
            continue;
        }

        cleanedRows.push({
            Title: cleanedTitle,
            Description: cleanedDescription,
            'Closed date': cleanedClosedDate
        });
        validRows++;
    }

    if (cleanedRows.length === 0) {
        showStatus('Error: No valid rows found in CSV', 'error');
        return;
    }

    // Generate cleaned CSV
    processedCSV = generateCSV(cleanedRows);
    processedRows = cleanedRows;
    
    showStatus(`✓ Success! Processed ${validRows} valid rows${invalidRows > 0 ? `, removed ${invalidRows} invalid rows` : ''}`, 'success');
    showPreview(cleanedRows);
    downloadBtn.style.display = 'block';
    downloadExcelBtn.style.display = 'block';
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    
    return result;
}

function cleanNewlinesInQuotedFields(csvContent) {
    // Replace all newlines (CR, LF, CRLF) within quoted fields with spaces
    // This prevents CSV parsing issues when HTML or text contains line breaks
    let result = '';
    let inQuotes = false;
    
    for (let i = 0; i < csvContent.length; i++) {
        const char = csvContent[i];
        const nextChar = csvContent[i + 1];
        
        if (char === '"') {
            // Check if it's an escaped quote
            if (inQuotes && nextChar === '"') {
                result += '""';
                i++; // Skip next quote
            } else {
                inQuotes = !inQuotes;
                result += char;
            }
        } else if (inQuotes && (char === '\r' || char === '\n')) {
            // Replace newlines inside quotes with space
            result += ' ';
            // Skip \r\n combination
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
        } else {
            result += char;
        }
    }
    
    return result;
}

function removeHTMLTags(text) {
    // Remove HTML tags - handle multiline and broken tags with any characters inside
    // This regex matches < followed by any characters (including newlines, spaces, etc.) until >
    let cleaned = text.replace(/<[^>]*>/gs, ' ');
    // Also handle broken tags that might span multiple lines or have weird characters
    cleaned = cleaned.replace(/<[\s\S]*?>/g, ' ');
    // Replace &nbsp; and other HTML entities with space
    cleaned = cleaned.replace(/&nbsp;/gi, ' ');
    cleaned = cleaned.replace(/&[a-z]+;/gi, ' ');
    cleaned = cleaned.replace(/&#\d+;/g, ' ');
    // Normalize multiple spaces to single space
    cleaned = cleaned.replace(/\s+/g, ' ');
    return cleaned.trim();
}

function generateCSV(rows) {
    const headers = ['Title', 'Description', 'Closed date'];
    let csv = headers.map(h => `"${h}"`).join(',') + '\n';

    rows.forEach(row => {
        const values = headers.map(header => {
            let value = row[header] || '';
            // Wrap in quotes (quotes already replaced with single quotes during processing)
            return `"${value}"`;
        });
        csv += values.join(',') + '\n';
    });

    return csv;
}

function showPreview(rows) {
    const previewRows = rows.slice(0, 5);
    
    let html = '<h3>Preview (first 5 rows)</h3>';
    html += '<table class="preview-table">';
    html += '<thead><tr><th>Title</th><th>Description</th><th>Closed date</th></tr></thead>';
    html += '<tbody>';
    
    previewRows.forEach(row => {
        const desc = row.Description.length > 100 
            ? row.Description.substring(0, 100) + '...' 
            : row.Description;
        html += `<tr>
            <td>${escapeHTML(row.Title)}</td>
            <td>${escapeHTML(desc)}</td>
            <td>${escapeHTML(row['Closed date'])}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    preview.innerHTML = html;
}

function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';
}

function downloadCleanedCSV() {
    if (!processedCSV) return;

    // Add UTF-8 BOM for proper encoding in Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + processedCSV], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'cleaned_data.csv');
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
}

function copyToClipboard() {
    const text = infoContent.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<span>✓</span> Copied!';
        copyBtn.style.background = '#28a745';
        
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.style.background = '#667eea';
        }, 2000);
    }).catch(err => {
        alert('Failed to copy to clipboard');
    });
}

function downloadAsExcel() {
    if (!processedRows) return;

    // Create HTML table for Excel
    let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
    html += '<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>';
    html += '<x:Name>Sheet1</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>';
    html += '</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>';
    html += '<table border="1">';
    
    // Header
    html += '<thead><tr>';
    html += '<th>Title</th><th>Description</th><th>Closed date</th>';
    html += '</tr></thead>';
    
    // Rows
    html += '<tbody>';
    processedRows.forEach(row => {
        html += '<tr>';
        html += `<td>${escapeHTML(row.Title)}</td>`;
        html += `<td>${escapeHTML(row.Description)}</td>`;
        html += `<td>${escapeHTML(row['Closed date'])}</td>`;
        html += '</tr>';
    });
    html += '</tbody></table></body></html>';

    // Create blob and download
    const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'cleaned_data.xls');
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
}
