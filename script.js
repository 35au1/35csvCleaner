let processedCSV = null;

const INFO_TEXT = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit.';

const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const status = document.getElementById('status');
const preview = document.getElementById('preview');
const downloadBtn = document.getElementById('downloadBtn');
const infoContent = document.getElementById('infoContent');
const copyBtn = document.getElementById('copyBtn');

fileInput.addEventListener('change', handleFileSelect);
downloadBtn.addEventListener('click', downloadCleanedCSV);
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
    let validRows = 0;
    let invalidRows = 0;

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
    
    showStatus(`✓ Success! Processed ${validRows} valid rows${invalidRows > 0 ? `, removed ${invalidRows} invalid rows` : ''}`, 'success');
    showPreview(cleanedRows);
    downloadBtn.style.display = 'block';
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

function removeHTMLTags(text) {
    // Remove HTML tags and replace with space
    let cleaned = text.replace(/<[^>]*>/g, ' ');
    // Replace &nbsp; and other HTML entities with space
    cleaned = cleaned.replace(/&nbsp;/gi, ' ');
    cleaned = cleaned.replace(/&[a-z]+;/gi, ' ');
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
